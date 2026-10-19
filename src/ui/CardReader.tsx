import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Snapshot } from '../domain/types';
import { attentionByCard } from '../domain/attention';
import { resolveAttention } from '../domain/actions';
import { clozeDisplay } from '../domain/markdown';
import { Markdown } from './Markdown';
import { Button, Dialog, Empty } from './common';

type Props={s:Snapshot;ids:string[];initialId?:string;onClose:()=>void;notify:(message:string,error?:boolean)=>void};
export function CardReader({s,ids,initialId,onClose,notify}:Props){
 const [index,setIndex]=useState(()=>Math.max(0,ids.indexOf(initialId||ids[0]))),[busy,setBusy]=useState(false);
 const body=useRef<HTMLDivElement>(null),saving=useRef(false);
 const cards=ids.map(id=>s.cards.find(c=>c.id===id)).filter(c=>c&&!c.purged&&!c.conflicts.length);
 const at=Math.min(index,Math.max(0,cards.length-1)),card=cards[at],deck=s.decks.find(d=>d.id===card?.deckId);
 const pending=useMemo(()=>attentionByCard(s),[s]),needsAttention=Boolean(card&&pending.has(card.id));
 const move=(direction:number)=>{if(!saving.current)setIndex(Math.max(0,Math.min(cards.length-1,at+direction)));};
 useEffect(()=>{body.current?.scrollTo({top:0,behavior:'auto'});},[card?.id]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.altKey||event.ctrlKey||event.metaKey||event.defaultPrevented)return;
   if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
   if(event.key==='ArrowRight'){event.preventDefault();move(1);}
  };
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 });
 const studied=async()=>{
  if(!card||saving.current||!needsAttention)return;
  saving.current=true;setBusy(true);
  try{await resolveAttention(card.id);notify('Изучено. Карточка убрана из «Рассмотреть».');}
  catch(error){notify((error as Error).message,true);}
  finally{saving.current=false;setBusy(false);}
 };
 return <Dialog title="Просмотр карточек" wide onClose={()=>{if(!saving.current)onClose();}}>
  {card?<div className="card-reader">
   <div ref={body} className="card-reader-body">
    <div className="card-reader-meta"><span style={{color:deck?.color}}>{deck?.name||'Колода в корзине'}</span>{needsAttention&&<span className="attention-label">Рассмотреть</span>}</div>
    {card.title&&<h3>{card.title}</h3>}
    <Markdown>{card.type==='cloze'?clozeDisplay(card.front,card.clozeIndex||1,true):card.front}</Markdown>
    {card.back&&<div className="card-reader-answer"><Markdown>{card.back}</Markdown></div>}
    {card.notes&&<div className="card-reader-notes"><span className="eyebrow">ПОЯСНЕНИЕ</span><Markdown>{card.notes}</Markdown></div>}
    {card.type==='input'&&card.aliases.length>0&&<p className="card-reader-aliases">Другие варианты ответа: {card.aliases.join(' · ')}</p>}
   </div>
   <footer className="card-reader-footer">
    <div className="card-reader-navigation">
     <Button kind="secondary" title="Предыдущая карточка" disabled={busy||at===0} onClick={()=>move(-1)}><ArrowLeft size={17}/>Назад</Button>
     <span role="status" aria-live="polite">{at+1} / {cards.length}</span>
     <Button kind="secondary" title="Следующая карточка" disabled={busy||at===cards.length-1} onClick={()=>move(1)}>Далее<ArrowRight size={17}/></Button>
    </div>
    {needsAttention&&<Button className="card-reader-studied" title="Убрать из «Рассмотреть»" disabled={busy} onClick={studied}><CheckCircle2 size={18}/>{busy?'Сохраняем…':'Изучил'}</Button>}
    <p className="hint">Расписание сохраняется.</p>
   </footer>
  </div>:<Empty title="Нет карточек для просмотра" description="Карточки удалены или требуют выбора версии."/>}
 </Dialog>;
}
