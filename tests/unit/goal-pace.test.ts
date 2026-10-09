import { describe, expect, it } from 'vitest';
import type { Goal, Operation, Snapshot } from '../../src/domain/types';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { materialize, makeQueue, todayIntroducedIds } from '../../src/domain/reducer';
import { goalPace } from '../../src/domain/goal-pace';
import { goalForecast } from '../../src/domain/planner';
import { dateEnd, dateStart } from '../../src/domain/time';
import { EventSchema } from '../../src/domain/protocol.mjs';
import { deck, card, epoch, op, review } from '../fixtures';

const goal:Goal={id:'goal',name:'Сегодня и завтра',date:'2026-10-03',minutes:60,retention:.9,deckIds:[deck.id],importance:{}};
const events=(count=59):Operation[]=>[op('d1','deck.put',deck,[],1),...Array.from({length:count},(_,i)=>op('c'+i,'card.put',{...card,id:'c'+i},['d1'],i+2,'pc',i+2,'c'+i))];
const readings=(count:number,at=epoch):Operation[]=>Array.from({length:count},(_,i)=>op('read'+i,'study.introduce',{cardId:'c'+i,cardVersion:'c'+i,durationMs:30000,context:'review',sessionId:'read'},['c'+i],100+i,'reading',i+1,'c'+i,at));
const goalQueue=(s:Snapshot,g=goal,at=epoch)=>makeQueue(s,'review',g.deckIds,at,{goalNewPerDay:goalPace(s,g,at).newPerDay});

describe('goal pace and preparation queue',()=>{
 it('covers 59 fresh cards in two inclusive days with 30 per day independent of default limits',()=>{
  const s=materialize(events(),epoch),f=goalForecast(s,goal,epoch);
  expect(f.days).toBe(2);expect(f.newPerDay).toBe(30);expect(f.requiredNewPerDay).toBe(30);
  expect(f.remainingToday).toBe(30);expect(f.newByDeadline).toBe(59);expect(f.uncoveredNew).toBe(0);
  expect(f.warnings).toEqual([]);expect(goalQueue(s)).toHaveLength(30);
  expect(makeQueue(s,'review',[],epoch)).toHaveLength(20);
  expect(makeQueue(s,'review',[deck.id],epoch)).toHaveLength(20);
  expect(goalQueue(s,{...goal,date:'2026-10-02'})).toHaveLength(59);
  expect(s.settings.newPerDay).toBe(20);expect(s.decks[0].newPerDay).toBe(20);
 });
 it('treats old goals and null as automatic and allows a manual pace above 20 and above 500',()=>{
  const s=materialize(events(),epoch);
  expect(goalPace(s,{...goal,newPerDay:null},epoch).newPerDay).toBe(30);
  expect(goalPace(s,{...goal,newPerDay:50},epoch).automatic).toBe(false);
  expect(goalQueue(s,{...goal,newPerDay:50})).toHaveLength(50);
  const many=materialize(events(600),epoch);expect(goalQueue(many,{...goal,date:'2026-10-02'})).toHaveLength(600);
 });
 it('keeps automatic daily allowance stable while reading and shares it with every session on the same goal decks',()=>{
  const s=materialize([...events(),...readings(30)],epoch),p=goalPace(s,goal,epoch);
  expect(p.newPerDay).toBe(30);expect(p.remainingToday).toBe(0);expect(p.introducedToday).toBe(30);
  expect(todayIntroducedIds(s,epoch).size).toBe(30);
  const queue=goalQueue(s);expect(queue).toHaveLength(30);expect(queue.every(c=>c.introductions.length===1)).toBe(true);
  expect(goalQueue(s,{...goal,id:'another'}).map(c=>c.id)).toEqual(queue.map(c=>c.id));
  const partial=materialize([...events(),...readings(1)],epoch);
  expect(goalPace(partial,goal,epoch).newPerDay).toBe(30);expect(goalPace(partial,goal,epoch).remainingToday).toBe(29);
 });
 it('finishes earlier reading for free and introduces only the remaining 29 the next day',()=>{
  const tomorrow=epoch+86400000,s=materialize([...events(),...readings(30)],tomorrow),p=goalPace(s,goal,tomorrow);
  expect(p.days).toBe(1);expect(p.newPerDay).toBe(29);expect(p.introducedToday).toBe(0);
  const queue=goalQueue(s,goal,tomorrow);
  expect(queue.filter(c=>!c.introductions.length)).toHaveLength(29);expect(queue.filter(c=>c.introductions.length)).toHaveLength(30);
 });
 it('counts a first assessment without reading once but does not charge an old introduction again on its first assessment',()=>{
  const direct=op('grade','review',{...review,cardId:'c0',cardVersion:'c0'},['c0'],100,'answers',1,'c0');
  let s=materialize([...events(),direct],epoch);expect(goalPace(s,goal,epoch).introducedToday).toBe(1);expect(goalPace(s,goal,epoch).remainingToday).toBe(29);
  s=materialize([...events(),...readings(1,epoch-86400000),{...direct,deps:['read0'],clock:101}],epoch);
  expect(goalPace(s,goal,epoch).introducedToday).toBe(0);expect(goalPace(s,goal,epoch).remainingToday).toBe(29);
  const laterReading={...readings(1)[0],deps:['grade'],clock:101};
  s=materialize([...events(),{...direct,at:epoch-86400000},laterReading],epoch);
  expect(goalPace(s,goal,epoch).introducedToday).toBe(0);expect(goalPace(s,goal,epoch).remainingToday).toBe(29);
 });
 it('does not let introductions in unrelated decks consume this goal and respects zero global and deck limits elsewhere',()=>{
  const other=op('other','deck.put',{...deck,id:'other'},[],1,'other',1,'other');
  const cards=Array.from({length:20},(_,i)=>op('other'+i,'card.put',{...card,id:'other'+i,deckId:'other'},['other'],i+2,'other',i+2,'other'+i));
  const seen=Array.from({length:20},(_,i)=>op('seen'+i,'study.introduce',{cardId:'other'+i,cardVersion:'other'+i,durationMs:20000,context:'review',sessionId:'other'},['other'+i],i+30,'other',i+22,'other'+i));
  const settings=op('settings','settings.put',{...DEFAULT_SETTINGS,newPerDay:0},[],1,'settings',1,'settings');
  const limit=op('limit','deck.put',{...deck,newPerDay:0},['d1'],100,'limit',1,'deck');
  const s=materialize([...events(),other,...cards,...seen,settings,limit],epoch);
  expect(goalPace(s,goal,epoch).introducedToday).toBe(0);expect(goalQueue(s)).toHaveLength(30);
  expect(makeQueue(s,'review',[deck.id],epoch)).toEqual([]);
 });
 it('manual zero still permits unfinished first assessments and due reviews',()=>{
  const reading=readings(1),due=op('grade','review',{...review,cardId:'c1',cardVersion:'c1'},['c1'],100,'answers',1,'c1',epoch-7*86400000);
  const s=materialize([...events(3),...reading,due],epoch);
  expect(new Set(goalQueue(s,{...goal,newPerDay:0}).map(c=>c.id))).toEqual(new Set(['c0','c1']));
 });
 it('applies goal topic priority before selecting a small fresh allowance',()=>{
  const other=op('other','deck.put',{...deck,id:'other'},[],1,'other',1,'other');
  const next=Array.from({length:5},(_,i)=>op('other'+i,'card.put',{...card,id:'other'+i,deckId:'other'},['other'],i+2,'other',i+2,'other'+i));
  const s=materialize([...events(5),other,...next],epoch),g={...goal,deckIds:[deck.id,'other'],newPerDay:3,importance:{other:2}};
  const queue=makeQueue(s,'review',g.deckIds,epoch,{goalNewPerDay:3,compare:(a,b)=>(g.importance[b.deckId as 'other']||1)-(g.importance[a.deckId as 'other']||1)});
  expect(queue).toHaveLength(3);expect(queue.every(c=>c.deckId==='other')).toBe(true);
 });
 it('keeps sibling burial, schedules first assessments on separate days and reports an impossible cloze deadline',()=>{
  const source=events(3).map(e=>e.kind==='card.put'?{...e,payload:{...e.payload,type:'cloze',front:'{{c1::один}} {{c2::два}} {{c3::три}}',clozeIndex:Number(e.entityId.slice(1))+1,siblingId:'siblings'}}:e);
  let s=materialize(source,epoch),f=goalForecast(s,goal,epoch);
  expect(goalQueue(s)).toHaveLength(1);expect(f.newByDeadline).toBe(2);expect(f.uncoveredNew).toBe(1);
  expect(f.warning).toContain('Связанные пропуски');expect(f.coverage).toBeLessThan(1);
  s=materialize([...source,...readings(1)],epoch);expect(goalQueue(s).map(c=>c.id)).toEqual(['c0']);
 });
 it('warns about insufficient pace and insufficient time separately without claiming full preparation',()=>{
  const s=materialize(events(),epoch),slow=goalForecast(s,{...goal,newPerDay:20,minutes:1},epoch);
  expect(slow.newByDeadline).toBe(40);expect(slow.uncoveredNew).toBe(19);
  expect(slow.requiredNewPerDay).toBe(30);expect(slow.tempoCoverage).toBeCloseTo(40/59);
  expect(slow.budgetCoverage).toBeLessThan(1);expect(slow.warnings).toHaveLength(2);
  const enoughTime=goalForecast(s,{...goal,newPerDay:20},epoch);
  expect(enoughTime.budgetCoverage).toBe(1);expect(enoughTime.coverage).toBeLessThan(1);
  expect(goalForecast(s,{...goal,minutes:1},epoch).warnings).toEqual(['При текущем бюджете времени весь материал может не поместиться']);
 });
 it('uses the profile calendar date, counts inclusive days across DST and closes preparation only after midnight',()=>{
  const s={...materialize(events(),epoch),settings:{...DEFAULT_SETTINGS,timeZone:'America/New_York'}};
  const spring=Date.parse('2026-03-07T23:00:00-05:00');
  expect(goalPace(s,{...goal,date:'2026-03-08'},spring).days).toBe(2);
  expect(goalPace(s,{...goal,date:'2026-03-08'},spring).newPerDay).toBe(30);
  expect(dateStart('2026-03-08','America/New_York',4)).toBe(Date.parse('2026-03-08T04:00:00-04:00'));
  expect(dateStart('2026-11-01','America/New_York',4)).toBe(Date.parse('2026-11-01T04:00:00-05:00'));
  const last=dateEnd(goal.date,s.settings.timeZone);
  expect(goalPace(s,goal,last).days).toBe(1);expect(goalPace(s,goal,last+1).days).toBe(0);
  expect(goalForecast(s,goal,last+1).newByDeadline).toBe(0);
  expect(goalForecast(s,goal,last+1).warning).toContain('Срок');
 });
 it('handles completed and empty goals and validates manual values in the shared event schema',()=>{
  const empty=materialize(events(0),epoch),f=goalForecast(empty,goal,epoch);
  expect(f.newPerDay).toBe(0);expect(f.newByDeadline).toBe(0);expect(f.coverage).toBe(1);expect(f.requiredMinutesPerDay).toBe(0);
  const e=op('goal','goal.put',goal,[],1,'goals',1,'goal');
  for(const newPerDay of [undefined,null,0,50,600,100000])expect(EventSchema.safeParse({...e,payload:{...goal,newPerDay}}).success).toBe(true);
  for(const newPerDay of [-1,1.5,100001,'30',NaN])expect(EventSchema.safeParse({...e,payload:{...goal,newPerDay}}).success).toBe(false);
 });
});
