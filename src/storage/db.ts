import Dexie, { type EntityTable } from 'dexie';
import type { Operation, Attachment, LocalIdentity } from '../domain/types';
import { validateEvents, canonical } from '../domain/protocol.mjs';
import { materialize } from '../domain/reducer';
type Meta={key:string;value:unknown};
export const db=new Dexie('recall-local-v1') as Dexie&{events:EntityTable<Operation,'id'>;attachments:EntityTable<Attachment,'id'>;meta:EntityTable<Meta,'key'>};
db.version(1).stores({events:'&id,[deviceId+seq],entityId,kind,clock',attachments:'&id',meta:'&key'});
export async function getMeta<T>(key:string):Promise<T|undefined>{return (await db.meta.get(key))?.value as T|undefined;}
export async function setMeta(key:string,value:unknown){await db.meta.put({key,value});}
export async function identity():Promise<LocalIdentity> {
 let value=await getMeta<LocalIdentity>('identity');
 if(!value){value={id:crypto.randomUUID(),name:/iPhone|iPad/.test(navigator.userAgent)?'Мой iPhone':/Android/.test(navigator.userAgent)?'Мой Android':'Мой компьютер'};await setMeta('identity',value);}return value;
}
export async function snapshot(){return materialize(await db.events.toArray());}
export async function append(kind:string,entityId:string,payload:object,extraDeps:string[]=[],at=Date.now()):Promise<Operation> {
 return db.transaction('rw',db.events,db.meta,async()=>{
  const who=await identity();
  const [last,highest,sequence]=await Promise.all([db.events.where('[deviceId+seq]').between([who.id,Dexie.minKey],[who.id,Dexie.maxKey]).last(),db.events.orderBy('clock').last(),getMeta<number>('sequence')]);
  const seq=Math.max(last?.seq||0,sequence||0)+1,clock=(highest?.clock||0)+1;
  const deps=[...new Set([...(last?[last.id]:[]),...extraDeps])];
  const e:Operation={id:crypto.randomUUID(),deviceId:who.id,seq,clock,deps,at,kind,entityId,payload:JSON.parse(JSON.stringify(payload)) as Record<string,unknown>};
  validateEvents([e]);await db.events.add(e);await setMeta('sequence',seq);return e;
 });
}
export async function merge(events:Operation[],attachments:Attachment[]=[]) {
 const checked=validateEvents(events) as Operation[];
 const batchIds=new Map<string,Operation>(),batchSequences=new Map<string,string>();
 for(const e of checked){const old=batchIds.get(e.id),seq=e.deviceId+':'+e.seq;if(old&&canonical(old)!==canonical(e))throw new Error('Конфликт содержимого события в пакете');if(batchSequences.has(seq)&&batchSequences.get(seq)!==e.id)throw new Error('Конфликт последовательности в пакете');batchIds.set(e.id,e);batchSequences.set(seq,e.id);}
 await db.transaction('rw',db.events,db.attachments,async()=>{
  for(const e of checked){const old=await db.events.get(e.id);if(old&&canonical(old)!==canonical(e))throw new Error('Событие с тем же ID содержит другие данные. Импорт остановлен.');const sameSeq=await db.events.where('[deviceId+seq]').equals([e.deviceId,e.seq]).first();if(sameSeq&&sameSeq.id!==e.id)throw new Error('Конфликт последовательности устройства');}
  const ids=new Set(checked.map(e=>e.id));const existing=await db.events.bulkGet(checked.flatMap(e=>e.deps).filter(id=>!ids.has(id)));
  const dependencyMap=new Map([...checked,...existing.filter((x):x is Operation=>Boolean(x))].map(e=>[e.id,e]));
  for(const e of checked)for(const dep of e.deps){const p=dependencyMap.get(dep);if(p&&p.clock>=e.clock)throw new Error('Нарушен причинный порядок изменений');}
  await db.attachments.bulkPut(attachments);await db.events.bulkPut(checked);
 });
}
export async function addAttachment(file:Blob,name:string) {
 if(file.size>8*1024*1024)throw new Error('Изображение должно быть меньше 8 МБ');
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Поддерживаются PNG, JPG, WebP и GIF');
 const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 await db.attachments.put({id:hash,name,type:file.type,blob:file});return hash;
}
export async function persistentStorage(){if(!navigator.storage?.persist)return false;try{return await navigator.storage.persist();}catch{return false;}}





