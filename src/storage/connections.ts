import {db,getMeta,setMeta} from './db';
import type {Connection} from '../domain/types';

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
export async function connections():Promise<Connection[]>{
 const saved=await getMeta<Connection[]>('syncConnections')||[],primary=await getMeta<Connection>('connection');
 const unique=new Map(saved.map(c=>[connectionOrigin(c),c]));
 if(primary)unique.set(connectionOrigin(primary),primary);
 return [...unique.values()];
}
export async function saveConnection(connection:Connection){
 await db.transaction('rw',db.meta,async()=>{
  const all=await connections(),primary=await getMeta<Connection>('connection'),origin=connectionOrigin(connection);
  const next={...connection,origin},exists=all.some(c=>connectionOrigin(c)===origin);
  await setMeta('syncConnections',exists?all.map(c=>connectionOrigin(c)===origin?next:c):[...all,next]);
  if(!primary||connectionOrigin(primary)===origin)await setMeta('connection',{...connection,origin});
 });
}
export async function forgetConnection(origin:string){
 await db.transaction('rw',db.meta,async()=>{
  const all=(await connections()).filter(c=>connectionOrigin(c)!==origin),primary=await getMeta<Connection>('connection');
  await setMeta('syncConnections',all);
  if(primary&&connectionOrigin(primary)===origin){if(all[0])await setMeta('connection',all[0]);else await db.meta.delete('connection');}
 });
}
export interface SyncReport {at:number;synced:string[];unavailable:{name:string;error:string}[];}
