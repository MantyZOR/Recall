import { useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WEEKDAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const format=new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'UTC'});
function utcDate(year:number,month:number,day:number){
 const date=new Date(0);date.setUTCHours(12,0,0,0);date.setUTCFullYear(year,month,day);return date;
}
function isoDate(year:number,month:number,day:number){return utcDate(year,month,day).toISOString().slice(0,10);}
export function DateField({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const trigger=useRef<HTMLButtonElement>(null);
 const id=useId(),parsed=new Date(value+'T12:00:00Z'),selected=Number.isFinite(parsed.getTime())?parsed:new Date();
 const [open,setOpen]=useState(false),[view,setView]=useState({year:selected.getUTCFullYear(),month:selected.getUTCMonth()});
 const first=utcDate(view.year,view.month,1),offset=(first.getUTCDay()+6)%7,days=utcDate(view.year,view.month+1,0).getUTCDate();
 const thisYear=new Date().getUTCFullYear(),years=[...new Set([...Array.from({length:26},(_,i)=>thisYear-5+i),view.year,selected.getUTCFullYear()])].filter(y=>y>=1&&y<=9999).sort((a,b)=>a-b);
 const toggle=()=>{if(!open)setView({year:selected.getUTCFullYear(),month:selected.getUTCMonth()});setOpen(!open);};
 const shift=(months:number)=>{const next=utcDate(view.year,view.month+months,1);if(next.getUTCFullYear()>=1&&next.getUTCFullYear()<=9999)setView({year:next.getUTCFullYear(),month:next.getUTCMonth()});};
 const choose=(day:number)=>{onChange(isoDate(view.year,view.month,day));setOpen(false);trigger.current?.focus();};
 return <div className="date-field" onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
  <label htmlFor={id}>Дата</label>
  <button ref={trigger} id={id} type="button" className="date-trigger" aria-expanded={open} aria-controls={id+'-calendar'} aria-describedby={id+'-value'} onClick={toggle}><CalendarDays size={18}/><span id={id+'-value'}>{value?format.format(selected):'Выбрать дату'}</span></button>
  {open&&<div id={id+'-calendar'} className="date-calendar" role="group" aria-label="Выбор даты">
   <div className="date-calendar-header"><button type="button" className="icon-button" aria-label="Предыдущий месяц" disabled={view.year===1&&view.month===0} onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><strong>{MONTHS[view.month]} {view.year}</strong><button type="button" className="icon-button" aria-label="Следующий месяц" disabled={view.year===9999&&view.month===11} onClick={()=>shift(1)}><ChevronRight size={18}/></button></div>
   <div className="date-calendar-selectors"><select aria-label="Месяц" value={view.month} onChange={e=>setView({...view,month:+e.target.value})}>{MONTHS.map((month,i)=><option key={month} value={i}>{month}</option>)}</select><select aria-label="Год" value={view.year} onChange={e=>setView({...view,year:+e.target.value})}>{years.map(year=><option key={year} value={year}>{year}</option>)}</select></div>
   <div className="date-calendar-weekdays" aria-hidden="true">{WEEKDAYS.map(day=><span key={day}>{day}</span>)}</div>
   <div className="date-calendar-days">{Array.from({length:offset},(_,i)=><span key={'empty'+i} aria-hidden="true"/>)}{Array.from({length:days},(_,i)=>{const day=i+1,date=isoDate(view.year,view.month,day);return <button key={date} type="button" data-date={date} aria-label={format.format(utcDate(view.year,view.month,day))} aria-pressed={date===value} className={date===value?'selected':''} onClick={()=>choose(day)}>{day}</button>;})}</div>
  </div>}
 </div>;
}
