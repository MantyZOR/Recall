import { describe,expect,it } from 'vitest';
import type { Goal } from '../../src/domain/types';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { materialize,makeQueue } from '../../src/domain/reducer';
import { goalStudyPlan,studyPlan,studyEmptyLabel } from '../../src/domain/study-plan';
import { dateStart } from '../../src/domain/time';
import { base,card,deck,epoch,op,review } from '../fixtures';
const day=86400000;
function scenario(){
 const reverse={...deck,id:'reverse',name:'Ревёрс'};
 const events=[op('d1','deck.put',deck,[],1),op('d2','deck.put',reverse,[],2,'pc',2,'reverse')];
 for(let i=0;i<25;i++){
  const id='learned'+i,version='card-'+id;
  events.push(op(version,'card.put',{...card,id},['d1'],i+3,'pc',i+3,id));
  events.push(op('answer-'+id,'review',{...review,cardId:id,cardVersion:version},[version],i+80,'pc',i+80,id,epoch-3600000));
 }
 for(let i=0;i<9;i++){
  const id='due'+i,version='card-'+id;
  events.push(op(version,'card.put',{...card,id},['d1'],i+30,'pc',i+30,id));
  events.push(op('answer-'+id,'review',{...review,cardId:id,cardVersion:version},[version],i+110,'pc',i+110,id,epoch-7*day));
 }
 for(let i=0;i<19;i++)events.push(op('fresh'+i,'card.put',{...card,id:'fresh'+i,deckId:'reverse'},['d2'],i+45,'pc',i+45,'fresh'+i));
 return materialize(events,epoch);
}
const goal:Goal={id:'g',name:'К сроку',date:'2026-10-10',minutes:20,retention:.9,deckIds:['reverse'],importance:{}};
describe('scheduled study availability',()=>{
 it('explains 19 untouched cards blocked by 25 introductions against a global limit of 20 without claiming they were repeated',()=>{
  const s=scenario(),plan=studyPlan(s,['reverse'],epoch);
  expect(plan.ready).toBe(0);expect(plan.fresh).toBe(19);expect(plan.rated).toBe(0);expect(plan.emptyReason).toBe('new-limit');
  expect(studyEmptyLabel(plan)).toBe('Лимит новых на сегодня');expect(plan.resetAt).toBe(dateStart('2026-10-03','Europe/Moscow',4));
  expect(s.settings.newPerDay).toBe(20);expect(makeQueue(s,'practice',['reverse'],epoch)).toHaveLength(19);
 });
 it('shows nine real due reviews in a goal even when its new-card pace is zero',()=>{
  const s=scenario(),plan=goalStudyPlan(s,{...goal,deckIds:[deck.id]},epoch);
  expect(plan.ready).toBe(9);expect(plan.repeatReady).toBe(9);expect(plan.newReady).toBe(0);expect(plan.firstReady).toBe(0);
  expect(plan.queue.map(c=>c.id)).toEqual(makeQueue(s,'review',[deck.id],epoch,{goalNewPerDay:0}).map(c=>c.id));
 });
 it('shows goal introductions independently of the already exhausted ordinary allowance',()=>{
  const s=scenario(),plan=goalStudyPlan(s,goal,epoch);
  expect(plan.newReady).toBe(3);expect(plan.ready).toBe(3);expect(studyPlan(s,['reverse'],epoch).ready).toBe(0);
 });
 it('finishes a first assessment even at a zero new allowance',()=>{
  const reading=op('read','study.introduce',{cardId:card.id,cardVersion:'a1',durationMs:10000,context:'review',sessionId:'s'},['a1'],3);
  const settings=op('settings','settings.put',{...DEFAULT_SETTINGS,newPerDay:0},[],1,'settings',1,'settings');
  const plan=studyPlan(materialize([...base,reading,settings],epoch),[],epoch);
  expect(plan.firstReady).toBe(1);expect(plan.newReady).toBe(0);expect(plan.repeatReady).toBe(0);expect(plan.ready).toBe(1);
 });
 it('distinguishes a deck limit from a global limit and exposes the nearest future review',()=>{
  const restricted=op('limit','deck.put',{...deck,newPerDay:0},['d1'],3);
  expect(studyPlan(materialize([...base,restricted],epoch),[],epoch).emptyReason).toBe('deck-limit');
  const answer=op('answer','review',review,['a1'],3);
  const s=materialize([...base,answer],epoch),plan=studyPlan(s,[],epoch);
  expect(plan.ready).toBe(0);expect(plan.emptyReason).toBe('scheduled');expect(plan.nextReviewAt).toBe(s.cards[0].memory!.due);
 });
 it('reports empty and expired scopes without enabling a scheduled goal',()=>{
  expect(studyPlan(materialize([],epoch),[],epoch).emptyReason).toBe('empty');
  const plan=goalStudyPlan(scenario(),{...goal,date:'2026-10-01'},epoch);
  expect(plan.ready).toBe(0);expect(plan.emptyReason).toBe('expired');
 });
 it('preserves scheduled sibling burial but permits explicit full practice of all siblings',()=>{
  const cards=Array.from({length:3},(_,i)=>op('c'+i,'card.put',{...card,id:'c'+i,type:'cloze',siblingId:'text',clozeIndex:i+1},['d1'],i+2,'pc',i+2,'c'+i));
  const s=materialize([base[0],...cards],epoch);
  expect(studyPlan(s,[],epoch).newReady).toBe(1);expect(makeQueue(s,'practice',[],epoch)).toHaveLength(1);
  expect(makeQueue(s,'practice',[],epoch,{includeSiblings:true})).toHaveLength(3);
  expect(makeQueue(s,'review',[],epoch,{includeSiblings:true})).toHaveLength(1);
  const grade=op('r','review',{...review,cardId:'c0',cardVersion:'c0'},['c0'],10,'pc',10,'c0');
  const touched=studyPlan(materialize([base[0],...cards,grade],epoch),[],epoch);
  expect(touched.ready).toBe(0);expect(touched.emptyReason).toBe('siblings');
 });
 it('replays a real practice assessment through the same memory algorithm and keeps its context in history',()=>{
  const prior=op('old','review',review,['a1'],3,'pc',3,card.id,epoch-day);
  const before=materialize([...base,prior],epoch),answer=op('practice','review',{...review,context:'practice',previousReviewIds:['old'],elapsedDays:1},['old'],4);
  const after=materialize([...base,prior,answer],epoch);
  expect(after.cards[0].memory!.lastAt).toBe(epoch);expect(after.cards[0].memory!.due).not.toBe(before.cards[0].memory!.due);
  expect(after.cards[0].reviews.at(-1)!.payload.context).toBe('practice');
 });
});
