import { useState } from 'react';
import { Plus, Target, CalendarDays, ArrowRight, Pencil, Trash2, FlaskConical, AlertTriangle } from 'lucide-react';
import type { Goal, Snapshot, Context } from '../domain/types';
import { goalForecast } from '../domain/planner';
import { entityHeads } from '../domain/reducer';
import { goalStudyPlan } from '../domain/study-plan';
import { StudyStatus } from './StudyStatus';
import { calendarDate, shiftedDate } from '../domain/time';
import { append } from '../storage/db';
import { DateField } from './DateField';
import { Button, PageHeader, Dialog, Empty, Progress, formatDate } from './common';

type Props={s:Snapshot;start:(g:Goal,c:Context)=>void;practice:(g:Goal)=>void;notify:(m:string,e?:boolean)=>void;};
type Forecast=ReturnType<typeof goalForecast>;

function PaceDetails({f}:{f:Forecast}){
 return <div className="goal-pace-details">
  <p><strong>На сегодня ещё {Math.min(f.fresh.length,f.remainingToday)} новых</strong><span>Осталось новых: {f.fresh.length} · впервые изучено сегодня: {f.introducedToday}</span></p>
  {f.learning.length>0&&<p>Прочитано, но ещё без первой оценки: {f.learning.length}. Эти карточки доступны сверх темпа новых.</p>}
  {f.newCount>0&&<p>До даты можно запланировать первую проверку для {f.newByDeadline} из {f.newCount} ещё не оценённых карточек.</p>}
 </div>;
}
function PlanWarnings({f}:{f:Forecast}){
 return <>{f.warnings.map(warning=><div className="notice warning" key={warning}><AlertTriangle size={17}/><div><strong>{warning}</strong><p>{warning.includes('Темп')?'Увеличь число новых в день, включи авторасчёт или перенеси дату.':warning.includes('Связанные')?'Пропуски из одного текста разносятся по дням. Перенеси дату или проверь настройку связанных карточек.':!f.days?'Выбери новую дату, чтобы продолжить подготовку.':'Увеличь минуты в день, сократи объём или перенеси дату.'}</p></div></div>)}</>;
}
export function Goals({s,start,practice,notify}:Props){
 const [editor,setEditor]=useState<Goal|null|false>(false);
 const remove=async(g:Goal)=>{try{await append('goal.delete',g.id,{},entityHeads(s.events,g.id,'goal.').map(e=>e.id));notify('Цель убрана. Карточки и история сохранены.');}catch(e){notify((e as Error).message,true);}};
 return <>
  <PageHeader eyebrow="ПОДГОТОВКА К ДАТЕ" title="Держи цель в поле зрения." description="Выбери важное и найди реалистичный ритм подготовки."><Button disabled={!s.decks.length} onClick={()=>setEditor(null)}><Plus size={17}/>Добавить цель</Button></PageHeader>
  {!s.goals.length?<Empty title="Преврати дату в понятный план" description={s.decks.length?'Экзамен, собеседование или личный рубеж. Выбери темы и минуты в день.':'Сначала создай колоды с материалом, затем добавь цель.'}><Button disabled={!s.decks.length} onClick={()=>setEditor(null)}><Target size={16}/>Создать цель</Button></Empty>:<div className="goals-list">{s.goals.map(g=>{
   const f=goalForecast(s,g),plan=goalStudyPlan(s,g);
   return <article key={g.id} className="goal-card">
    <div className="goal-card-header"><span className="metric-icon lavender"><Target size={22}/></span><div><h2>{g.name}</h2><p><CalendarDays size={14}/>{formatDate(g.date)} · дней на подготовку: {f.days}</p></div><button className="icon-button" aria-label={'Изменить '+g.name} onClick={()=>setEditor(g)}><Pencil size={17}/></button><button className="icon-button" aria-label={'Убрать '+g.name} onClick={()=>remove(g)}><Trash2 size={17}/></button></div>
    <div className="goal-topics">{s.decks.filter(d=>g.deckIds.includes(d.id)).map(d=><span key={d.id} style={{color:d.color,background:d.color+'18'}}>{d.name}{(g.importance[d.id]||1)>1?' · приоритет':''}</span>)}</div>
    <div className="goal-metrics"><div><strong>{f.selected.length}</strong><span>карточек в плане</span></div><div><strong>{g.minutes}<small> мин</small></strong><span>доступно в день</span></div><div className="goal-pace-metric"><strong>{f.newPerDay}</strong><span>новых в день · {f.automatic?'авто':'вручную'}</span><button className="text-button" onClick={()=>setEditor(g)}>Изменить темп</button></div><div><strong>{Math.round(g.retention*100)}%</strong><span>целевая память</span></div></div>
    <PaceDetails f={f}/>
    <StudyStatus plan={plan} timeZone={s.settings.timeZone} goal/>
    <div className="goal-estimate"><div><span>Оценка охвата по времени</span><strong>{Math.round(f.budgetCoverage*100)}%</strong></div><Progress value={f.budgetCoverage*100}/><small>Около {f.estimatedMinutes} мин на изучение и повторения · доступно {f.availableMinutes} мин до даты</small>{f.days>0&&<p className="goal-time-needed">Ориентир по времени: <strong>{f.requiredMinutesPerDay} мин в день</strong></p>}</div>
    <PlanWarnings f={f}/>
    <p className="goal-pace-scope">Темп действует по кнопке «Учиться по цели». В «Сегодня» и отдельных колодах используются обычные дневные лимиты. Уже введённые сегодня карточки выбранных колод учитываются в обоих режимах.</p>
    <p className="model-disclaimer">Сегодня и выбранная дата включены в план. До этой даты колоды используют целевой процент памяти. При нескольких целях действует самый высокий процент. Прогноз учитывает скорость чтения и ответов, а будущие ответы считает успешными. Первое знакомство со всеми карточками ещё не означает, что они запомнились.</p>
    <div className="goal-card-actions"><Button disabled={!plan.ready} onClick={()=>start(g,'review')}>Учиться по цели<span className="goal-ready-badge" aria-hidden="true">{plan.ready}</span><ArrowRight size={16}/></Button><Button kind="secondary" disabled={!f.selected.length} onClick={()=>practice(g)}>Практика всех карточек</Button><Button kind="ghost" disabled={!f.selected.length} onClick={()=>start(g,'exam')}><FlaskConical size={16}/>Пробная проверка</Button></div>
   </article>;
  })}</div>}
  {editor!==false&&<GoalEditor key={editor?.id||'new'} s={s} base={editor||undefined} onClose={()=>setEditor(false)} notify={notify}/>}
 </>;
}
function GoalEditor({s,base,onClose,notify}:{s:Snapshot;base?:Goal;onClose:()=>void;notify:Props['notify']}){
 const defaultDate=shiftedDate(calendarDate(Date.now(),s.settings.timeZone),30);
 const [g,setG]=useState<Goal>(base||{id:crypto.randomUUID(),name:'',date:defaultDate,minutes:s.settings.minutes,retention:.9,deckIds:s.decks.map(d=>d.id),importance:{},newPerDay:null}),[busy,setBusy]=useState(false);
 const automatic=g.newPerDay===null||g.newPerDay===undefined;
 const f=goalForecast(s,{...g,newPerDay:automatic?null:Math.min(100000,Math.max(0,Math.trunc(g.newPerDay!)))});
 const save=async()=>{
  if(!g.name.trim()||!g.date||!g.deckIds.length){notify('Укажи название, дату и хотя бы одну колоду',true);return;}
  if(!Number.isFinite(g.minutes)||g.minutes<1||g.minutes>720){notify('Укажи от 1 до 720 минут в день',true);return;}
  if(!automatic&&(!Number.isInteger(g.newPerDay)||g.newPerDay!<0||g.newPerDay!>100000)){notify('Темп — целое число от 0 до 100000 новых карточек в день',true);return;}
  setBusy(true);
  try{await append('goal.put',g.id,{...g,name:g.name.trim(),newPerDay:automatic?null:g.newPerDay},entityHeads(s.events,g.id,'goal.').map(e=>e.id));onClose();notify('Цель сохранена');}
  catch(e){notify((e as Error).message,true);setBusy(false);}
 };
 return <Dialog title={base?'Настроить цель':'Новая цель'} onClose={onClose}>
  <div className="form-body goal-form">
   <label>Название<input value={g.name} placeholder="Например, собеседование" onChange={e=>setG({...g,name:e.target.value})}/></label>
   <div className="form-row"><DateField value={g.date} onChange={date=>setG({...g,date})}/><label>Минут в день<input type="number" min={1} max={720} value={g.minutes} onChange={e=>setG({...g,minutes:+e.target.value})}/></label></div>
   <label>Темп новых карточек<select value={automatic?'auto':'manual'} onChange={e=>setG({...g,newPerDay:e.target.value==='auto'?null:f.newPerDay})}><option value="auto">Рассчитать по сроку</option><option value="manual">Задать вручную</option></select></label>
   {!automatic&&<label>Новых в день для этой цели<input type="number" inputMode="numeric" min={0} max={100000} step={1} value={g.newPerDay!} onChange={e=>setG({...g,newPerDay:+e.target.value})}/></label>}
   <p className="hint goal-pace-input-hint">Авторасчёт делит оставшиеся новые карточки по дням до даты и учитывает уже изученные сегодня. Темп пересчитывается по мере подготовки. Значение 0 в ручном режиме оставляет только повторения и незавершённые первые проверки.</p>
   <label>Желаемая память <span>{Math.round(g.retention*100)}%</span><input type="range" min={70} max={97} value={Math.round(g.retention*100)} onChange={e=>setG({...g,retention:+e.target.value/100})}/></label>
   <span className="form-label">Колоды и их важность</span>
   <div className="goal-deck-picker">{s.decks.map(d=><div key={d.id}><label className="checkbox-label"><input type="checkbox" checked={g.deckIds.includes(d.id)} onChange={e=>setG({...g,deckIds:e.target.checked?[...g.deckIds,d.id]:g.deckIds.filter(id=>id!==d.id)})}/><span className="color-dot" style={{background:d.color}}/><span className="goal-deck-name">{d.name}</span></label><select aria-label={'Приоритет '+d.name} value={g.importance[d.id]||1} onChange={e=>setG({...g,importance:{...g.importance,[d.id]:+e.target.value}})}><option value={.5}>Ниже</option><option value={1}>Обычный</option><option value={2}>Выше</option></select></div>)}</div>
   <aside className="goal-pace-preview" aria-label="План подготовки">
    <span>{automatic?'Автоматический темп':'Выбранный темп'}</span><strong>{f.newPerDay} новых в день</strong>
    {f.days>0&&<p>Дней на подготовку: {f.days}, включая сегодня и выбранную дату.{!automatic&&f.fresh.length>0&&<> Для охвата новых карточек нужен темп не ниже {f.requiredNewPerDay} в день.</>}</p>}
    <PaceDetails f={f}/>
    {f.days>0&&<p>Ориентир по времени: <strong>{f.requiredMinutesPerDay} мин в день</strong> · выбрано {g.minutes} мин.</p>}
    <PlanWarnings f={f}/>
   </aside>
   <p className="hint">Темп этой цели применяется по кнопке «Учиться по цели» независимо от обычных лимитов в настройках и колодах. Слабые карточки из важных тем будут выше в очереди. Пробная проверка сохраняется отдельно.</p>
  </div>
  <footer className="dialog-footer"><Button kind="secondary" onClick={onClose}>Отмена</Button><Button onClick={save} disabled={busy}>Сохранить цель</Button></footer>
 </Dialog>;
}
