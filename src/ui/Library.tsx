import {ChoiceOptions} from './ChoiceOptions';
import { useMemo, useState } from 'react';
import { Plus, ArrowRight, Settings2, Download, Search, Trash2, RotateCcw, FileInput, CheckCircle2, AlertTriangle, BookOpen, Repeat2, Eye } from 'lucide-react';
import type { Snapshot, Deck, CardView, Card } from '../domain/types';
import { MODEL_NAMES } from '../domain/types';
import { activeCards, deletedDecks, entityHeads } from '../domain/reducer';
import { studyPlan, studyEmptyLabel } from '../domain/study-plan';
import { StudyStatus } from './StudyStatus';
import { append, db, snapshot } from '../storage/db';
import { exportDeckPack, exportTSV } from '../storage/archive';
import { cardData, saveDeck, purgeCards, purgeDeck } from '../domain/actions';
import { clozeDisplay } from '../domain/markdown';
import { Markdown } from './Markdown';
import { CardReader } from './CardReader';
import { attentionByCard } from '../domain/attention';
import { Button, PageHeader, Empty, Dialog, Progress, cleanText, formatCount, formatDate } from './common';
type Notify=(text:string,error?:boolean)=>void;
export function Decks({s,newDeck,edit,open,start,practice,importCards,notify}:{s:Snapshot;newDeck:()=>void;edit:(d:Deck)=>void;open:(id:string)=>void;start:(ids:string[])=>void;practice:(d:Deck)=>void;importCards:()=>void;notify:Notify}){
 const cards=activeCards(s),deleted=useMemo(()=>deletedDecks(s),[s.events,s.decks]);
 const [trashOpen,setTrashOpen]=useState(false),[removing,setRemoving]=useState<Deck|null>(null),[purging,setPurging]=useState<Deck|null>(null),[busy,setBusy]=useState(false);
 const remove=async()=>{
  if(!removing)return;
  setBusy(true);
  try{
   await append('deck.delete',removing.id,{},entityHeads(s.events,removing.id,'deck.').map(e=>e.id));
   setRemoving(null);notify('Колода перемещена в корзину. Карточки и история сохранены.');
  }catch(e){notify((e as Error).message,true);}finally{setBusy(false);}
 };
 const restore=async(d:Deck)=>{
  setBusy(true);
  try{await saveDeck(d,s);notify('Колода восстановлена вместе с карточками и историей.');}
  catch(e){notify((e as Error).message,true);}finally{setBusy(false);}
 };
 const purge=async()=>{
  if(!purging)return;
  setBusy(true);
  try{
   const removed=await purgeDeck(purging.id);
   setPurging(null);notify(removed?'Колода и карточки удалены навсегда. Статистика сохранена.':'Колода уже восстановлена или удалена. Обнови корзину.');
  }catch(e){notify((e as Error).message,true);}finally{setBusy(false);}
 };
 return <>
  <PageHeader eyebrow="БИБЛИОТЕКА ЗНАНИЙ" title={trashOpen?'Корзина колод':'Твои колоды'} description={trashOpen?'Колоду можно восстановить или удалить навсегда вместе с карточками. Статистика ответов сохраняется.':'Каждой теме — своё место. Всем знаниям — время для повторения.'}>
   <Button kind="secondary" onClick={importCards}><FileInput size={17}/>Импорт</Button>
   <Button onClick={()=>{setTrashOpen(false);newDeck();}}><Plus size={17}/>Новая колода</Button>
  </PageHeader>
  <div className="deck-list-toolbar"><Button kind="ghost" onClick={()=>setTrashOpen(!trashOpen)}>{trashOpen?<RotateCcw size={16}/>:<Trash2 size={16}/>}<span>{trashOpen?'К активным колодам':'Корзина колод ('+deleted.length+')'}</span></Button></div>
  {trashOpen?(deleted.length?<div className="deck-grid">{deleted.map(d=>{
   const count=s.cards.filter(c=>c.deckId===d.id&&!c.purged).length;
   return <article className="deck-tile deleted-deck" key={d.id}>
    <div className="deck-tile-top"><span className="deck-icon" style={{color:d.color,background:d.color+'18'}}>{d.icon}</span><span className="model-tag">В КОРЗИНЕ</span></div>
    <h2 className="deck-name">{d.name}</h2><p>{d.description||'Карточки и история ответов сохранены.'}</p>
    <div className="deck-tile-count"><strong>{count}</strong><span>карточек</span></div>
    <div className="deck-trash-actions"><Button kind="secondary" disabled={busy} onClick={()=>restore(d)}><RotateCcw size={16}/>Восстановить колоду</Button><Button kind="danger" disabled={busy} onClick={()=>setPurging(d)}><Trash2 size={16}/>Удалить навсегда</Button></div>
   </article>;
  })}</div>:<Empty title="Корзина колод пуста" description="Здесь появятся колоды для восстановления или окончательного удаления. Статистика ответов сохраняется."/>):
  !s.decks.length?<Empty title="Пока ни одной колоды" description="Дай название первой теме или добавь карточки из Markdown."><Button onClick={newDeck}><Plus size={16}/>Создать колоду</Button></Empty>:
  <div className="deck-grid">{s.decks.map(d=>{
   const own=cards.filter(c=>c.deckId===d.id),plan=studyPlan(s,[d.id]),ready=plan.ready,learned=own.filter(c=>c.memory).length;
   return <article className="deck-tile" key={d.id}>
    <div className="deck-tile-top"><span className="deck-icon" style={{color:d.color,background:d.color+'18'}}>{d.icon}</span><div className="deck-tile-controls"><button className="icon-button" aria-label={'Экспорт '+d.name} title="Markdown и изображения" onClick={()=>exportDeckPack(d,own).catch(e=>notify(e.message,true))}><Download size={18}/></button><button className="icon-button" aria-label={'Настройки '+d.name} onClick={()=>edit(d)}><Settings2 size={18}/></button><button className="icon-button danger-control" aria-label={'Удалить '+d.name} title="Удалить колоду" onClick={()=>setRemoving(d)}><Trash2 size={18}/></button></div></div>
    <button className="deck-name" onClick={()=>open(d.id)}>{d.name}</button><p>{d.description||'Добавь описание этой темы'}</p>
    <div className="deck-tile-count"><strong>{own.length}</strong><span>карточек</span><span className="model-tag">{MODEL_NAMES[d.algorithm]}</span></div>
    <Progress value={own.length?learned/own.length*100:0} color={d.color}/><div className="tile-meta"><span>{learned} знакомых</span><span>Цель {Math.round(d.retention*100)}%</span></div>
    <StudyStatus plan={plan} timeZone={s.settings.timeZone} compact/>
    <div className="deck-tile-actions">
     <Button kind={ready?'primary':'secondary'} disabled={!ready} onClick={()=>start([d.id])}>{ready?'Повторить '+ready:studyEmptyLabel(plan)}<ArrowRight size={15}/></Button>
     <Button kind="secondary" onClick={()=>open(d.id)}><BookOpen size={16}/>Открыть карточки</Button>
     <Button kind="secondary" disabled={!own.length} onClick={()=>practice(d)}><Repeat2 size={16}/>Практика всей колоды</Button>
    </div>
   </article>;
  })}</div>}
  {purging&&<Dialog title="Удалить колоду навсегда?" onClose={()=>{if(!busy)setPurging(null);}}><div className="form-body deck-delete-info"><p>Колода «<strong>{purging.name}</strong>» и все её карточки будут удалены навсегда, включая карточки в корзине.</p><p>Карточек к удалению: <strong>{s.cards.filter(c=>c.deckId===purging.id&&!c.purged).length}</strong>.</p><p>Восстановить их через корзину будет нельзя. Статистика ответов сохранится. Старые архивы и резервные копии останутся.</p><p>Удаление передаётся на второе устройство при синхронизации. Колода перестанет участвовать в обучении и связанных целях.</p></div><footer className="dialog-footer"><Button kind="secondary" disabled={busy} onClick={()=>setPurging(null)}>Отмена</Button><Button kind="danger" disabled={busy} onClick={purge}><Trash2 size={16}/>{busy?'Удаляем…':'Удалить навсегда'}</Button></footer></Dialog>}
  {removing&&<Dialog title="Удалить колоду?" onClose={()=>{if(!busy)setRemoving(null);}}><div className="form-body deck-delete-info"><p>Колода «<strong>{removing.name}</strong>» и её карточки будут убраны из обучения и активной библиотеки.</p><p>В «Корзине колод» можно восстановить всё вместе с историей ответов и расписанием повторений. Удаление передаётся на второе устройство при синхронизации.</p></div><footer className="dialog-footer"><Button kind="secondary" disabled={busy} onClick={()=>setRemoving(null)}>Отмена</Button><Button kind="danger" disabled={busy} onClick={remove}><Trash2 size={16}/>{busy?'Удаляем…':'Удалить колоду'}</Button></footer></Dialog>}
 </>;
}

export function Library({s,deckFilter,setDeckFilter,newCard,edit,importCards,notify}:{s:Snapshot;deckFilter:string;setDeckFilter:(s:string)=>void;newCard:()=>void;edit:(c:CardView)=>void;importCards:()=>void;notify:Notify}){
 const [search,setSearch]=useState(''),[mode,setMode]=useState('all');
 const [reader,setReader]=useState<{ids:string[];initialId:string}|null>(null);
 const attention=useMemo(()=>attentionByCard(s),[s]);
 const [selected,setSelected]=useState<Set<string>>(new Set()),[conflict,setConflict]=useState<CardView|null>(null);
 const [pendingDelete,setPendingDelete]=useState<string[]|null>(null),[busy,setBusy]=useState(false);
 const decks=useMemo(()=>new Map(s.decks.map(d=>[d.id,d])),[s.decks]);
 const allDecks=useMemo(()=>new Map([...s.decks,...deletedDecks(s)].map(d=>[d.id,d])),[s.decks,s.events]);
 const existingCards=useMemo(()=>s.cards.filter(c=>!c.purged&&decks.has(c.deckId)),[s.cards,decks]);
 const trashed=useMemo(()=>s.cards.filter(c=>c.deleted&&!c.purged),[s.cards]);
 const list=useMemo(()=>(mode==='trash'?trashed:existingCards.filter(c=>!c.deleted)).filter(c=>
  (deckFilter==='all'||c.deckId===deckFilter)&&(mode!=='conflicts'||c.conflicts.length>0)&&(mode!=='attention'||attention.has(c.id))&&
  [c.title,c.front,c.back,c.tags.join(' '),...(c.options||[]).flatMap(o=>[o.text,o.feedback||''])].join(' ').toLowerCase().includes(search.toLowerCase())
 ),[existingCards,trashed,mode,deckFilter,search,attention]);
 const previewable=list.filter(c=>!c.conflicts.length);
 const preview=(id=previewable[0]?.id)=>{if(id)setReader({ids:previewable.map(c=>c.id),initialId:id});};
 const selectedCards=list.filter(c=>selected.has(c.id));
 const deleting=trashed.filter(c=>pendingDelete?.includes(c.id));
 const filterDecks=mode==='trash'?[...allDecks.values()]:s.decks;
 const toggle=(id:string)=>setSelected(set=>{const copy=new Set(set);copy.has(id)?copy.delete(id):copy.add(id);return copy;});
 const trash=async(ids:string[])=>{
  setBusy(true);
  try{
   await db.transaction('rw',db.events,db.meta,async()=>{
    const current=await snapshot();
    for(const c of current.cards.filter(c=>ids.includes(c.id)&&!c.deleted))await append('card.delete',c.id,{},c.heads);
   });
   setSelected(new Set());notify('Карточки перемещены в корзину');
  }catch(e){notify((e as Error).message,true);}finally{setBusy(false);}
 };
 const restore=async(c:CardView)=>{
  if(!decks.has(c.deckId)){notify('Сначала восстанови колоду в разделе «Колоды → Корзина колод»',true);return;}
  setBusy(true);
  try{
   await db.transaction('rw',db.events,db.meta,async()=>{
    const current=(await snapshot()).cards.find(item=>item.id===c.id);
    if(!current||current.purged)throw new Error('Карточка уже удалена навсегда');
    await append('card.restore',c.id,cardData(current),current.heads);
   });
   notify('Карточка восстановлена');
  }catch(e){notify((e as Error).message,true);}finally{setBusy(false);}
 };
 const removeForever=async()=>{
  if(!pendingDelete)return;
  setBusy(true);
  try{
   const count=await purgeCards(pendingDelete);
   setPendingDelete(null);setSelected(new Set());
   notify(count?'Удалено навсегда: '+count+'. Статистика ответов сохранена.':'Эти карточки уже восстановлены или удалены.');
  }catch(e){notify((e as Error).message,true);}finally{setBusy(false);}
 };
 const resolve=async(payload:Card)=>{
  if(!conflict)return;
  try{await append('card.put',conflict.id,cardData(payload),conflict.heads);setConflict(null);notify('Версия выбрана. История сохранена.');}
  catch(e){notify((e as Error).message,true);}
 };
 const exportSelected=async()=>{
  const picked=selectedCards.filter(c=>!c.deleted);if(!picked.length)return;
  const d=decks.get(picked[0].deckId)!;
  await exportDeckPack({...d,name:picked.every(c=>c.deckId===d.id)?d.name:'Выбранные карточки'},picked);
 };
 return <>
  <PageHeader eyebrow="РЕДАКТОР И ПОИСК" title={mode==='trash'?'Корзина карточек':mode==='attention'?'Рассмотреть':deckFilter==='all'?'Все карточки':allDecks.get(deckFilter)?.name||'Карточки'} description="Находи нужное, уточняй вопросы, собирай материал по частям.">
   <Button kind="secondary" disabled={!previewable.length} onClick={()=>preview()}><Eye size={17}/>{mode==='attention'?'Изучить карточки':'Предпросмотр'}</Button>
   <Button kind="secondary" onClick={importCards}>Импорт .md</Button>
   <Button onClick={newCard} disabled={!s.decks.length}><Plus size={17}/>Новая карточка</Button>
  </PageHeader>
  <div className="library-view-tabs" role="group" aria-label="Раздел карточек">
   <button className={'button '+(mode==='all'?'secondary':'ghost')} aria-pressed={mode==='all'} onClick={()=>{setMode('all');setDeckFilter('all');setSelected(new Set());}}>Все карточки</button>
   <button className={'button '+(mode==='attention'?'secondary':'ghost')} aria-pressed={mode==='attention'} onClick={()=>{setMode('attention');setDeckFilter('all');setSelected(new Set());}}>Рассмотреть ({attention.size})</button>
  </div>
  <div className="library-toolbar">
   <div className="search-input"><Search size={17}/><input placeholder="Поиск по вопросу, ответу или тегам" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <select aria-label="Фильтр колоды" value={deckFilter} onChange={e=>{setDeckFilter(e.target.value);setSelected(new Set());}}><option value="all">Все колоды</option>{filterDecks.map(d=><option key={d.id} value={d.id}>{d.name}{decks.has(d.id)?'':' (в корзине)'}</option>)}</select>
   <select aria-label="Статус карточек" value={mode} onChange={e=>{setMode(e.target.value);setDeckFilter('all');setSelected(new Set());}}>
    <option value="all">Активные</option><option value="attention">Рассмотреть ({attention.size})</option><option value="conflicts">Конфликты ({existingCards.filter(c=>!c.deleted&&c.conflicts.length).length})</option><option value="trash">Корзина ({trashed.length})</option>
   </select>
  </div>
  {mode==='attention'&&<p className="attention-copy">Карточки с оценкой «Не вспомнил». Открой готовую карточку, разберись и нажми «Изучил». Новая ошибка вернёт её в этот список.</p>}
  {s.pending.length>0&&<div className="notice warning">Есть {s.pending.length} изменений без необходимой части истории. Подключи второе устройство или импортируй полный архив.</div>}
  {mode==='trash'&&<div className="trash-toolbar"><p>Можно восстановить карточки или удалить навсегда. Статистика ответов сохранится.</p><Button kind="danger" disabled={busy||!trashed.length} onClick={()=>setPendingDelete(trashed.map(c=>c.id))}><Trash2 size={16}/>Очистить всю корзину</Button></div>}
  {selectedCards.length>0&&<div className="selection-bar">
   <strong>Выбрано: {selectedCards.length}</strong>
   {mode!=='trash'&&<Button kind="secondary" onClick={()=>exportSelected().catch(e=>notify(e.message,true))}><Download size={16}/>Скачать .md</Button>}
   <Button kind={mode==='trash'?'danger':'ghost'} disabled={busy} onClick={()=>mode==='trash'?setPendingDelete(selectedCards.map(c=>c.id)):trash(selectedCards.map(c=>c.id))}><Trash2 size={16}/>{mode==='trash'?'Удалить навсегда':'В корзину'}</Button>
  </div>}
  {list.length?<div className={'card-table '+(mode==='trash'?'card-trash':'')}>
   <div className="card-table-head"><input type="checkbox" aria-label="Выбрать все карточки" checked={list.every(c=>selected.has(c.id))} onChange={e=>setSelected(e.target.checked?new Set(list.map(c=>c.id)):new Set())}/><span>Вопрос</span><span>Колода</span><span>Следующий повтор</span><span/></div>
   {list.map(c=><div className="card-table-row" key={c.id}>
    <input type="checkbox" aria-label={'Выбрать '+c.title} checked={selected.has(c.id)} onChange={()=>toggle(c.id)}/>
    <button className="card-question" disabled={c.deleted} onClick={()=>c.conflicts.length?setConflict(c):edit(c)}>
     <strong>{c.title||cleanText(c.front).slice(0,80)}</strong><small>{cleanText(c.front).slice(0,95)}</small>
     <div className="card-tags">{attention.has(c.id)&&<span className="attention-label">Рассмотреть</span>}<span>{({basic:'Вопрос–ответ',input:'Ввод',cloze:'Пропуск',choice:'Выбор ответа'})[c.type]}</span>{c.conflicts.length>0&&<span className="conflict-tag"><AlertTriangle size={12}/>Две версии</span>}{c.tags.filter(Boolean).slice(0,3).map(t=><span key={t}>#{t}</span>)}</div>
    </button>
    <span className="card-deck" style={{color:allDecks.get(c.deckId)?.color}}>{allDecks.get(c.deckId)?.name||'Удалённая колода'}</span>
    <span className="card-due">{c.deleted?decks.has(c.deckId)?'В корзине':'Сначала восстанови колоду':c.conflicts.length?'Выбери версию':c.memory?c.memory.due<=Date.now()?'Пора повторить':formatDate(c.memory.due):'Новая'}</span>
    <div className="card-row-actions">
     {c.deleted?<><button className="icon-button" disabled={busy} aria-label={'Восстановить '+c.title} title={decks.has(c.deckId)?'Восстановить карточку':'Сначала восстанови колоду'} onClick={()=>restore(c)}><RotateCcw size={16}/></button><button className="icon-button danger-control" disabled={busy} aria-label={'Удалить навсегда '+c.title} title="Удалить навсегда" onClick={()=>setPendingDelete([c.id])}><Trash2 size={16}/></button></>:<><button className="icon-button" disabled={busy||Boolean(c.conflicts.length)} aria-label={'Просмотр '+c.title} title="Предпросмотр карточки" onClick={()=>preview(c.id)}><Eye size={17}/></button><button className="icon-button" disabled={busy} aria-label={'В корзину '+c.title} onClick={()=>trash([c.id])}><Trash2 size={16}/></button></>}
    </div>
   </div>)}
  </div>:<Empty title={mode==='trash'?'Корзина пуста':mode==='attention'?(search?'Ничего не найдено':'Всё рассмотрено'):search?'Ничего не найдено':'Здесь появятся твои вопросы'} description={mode==='trash'?'Здесь появятся карточки, которые ты переместишь в корзину.':mode==='attention'?(search?'Попробуй другой запрос или выбери все колоды.':'После ошибок в проверках здесь появятся карточки для спокойного изучения.'):search?'Попробуй другой запрос или выбери все колоды.':'Создавай карточки вручную или переноси материал из Markdown.'}>{!search&&mode!=='trash'&&mode!=='attention'&&<Button kind="secondary" onClick={importCards}><FileInput size={16}/>Импортировать Markdown</Button>}</Empty>}
  <p className="table-footer">{formatCount(list.length)}{mode==='all'?' · Каждый ответ сохраняется вместе с версией вопроса.':''}</p>
  {reader&&<CardReader s={s} ids={reader.ids} initialId={reader.initialId} onClose={()=>setReader(null)} notify={notify}/>}
  {pendingDelete&&<Dialog title="Удалить карточки навсегда?" onClose={()=>{if(!busy)setPendingDelete(null);}}>
   <div className="form-body permanent-delete-info"><p>Карточек к удалению: <strong>{deleting.length}</strong>. Они исчезнут из библиотеки и корзины. Восстановить их через приложение будет нельзя.</p>
    <ul>{deleting.slice(0,5).map(c=><li key={c.id}>{c.title||cleanText(c.front).slice(0,80)}</li>)}</ul>{deleting.length>5&&<p>И ещё {deleting.length-5}.</p>}
    <p>Статистика ответов сохранится. Старые архивы и резервные копии останутся.</p>
   </div>
   <footer className="dialog-footer"><Button kind="secondary" disabled={busy} onClick={()=>setPendingDelete(null)}>Отмена</Button><Button kind="danger" disabled={busy||!deleting.length} onClick={removeForever}><Trash2 size={16}/>{busy?'Удаляем…':'Удалить навсегда'}</Button></footer>
  </Dialog>}
  {conflict&&<Dialog title="Выбери версию карточки" onClose={()=>setConflict(null)} wide><div className="form-body"><p>На устройствах вопрос изменён по-разному. Обе версии сохранены в журнале.</p><div className="conflict-grid">{conflict.conflicts.map(e=><article key={e.id}><small>{formatDate(e.at)} · устройство {e.deviceId.slice(0,8)}</small><Markdown>{String(e.payload.front)}</Markdown>{e.payload.type==='choice'&&<ChoiceOptions options={(e.payload as unknown as Card).options||[]} readOnly/>}<hr/><Markdown>{String(e.payload.back)}</Markdown><Button kind="secondary" onClick={()=>resolve(e.payload as unknown as Card)}>Использовать эту версию</Button></article>)}</div></div></Dialog>}
 </>;
}
