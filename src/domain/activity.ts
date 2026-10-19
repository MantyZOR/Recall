import type { Snapshot } from './types';
import { studyDay } from './reducer';
import { shiftedDate } from './time';

export const ACTIVITY_PERIODS=[
 {id:'month',label:'Месяц',title:'Ритм за месяц'},
 {id:'quarter',label:'12 недель',title:'Ритм за 12 недель'},
 {id:'half-year',label:'Полгода',title:'Ритм за полгода'},
 {id:'year',label:'Год',title:'Ритм за год'},
] as const;
export type ActivityPeriod=typeof ACTIVITY_PERIODS[number]['id'];

function monthsBefore(date:string,months:number){
 const [y,m,d]=date.split('-').map(Number),first=new Date(Date.UTC(y,m-1-months,1));
 const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 first.setUTCDate(Math.min(d,lastDay));return first.toISOString().slice(0,10);
}
export function activityCalendar(s:Snapshot,period:ActivityPeriod,now=Date.now()){
 const end=studyDay(now,s.settings.timeZone,s.settings.dayStartsAt);
 const start=period==='quarter'?shiftedDate(end,-83):shiftedDate(monthsBefore(end,period==='month'?1:period==='half-year'?6:12),1);
 const counts=new Map<string,number>();let total=0;
 for(const card of s.cards)for(const review of card.reviews){
  const day=studyDay(review.at,s.settings.timeZone,s.settings.dayStartsAt);
  if(day>=start&&day<=end){counts.set(day,(counts.get(day)||0)+1);total++;}
 }
 const days:{date:string;count:number}[]=[];
 for(let day=start;day<=end;day=shiftedDate(day,1))days.push({date:day,count:counts.get(day)||0});
 const offset=(new Date(start+'T12:00:00Z').getUTCDay()+6)%7;
 const cells:({date:string;count:number}|null)[]=[...Array.from({length:offset},()=>null),...days];
 while(cells.length%7)cells.push(null);
 const columns=new Map<number,string>();let previous='';
 for(const [i,cell]of cells.entries())if(cell&&cell.date.slice(0,7)!==previous){
  previous=cell.date.slice(0,7);
  columns.set(Math.floor(i/7),new Intl.DateTimeFormat('ru',{month:'short',timeZone:'UTC'}).format(new Date(cell.date+'T12:00:00Z')));
 }
 return {start,end,total,days,cells,weeks:cells.length/7,months:[...columns].map(([column,label])=>({column,label}))};
}
