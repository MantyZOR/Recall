import {db,getMeta,setMeta} from './db';
import type {Connection} from '../domain/types';
import {isRecallLocalName} from '../domain/lan-pairing.mjs';

// Tokens stay in this device's metadata, never in the replicated study journal.
export function localServerOrigin(value:string){
 const url=new URL(value.trim());
 const host=url.hostname.toLowerCase(),parts=host.split('.').map(Number);
 const loopback=host==='localhost'||host==='127.0.0.1'||host==='[::1]';
 const privateIP=parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===169&&parts[1]===254);
 const localName=/^[a-z0-9-]+\.local$/.test(host),privateV6=/^\[(?:f[cd][a-f0-9]{2}:|fe80:)/.test(host);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(loopback||privateIP||localName||privateV6)||!(url.protocol==='https:'||loopback&&url.protocol==='http:'))throw Error('Нужен локальный HTTPS-адрес Recall, например https://192.168.1.20:8443');
 return url.origin;
}
export const connectionOrigin=(value:Connection)=>value.origin||location.origin;
export const connectionKey=(value:Connection)=>value.serverId||connectionOrigin(value);
const sameConnection=(a:Connection,b:Connection)=>a.serverId&&b.serverId?a.serverId===b.serverId:connectionOrigin(a)===connectionOrigin(b);
export function advertisedLocalOrigin(value?:string|null){
 if(!value)return;
 try{const url=new URL(localServerOrigin(value));if(url.protocol==='https:'&&isRecallLocalName(url.hostname))return url.origin;}catch{/* Keep the working address if the advertisement is invalid. */}
}
export async function connections():Promise<Connection[]>{
 const saved=await getMeta<Connection[]>('syncConnections')||[],primary=await getMeta<Connection>('connection');
 const unique:Connection[]=[];
 for(const c of primary?[primary,...saved]:saved)if(!unique.some(existing=>sameConnection(c,existing)))unique.push(c);
 return unique;
}
export async function saveConnection(connection:Connection){
 await db.transaction('rw',db.meta,async()=>{
  const all=await connections(),primary=await getMeta<Connection>('connection'),origin=connectionOrigin(connection);
  const existing=all.find(c=>sameConnection(c,connection));
  if(existing?.role==='desktop'&&connection.role!=='desktop')throw Error('Этот компьютер уже подключён.');
  const next={...connection,origin};
  await setMeta('syncConnections',existing?all.map(c=>sameConnection(c,connection)?next:c):[...all,next]);
  if(!primary||sameConnection(primary,connection)||connection.role==='desktop'&&origin===location.origin)await setMeta('connection',next);
 });
}
export async function updateConnection(connection:Connection,progress:Partial<Connection>){
 await db.transaction('rw',db.meta,async()=>{
  const current=(await connections()).find(c=>sameConnection(c,connection)&&c.token===connection.token);
  if(current)await saveConnection({...current,...progress});
 });
}
export async function forgetConnection(connection:Connection){
 await db.transaction('rw',db.meta,async()=>{
  const all=(await connections()).filter(c=>!sameConnection(c,connection)),primary=await getMeta<Connection>('connection');
  await setMeta('syncConnections',all);
  if(primary&&sameConnection(primary,connection)){if(all[0])await setMeta('connection',all[0]);else await db.meta.delete('connection');}
 });
}
export interface SyncReport {at:number;synced:string[];unavailable:{name:string;error:string}[];}
