import type { Operation, Attachment } from '../domain/types';
import { assetIds, cursorOf, validateEvents } from '../domain/protocol.mjs';
import { compareEvents } from '../domain/reducer';
import { db, identity, merge } from './db';
import { PeerChannel } from './peer-channel';
import { decodeInvitation, encodeInvitation, makeInvitation, rememberPeer, type Invitation } from './peer-identity';

type Cursor=Record<string,number>;
export type PeerProgress={stage:'preparing'|'connecting'|'connected'|'waiting'|'syncing'|'done'|'error';text:string;peer?:string;sent?:number;received?:number};
type Frozen={events:Operation[];cursor:Cursor};
function cursor(value:unknown):Cursor{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>2000||Object.entries(value).some(([key,n])=>!key.length||key.length>160||typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>1e12))throw Error('Некорректная история устройства');return value as Cursor;
}
async function hash(blob:Blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}
function batches(events:Operation[]){
 const result:Operation[][]=[];let batch:Operation[]=[],size=0;
 for(const event of events){const bytes=new TextEncoder().encode(JSON.stringify(event)).length;if(batch.length&&(batch.length>=50||size+bytes>1024*1024)){result.push(batch);batch=[];size=0;}batch.push(event);size+=bytes;}
 if(batch.length)result.push(batch);return result;
}

/** An explicitly accepted, finite exchange. All acknowledgements follow durable writes. */
export class PeerExchange {
 private rpc:PeerChannel;private localReady=false;private remoteReady=false;private started=false;private stopped=false;
 private frozen?:Promise<Frozen>;private remoteCursor?:Cursor;private pending?:Operation[];private missing=new Set<string>();private repairMissing=new Set<string>();private knownAssets=new Set<string>();
 private sent=0;private received=0;private localDone=false;private remoteDone=false;private finished=false;
 constructor(channel:RTCDataChannel,private peer:Invitation,private progress:(value:PeerProgress)=>void,private fatal:(error:Error)=>void){
  this.rpc=new PeerChannel(channel,(method,payload,blob)=>this.handle(method,payload,blob),error=>{if(!this.dataComplete)this.fail(error);});
 }
 get dataComplete(){return this.localDone&&this.remoteDone;}
 async accept(){
  if(this.localReady||this.stopped)return;
  this.frozen=this.prepare();
  try{await this.frozen;await rememberPeer(this.peer);if(this.stopped)return;this.localReady=true;this.progress({stage:'waiting',text:'Ждём подтверждения на втором устройстве',peer:this.peer.name});await this.rpc.call('ready');if(!this.stopped)this.start();}catch(e){this.fail(e as Error);}
 }
 private async prepare(){
  const events=(await db.events.toArray()).sort(compareEvents);
  if(events.length>100000)throw Error('Поддерживается до 100 000 изменений за обмен');
  const ids=new Set(events.map(e=>e.id));if(events.some(e=>e.deps.some(dep=>!ids.has(dep))))throw Error('Здесь не хватает части истории. Сначала заверши прежнюю синхронизацию или восстанови полный архив.');
  this.knownAssets=new Set(assetIds(events) as string[]);
  return {events,cursor:cursorOf(events) as Cursor};
 }
 private start(){if(this.started||!this.localReady||!this.remoteReady||this.stopped)return;this.started=true;void this.run().catch(e=>this.fail(e));}
 private async handle(method:string,payload:unknown,blob?:Blob):Promise<{payload?:unknown}|void>{
  if(this.stopped)throw Error('Обмен закрыт');
  if(method==='ready'){this.remoteReady=true;this.start();return;}
  if(!this.localReady||!this.remoteReady||!this.frozen)throw Error('Сначала подтверди обмен на обоих устройствах');
  if(method==='state'){const state=await this.frozen;return {payload:{cursor:state.cursor}};}
  if(method==='batch'){
   if(this.pending||this.remoteDone||!Array.isArray(payload)||!payload.length||payload.length>50)throw Error('Некорректный пакет истории');
   const events=validateEvents(payload) as Operation[];
   if(this.received+events.length>100000)throw Error('История устройства слишком большая');
   this.pending=events;this.missing=new Set<string>();
   for(const id of assetIds(events) as string[])if(!await db.attachments.get(id))this.missing.add(id);
   return {payload:{missing:[...this.missing]}};
  }
  if(method==='asset'){
   const value=payload as {id:string;name:string;type:string};
   if(!value||!this.missing.has(value.id)&&!this.repairMissing.has(value.id)||typeof value.name!=='string'||value.name.length>500||!['image/png','image/jpeg','image/webp','image/gif'].includes(value.type)||!blob||blob.size>8*1024*1024||await hash(blob)!==value.id)throw Error('Изображение повреждено или не относится к пакету');
   const asset:Attachment={...value,blob:blob.slice(0,blob.size,value.type)};
   await db.attachments.put(asset);this.missing.delete(value.id);this.repairMissing.delete(value.id);return;
  }
  if(method==='commit'){
   if(!this.pending||this.missing.size)throw Error('Пакет ещё не получен полностью');
   const events=this.pending;await merge(events);for(const id of assetIds(events) as string[])this.knownAssets.add(id);this.pending=undefined;this.received+=events.length;this.report();return;
  }
  if(method==='asset-check'){
   if(this.pending||this.repairMissing.size||this.remoteDone||!Array.isArray(payload)||payload.length>256||payload.some(id=>typeof id!=='string'||!this.knownAssets.has(id)))throw Error('Некорректная проверка изображений');
   for(const id of payload)if(!await db.attachments.get(id))this.repairMissing.add(id);
   return {payload:{missing:[...this.repairMissing]}};
  }
  if(method==='done'){
   if(this.pending||this.repairMissing.size)throw Error('Есть незавершённый пакет');
   const expected=cursor(payload),actual=cursorOf(await db.events.toArray()) as Cursor;
   if(Object.entries(expected).some(([id,seq])=>(actual[id]||0)<seq))throw Error('История получена не полностью');
   this.remoteDone=true;await this.finish();return;
  }
  throw Error('Неизвестная команда обмена. Обнови Recall на обоих устройствах.');
 }
 private async run(){
  const frozen=await this.frozen!,state=await this.rpc.call('state');
  this.remoteCursor=cursor((state.payload as {cursor:unknown})?.cursor);this.report();
  const missing=frozen.events.filter(e=>e.seq>(this.remoteCursor![e.deviceId]||0));
  for(const batch of batches(missing)){
   if(this.stopped)return;
   const response=await this.rpc.call('batch',batch),needed=(response.payload as {missing:string[]})?.missing,allowed=new Set(assetIds(batch));
   if(!Array.isArray(needed)||needed.length>allowed.size||new Set(needed).size!==needed.length||needed.some(id=>!allowed.has(id)))throw Error('Некорректный запрос изображений');
   for(const id of needed){
    const asset=await db.attachments.get(id);if(!asset)throw Error('Не найдено изображение. Восстанови его из полного архива.');
    await this.rpc.call('asset',{id:asset.id,name:asset.name.slice(0,500),type:asset.type},asset.blob);
   }
   await this.rpc.call('commit');this.sent+=batch.length;this.report();
  }
  // Repair missing images even when both journals already have identical cursors.
  const refs=assetIds(frozen.events) as string[];
  for(let i=0;i<refs.length;i+=256){
   const ids=refs.slice(i,i+256),response=await this.rpc.call('asset-check',ids),needed=(response.payload as {missing:string[]})?.missing;
   if(!Array.isArray(needed)||needed.length>ids.length||new Set(needed).size!==needed.length||needed.some(id=>!ids.includes(id)))throw Error('Некорректный запрос изображений');
   for(const id of needed){const asset=await db.attachments.get(id);if(!asset)throw Error('Не найдено изображение. Восстанови его из полного архива.');await this.rpc.call('asset',{id:asset.id,name:asset.name.slice(0,500),type:asset.type},asset.blob);}
  }
  await this.rpc.call('done',frozen.cursor);this.localDone=true;await this.finish();
 }
 private report(){if(!this.stopped)this.progress({stage:'syncing',text:'Объединяем историю и изображения',peer:this.peer.name,sent:this.sent,received:this.received});}
 private async finish(){
  if(this.finished||!this.localDone||!this.remoteDone||this.stopped)return;
  this.finished=true;await rememberPeer(this.peer,Date.now());
  if(!this.stopped)this.progress({stage:'done',text:'Обмен завершён. Обе копии получили изменения.',peer:this.peer.name,sent:this.sent,received:this.received});
 }
 private fail(error:Error){if(this.stopped)return;this.close();this.fatal(error);}
 close(){this.stopped=true;this.pending=undefined;this.missing.clear();this.repairMissing.clear();this.knownAssets.clear();this.frozen=undefined;this.rpc.close();}
}

export class PeerSession {
 private pc:RTCPeerConnection;private channel?:RTCDataChannel;private invitation?:Invitation;private peer?:Invitation;private exchange?:PeerExchange;private stopped=false;private completed=false;
 private session:string=crypto.randomUUID();private expires=Date.now()+10*60_000;
 private deadline:ReturnType<typeof setTimeout>;private idle?:ReturnType<typeof setTimeout>;
 private cancelGather?:()=>void;
 get connected(){return Boolean(this.exchange);}
 constructor(private progress:(value:PeerProgress)=>void,private expectedId?:string){
  if(!window.isSecureContext||!window.RTCPeerConnection)throw Error('Нужен современный браузер и HTTPS (или localhost на ПК)');
  // Only LAN candidates: no STUN, TURN, signalling service or external media requests.
  this.pc=new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'});
  this.pc.ondatachannel=event=>{if(event.channel.label!=='recall-peer-v1'||this.channel){event.channel.close();this.fail(Error('Неизвестный канал обмена'));return;}this.bind(event.channel);};
  this.pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(this.pc.connectionState)&&!this.stopped&&!this.exchange?.dataComplete)this.fail(Error('Прямое соединение не удалось. Проверь общую сеть и создай новые коды. В гостевой Wi-Fi устройства могут быть изолированы.'));};
  this.deadline=setTimeout(()=>this.fail(Error('Приглашение истекло. Создай новое подключение.')),10*60_000);
 }
 async offer(){
  try{this.progress({stage:'preparing',text:'Готовим приглашение'});this.bind(this.pc.createDataChannel('recall-peer-v1',{ordered:true}));await this.pc.setLocalDescription(await this.pc.createOffer());await this.gather();this.ensureActive();this.invitation=await makeInvitation('offer',this.session,this.expires,this.pc.localDescription!.sdp);this.ensureActive();this.progress({stage:'connecting',text:'Приглашение готово. Покажи QR второму устройству.'});return encodeInvitation(this.invitation);}catch(e){this.fail(e as Error);throw e;}
 }
 async answer(code:string){
  try{
   const invitation=await decodeInvitation(code);if(invitation.kind!=='offer')throw Error('На этом устройстве нужен код приглашения, а не ответ');this.checkPeer(invitation);
   this.session=invitation.session;this.expires=invitation.expires;this.peer=invitation;
   this.progress({stage:'preparing',text:'Готовим ответный код',peer:invitation.name});
   await this.pc.setRemoteDescription({type:'offer',sdp:invitation.sdp});await this.pc.setLocalDescription(await this.pc.createAnswer());await this.gather();this.ensureActive();
   this.invitation=await makeInvitation('answer',this.session,this.expires,this.pc.localDescription!.sdp);this.ensureActive();this.progress({stage:'connecting',text:'Ответ готов. Передай файл ответа первому устройству или вставь там код текстом.',peer:invitation.name});return encodeInvitation(this.invitation);
  }catch(e){this.fail(e as Error);throw e;}
 }
 async complete(code:string){
  try{
   const invitation=await decodeInvitation(code);if(!this.invitation||this.invitation.kind!=='offer'||invitation.kind!=='answer'||invitation.session!==this.session||invitation.expires!==this.expires)throw Error('Ответ относится к другому приглашению. Начни подключение заново.');this.checkPeer(invitation);this.peer=invitation;
   this.progress({stage:'connecting',text:'Соединяем устройства',peer:invitation.name});await this.pc.setRemoteDescription({type:'answer',sdp:invitation.sdp});this.ensureActive();
  }catch(e){this.fail(e as Error);throw e;}
 }
 private checkPeer(invitation:Invitation){if(this.expectedId&&invitation.id!==this.expectedId)throw Error('Код другого устройства. Выбери «Новое подключение», чтобы добавить его.');}
 private ensureActive(){if(this.stopped)throw Error('Подключение закрыто');}
 private bind(channel:RTCDataChannel){
  this.channel=channel;
  channel.onopen=()=>{
   if(this.stopped||!this.peer){channel.close();return;}
   clearTimeout(this.deadline);this.idle=setTimeout(()=>this.fail(Error('Время обмена истекло. Подключись ещё раз, чтобы продолжить.')),20*60_000);
   this.exchange=new PeerExchange(channel,this.peer,value=>{if(value.stage==='done'){this.completed=true;clearTimeout(this.idle);this.idle=setTimeout(()=>this.close(),5000);}this.progress(value);},error=>this.fail(error));
   this.progress({stage:'connected',text:'Подтверди объединение данных на обоих устройствах',peer:this.peer.name});
  };
 }
 private gather(){
  if(this.pc.iceGatheringState==='complete')return Promise.resolve();
  return new Promise<void>((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);this.pc.removeEventListener('icegatheringstatechange',changed);this.cancelGather=undefined;};
   const changed=()=>{if(this.pc.iceGatheringState==='complete'){cleanup();resolve();}};
   const timer=setTimeout(()=>{cleanup();reject(Error('Не удалось получить адрес в локальной сети. Проверь Wi-Fi и создай новое подключение.'));},15000);
   this.cancelGather=()=>{cleanup();reject(Error('Подключение закрыто'));};this.pc.addEventListener('icegatheringstatechange',changed);changed();
  });
 }
 async accept(){if(!this.exchange)throw Error('Соединение ещё не готово');await this.exchange.accept();}
 private fail(error:Error){if(this.stopped)return;this.close();if(!this.completed)this.progress({stage:'error',text:error.message});}
 close(){if(this.stopped)return;this.stopped=true;clearTimeout(this.deadline);clearTimeout(this.idle);this.cancelGather?.();this.exchange?.close();if(this.channel){this.channel.onopen=null;this.channel.close();}this.pc.ondatachannel=null;this.pc.onconnectionstatechange=null;this.pc.close();}
}
