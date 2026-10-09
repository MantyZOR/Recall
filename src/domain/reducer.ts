import type { Operation, Snapshot, Deck, Card, CardView, Goal, Memory, Review, ParameterSet, Algorithm } from './types';
import { DEFAULT_SETTINGS } from './types';
import { DAY, schedule } from './fsrs';
import { dateEnd } from './time';
export const compareEvents=(a:Operation,b:Operation)=>a.clock-b.clock||a.deviceId.localeCompare(b.deviceId,'en')||a.seq-b.seq||a.id.localeCompare(b.id,'en');
export function orderedEvents(events:Operation[]) {
 const sorted=[...events].sort(compareEvents),seen=new Set<string>(),applied:Operation[]=[],pending:Operation[]=[];
 for(const e of sorted) {if(e.deps.every(d=>seen.has(d))){seen.add(e.id);applied.push(e);}else pending.push(e);}
 return {applied,pending};
}
export function isAncestor(ancestor:string,event:Operation,byId:Map<string,Operation>) {
 const target=byId.get(ancestor);if(!target)return false;
 const stack=[...event.deps],seen=new Set<string>();
 while(stack.length){const id=stack.pop()!;if(id===ancestor)return true;if(seen.has(id))continue;seen.add(id);const e=byId.get(id);if(e&&e.clock>=target.clock)stack.push(...e.deps);}
 return false;
}
export function causalHeads(events:Operation[],candidates:Operation[],known?:Map<string,Operation>) {
 const byId=known||new Map(events.map(e=>[e.id,e])),heads:Operation[]=[];
 for(const e of [...candidates].sort(compareEvents)){for(let i=heads.length-1;i>=0;i--)if(isAncestor(heads[i].id,e,byId))heads.splice(i,1);heads.push(e);}
 return heads;
}
export function entityHeads(events:Operation[],entityId:string,kindPrefix:string){return causalHeads(events,events.filter(e=>e.entityId===entityId&&e.kind.startsWith(kindPrefix)));}
export function targetRetention(deck:Deck,goals:Goal[],zone:string,now=Date.now()){const active=goals.filter(g=>g.deckIds.includes(deck.id)&&dateEnd(g.date,zone)>=now);return active.length?Math.max(...active.map(g=>g.retention)):deck.retention;}
export function replay(reviews:Operation[],algorithm:Algorithm,retention:number,weights?:number[]) {
 let memory:Memory|null=null,previous:Operation|undefined,concurrent=false;
 for(const [i,e] of reviews.entries()) {
  const r=e.payload as unknown as Review;
  const follows=previous&&r.previousReviewIds.includes(previous.id);
  let elapsed=memory?Math.max(0,(e.at-memory.lastAt)/DAY):0;
  if(follows)elapsed=r.elapsedDays;
  if(previous&&!follows)concurrent=true;
  const at=Math.max(e.at,memory?.lastAt||0);
  memory=schedule(memory,r.rating,at,elapsed,retention,algorithm,weights,i===reviews.length-1);previous=e;
 }
 return {memory,concurrent};
}
export function purgedDeckIds(events:Operation[]){return new Set(events.filter(e=>e.kind==='deck.delete'&&e.payload.permanent===true).map(e=>e.entityId));}
export function materialize(all:Operation[],now=Date.now()):Snapshot {
 const {applied:events,pending}=orderedEvents(all),byId=new Map(events.map(e=>[e.id,e]));
 const purgedDecks=purgedDeckIds(events);
 const undone=new Set(events.filter(e=>e.kind==='review.undo').map(e=>String(e.payload.reviewId)));
 const settingsEvent=events.filter(e=>e.kind==='settings.put').at(-1);
 const settings={...DEFAULT_SETTINGS,...settingsEvent?.payload};
 const parameters:Record<string,ParameterSet>={};
 for(const e of events.filter(e=>e.kind==='model.parameters')){const p=e.payload as unknown as ParameterSet;parameters[p.algorithm]=p;}
 const decks:Deck[]=[],cards:CardView[]=[],goals:Goal[]=[];
 const groups=new Map<string,Operation[]>();
 for(const e of events){if(!groups.has(e.entityId))groups.set(e.entityId,[]);groups.get(e.entityId)!.push(e);}
 for(const [id,group] of groups) {
  const de=group.filter(e=>e.kind.startsWith('deck.'));
  if(de.length&&!purgedDecks.has(id)&&!causalHeads(events,de,byId).some(e=>e.kind==='deck.delete')){const last=de.filter(e=>e.kind==='deck.put').at(-1);if(last)decks.push(last.payload as unknown as Deck);}
  const ge=group.filter(e=>e.kind.startsWith('goal.'));
  if(ge.length&&!causalHeads(events,ge,byId).some(e=>e.kind==='goal.delete')){const last=ge.filter(e=>e.kind==='goal.put').at(-1);if(last)goals.push(last.payload as unknown as Goal);}
 }
 const deckById=new Map(decks.map(d=>[d.id,d]));
 for(const [id,group]of groups) {
  const ce=group.filter(e=>e.kind.startsWith('card.'));if(!ce.length)continue;
  const heads=causalHeads(events,ce,byId),edits=ce.filter(e=>['card.put','card.restore'].includes(e.kind)),current=edits.at(-1);if(!current)continue;
  const data=current.payload as unknown as Card;
  const conflicts=heads.filter(e=>['card.put','card.restore'].includes(e.kind));
  const purged=purgedDecks.has(data.deckId)||ce.some(e=>e.kind==='card.delete'&&e.payload.permanent===true);
  const meaningful=edits.filter(e=>Boolean(e.payload.resetMemory)).at(-1);
  const reviews=group.filter(e=>e.kind==='review'&&!undone.has(e.id)&&(!meaningful||isAncestor(meaningful.id,e,byId)));
  const introductions=group.filter(e=>e.kind==='study.introduce'&&(!meaningful||isAncestor(meaningful.id,e,byId)));
  const deck=deckById.get(data.deckId),model=deck?.algorithm||'fsrs7',params=parameters[model];
  const {memory,concurrent}=replay(reviews,model,deck?targetRetention(deck,goals,settings.timeZone,now):.9,params?.values);
  cards.push({...data,version:current.id,heads:heads.map(e=>e.id),conflicts:conflicts.length>1?conflicts:[],deleted:purged||heads.some(e=>e.kind==='card.delete'),purged,memory,reviews,introductions,concurrentReviews:concurrent});
 }
 return {decks:decks.sort((a,b)=>a.name.localeCompare(b.name,'ru')),cards,goals:goals.sort((a,b)=>a.date.localeCompare(b.date)),settings,parameters,events,pending};
}
const studyFormatters=new Map<string,Intl.DateTimeFormat>();
export function studyDay(at:number,zone:string,startsAt:number) {
 if(!studyFormatters.has(zone))studyFormatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}));
 const parts=studyFormatters.get(zone)!.formatToParts(at);
 const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 const date=Date.UTC(+values.year,+values.month-1,+values.day);
 return new Date(date-(+values.hour<startsAt?DAY:0)).toISOString().slice(0,10);
}
export function deletedDecks(s:Snapshot){
 const active=new Set(s.decks.map(d=>d.id)),purged=purgedDeckIds(s.events),latest=new Map<string,Deck>();
 for(const e of s.events)if(e.kind==='deck.put')latest.set(e.entityId,e.payload as unknown as Deck);
 return [...latest.values()].filter(d=>!active.has(d.id)&&!purged.has(d.id)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
export function activeCards(s:Snapshot){const decks=new Set(s.decks.map(d=>d.id));return s.cards.filter(c=>!c.deleted&&decks.has(c.deckId)&&!c.conflicts.length);}
export function todayReviews(s:Snapshot,now=Date.now()) {const today=studyDay(now,s.settings.timeZone,s.settings.dayStartsAt),undone=new Set(s.events.filter(e=>e.kind==='review.undo').map(e=>String(e.payload.reviewId)));return s.events.filter(e=>e.kind==='review'&&!undone.has(e.id)&&Math.abs(e.at-now)<2*DAY&&studyDay(e.at,s.settings.timeZone,s.settings.dayStartsAt)===today);}
export function todayIntroducedIds(s:Snapshot,now=Date.now()){
 const day=studyDay(now,s.settings.timeZone,s.settings.dayStartsAt);
 return new Set(s.cards.filter(c=>{
  const reading=c.introductions[0],answer=c.reviews[0];
  const first=reading&&answer?(compareEvents(reading,answer)<0?reading:answer):reading||answer;
  return first&&Math.abs(first.at-now)<2*DAY&&studyDay(first.at,s.settings.timeZone,s.settings.dayStartsAt)===day;
 }).map(c=>c.id));
}
export interface QueueOptions {goalNewPerDay?:number;compare?:(a:CardView,b:CardView)=>number;includeSiblings?:boolean;}
export function makeQueue(s:Snapshot,context:'review'|'practice'|'exam',deckIds:string[]=[],now=Date.now(),options:QueueOptions={}) {
 const deckSet=new Set(deckIds),cards=activeCards(s).filter(c=>!deckIds.length||deckSet.has(c.deckId)),today=todayReviews(s,now),byId=new Map(s.cards.map(c=>[c.id,c]));
 if(options.compare)cards.sort(options.compare);
 const day=studyDay(now,s.settings.timeZone,s.settings.dayStartsAt);
 const readingToday=s.cards.flatMap(c=>c.introductions).filter(e=>Math.abs(e.at-now)<2*DAY&&studyDay(e.at,s.settings.timeZone,s.settings.dayStartsAt)===day);
 const introduced=todayIntroducedIds(s,now);
 const goalMode=options.goalNewPerDay!==undefined;
 const counted=goalMode?[...introduced].filter(id=>!deckIds.length||deckSet.has(byId.get(id)?.deckId||'')):[...introduced];
 const touched=new Set([...today,...readingToday].map(e=>e.entityId)),touchedSiblings=new Set([...today,...readingToday].map(e=>byId.get(e.entityId)?.siblingId).filter(Boolean));
 const used=new Set<string>();
 const siblingsAllowed=(c:CardView)=>!s.settings.burySiblings||!c.siblingId||!used.has(c.siblingId);
 const take=(c:CardView)=>{if(c.siblingId)used.add(c.siblingId);return c;};
 // A full practice can explicitly include siblings; scheduled review always keeps its original separation.
 if(context!=='review')return cards.sort((a,b)=>(a.memory?.stability||0)-(b.memory?.stability||0)).filter(c=>{if(!options.includeSiblings&&!siblingsAllowed(c))return false;take(c);return true;});
 const due=cards.filter(c=>c.memory&&c.memory.due<=now&&(!s.settings.burySiblings||!c.siblingId||!touchedSiblings.has(c.siblingId)||touched.has(c.id))).sort((a,b)=>a.memory!.due-b.memory!.due);
 const queue:CardView[]=[];for(const c of due)if(siblingsAllowed(c))queue.push(take(c));
 for(const c of cards.filter(c=>!c.memory&&c.introductions.length)){
  if(siblingsAllowed(c)&&(!s.settings.burySiblings||!c.siblingId||!touchedSiblings.has(c.siblingId)||touched.has(c.id)))queue.push(take(c));
 }
 let remaining=Math.max(0,(options.goalNewPerDay??s.settings.newPerDay)-counted.length);
 const limits=new Map(s.decks.map(d=>[d.id,Math.max(0,d.newPerDay-[...introduced].filter(id=>byId.get(id)?.deckId===d.id).length)]));
 for(const c of cards.filter(c=>!c.memory&&!c.introductions.length)){
  if(!remaining)break;const n=goalMode?remaining:limits.get(c.deckId)||0;
  if(!n||!siblingsAllowed(c)||(s.settings.burySiblings&&c.siblingId&&touchedSiblings.has(c.siblingId)))continue;
  queue.push(take(c));remaining--;limits.set(c.deckId,n-1);
 }return queue;
}




