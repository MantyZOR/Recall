import {db,getMeta,setMeta,identity,merge} from './db';
import {cursorOf,assetIds} from '../domain/protocol.mjs';
import {compareEvents} from '../domain/reducer';
import type {Connection,Operation,Attachment} from '../domain/types';
import {connections,connectionOrigin,localServerOrigin,saveConnection,type SyncReport} from './connections';
import {devicePreferences} from './sync-policy';

function requestSignal(timeout:number,signal?:AbortSignal){return signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);}
function endpoint(connection:Connection|undefined,route:string){
 if(connection)return connectionOrigin(connection)+'/api/'+route;
 if(import.meta.env.VITE_PUBLIC_APP==='true')throw Error('Добавь компьютер в разделе «Устройства»');
 return '/api/'+route;
}
export async function api<T=Record<string,unknown>>(route:string,payload?:unknown,method?:string,signal?:AbortSignal,target?:Connection):Promise<T>{
 const connection=target||await getMeta<Connection>('connection');
 const headers:Record<string,string>={};if(connection?.token)headers.Authorization='Bearer '+connection.token;if(payload!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(endpoint(connection,route),{method:method||(payload===undefined?'GET':'POST'),headers,body:payload===undefined?undefined:JSON.stringify(payload),signal:requestSignal(15000,signal),redirect:'error',credentials:'omit'});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Нет соединения с компьютером');return result;
}
export async function bootstrap(){
 if(import.meta.env.VITE_PUBLIC_APP==='true')return;
 const hash=new URLSearchParams(location.hash.slice(1)),setup=hash.get('setup'),pair=hash.get('pair');
 if(setup){await saveConnection({token:setup,serverId:'',role:'desktop',at:Date.now(),origin:location.origin});history.replaceState(null,'',location.pathname);return;}
 if(pair){await setMeta('pairSecret',pair);history.replaceState(null,'',location.pathname);}
 if(['localhost','127.0.0.1'].includes(location.hostname)&&!(await connections()).some(c=>connectionOrigin(c)===location.origin)){
  try{const response=await fetch('/api/local-bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:requestSignal(15000),redirect:'error'});if(response.ok)await saveConnection({...await response.json(),origin:location.origin,name:'Этот компьютер'});}catch{/* Offline opening is independent of the PC. */}
 }
}
export async function pairPhone(secret:string){return pairServer(location.origin,secret);}
export async function pairServer(address:string,secret:string,name=''){
 const origin=localServerOrigin(address),who=await identity();
 const connection=await api<Connection>('pair/accept',{secret:secret.trim(),deviceId:who.id,name:who.name},undefined,undefined,{origin,token:'',serverId:'',role:'phone',at:Date.now()});
 await saveConnection({...connection,origin,name:name.trim()||origin});await setMeta('pairSecret','');
}
let running:Promise<void>|undefined;
export function synchronize(signal?:AbortSignal,manual=true){if(running)return running;running=runAll(signal,manual).finally(()=>{running=undefined;});return running;}
const failureText=(error:unknown)=>error instanceof Error&&['TimeoutError','AbortError','TypeError'].includes(error.name)?'Компьютер недоступен. Проверь службу Recall, сеть, адрес и доверие сертификату.':error instanceof Error?error.message:String(error);
async function runAll(signal:AbortSignal|undefined,manual:boolean){
 const all=await connections();if(!all.length)throw Error('Сначала добавь компьютер в «Устройствах»');
 const preferences=devicePreferences(await getMeta('devicePreferences')),report:SyncReport={at:Date.now(),synced:[],unavailable:[]},reachable:Connection[]=[];
 for(const connection of all){
  signal?.throwIfAborted();const name=connection.name||connectionOrigin(connection);
  if(!manual&&((connection.failures||0)>=Math.max(1,preferences.syncAttempts)||(connection.nextAttemptAt||0)>Date.now())){report.unavailable.push({name,error:connection.error||'Автопроверка на паузе — нажми «Синхронизировать сейчас»'});continue;}
  try{
   if(connection.role!=='desktop'||connectionOrigin(connection)!==location.origin){
    const response=await fetch(endpoint(connection,'health'),{signal:requestSignal(2500,signal),redirect:'error',credentials:'omit'});if(!response.ok)throw Error('Компьютер недоступен');
    const health=await response.json();if(health.serverId!==connection.serverId)throw Error('По этому адресу другая установка Recall. Подключи её отдельно.');
   }
   await runSync(connection,signal);reachable.push(connection);
  }catch(error){
   signal?.throwIfAborted();const failures=Math.min(10,(connection.failures||0)+1),text=failureText(error);
   await saveConnection({...connection,error:text,failures,nextAttemptAt:Date.now()+Math.min(120000,10000*3**(failures-1))});report.unavailable.push({name,error:text});
  }
 }
 // Relay changes learned from later services back to earlier ones in this click.
 for(const connection of reachable){
  const name=connection.name||connectionOrigin(connection);
  try{if(reachable.length>1)await runSync(connection,signal);report.synced.push(name);}
  catch(error){signal?.throwIfAborted();const text=failureText(error);await saveConnection({...connection,error:text,failures:1});report.unavailable.push({name,error:text});}
 }
 await setMeta('syncReport',report);
 if(!report.synced.length)throw Error(report.unavailable[0]?.error||'Нет доступных компьютеров');
}
async function runSync(connection:Connection,signal?:AbortSignal){
 if(!connection.serverId){const status=await api<{serverId:string}>('status',undefined,undefined,signal,connection);connection.serverId=status.serverId;}
 let ack=connection.ack||{};
 for(let round=0;round<1000;round++){
  signal?.throwIfAborted();
  const events=(await db.events.toArray()).sort(compareEvents),push=events.filter(e=>e.seq>(ack[e.deviceId]||0)).slice(0,300);
  const ids=assetIds(push) as string[];
  if(ids.length){const {missing}=await api<{missing:string[]}>('assets/check',{ids},undefined,signal,connection);for(const id of missing){
   const asset=await db.attachments.get(id);if(!asset)throw Error('Не найдено вложение. Восстанови полный архив.');
   const response=await fetch(endpoint(connection,'asset/'+id),{method:'PUT',headers:{Authorization:'Bearer '+connection.token,'Content-Type':asset.type,'X-Asset-Name':encodeURIComponent(asset.name)},body:asset.blob,signal:requestSignal(30000,signal),redirect:'error',credentials:'omit'});if(!response.ok)throw Error('Не удалось передать изображение');
  }}
  const result=await api<{events:Operation[];more:boolean;ack:Record<string,number>;assetIds:string[]}>('sync',{events:push,cursor:cursorOf(events)},undefined,signal,connection);
  const assets:Attachment[]=[];
  for(const id of result.assetIds){if(await db.attachments.get(id))continue;const response=await fetch(endpoint(connection,'asset/'+id),{headers:{Authorization:'Bearer '+connection.token},signal:requestSignal(30000,signal),redirect:'error',credentials:'omit'});if(!response.ok)throw Error('Обмен изображениями прервался');
   const blob=await response.blob(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==id)throw Error('Повреждено изображение при передаче');
   assets.push({id,blob,name:decodeURIComponent(response.headers.get('X-Asset-Name')||'image'),type:blob.type});
  }
  await merge(result.events,assets);ack=result.ack;connection.ack=ack;
  await saveConnection({...connection,ack});
  const stillPushing=events.some(e=>e.seq>(ack[e.deviceId]||0));
  if(!result.more&&!stillPushing){await api('sync/ack',{cursor:cursorOf(await db.events.toArray())},undefined,signal,connection);Object.assign(connection,{ack,lastSync:Date.now(),error:'',failures:0,nextAttemptAt:0});await saveConnection(connection);return;}
 }
 throw Error('Обмен слишком большой. Продолжи синхронизацию ещё раз.');
}
