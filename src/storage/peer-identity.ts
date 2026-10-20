import { Inflate, deflateSync, strToU8, strFromU8 } from 'fflate';
import { canonical } from '../domain/protocol.mjs';
import { db, getMeta, identity, setMeta } from './db';

export type Peer = {id:string;name:string;fingerprint:string;addedAt:number;lastSync?:number};
export type Invitation = {v:1;kind:'offer'|'answer';session:string;expires:number;id:string;name:string;key:JsonWebKey;sdp:string;signature:string};
type SigningKey = {privateKey:CryptoKey;publicKey:JsonWebKey};
export const PUBLIC_RECALL_URL='https://mantyzor.github.io/Recall/';
const PREFIX='recall-peer:1:';
const bytes64=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function from64(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Повреждён код подключения');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
function publicFields(key:JsonWebKey){return {kty:key.kty,crv:key.crv,x:key.x,y:key.y};}
export async function fingerprint(key:JsonWebKey){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',strToU8(canonical(publicFields(key)))).catch(()=>{throw Error('Не удалось проверить ключ устройства');})),b=>b.toString(16).padStart(2,'0')).join('');}
async function signingKey():Promise<SigningKey>{
 const old=await getMeta<SigningKey>('peerSigningKey');if(old)return old;
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const value={privateKey:keys.privateKey,publicKey:await crypto.subtle.exportKey('jwk',keys.publicKey)};
 return db.transaction('rw',db.meta,async()=>{const existing=await getMeta<SigningKey>('peerSigningKey');if(existing)return existing;await setMeta('peerSigningKey',value);return value;});
}
export async function makeInvitation(kind:Invitation['kind'],session:string,expires:number,sdp:string):Promise<Invitation>{
 const who=await identity(),keys=await signingKey();
 const content={v:1 as const,kind,session,expires,id:who.id,name:who.name,key:publicFields(keys.publicKey),sdp};
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,strToU8(canonical(content)));
 return {...content,signature:bytes64(new Uint8Array(signature))};
}
export function encodeInvitation(value:Invitation){const code=PREFIX+bytes64(deflateSync(strToU8(JSON.stringify(value)),{level:9}));if(code.length>12000)throw Error('Сетевых адресов слишком много для приглашения. Отключи лишние сетевые подключения и попробуй снова.');return code;}
export async function decodeInvitation(raw:string,now=Date.now()):Promise<Invitation>{
 let code=raw.trim();
 if(code.startsWith('https://')||code.startsWith('http://'))code=new URLSearchParams(new URL(code).hash.slice(1)).get('peer')||'';
 if(!code.startsWith(PREFIX)||code.length>12000)throw Error('Это не код прямого обмена Recall');
 const parts:Uint8Array[]=[];let size=0;
 const inflate=new Inflate(part=>{size+=part.length;if(size>32768)throw Error('Код подключения слишком большой');parts.push(part);});
 try{inflate.push(from64(code.slice(PREFIX.length)),true);}catch{throw Error('Повреждён код подключения');}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 let value:Invitation;try{value=JSON.parse(strFromU8(bytes));}catch{throw Error('Повреждён код подключения');}
 if(!value||typeof value!=='object'||value.v!==1||!['offer','answer'].includes(value.kind)||typeof value.session!=='string'||!/^[a-f0-9-]{36}$/.test(value.session)||!Number.isSafeInteger(value.expires)||value.expires<=now||value.expires>now+11*60_000)throw Error('Код устарел или не поддерживается. Создай новый.');
 if(typeof value.id!=='string'||!value.id.length||value.id.length>160||typeof value.name!=='string'||!value.name.trim()||value.name.length>80||typeof value.sdp!=='string'||value.sdp.length>20000||!value.sdp.includes('a=fingerprint:sha-256 ')||typeof value.signature!=='string'||value.signature.length>100||!value.key||value.key.kty!=='EC'||value.key.crv!=='P-256'||typeof value.key.x!=='string'||typeof value.key.y!=='string'||value.key.x.length!==43||value.key.y.length!==43||value.key.d)throw Error('Некорректное приглашение');
 const {signature,...content}=value;
 try{const key=await crypto.subtle.importKey('jwk',publicFields(value.key),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,from64(signature),strToU8(canonical(content))))throw Error();}catch{throw Error('Подпись приглашения не совпадает');}
 if(value.id===(await identity()).id)throw Error('Это код этого же устройства. Открой Recall на другом устройстве.');
 const known=(await peers()).find(p=>p.id===value.id);if(known&&known.fingerprint!==await fingerprint(value.key))throw Error('Ключ знакомого устройства изменился. Удали старое подключение только после проверки второго устройства.');
 return value;
}
export async function peers(){return await getMeta<Peer[]>('peers')||[];}
export async function rememberPeer(invitation:Invitation,lastSync?:number){
 const key=await fingerprint(invitation.key);
 await db.transaction('rw',db.meta,async()=>{
  const list=await peers(),old=list.find(p=>p.id===invitation.id);
  if(old&&old.fingerprint!==key)throw Error('Ключ устройства изменился');
  const value:Peer={...old,id:invitation.id,name:invitation.name,fingerprint:key,addedAt:old?.addedAt||Date.now(),...(lastSync?{lastSync}:{})};
  await setMeta('peers',[...list.filter(p=>p.id!==value.id),value]);
 });
}
export async function forgetPeer(id:string){await db.transaction('rw',db.meta,async()=>setMeta('peers',(await peers()).filter(p=>p.id!==id)));}
export async function renameLocalDevice(name:string){const trimmed=name.trim();if(!trimmed||trimmed.length>80)throw Error('Имя устройства: от 1 до 80 символов');await db.transaction('rw',db.meta,async()=>setMeta('identity',{...await identity(),name:trimmed}));}
