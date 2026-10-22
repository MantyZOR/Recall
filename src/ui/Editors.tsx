import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, ImagePlus, Upload, Check, FileText } from 'lucide-react';
import type { Card, CardView, Deck, Snapshot, Algorithm } from '../domain/types';
import { MODEL_NAMES } from '../domain/types';
import { clozeGroups, clozeDisplay, parseMarkdown } from '../domain/markdown';
import { saveCard, saveDeck, importMarkdownCards } from '../domain/actions';
import { addAttachment } from '../storage/db';
import { readImport, importArchive, type ArchivePreview, type MarkdownPreview } from '../storage/archive';
import { replay } from '../domain/reducer';
import { Markdown } from './Markdown';
import {ChoiceOptions} from './ChoiceOptions';
import {ChoiceEditor} from './ChoiceEditor';
import { ImportDownloads } from './ImportDownloads';
import { Button, Dialog, COLORS, cleanText } from './common';
type Notify=(message:string,error?:boolean)=>void;
export function DeckEditor({s,base,onClose,notify}:{s:Snapshot;base?:Deck;onClose:()=>void;notify:Notify}){
 const [data,setData]=useState<Deck>(base||{id:crypto.randomUUID(),name:'',description:'',color:COLORS[s.decks.length%COLORS.length],icon:'Aa',algorithm:'fsrs7',retention:.9,newPerDay:20}),[busy,setBusy]=useState(false);
 const changed=base&&(data.algorithm!==base.algorithm||data.retention!==base.retention);
 const differences=changed?s.cards.filter(c=>c.deckId===data.id&&c.memory).map(c=>({before:c.memory!.due,after:replay(c.reviews,data.algorithm,data.retention,s.parameters[data.algorithm]?.values).memory!.due})): [];
 const field=<K extends keyof Deck>(key:K,value:Deck[K])=>setData(d=>({...d,[key]:value}));
 const save=async()=>{if(!data.name.trim()){notify('Введи название колоды',true);return;}setBusy(true);try{await saveDeck({...data,name:data.name.trim()},s);onClose();notify(base?'Колода обновлена':'Колода создана');}catch(e){notify((e as Error).message,true);setBusy(false);}};
 return <Dialog title={base?'Настройки колоды':'Новая колода'} onClose={onClose}><div className="form-body"><label>Название<input value={data.name} maxLength={160} placeholder="Например, английский" onChange={e=>field('name',e.target.value)}/></label><label>Описание<textarea rows={2} value={data.description} placeholder="Что хочешь запомнить?" onChange={e=>field('description',e.target.value)}/></label><div className="form-row"><label>Символ<input value={data.icon} maxLength={6} onChange={e=>field('icon',e.target.value)}/></label><label>Новых в день<input type="number" min={0} max={500} value={data.newPerDay} onChange={e=>field('newPerDay',+e.target.value)}/></label></div><label>Цвет<div className="color-picker">{COLORS.map(c=><button key={c} style={{background:c}} className={data.color===c?'chosen':''} onClick={()=>field('color',c)} aria-label={'Цвет '+c}>{data.color===c&&<Check size={16}/>}</button>)}</div></label><label>Желаемое запоминание <span>{Math.round(data.retention*100)}%</span><input type="range" min={70} max={97} value={Math.round(data.retention*100)} onChange={e=>field('retention',+e.target.value/100)}/><small>Выше вероятность вспомнить — чаще повторения.</small></label><details open={Boolean(base)}><summary>Алгоритм и расширенные настройки</summary><label>Алгоритм<select value={data.algorithm} onChange={e=>field('algorithm',e.target.value as Algorithm)}>{Object.entries(MODEL_NAMES).map(([key,value])=><option key={key} value={key}>{value}{key==='fsrs7'?' · основной':''}</option>)}</select></label><p className="hint">FSRS прогнозирует память. SM-2 и Лейтнер дают простые интервалы без вероятностного прогноза.</p></details>{changed&&<div className="notice"><strong>Предпросмотр нового расписания</strong><p>По реальной истории будут пересчитаны {differences.length} карточек. Ближайшие повторы станут раньше у {differences.filter(d=>d.after<d.before-60000).length}, позже у {differences.filter(d=>d.after>d.before+60000).length}. История и прежние зафиксированные прогнозы сохранятся.</p></div>}</div><footer className="dialog-footer"><Button kind="secondary" onClick={onClose}>Отмена</Button><Button disabled={busy} onClick={save}>{busy?'Сохраняем…':changed?'Применить новое расписание':'Сохранить колоду'}</Button></footer></Dialog>;
}
export function CardEditor({s,base,deckId,onClose,notify}:{s:Snapshot;base?:CardView;deckId?:string;onClose:()=>void;notify:Notify}){
 const [data,setData]=useState<Card>(base?{...base}:{id:crypto.randomUUID(),deckId:deckId||s.decks[0]?.id||'',title:'',type:'basic',front:'',back:'',notes:'',aliases:[],tags:[]}),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false),[reset,setReset]=useState(false);
 const field=<K extends keyof Card>(key:K,value:Card[K])=>setData(d=>({...d,[key]:value}));
 const save=async()=>{if(!data.deckId){notify('Сначала создай колоду',true);return;}if(!data.front.trim()||(!['cloze','choice'].includes(data.type)&&!data.back.trim())){notify('Заполни вопрос и ответ',true);return;}setBusy(true);try{await saveCard({...data,title:data.title.trim()||cleanText(data.front).slice(0,80)},base,s,reset);onClose();notify('Карточка сохранена на этом устройстве');}catch(e){notify((e as Error).message,true);setBusy(false);}};
 const image=async(file?:File,target:'front'|'back'='front')=>{if(!file)return;try{const id=await addAttachment(file,file.name);field(target,data[target]+'\n\n!['+file.name.replace(/[[\]]/g,'')+'](asset:'+id+')');notify('Изображение добавлено');}catch(e){notify((e as Error).message,true);}};
 return <Dialog title={base?'Редактировать карточку':'Новая карточка'} onClose={onClose} wide><div className="editor-tools"><div className="segments">{(['basic','input','cloze','choice'] as const).map(type=><button className={data.type===type?'active':''} key={type} onClick={()=>{field('type',type);if(type==='choice'&&!data.options)field('options',[{id:crypto.randomUUID(),text:'',correct:true},{id:crypto.randomUUID(),text:'',correct:false}]);}}>{({basic:'Вопрос–ответ',input:'Ввод ответа',cloze:'Пропуски',choice:'Выбор ответа'})[type]}</button>)}</div><button className="text-button" onClick={()=>setPreview(!preview)}><Eye size={16}/>{preview?'Редактор':'Предпросмотр'}</button></div><div className="editor-layout"><div className={'form-body '+(preview?'with-preview':'')}><div className="form-row"><label>Колода<select value={data.deckId} onChange={e=>field('deckId',e.target.value)}>{s.decks.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Короткое название<input value={data.title} maxLength={300} placeholder="Необязательно" onChange={e=>field('title',e.target.value)}/></label></div><label>{data.type==='cloze'?'Текст с пропусками':'Вопрос'}<textarea className="code-input" rows={6} value={data.front} placeholder={data.type==='cloze'?'Столица Франции — {{c1::Париж::город}}.':'Один вопрос — одна ясная попытка вспомнить.'} onChange={e=>field('front',e.target.value)}/></label><div className="inline-tools"><label className="text-button file-button"><ImagePlus size={16}/>Изображение<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{image(e.target.files?.[0]);e.target.value='';}}/></label><span className="muted">Markdown · $формулы$ · блоки кода</span></div>{data.type==='cloze'&&<p className="hint">Синтаксис: {'{{c1::ответ::подсказка}}'}. Разные номера создают связанные карточки. Найдено: {clozeGroups(data.front).length}.</p>}{data.type==='choice'&&<ChoiceEditor options={data.options||[]} onChange={options=>field('options',options)}/>}<label>{data.type==='choice'?'Общий разбор после проверки (необязательно)':data.type==='cloze'?'Пояснение после ответа (необязательно)':'Ответ'}<textarea className="code-input" rows={4} value={data.back} placeholder="Правильный ответ и важные детали" onChange={e=>field('back',e.target.value)}/></label><div className="inline-tools"><label className="text-button file-button"><ImagePlus size={16}/>Изображение в ответ<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{image(e.target.files?.[0],'back');e.target.value='';}}/></label></div>{data.type==='input'&&<label>Другие правильные ответы<textarea rows={2} value={data.aliases.join('; ')} placeholder="Синонимы через ;" onChange={e=>field('aliases',e.target.value.split(';').map(x=>x.trim()))}/><small>Короткие ответы сравниваются без учёта регистра, лишних пробелов и ё/е. Для формул, кода и длинного текста оценка ручная.</small></label>}<details><summary>Пояснение, теги и история</summary><label>Пояснение<textarea rows={3} value={data.notes} onChange={e=>field('notes',e.target.value)}/></label><label>Теги<input value={data.tags.join(', ')} placeholder="Через запятую" onChange={e=>field('tags',e.target.value.split(',').map(x=>x.trim()))}/></label>{base&&<label className="checkbox-label"><input type="checkbox" checked={reset} onChange={e=>setReset(e.target.checked)}/>Вопрос существенно изменился — начать состояние памяти заново</label>}</details></div>{preview&&<aside className="editor-preview"><span className="eyebrow">Так выглядит карточка</span><Markdown>{data.type==='cloze'?clozeDisplay(data.front,clozeGroups(data.front)[0]||1):data.front||'Вопрос появится здесь'}</Markdown><hr/><span className="eyebrow">Ответ</span>{data.type==='choice'&&<ChoiceOptions options={data.options||[]} readOnly/>}<Markdown>{data.type==='cloze'?clozeDisplay(data.front,clozeGroups(data.front)[0]||1,true)+(data.back?'\n\n'+data.back:''):data.back||'Ответ появится здесь'}</Markdown></aside>}</div><footer className="dialog-footer"><span className="hint">Сохранение работает без сети</span><Button kind="secondary" onClick={onClose}>Отмена</Button><Button disabled={busy} onClick={save}>{busy?'Сохраняем…':'Сохранить карточку'}</Button></footer></Dialog>;
}
export function ImportDialog({s,onClose,notify}:{s:Snapshot;onClose:()=>void;notify:Notify}){
 const [source,setSource]=useState(''),[pack,setPack]=useState<ArchivePreview|MarkdownPreview|null>(null),[target,setTarget]=useState('new'),[busy,setBusy]=useState(false);
 const [deckName,setDeckName]=useState(''),[filename,setFilename]=useState(''),[dragging,setDragging]=useState(false);
 const input=useRef<HTMLInputElement>(null),working=useRef(false);
 const parsed=useMemo(()=>source?parseMarkdown(source):null,[source]);
 const content=pack&&'parsed' in pack?pack.parsed:parsed,archive=pack&&'events' in pack?pack:null;
 const load=useCallback(async(file:File)=>{
  if(working.current)return;
  if(!/\.(md|markdown|zip)$/i.test(file.name)){notify('Выбери Markdown (.md) или ZIP-архив',true);return;}
  working.current=true;setBusy(true);
  try{
   const preview=await readImport(file);setPack(preview);setSource('');setFilename(file.name);
   if('parsed' in preview)setDeckName(preview.parsed.deck.name||file.name.replace(/\.(md|markdown|zip)$/i,''));
  }catch(e){notify((e as Error).message,true);}finally{working.current=false;setBusy(false);}
 },[notify]);
 const loadFiles=useCallback((files:FileList|File[]|null)=>{
  if(!files?.length)return;
  if(files.length!==1){notify('Перетащи один Markdown-файл или ZIP-архив',true);return;}
  void load(files[0]);
 },[load,notify]);
 useEffect(()=>{
  const hasFiles=(event:DragEvent)=>Boolean(event.dataTransfer&&Array.from(event.dataTransfer.types).includes('Files'));
  const over=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';setDragging(true);};
  const drop=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();setDragging(false);loadFiles(event.dataTransfer!.files);};
  const leave=(event:DragEvent)=>{if(!event.relatedTarget)setDragging(false);};
  const reset=()=>setDragging(false);
  window.addEventListener('dragover',over);window.addEventListener('drop',drop);window.addEventListener('dragleave',leave);
  window.addEventListener('dragend',reset);window.addEventListener('blur',reset);
  return ()=>{window.removeEventListener('dragover',over);window.removeEventListener('drop',drop);window.removeEventListener('dragleave',leave);window.removeEventListener('dragend',reset);window.removeEventListener('blur',reset);};
 },[loadFiles]);
 const apply=async()=>{
  if(working.current)return;
  working.current=true;setBusy(true);
  try{if(archive){await importArchive(archive);notify('Архив объединён с локальной базой');}else if(content){
   if(content.errors.length)throw new Error('Исправь ошибки импорта');
   const isNew=target==='new',deck=isNew?{id:crypto.randomUUID(),name:deckName.trim()||content.deck.name||'Новая колода',description:content.deck.description||'',retention:content.deck.retention||.9,algorithm:'fsrs7' as const,newPerDay:20,color:COLORS[s.decks.length%COLORS.length],icon:'Aa'}:s.decks.find(d=>d.id===target)!;
   const result=await importMarkdownCards(content.cards,deck,isNew,pack&&'parsed' in pack?pack.attachments:[]);
   notify('Добавлено '+result.added+' карточек'+(result.skipped?' · '+result.skipped+' совпадений пропущено':''));
  }onClose();}catch(e){notify((e as Error).message,true);}finally{working.current=false;setBusy(false);}
 };
 return <Dialog title="Добавить из Markdown или архива" onClose={onClose} wide>
  <div className={'import-body '+(dragging?'dragging':'')}>
   <div className="import-top">
    <div className="import-file">
     <button type="button" className="import-dropzone" disabled={busy} onClick={()=>input.current?.click()}>
      <Upload size={24}/><strong>{dragging?'Отпусти файл здесь':'Выбрать или перетащить файл'}</strong><span>Markdown (.md) или ZIP с изображениями / полным архивом</span>
     </button>
     <input ref={input} type="file" hidden aria-label="Файл Markdown или ZIP" accept=".md,.markdown,.zip" onChange={e=>{loadFiles(e.target.files);e.target.value='';}}/>
     {filename&&<div className="import-file-status"><FileText size={17}/><span>{filename}</span><button type="button" className="text-button" disabled={busy} onClick={()=>{setPack(null);setFilename('');setDeckName('');}}>Убрать файл</button></div>}
    </div>
    <ImportDownloads/>
   </div>
   <div className="import-layout">
    <div><label className="form-label">Или вставь текст
     <textarea className="code-input import-source" rows={12} disabled={busy} value={source} placeholder={'---\ndeck: Моя колода\n---\n\n## [basic] Первый вопрос\nТекст вопроса\n:::answer\nТекст ответа'} onChange={e=>{setPack(null);setFilename('');setDeckName('');setSource(e.target.value);}}/>
    </label><p className="hint">Подготовь текст сам или с помощью ИИ. Правила и примеры находятся в наборе выше.</p></div>
    <aside className="import-preview">{archive?<><span className="eyebrow">Полный архив</span><h3>{archive.events.length} событий</h3><p>{archive.attachments.length} вложений с проверенными контрольными суммами.</p><div className="notice">Импорт объединяет карточки, историю и настройки. Повторный импорт исключает дубликаты. Настройки из более поздних изменений могут обновить текущие.</div></>:content?<><span className="eyebrow">Предпросмотр импорта</span><h3>{content.cards.length} карточек</h3><label>Куда добавить<select value={target} onChange={e=>setTarget(e.target.value)}><option value="new">Создать новую колоду</option>{s.decks.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label>{target==='new'&&<label>Название<input value={deckName||content.deck.name||''} onChange={e=>setDeckName(e.target.value)}/></label>}{content.errors.map((e,i)=><p className="error-text" key={i}>{e}</p>)}<div className="preview-list">{content.cards.slice(0,8).map((c,i)=><div key={i}><span className="number">{i+1}</span><div><strong>{c.title||cleanText(c.front).slice(0,50)}</strong><small>{({basic:'Вопрос–ответ',input:'Ввод ответа',cloze:'Пропуск '+c.clozeIndex,choice:'Выбор ответа'})[c.type]}</small></div></div>)}</div></>:<div className="import-empty"><FileText size={36}/><h3>Конспект → карточки</h3><p>Выбери файл или вставь Markdown. Перед добавлением увидишь вопросы и ошибки.</p></div>}</aside>
   </div>
  </div>
  <footer className="dialog-footer"><span className="hint" role="status">{busy?'Проверяем и сохраняем…':'Данные остаются на твоих устройствах'}</span><Button kind="secondary" onClick={onClose}>Отмена</Button><Button disabled={busy||(!content&&!archive)||Boolean(content?.errors.length)} onClick={apply}>{busy?'Проверяем…':archive?'Объединить архив':'Добавить карточки'}</Button></footer>
 </Dialog>;
}
