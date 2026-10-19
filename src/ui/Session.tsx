import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, CheckCircle2, Undo2, Lightbulb, Pencil, Sparkles, ArrowRight, BookOpen } from 'lucide-react';
import type { Snapshot, CardView, Rating, Context, Review, Introduction } from '../domain/types';
import { MODEL_NAMES } from '../domain/types';
import { prediction, schedule, intervalLabel, DAY } from '../domain/fsrs';
import { clozeDisplay, clozeHasHint, checkTypedAnswer } from '../domain/markdown';
import { needsIntroduction, deferIntroduction } from '../domain/learning';
import { append, snapshot } from '../storage/db';
import { causalHeads, targetRetention } from '../domain/reducer';
import { Button, Progress, formatCount } from './common';
import { Markdown } from './Markdown';
import { CardReader } from './CardReader';
import { useStudyDock } from './use-study-dock';

type Props={s:Snapshot;ids:string[];context:Context;minutes:number;onExit:()=>void;edit:(c:CardView)=>void;notify:(s:string,error?:boolean)=>void;};
const RATING_NAMES=['Не вспомнил','Трудно','Нормально','Легко'];
const RATING_COMPACT=['Забыл','Трудно','Норм.','Легко'];

export function Session({s,ids,context,minutes,onExit,edit,notify}:Props){
 const [consider,setConsider]=useState(false);
 const answerSection=useRef<HTMLDivElement>(null),skipped=useRef(new Set<string>());
 const latest=useRef(s);if(s.events.length>=latest.current.events.length)latest.current=s;
 const [queue,setQueue]=useState(ids),[index,setIndex]=useState(0),[shown,setShown]=useState(false),[typed,setTyped]=useState(''),[hints,setHints]=useState(false),[busy,setBusy]=useState(false);
 const [card,setCard]=useState<CardView|undefined>(()=>s.cards.find(c=>c.id===ids[0])),[answeredAt,setAnsweredAt]=useState(0),[prePrediction,setPrediction]=useState<number|null>(null),[duration,setDuration]=useState(0);
 const [introducing,setIntroducing]=useState(()=>needsIntroduction(s.cards.find(c=>c.id===ids[0]),context));
 const [readings,setReadings]=useState<{cardId:string;duration:number}[]>([]);
 const [results,setResults]=useState<{id:string;cardId:string;rating:Rating;hints:boolean;duration:number;index:number;queuedAgain:boolean}[]>([]),[tick,setTick]=useState(Date.now()),[budget,setBudget]=useState(minutes);
 const sessionId=useRef(crypto.randomUUID()),started=useRef(performance.now()),sessionStarted=useRef(Date.now()),saving=useRef(false),againCounts=useRef(new Map<string,number>());
 const capture=(c:CardView|undefined,source:Snapshot)=>{
  const deck=source.decks.find(d=>d.id===c?.deckId),params=deck?source.parameters[deck.algorithm]:undefined;
  return {deck,weights:params?.values,paramsId:params?.id||(deck?.algorithm||'fsrs7')+'-defaults-v1',
   parameterEvents:params?source.events.filter(e=>e.kind==='model.parameters'&&e.entityId===params.id).slice(-1).map(e=>e.id):[],
   previous:c?causalHeads(source.events,c.reviews).map(e=>e.id):[],retention:deck?targetRetention(deck,source.goals,source.settings.timeZone):.9};
 };
 const presented=useRef(capture(card,s)),liveVersion=s.cards.find(c=>c.id===queue[index])?.version;
 useEffect(()=>{
  const c=latest.current.cards.find(c=>c.id===queue[index]);presented.current=capture(c,latest.current);
  setCard(c);setIntroducing(needsIntroduction(c,context)&&!skipped.current.has(c?.id+':'+c?.version));
  setShown(false);setTyped('');setHints(false);setAnsweredAt(0);setPrediction(null);started.current=performance.now();
  if(window.matchMedia('(max-width:820px)').matches)window.scrollTo({top:0,behavior:'auto'});
 },[index,queue[index],liveVersion]);
 useEffect(()=>{const id=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(id);},[]);
 const {deck,weights,retention}=presented.current;
 const spent=(tick-sessionStarted.current)/60000,timeUp=spent>=budget&&(results.length>0||readings.length>0),done=index>=queue.length||timeUp;
 const controls=useStudyDock(!done&&Boolean(card&&deck));
 const correct=results.filter(r=>r.rating>1&&!r.hints).length,auto=card&&card.type==='input'&&s.settings.inputMode==='auto-short'?checkTypedAnswer(typed,card):null;
 useEffect(()=>{
  const answer=answerSection.current;
  if(!shown||introducing||!answer||!window.matchMedia('(max-width:820px)').matches)return;
  const section=answer.getBoundingClientRect(),dock=controls.current?.getBoundingClientRect();
  const viewport=window.visualViewport,visibleBottom=Math.min(dock?.top??window.innerHeight,viewport?viewport.offsetTop+viewport.height:window.innerHeight);
  if(section.top+64<=visibleBottom)return;
  const header=answer.closest('.session')?.querySelector('.session-header')?.getBoundingClientRect();
  window.scrollTo({top:Math.max(0,window.scrollY+section.top-62-(header?.height||0)-12),behavior:'auto'});
 },[shown,introducing,controls]);

 const introduce=async()=>{
  if(!introducing||!card||!deck||saving.current||done||context==='exam')return;
  saving.current=true;setBusy(true);
  try{
   const live=latest.current.cards.find(c=>c.id===card.id);
   if(live?.deleted||live?.conflicts.length||live?.version!==card.version)throw new Error('Карточка изменилась во время чтения. Закрой сессию и открой её заново.');
   const durationMs=Math.min(86400000,Math.max(0,performance.now()-started.current));
   const payload:Introduction={cardId:card.id,cardVersion:card.version,durationMs,context,sessionId:sessionId.current};
   await append('study.introduce',card.id,payload,card.heads);latest.current=await snapshot();
   setReadings(r=>[...r,{cardId:card.id,duration:durationMs}]);setQueue(q=>deferIntroduction(q,index));setIndex(i=>i+1);
  }catch(e){notify('Изучение не сохранено: '+(e as Error).message,true);}finally{saving.current=false;setBusy(false);}
 };
 const skipIntroduction=()=>{
  if(!introducing||!card||saving.current)return;
  skipped.current.add(card.id+':'+card.version);setIntroducing(false);setShown(false);started.current=performance.now();
  if(window.matchMedia('(max-width:820px)').matches)window.scrollTo({top:0,behavior:'auto'});
 };
 const reveal=()=>{
  if(!card||shown||introducing||saving.current)return;
  const at=Date.now();setAnsweredAt(at);setDuration(Math.min(86400000,Math.max(0,performance.now()-started.current)));
  setPrediction(prediction(card.memory,at,deck?.algorithm||'fsrs7',weights));setShown(true);
 };
 const grade=async(rating:Rating)=>{
  if(!shown||introducing||!card||!deck||saving.current||done)return;
  saving.current=true;setBusy(true);
  try{
   const live=latest.current.cards.find(c=>c.id===card.id);
   if(live?.deleted||live?.conflicts.length||live?.version!==card.version)throw new Error('Карточка изменилась во время ответа. Закрой сессию и открой её заново.');
   const previous=presented.current.previous;
   const actual:Rating=hints?1:rating,elapsed=card.memory?Math.max(0,(answeredAt-card.memory.lastAt)/DAY):0;
   const learningAttempt=!card.memory&&card.introductions.length>0;
   const actualContext=context==='review'&&(learningAttempt||results.some(r=>r.cardId===card.id))?'practice':context;
   const payload:Review={cardId:card.id,cardVersion:card.version,rating:actual,elapsedDays:elapsed,durationMs:duration,context:actualContext,hints,model:deck.algorithm==='fsrs7'?'FSRS-7/rust-scalar-v1':MODEL_NAMES[deck.algorithm],paramsId:presented.current.paramsId,retention,prediction:prePrediction,previousReviewIds:previous,sessionId:sessionId.current};
   const deps=[...card.heads,...previous,...causalHeads(latest.current.events,card.introductions).map(e=>e.id),...presented.current.parameterEvents];
   const e=await append('review',card.id,payload,deps,answeredAt);latest.current=await snapshot();
   const count=againCounts.current.get(card.id)||0,queuedAgain=actual===1&&context!=='exam'&&count<2;
   if(queuedAgain){againCounts.current.set(card.id,count+1);setQueue(q=>{const copy=[...q];copy.splice(Math.min(copy.length,index+4),0,card.id);return copy;});}
   setResults(r=>[...r,{id:e.id,cardId:card.id,rating:actual,hints,duration,index,queuedAgain}]);setIndex(i=>i+1);
  }catch(e){notify('Ответ не сохранён: '+(e as Error).message,true);}finally{saving.current=false;setBusy(false);}
 };
 const undo=async()=>{
  const last=results.at(-1);if(!last||saving.current)return;saving.current=true;setBusy(true);
  try{
   await append('review.undo',last.cardId,{reviewId:last.id},[last.id]);const fresh=await snapshot();latest.current=fresh;
   if(last.queuedAgain){setQueue(q=>{const copy=[...q];const pos=copy.findIndex((id,i)=>i>last.index&&id===last.cardId);if(pos>=0)copy.splice(pos,1);return copy;});againCounts.current.set(last.cardId,Math.max(0,(againCounts.current.get(last.cardId)||1)-1));}
   setResults(r=>r.slice(0,-1));setIndex(last.index);setCard(fresh.cards.find(c=>c.id===last.cardId));setShown(false);setTyped('');setHints(false);started.current=performance.now();notify('Последняя оценка отменена');
  }catch(e){notify((e as Error).message,true);}finally{saving.current=false;setBusy(false);}
 };
 useEffect(()=>{
  const handle=(e:KeyboardEvent)=>{
   if(e.repeat||document.querySelector('[role="dialog"]'))return;
   const tag=(e.target as HTMLElement).tagName;if(['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(tag))return;
   if(e.code==='Space'||e.key==='Enter'){e.preventDefault();if(introducing)introduce();else if(!shown)reveal();else if(auto!==null)grade(auto?3:1);}
   else if(shown&&['1','2','3','4'].includes(e.key)){e.preventDefault();grade(+e.key as Rating);}
   else if(e.key.toLowerCase()==='z'&&(e.ctrlKey||e.metaKey)){e.preventDefault();undo();}
  };
  document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle);
 });
 if(done||!card||!deck)return <div className="session-summary">
  <div className="summary-spark"><Sparkles size={38}/></div><span className="eyebrow">{timeUp?'ВРЕМЯ ДЛЯ ПАУЗЫ':'СЕССИЯ ЗАВЕРШЕНА'}</span>
  <h1>{results.length||readings.length?'Ещё немного осталось с тобой.':'На сейчас всё спокойно.'}</h1>
  <p>{timeUp?'Бюджет времени на эту сессию закончился. Уже сохранённые ответы и изучение учтены.':'Все оценки сохранены на этом устройстве. Следующие повторы назначены по истории.'}</p>
  <div className="summary-metrics"><div><strong>{results.length}</strong><span>ответов</span></div><div><strong>{results.length?Math.round(correct/results.length*100)+'%':'—'}</strong><span>без подсказки</span></div><div><strong>{Math.max(0,Math.round(spent))}</strong><span>минут</span></div></div>
  {readings.length>0&&<div className="introduction-summary"><BookOpen size={20}/><div><strong>Первичное изучение: {formatCount(new Set(readings.map(r=>r.cardId)).size)}</strong><p>Чтение учтено отдельно от ответов.{timeUp&&index<queue.length?' Карточки без первой оценки ждут проверки в «Сегодня».':''}</p></div></div>}
  {results.some(r=>r.rating===1)&&<div className="notice"><strong>Что полезно уточнить</strong><p>{[...new Set(results.filter(r=>r.rating===1).map(r=>s.cards.find(c=>c.id===r.cardId)?.title))].slice(0,6).filter(Boolean).join(' · ')}</p><p>Эти карточки доступны в «Карточки → Рассмотреть».</p><Button kind="secondary" onClick={()=>setConsider(true)}><BookOpen size={17}/>Разобрать карточки</Button></div>}
  {consider&&<CardReader s={s} ids={[...new Set(results.filter(r=>r.rating===1).map(r=>r.cardId))]} onClose={()=>setConsider(false)} notify={notify}/>}
  <div className="summary-buttons"><Button onClick={onExit}>Вернуться к сегодня<ArrowRight size={16}/></Button>{timeUp&&index<queue.length&&<Button kind="secondary" onClick={()=>setBudget(b=>b+minutes)}>Продолжить ещё {minutes} мин</Button>}{results.length>0&&<button className="text-button" disabled={busy} onClick={undo}><Undo2 size={16}/>Отменить последнюю оценку</button>}</div>
 </div>;
 const displayFront=card.type==='cloze'?clozeDisplay(card.front,card.clozeIndex||1,false,hints):card.front;
 const displayBack=card.type==='cloze'?clozeDisplay(card.front,card.clozeIndex||1,true)+(card.back?'\n\n'+card.back:''):card.back;
 const choices=([1,2,3,4] as Rating[]).map(r=>schedule(card.memory,r,answeredAt||Date.now(),card.memory?Math.max(0,((answeredAt||Date.now())-card.memory.lastAt)/DAY):0,retention,deck.algorithm,weights));
 const learningAttempt=!card.memory&&card.introductions.length>0;
 return <div className={'session'+(introducing?' session-introduction':'')}>
  <header className="session-header"><button className="text-button" onClick={onExit}><ArrowLeft size={17}/>Завершить</button><span>{context==='review'?'Повторение':context==='exam'?'Пробная проверка':'Дополнительная практика'}</span><span className="session-time"><Clock3 size={16}/>{Math.max(0,Math.ceil(budget-spent))} мин</span></header>
  <div className="session-progress"><Progress value={index/queue.length*100}/><span>{index+1} / {queue.length}</span></div>
  <div className="study-card">
   <div className="study-card-top"><span className="deck-label" style={{color:deck.color}}><span style={{background:deck.color}}/>{deck.name}</span><button className="icon-button" aria-label="Редактировать текущую карточку" onClick={()=>edit(card)}><Pencil size={16}/></button></div>
   <span className="eyebrow">{introducing?'ПЕРВИЧНОЕ ИЗУЧЕНИЕ':card.type==='input'?'НАБЕРИ СВОЙ ОТВЕТ':card.type==='cloze'?'ВОССТАНОВИ ПРОПУСК':'ПОПРОБУЙ ВСПОМНИТЬ'}</span>
   {introducing&&<p className="introduction-copy">Сначала прочитай вопрос и ответ. Можно спокойно разобраться — оценку поставишь после самостоятельной попытки.</p>}
   {!introducing&&learningAttempt&&<p className="introduction-copy">Теперь попробуй ответить без подсказки. Это первая учебная проверка.</p>}
   <Markdown className="question-markdown">{displayFront}</Markdown>
   {card.type==='input'&&!shown&&!introducing&&<textarea autoFocus className="typed-answer" placeholder="Твой ответ…" rows={2} value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&checkTypedAnswer(typed,card)!==null){e.preventDefault();reveal();}}}/>}
   {(shown||introducing)&&<div ref={answerSection} className="answer-section">
    <span className="eyebrow">{introducing?'ОТВЕТ ДЛЯ ИЗУЧЕНИЯ':'ПРАВИЛЬНЫЙ ОТВЕТ'}</span>
    {card.type==='input'&&typed&&!introducing&&<div className={'typed-result '+(auto===true?'correct':auto===false?'incorrect':'')}><span>Твой ответ: {typed}</span><strong>{auto===true?'Совпадает':auto===false?'Есть различия':'Оцени по смыслу'}</strong></div>}
    <Markdown>{displayBack}</Markdown>
    {card.notes&&<details className="answer-notes" open={introducing||undefined}><summary>Пояснение</summary><Markdown>{card.notes}</Markdown></details>}
    {!introducing&&prePrediction!==null&&<div className="prediction-note">Прогноз до ответа: {Math.round(prePrediction*100)}% · {MODEL_NAMES[deck.algorithm]}</div>}
   </div>}
   {!shown&&!introducing&&card.type==='cloze'&&context!=='exam'&&clozeHasHint(card.front,card.clozeIndex||1)&&<button className="text-button hint-button" onClick={()=>setHints(true)}><Lightbulb size={16}/>{hints?'Подсказка использована':'Показать подсказку'}</button>}
  </div>
  <div ref={controls} className="session-answer-controls" role="group" aria-label="Ответ и оценки">
   <div className="study-dock-note"><span>{busy?'Сохраняем…':introducing?'Изучаем новое · без оценки':hints?'С подсказкой · засчитаем «Не вспомнил»':!shown?'Вспомни ответ':auto===true?'Ответ верный':auto===false?'Ответ отличается':'Выбери оценку'}</span>{results.length>0&&<button className="text-button" aria-label="Отменить оценку" onClick={undo} disabled={busy}><Undo2 size={15}/>Отменить</button>}</div>
   {introducing?<><div className="introduction-actions">
    <button className="button primary introduction-next" aria-label="Прочитал — проверить позже" disabled={busy} onClick={introduce}><strong>Прочитал</strong><span>Проверить позже</span></button>
    <button className="button secondary introduction-skip" aria-label="Уже знаю — проверить" disabled={busy} onClick={skipIntroduction}><strong>Уже знаю</strong><span>Проверить сейчас</span></button>
   </div><p className="hint">{queue.length-index>1?'Вернёмся к вопросу после нескольких других карточек.':'Следом попробуем ответить без подсказки.'}</p></>
   :!shown?<><Button className="reveal-button" onClick={reveal}>Показать ответ<span>↵</span></Button><p className="hint">Сначала сделай самостоятельную попытку вспомнить.</p></>
   :<>{hints&&<p className="warning-text">С подсказкой ответ не считается самостоятельным. Сохраним «Не вспомнил».</p>}{auto!==null&&!hints&&<p className={'auto-rating '+(auto?'correct':'incorrect')}>{auto?'Короткий ответ верный. Рекомендуем «Нормально».':'Короткий ответ отличается. Рекомендуем «Не вспомнил».'} Оценку можно уточнить.</p>}
    <div className="rating-buttons">{choices.map((m,i)=><button key={i} aria-label={RATING_NAMES[i]+' · '+intervalLabel(m.due-(answeredAt||Date.now()))+(auto!==null&&((auto&&i===2)||(!auto&&i===0))?' · рекомендуем':'')} className={'rating rating-'+(i+1)+(auto!==null&&((auto&&i===2)||(!auto&&i===0))?' suggested':'')} disabled={busy||(hints&&i!==0)} onClick={()=>grade(i+1 as Rating)}><span className="rating-key">{i+1}</span><strong><span className="rating-name-full">{RATING_NAMES[i]}</span><span className="rating-name-compact" aria-hidden="true">{RATING_COMPACT[i]}</span></strong><span className="rating-interval">{intervalLabel(m.due-(answeredAt||Date.now()))}</span>{auto!==null&&((auto&&i===2)||(!auto&&i===0))&&<span className="rating-recommendation">Рекомендуем</span>}</button>)}</div><p className="rating-help">«Трудно» — вспомнил с усилием. «Не вспомнил» — ответ не удалось воспроизвести.</p>
   </>}
  </div>
  <footer className="session-footer"><span><CheckCircle2 size={14}/>{introducing?'Чтение сохраняется отдельно от оценок':'Сохранение до следующей карточки'}</span>{results.length>0&&<button className="text-button" onClick={undo} disabled={busy}><Undo2 size={15}/>Отменить оценку</button>}</footer>
 </div>;
}
