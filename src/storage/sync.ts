import { db, getMeta, setMeta, identity, merge } from './db';
import { cursorOf, assetIds } from '../domain/protocol.mjs';
import { compareEvents } from '../domain/reducer';
import type { Connection, Operation, Attachment } from '../domain/types';
export async function api<T=Record<string,unknown>>(route:string,payload?:unknown,method?:string,signal?:AbortSignal):Promise<T>{
 const connection=await getMeta<Connection>('connection');
 const headers:Record<string,string>={};if(connection)headers.Authorization='Bearer '+connection.token;if(payload!==undefined)headers['Content-Type']='application/json';
 const response=await fetch('/api/'+route,{method:method||(payload===undefined?'GET':'POST'),headers,body:payload===undefined?undefined:JSON.stringify(payload),signal:requestSignal(15000,signal)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Нет соединения с компьютером');return result;
}
export async function bootstrap(){
 const hash=new URLSearchParams(location.hash.slice(1)),setup=hash.get('setup'),pair=hash.get('pair');
 if(setup){const connection:Connection={token:setup,serverId:'',role:'desktop',at:Date.now()};await setMeta('connection',connection);history.replaceState(null,'',location.pathname);return;}
 if(pair){await setMeta('pairSecret',pair);history.replaceState(null,'',location.pathname);}
 if(!await getMeta<Connection>('connection')&&['localhost','127.0.0.1'].includes(location.hostname)){try{await setMeta('connection',await api('local-bootstrap',{}));}catch{/* Offline opening is independent of the PC. */}}
}
export async function pairPhone(secret:string){const who=await identity();const result=await api<Connection>('pair/accept',{secret:secret.trim(),deviceId:who.id,name:who.name});await setMeta('connection',result);await setMeta('pairSecret','');}
let running:Promise<void>|undefined;
export function synchronize(signal?:AbortSignal){if(running)return running;running=runSync(signal).finally(()=>{running=undefined;});return running;}
function requestSignal(timeout:number,signal?:AbortSignal){return signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);}
async function runSync(signal?:AbortSignal){
 const connection=await getMeta<Connection>('connection');if(!connection)throw new Error('Сначала подключи устройство');
 let ack=connection.ack||{};
 for(let round=0;round<1000;round++){
  signal?.throwIfAborted();
  const events=(await db.events.toArray()).sort(compareEvents),push=events.filter(e=>e.seq>(ack[e.deviceId]||0)).slice(0,300);
  const ids=assetIds(push) as string[];
  if(ids.length){const {missing}=await api<{missing:string[]}>('assets/check',{ids},undefined,signal);for(const id of missing){
    const asset=await db.attachments.get(id);if(!asset)throw new Error('Не найдено вложение. Восстанови полный архив.');
    const res=await fetch('/api/asset/'+id,{method:'PUT',headers:{Authorization:'Bearer '+connection.token,'Content-Type':asset.type,'X-Asset-Name':encodeURIComponent(asset.name)},body:asset.blob,signal:requestSignal(30000,signal)});if(!res.ok)throw new Error('Не удалось передать изображение');
  }}
  const result=await api<{events:Operation[];more:boolean;ack:Record<string,number>;assetIds:string[]}>('sync',{events:push,cursor:cursorOf(events)},undefined,signal);
  const assets:Attachment[]=[];
  for(const id of result.assetIds){if(await db.attachments.get(id))continue;const res=await fetch('/api/asset/'+id,{headers:{Authorization:'Bearer '+connection.token},signal:requestSignal(30000,signal)});if(!res.ok)throw new Error('Обмен изображениями прервался');
   const blob=await res.blob(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==id)throw new Error('Повреждено изображение при передаче');
   assets.push({id,blob,name:decodeURIComponent(res.headers.get('X-Asset-Name')||'image'),type:blob.type});
  }
  await merge(result.events,assets);ack=result.ack;
  // Save acknowledgement only after the atomic local merge succeeds.
  await setMeta('connection',{...connection,ack});
  const stillPushing=events.some(e=>e.seq>(ack[e.deviceId]||0));
  if(!result.more&&!stillPushing){await api('sync/ack',{cursor:cursorOf(await db.events.toArray())},undefined,signal);await setMeta('connection',{...connection,ack,lastSync:Date.now()});return;}
 }
 throw new Error('Обмен слишком большой. Продолжи синхронизацию ещё раз.');
}


