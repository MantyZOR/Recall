import type { CardView, Context, Snapshot } from './types';

export function needsIntroduction(card:CardView|undefined,context:Context) {
 return Boolean(card&&context!=='exam'&&!card.memory&&!card.introductions.length);
}

// The current introduction is followed by up to three other queue entries.
export function deferIntroduction(queue:string[],index:number) {
 const next=[...queue],id=next[index];
 if(id)next.splice(Math.min(next.length,index+4),0,id);
 return next;
}

export function introductionStats(s:Snapshot) {
 const readings=s.events.filter(e=>e.kind==='study.introduce');
 return {cards:new Set(readings.map(e=>e.entityId)).size,readings:readings.length,durationMs:readings.reduce((sum,e)=>sum+Number(e.payload.durationMs),0)};
}

export function averageIntroductionSeconds(s:Snapshot) {
 const timings=s.events.filter(e=>e.kind==='study.introduce'&&Number(e.payload.durationMs)>=1000&&Number(e.payload.durationMs)<=180000).slice(-200);
 return timings.length?timings.reduce((sum,e)=>sum+Number(e.payload.durationMs)/1000,0)/timings.length:30;
}
