import {db,getMeta,setMeta,identity,merge} from './db';
import {cursorOf,assetIds} from '../domain/protocol.mjs';
import {compareEvents} from '../domain/reducer';
import type {Connection,Operation,Attachment} from '../domain/types';
import {advertisedLocalOrigin,connections,connectionOrigin,localServerOrigin,saveConnection,updateConnection,type SyncReport} from './connections';

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
export function isLocalDesktop(){
 return import.meta.env.VITE_PUBLIC_APP!=='true'&&['localhost','127.0.0.1'].includes(location.hostname);
}
async function connectLocalDesktop():Promise<Connection>{
 if(!isLocalDesktop())throw Error('На компьютере открой окно Recall и нажми «Открыть на ПК».');
 let access:Connection;
 try{
  const response=await fetch('/api/local-bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:requestSignal(2500),redirect:'error',credentials:'omit'});
  if(!response.ok)throw Error();
  access=await response.json() as Connection;
  if(access.role!=='desktop'||!access.serverId||!access.token)throw Error();
 }catch{
  throw Error('Служба Recall недоступна. В окне Recall нажми «Запустить», затем «Открыть на ПК».');
 }
 const current=await getMeta<Connection>('connection');
 const previous=current?.role==='desktop'&&connectionOrigin(current)===location.origin?current:undefined;
 const sameServer=previous?.serverId===access.serverId;
 if(sameServer&&previous?.token===access.token)return previous;
 const connection={...(sameServer?previous:undefined),...access,origin:location.origin,name:previous?.name||'Этот компьютер',error:'',failures:0,nextAttemptAt:0};
 await saveConnection(connection);
 return connection;
}
let desktopAccess:Promise<Connection>|undefined;
function localDesktopAccess(){
 if(!desktopAccess)desktopAccess=connectLocalDesktop().finally(()=>{desktopAccess=undefined;});
 return desktopAccess;
}
export async function desktopApi<T=Record<string,unknown>>(route:string,payload:unknown):Promise<T>{
 return api<T>(route,payload,undefined,undefined,await localDesktopAccess());
}
export async function bootstrap(){
 if(import.meta.env.VITE_PUBLIC_APP==='true')return;
 const hash=new URLSearchParams(location.hash.slice(1)),setup=hash.get('setup'),pair=hash.get('pair');
 if(setup){await saveConnection({token:setup,serverId:'',role:'desktop',at:Date.now(),origin:location.origin});history.replaceState(null,'',location.pathname);return;}
 if(pair){await setMeta('pairSecret',pair);history.replaceState(null,'',location.pathname);}
 if(isLocalDesktop())try{await localDesktopAccess();}catch{/* The local library still opens with the service off. */}
}
export async function pairPhone(secret:string){return pairServer(location.origin,secret);}
export async function pairServer(address:string,secret:string,name=''){
 const origin=localServerOrigin(address),who=await identity();
 const connection=await api<Connection>('pair/accept',{secret:secret.trim(),deviceId:who.id,name:who.name},undefined,undefined,{origin,token:'',serverId:'',role:'phone',at:Date.now()});
 await saveConnection({...connection,origin,localOrigin:advertisedLocalOrigin(connection.localOrigin),name:name.trim()||connection.name||origin});await setMeta('pairSecret','');
}
type Health={serverId:string;localOrigin?:string};
export async function verifyServerOrigin(origin:string,serverId:string,signal?:AbortSignal){
 const response=await fetch(localServerOrigin(origin)+'/api/health',{signal:requestSignal(2500,signal),redirect:'error',credentials:'omit'});
 if(!response.ok)throw Error('Компьютер недоступен');
 const health=await response.json() as Health;
 if(!serverId||health.serverId!==serverId)throw Error('По этому адресу другая установка Recall. Подключи её отдельно.');
 return health;
}
async function reach(connection:Connection,signal?:AbortSignal){
 if(connection.role==='desktop'&&connectionOrigin(connection)===location.origin)return connection;
 const candidates=[...new Set([advertisedLocalOrigin(connection.localOrigin),connectionOrigin(connection)].filter((v):v is string=>Boolean(v)))];
 let problem:unknown;
 for(const origin of candidates){
  try{
   const health=await verifyServerOrigin(origin,connection.serverId,signal);
   const stable=advertisedLocalOrigin(health.localOrigin);
   if(stable&&stable!==connection.localOrigin){connection.localOrigin=stable;await updateConnection(connection,{localOrigin:stable});}
   return {...connection,origin};
  }catch(error){signal?.throwIfAborted();problem=error;}
 }
 throw problem||Error('Компьютер недоступен');
}
let running:Promise<void>|undefined;
export function synchronize(signal?:AbortSignal,manual=true){if(running)return running;running=runAll(signal,manual).finally(()=>{running=undefined;});return running;}
const failureText=(error:unknown)=>error instanceof Error&&['TimeoutError','AbortError','TypeError'].includes(error.name)?'Компьютер недоступен. Проверь службу Recall, сеть, адрес и доверие сертификату.':error instanceof Error?error.message:String(error);
async function runAll(signal:AbortSignal|undefined,manual:boolean){
 const all=await connections();if(!all.length)throw Error('Сначала добавь компьютер в «Устройствах»');
 const report:SyncReport={at:Date.now(),synced:[],unavailable:[]},reachable:{connection:Connection;target:Connection}[]=[];
 for(const connection of all){
  signal?.throwIfAborted();const name=connection.name||connectionOrigin(connection);
  if(!manual&&(connection.nextAttemptAt||0)>Date.now()){report.unavailable.push({name,error:connection.error||'Компьютер сейчас недоступен'});continue;}
  try{
   const target=await reach(connection,signal);await runSync(connection,target,signal);reachable.push({connection,target});
  }catch(error){
   signal?.throwIfAborted();const failures=Math.min(10,(connection.failures||0)+1),text=failureText(error);
   await updateConnection(connection,{error:text,failures,nextAttemptAt:Date.now()+Math.min(120000,10000*3**(failures-1))});report.unavailable.push({name,error:text});
  }
 }
 // Relay changes learned from later services back to earlier ones in this click.
 for(const {connection,target} of reachable){
  const name=connection.name||connectionOrigin(connection);
  try{if(reachable.length>1)await runSync(connection,target,signal);report.synced.push(name);}
  catch(error){signal?.throwIfAborted();const text=failureText(error);await updateConnection(connection,{error:text,failures:1});report.unavailable.push({name,error:text});}
 }
 await setMeta('syncReport',report);
 if(!report.synced.length)throw Error(report.unavailable[0]?.error||'Нет доступных компьютеров');
}
async function runSync(connection:Connection,target:Connection,signal?:AbortSignal){
 if(!connection.serverId){const status=await api<{serverId:string}>('status',undefined,undefined,signal,target);await updateConnection(connection,{serverId:status.serverId});connection.serverId=status.serverId;}
 let ack=connection.ack||{};
 for(let round=0;round<1000;round++){
  signal?.throwIfAborted();
  const events=(await db.events.toArray()).sort(compareEvents),push=events.filter(e=>e.seq>(ack[e.deviceId]||0)).slice(0,300);
  const ids=assetIds(push) as string[];
  if(ids.length){const {missing}=await api<{missing:string[]}>('assets/check',{ids},undefined,signal,target);for(const id of missing){
   const asset=await db.attachments.get(id);if(!asset)throw Error('Не найдено вложение. Восстанови полный архив.');
   const response=await fetch(endpoint(target,'asset/'+id),{method:'PUT',headers:{Authorization:'Bearer '+connection.token,'Content-Type':asset.type,'X-Asset-Name':encodeURIComponent(asset.name)},body:asset.blob,signal:requestSignal(30000,signal),redirect:'error',credentials:'omit'});if(!response.ok)throw Error('Не удалось передать изображение');
  }}
  const result=await api<{events:Operation[];more:boolean;ack:Record<string,number>;assetIds:string[]}>('sync',{events:push,cursor:cursorOf(events)},undefined,signal,target);
  const assets:Attachment[]=[];
  for(const id of result.assetIds){if(await db.attachments.get(id))continue;const response=await fetch(endpoint(target,'asset/'+id),{headers:{Authorization:'Bearer '+connection.token},signal:requestSignal(30000,signal),redirect:'error',credentials:'omit'});if(!response.ok)throw Error('Обмен изображениями прервался');
   const blob=await response.blob(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==id)throw Error('Повреждено изображение при передаче');
   assets.push({id,blob,name:decodeURIComponent(response.headers.get('X-Asset-Name')||'image'),type:blob.type});
  }
  await merge(result.events,assets);ack=result.ack;connection.ack=ack;
  await updateConnection(connection,{ack});
  const stillPushing=events.some(e=>e.seq>(ack[e.deviceId]||0));
  if(!result.more&&!stillPushing){await api('sync/ack',{cursor:cursorOf(await db.events.toArray())},undefined,signal,target);await updateConnection(connection,{ack,lastSync:Date.now(),error:'',failures:0,nextAttemptAt:0});return;}
 }
 throw Error('Обмен слишком большой. Продолжи синхронизацию ещё раз.');
}
