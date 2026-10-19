import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Snapshot } from '../domain/types';
import { ACTIVITY_PERIODS, activityCalendar, type ActivityPeriod } from '../domain/activity';
import { getMeta, setMeta } from '../storage/db';
import { formatCount } from './common';

const palette=['var(--heatmap-empty)','#dad7f5','#afa8e8','#8276d9','#5350c7'];
const dateLabel=(date:string)=>new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export function ActivityRhythm({s}:{s:Snapshot}){
 const [period,setPeriod]=useState<ActivityPeriod>('quarter'),chosen=useRef(false),scroll=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let active=true;
  getMeta<ActivityPeriod>('activityPeriod').then(value=>{if(active&&!chosen.current&&ACTIVITY_PERIODS.some(p=>p.id===value))setPeriod(value!);}).catch(()=>{});
  return()=>{active=false;};
 },[]);
 const data=useMemo(()=>activityCalendar(s,period),[s,period]);
 useEffect(()=>{const element=scroll.current;if(element)element.scrollLeft=element.scrollWidth;},[period,data.end]);
 const title=ACTIVITY_PERIODS.find(p=>p.id===period)!.title;
 const choose=(value:ActivityPeriod)=>{chosen.current=true;setPeriod(value);setMeta('activityPeriod',value).catch(()=>{});};
 const style={'--activity-cell':period==='month'||period==='quarter'?'20px':'12px'} as CSSProperties;
 return <section className="panel activity-panel activity-rhythm">
  <div className="section-title"><h2>{title}</h2><label className="activity-period">Период<select aria-label="Период ритма" value={period} onChange={e=>choose(e.target.value as ActivityPeriod)}>{ACTIVITY_PERIODS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label></div>
  <p className="activity-period-summary"><span>{dateLabel(data.start)} — {dateLabel(data.end)}</span><strong>{formatCount(data.total,['ответ','ответа','ответов'])} за период</strong></p>
  <div ref={scroll} className="activity-calendar-scroll" tabIndex={0} aria-label={'Календарь: '+title.toLowerCase()}>
   <div className="activity-calendar" style={style}>
    <div className="activity-months" style={{gridTemplateColumns:'repeat('+data.weeks+', var(--activity-cell))'}}>{data.months.map((m,i)=><span key={m.column} style={{gridColumn:(m.column+1)+' / span '+Math.min(4,(data.months[i+1]?.column??data.weeks)-m.column)}}>{m.label}</span>)}</div>
    <div className="activity-calendar-body">
     <div className="activity-weekdays" aria-hidden="true">{['Пн','','Ср','','Пт','','Вс'].map((day,i)=><span key={i}>{day}</span>)}</div>
     <div className="heatmap" role="img" aria-label={title+': '+formatCount(data.total,['ответ','ответа','ответов'])} style={{gridTemplateColumns:'repeat('+data.weeks+', var(--activity-cell))'}}>
      {data.cells.map((day,i)=>day?<span key={day.date} data-date={day.date} title={dateLabel(day.date)+': '+formatCount(day.count,['ответ','ответа','ответов'])} style={{background:palette[day.count===0?0:day.count<5?1:day.count<15?2:day.count<35?3:4]}}/>:<span key={'empty-'+i} className="activity-empty" aria-hidden="true"/>)}
     </div>
    </div>
   </div>
  </div>
  <div className="heatmap-legend"><span>Меньше</span>{palette.map(color=><i key={color} style={{background:color}}/>)}<span>Больше</span></div>
 </section>;
}
