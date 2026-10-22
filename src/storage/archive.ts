import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { db, merge, snapshot } from './db';
import { validateEvents, assetIds } from '../domain/protocol.mjs';
import { ENGINE_INFO } from '../domain/model-info.mjs';
import type { Attachment, Operation, Deck, Card } from '../domain/types';
import { exportMarkdown, parseMarkdown, type ParsedMarkdown } from '../domain/markdown';
import {choiceAnswerMarkdown} from '../domain/choice';
export function download(name:string,body:string|Blob|Uint8Array,type='text/plain;charset=utf-8'){
 const blob=body instanceof Blob?body:typeof body==='string'?new Blob([body],{type}):new Blob([body.slice().buffer as ArrayBuffer],{type});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
const extension=(type:string)=>({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[type]||'bin';
export async function createArchive(){
 const [events,attachments]=await db.transaction('r',db.events,db.attachments,()=>Promise.all([db.events.toArray(),db.attachments.toArray()]));
 if(events.length>100000)throw new Error('История превышает поддерживаемые 100 000 событий в одном архиве. Сохрани копию SQLite вместе с изображениями.');
 const files:Record<string,Uint8Array>={};
 const manifest={format:'recall-archive',version:1,createdAt:new Date().toISOString(),eventFormat:'causal-log-v1',models:['FSRS-7','FSRS-6','SM-2','Leitner'],engine:ENGINE_INFO,attachments:attachments.map(a=>({id:a.id,name:a.name,type:a.type,path:'attachments/'+a.id+'.'+extension(a.type)}))};
 files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));files['events.json']=strToU8(JSON.stringify(events,null,2));
 for(const a of attachments)files['attachments/'+a.id+'.'+extension(a.type)]=new Uint8Array(await a.blob.arrayBuffer());
 files['README.txt']=strToU8('Recall — переносимый архив, формат 1.\nmanifest.json описывает формат и вложения. events.json хранит неизменяемые действия и настройки.\nВложения адресуются SHA-256. Авторизация и секреты сопряжения не экспортируются.\nИмпорт объединяет журнал по ID и не заменяет базу. Повторный импорт безопасен.\n');
 const sizes=Object.values(files).map(bytes=>bytes.byteLength);if(sizes.some(size=>size>32*1024*1024)||sizes.reduce((sum,size)=>sum+size,0)>128*1024*1024)throw new Error('Архив превышает поддерживаемый объём восстановления: 32 МБ на файл и 128 МБ после распаковки');
 const zip=zipSync(files,{level:6});if(zip.byteLength>64*1024*1024)throw new Error('Архив превышает поддерживаемые 64 МБ. Синхронизируй данные с ПК и сохрани копию SQLite вместе с вложениями.');return zip;
}
export async function exportArchive(){download('recall-'+new Date().toISOString().slice(0,10)+'.recall.zip',await createArchive(),'application/zip');}
export async function exportDeckPack(deck:Deck,cards:Card[]){
 let md=exportMarkdown(deck,cards);const refs=[...new Set([...md.matchAll(/asset:([a-f0-9]{64})/g)].map(m=>m[1]))],files:Record<string,Uint8Array>={};
 for(const id of refs){const a=await db.attachments.get(id);if(!a)throw new Error('Вложение отсутствует');const file='attachments/'+a.id+'.'+extension(a.type);md=md.replaceAll('asset:'+id,file);files[file]=new Uint8Array(await a.blob.arrayBuffer());}
 if(!refs.length){download(deck.name+'.md',md);return;}
 files['cards.md']=strToU8(md);download(deck.name+'.cards.zip',zipSync(files,{level:6}),'application/zip');
}
export interface ArchivePreview {events:Operation[];attachments:Attachment[];count:number;}
export interface MarkdownPreview {parsed:ParsedMarkdown;attachments:Attachment[];}
function unzipSafe(bytes:Uint8Array){
 if(bytes.byteLength>64*1024*1024)throw new Error('Архив должен быть меньше 64 МБ');
 let total=0;
 return unzipSync(bytes,{filter:file=>{total+=file.originalSize;if(file.originalSize>32*1024*1024||total>128*1024*1024)throw new Error('Распакованный архив слишком большой');if(file.name.includes('..')||file.name.startsWith('/')||file.name.includes('\\'))throw new Error('Некорректный путь в архиве');return true;}});
}
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer as ArrayBuffer)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function readImport(file:File):Promise<ArchivePreview|MarkdownPreview> {
 if(file.size>64*1024*1024)throw new Error('Файл слишком большой');
 if(/\.md$|\.markdown$/i.test(file.name))return {parsed:parseMarkdown(await file.text()),attachments:[]};
 const files=unzipSafe(new Uint8Array(await file.arrayBuffer()));
 if(files['manifest.json']){
  const manifest=JSON.parse(strFromU8(files['manifest.json']));if(manifest.format!=='recall-archive'||manifest.version!==1||!Array.isArray(manifest.attachments)||!files['events.json'])throw new Error('Неподдерживаемый формат архива');
  const events=validateEvents(JSON.parse(strFromU8(files['events.json']))) as Operation[],attachments:Attachment[]=[];
  for(const a of manifest.attachments){if(!/^[a-f0-9]{64}$/.test(a.id)||typeof a.path!=='string'||!files[a.path]||!['image/png','image/jpeg','image/webp','image/gif'].includes(a.type))throw new Error('Повреждено описание вложений');const bytes=files[a.path];if(bytes.byteLength>8*1024*1024)throw new Error('Изображение превышает 8 МБ');if(await digest(bytes)!==a.id)throw new Error('Контрольная сумма вложения не совпадает');attachments.push({id:a.id,name:String(a.name),type:a.type,blob:new Blob([bytes.slice().buffer as ArrayBuffer],{type:a.type})});}
  const knownIds=new Set([...events.map(e=>e.id),...(await db.events.toArray()).map(e=>e.id)]);if(events.some(e=>e.deps.some(id=>!knownIds.has(id))))throw new Error('В архиве отсутствует часть истории');
  const knownAssets=new Set([...attachments.map(a=>a.id),...(await db.attachments.toArray()).map(a=>a.id)]);if(assetIds(events).some((id:string)=>!knownAssets.has(id)))throw new Error('В архиве отсутствуют изображения');
  const duplicateIds=new Set<string>(),seqs=new Set<string>();for(const e of events){if(duplicateIds.has(e.id)||seqs.has(e.deviceId+':'+e.seq))throw new Error('Повторяющиеся события в архиве');duplicateIds.add(e.id);seqs.add(e.deviceId+':'+e.seq);}
  return {events,attachments,count:events.filter(e=>e.kind==='card.put').length};
 }
 if(!files['cards.md'])throw new Error('В архиве нужен cards.md либо manifest.json');
 let source=strFromU8(files['cards.md']);const attachments:Attachment[]=[];
 for(const [name,bytes]of Object.entries(files)){if(name==='cards.md')continue;const ext=name.split('.').at(-1)?.toLowerCase();const type=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'} as Record<string,string>)[ext||''];if(!type)continue;if(bytes.byteLength>8*1024*1024)throw new Error('Изображение превышает 8 МБ');const id=await digest(bytes);attachments.push({id,name:name.split('/').at(-1)||name,type,blob:new Blob([bytes.slice().buffer as ArrayBuffer],{type})});source=source.replaceAll(']('+name+')','](asset:'+id+')');}
 return {parsed:parseMarkdown(source),attachments};
}
export async function importArchive(preview:ArchivePreview){await merge(preview.events,preview.attachments);return snapshot();}
export function exportTSV(deck:Deck,cards:Card[]){const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';download(deck.name+'.tsv',['Вопрос\tОтвет\tТип\tТеги',...cards.map(c=>[c.front+(c.type==='choice'?'\n\n'+(c.options||[]).map(o=>'- '+o.text).join('\n'):''),c.type==='choice'?choiceAnswerMarkdown(c.options)+(c.back?'\n\n'+c.back:''):c.back,c.type,c.tags.join(', ')].map(quote).join('\t'))].join('\n'),'text/tab-separated-values;charset=utf-8');}



