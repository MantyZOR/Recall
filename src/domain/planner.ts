import type { Snapshot, Goal, CardView, Algorithm, Memory } from './types';
import { needsIntroduction, averageIntroductionSeconds } from './learning';
import { DAY, prediction, schedule, intervalDays } from './fsrs';
import { goalPace } from './goal-pace';
import { activeCards, todayReviews, targetRetention, studyDay } from './reducer';
export function averageSeconds(s:Snapshot){const undone=new Set(s.events.filter(e=>e.kind==='review.undo').map(e=>String(e.payload.reviewId)));const timings=s.events.filter(e=>e.kind==='review'&&!undone.has(e.id)&&Number(e.payload.durationMs)>=1000&&Number(e.payload.durationMs)<=180000).slice(-200).map(e=>Number(e.payload.durationMs)/1000);return timings.length?timings.reduce((a,b)=>a+b,0)/timings.length:20;}
export function goalForecast(s:Snapshot,g:Goal,now=Date.now()){
 const pace=goalPace(s,g,now),{selected,deadline,days}=pace,average=averageSeconds(s),reading=averageIntroductionSeconds(s);
 const newCards=selected.filter(c=>!c.memory),starts=new Map<string,number>(),used=new Set<string>();
 const byId=new Map(s.cards.map(c=>[c.id,c]));
 const touched=days?new Set([...todayReviews(s,now),...s.cards.flatMap(c=>c.introductions).filter(e=>Math.abs(e.at-now)<2*DAY)].filter(e=>
  studyDay(e.at,s.settings.timeZone,s.settings.dayStartsAt)===studyDay(now,s.settings.timeZone,s.settings.dayStartsAt)
 ).map(e=>byId.get(e.entityId)?.siblingId).filter((id):id is string=>Boolean(id))):new Set<string>();
 const priority=(a:CardView,b:CardView)=>(g.importance[b.deckId]||1)-(g.importance[a.deckId]||1);
 const candidates=[...pace.learning.sort(priority),...pace.fresh.sort(priority)];
 for(const [i,at] of pace.dailyStarts.entries()){
  let slots=i===0?pace.remainingToday:pace.newPerDay;
  const siblings=new Set<string>();
  for(const c of candidates){
   if(used.has(c.id))continue;
   const fresh=!c.introductions.length;
   if(fresh&&slots<=0)continue;
   if(s.settings.burySiblings&&c.siblingId&&(siblings.has(c.siblingId)||(i===0&&fresh&&touched.has(c.siblingId))))continue;
   starts.set(c.id,at);used.add(c.id);if(c.siblingId)siblings.add(c.siblingId);if(fresh)slots--;
  }
 }
 let seconds=0;
 const goals=[...s.goals.filter(other=>other.id!==g.id),g];
 for(const card of selected){
  const deck=s.decks.find(d=>d.id===card.deckId)!,weights=s.parameters[deck.algorithm]?.values,retention=targetRetention(deck,goals,s.settings.timeZone,now);
  let m=card.memory,at=now;
  if(!m){
   seconds+=average+(card.introductions.length?0:reading);
   const planned=starts.get(card.id);if(planned===undefined)continue;
   at=planned;m=schedule(null,3,at,0,retention,deck.algorithm,weights);
  }else m={...m,due:m.lastAt+intervalDays(m,retention,deck.algorithm,weights)*DAY};
  let visits=0;
  while(m.due<=deadline&&visits++<300){at=Math.max(now,m.due);seconds+=average;m=schedule(m,3,at,Math.max(0,(at-m.lastAt)/DAY),retention,deck.algorithm,weights);}
 }
 const available=days*g.minutes*60,uncoveredNew=newCards.length-starts.size;
 const predicted=selected.map(c=>prediction(c.memory,deadline,s.decks.find(d=>d.id===c.deckId)?.algorithm||'fsrs7',s.parameters[s.decks.find(d=>d.id===c.deckId)?.algorithm||'fsrs7']?.values)).filter((r):r is number=>r!==null);
 const current=predicted.length?predicted.reduce((a,b)=>a+b,0)/Math.max(1,selected.length):0;
 const budgetCoverage=days?(seconds>0?Math.min(1,available/seconds):1):0;
 const tempoCoverage=selected.length?(selected.length-uncoveredNew)/selected.length:1,coverage=Math.min(budgetCoverage,tempoCoverage);
 const warnings:string[]=[];
 if(!days)warnings.push('Срок подготовки уже прошёл');
 else{
  if(uncoveredNew>0)warnings.push(pace.newPerDay<pace.requiredNewPerDay?'Темп новых карточек не позволяет охватить весь материал':'Связанные пропуски не успевают пройти первую проверку до даты');
  if(budgetCoverage<1)warnings.push('При текущем бюджете времени весь материал может не поместиться');
 }
 return {...pace,newCount:newCards.length,uncoveredNew,newByDeadline:starts.size,estimatedMinutes:Math.ceil(seconds/60),availableMinutes:Math.round(available/60),requiredMinutesPerDay:days?Math.ceil(seconds/60/days):0,budgetCoverage,tempoCoverage,coverage,current,warnings,warning:warnings[0]||null};
}
export function forecastLoad(s:Snapshot,count=14,now=Date.now()){
 const cards=activeCards(s),result=Array.from({length:count},(_,i)=>({at:now+i*DAY,reviews:0,newCards:0,minutes:0}));
 const average=averageSeconds(s),states=new Map(cards.filter(c=>c.memory).map(c=>[c.id,c.memory!])),newCards=cards.filter(c=>!c.memory);
 let introduced=0;
 for(let i=0;i<count;i++){
  const day=now+(i+1)*DAY;
  for(const c of cards){const m=states.get(c.id);if(!m||m.due>day)continue;const deck=s.decks.find(d=>d.id===c.deckId)!;const weights=s.parameters[deck.algorithm]?.values;let next=m,cycles=0;
   while(next.due<=day&&cycles<12){result[i].reviews++;const at=Math.max(next.due,now+i*DAY);next=schedule(next,3,at,Math.max(0,(at-next.lastAt)/DAY),targetRetention(deck,s.goals,s.settings.timeZone,at),deck.algorithm,weights);cycles++;}
   states.set(c.id,next);
  }
  const toAdd=newCards.slice(introduced,introduced+s.settings.newPerDay);introduced+=toAdd.length;
  for(const c of toAdd){const d=s.decks.find(d=>d.id===c.deckId)!;states.set(c.id,schedule(null,3,now+i*DAY,0,targetRetention(d,s.goals,s.settings.timeZone,now+i*DAY),d.algorithm,s.parameters[d.algorithm]?.values));}
  result[i].newCards=toAdd.length;result[i].minutes=Math.ceil((result[i].reviews+toAdd.length*2)*average/60);
 }
 return result;
}
export function calibration(s:Snapshot){
 const undone=new Set(s.events.filter(e=>e.kind==='review.undo').map(e=>String(e.payload.reviewId)));
 const observed=s.events.filter(e=>e.kind==='review'&&!undone.has(e.id)&&e.payload.prediction!==null&&!e.payload.hints&&e.payload.context!=='practice'&&Number(e.payload.elapsedDays)>0);
 const bins=Array.from({length:5},(_,i)=>({min:i*.2,max:(i+1)*.2,n:0,predicted:0,actual:0}));
 for(const e of observed){const p=Math.min(.999999,Math.max(.000001,Number(e.payload.prediction))),b=bins[Math.min(4,Math.floor(p*5))];b.n++;b.predicted+=p;b.actual+=Number(e.payload.rating)>1?1:0;}
 const loss=observed.length?observed.reduce((sum,e)=>{const p=Math.min(.999999,Math.max(.000001,Number(e.payload.prediction)));return sum-(Number(e.payload.rating)>1?Math.log(p):Math.log(1-p));},0)/observed.length:null;
 return {observed,bins,loss};
}
export function estimateSessionMinutes(s:Snapshot,queue:CardView[]){return Math.max(1,Math.ceil((queue.length*averageSeconds(s)+queue.filter(c=>needsIntroduction(c,'review')).length*averageIntroductionSeconds(s))/60));}


