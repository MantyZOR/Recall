import { describe, expect, it } from 'vitest';
import { activeCards, causalHeads, deletedDecks, entityHeads, makeQueue, materialize, studyDay } from '../../src/domain/reducer';
import { dateEnd } from '../../src/domain/time';
import { goalForecast } from '../../src/domain/planner';
import { DAY, schedule } from '../../src/domain/fsrs';
import { base, card, deck, epoch, op, review } from '../fixtures';
import { cursorOf, validateEvents } from '../../src/domain/protocol.mjs';
describe('durable causal history',()=>{
 it('preserves simultaneous edits, excludes unresolved questions, and converges after choosing a version',()=>{
  const a=op('edit-a','card.put',{...card,front:'С компьютера'},['a1'],3,'pc',3);
  const b=op('edit-b','card.put',{...card,front:'С телефона'},['a1'],3,'phone',1);
  const edits=[...base,a,b],first=materialize(edits),second=materialize([...edits].reverse());
  expect(first).toEqual(second);expect(first.cards[0].conflicts).toHaveLength(2);expect(activeCards(first)).toHaveLength(0);
  const resolution=op('resolved','card.put',{...card,front:'Оба учтены'},['edit-a','edit-b'],4,'pc',4);
  const done=materialize([...edits,resolution]);expect(activeCards(done)[0].front).toBe('Оба учтены');expect(done.cards[0].conflicts).toEqual([]);
 });
 it('does not resurrect a deletion with an old or concurrent edit; explicit restore retains reviews',()=>{
  const r=op('r1','review',review,['a1'],3),del=op('del','card.delete',{},['r1'],4),old=op('old','card.put',{...card,back:'Старая версия'},['a1'],3,'phone',1);
  const s=materialize([...base,r,del,old]);expect(s.cards[0].deleted).toBe(true);
  const restored=materialize([...s.events,op('restore','card.restore',card,s.cards[0].heads,5)]);
  expect(restored.cards[0].deleted).toBe(false);expect(restored.cards[0].reviews).toHaveLength(1);
 });
 it('keeps permanent deletion after stale or explicit restores while retaining reviews and converging',()=>{
  const r=op('r1','review',review,['a1'],3);
  const soft=op('soft','card.delete',{},['r1'],4);
  const purge=op('purged','card.delete',{permanent:true},['soft'],5);
  const edit=op('old-edit','card.put',{...card,back:'Офлайн'},['a1'],4,'phone',1);
  const stale=op('stale-restore','card.restore',card,['soft','old-edit'],5,'phone',2);
  const explicit=op('later-restore','card.restore',card,['purged','stale-restore'],6,'phone',3);
  const history=[...base,r,soft,purge,edit,stale,explicit],s=materialize(history,epoch);
  expect(s).toEqual(materialize([...history].reverse(),epoch));
  expect(s.cards[0].purged).toBe(true);expect(s.cards[0].deleted).toBe(true);
  expect(activeCards(s)).toEqual([]);expect(makeQueue(s,'practice',[],epoch)).toEqual([]);
  expect(s.cards[0].reviews).toEqual([r]);
  expect(s.cards[0].memory).toEqual(materialize([...base,r],epoch).cards[0].memory);
  expect(validateEvents(history)).toEqual(history);
  expect(()=>validateEvents([{...purge,payload:{permanent:'yes'}}])).toThrow();
 });

 it('purges a deck permanently, hides offline-created children and cannot restore it from later edits',()=>{
  const r=op('r1','review',review,['a1'],3);
  const soft=op('deck-soft','deck.delete',{},['d1'],4,'pc',4,'deck');
  const cardPurge=op('card-purge','card.delete',{permanent:true},['a1'],5,'pc',5);
  const deckPurge=op('deck-purge','deck.delete',{permanent:true},['deck-soft'],6,'pc',6,'deck');
  const edit=op('deck-offline','deck.put',{...deck,name:'С телефона'},['d1'],3,'phone',1,'deck');
  const unseen=op('unseen','card.put',{...card,id:'offline-child',title:'Создана без сети'},['d1'],4,'phone',2,'offline-child');
  const restored=op('deck-restore','deck.put',deck,['deck-purge','deck-offline'],7,'phone',3,'deck');
  const cardRestore=op('card-restore','card.restore',card,['card-purge'],8,'phone',4);
  const history=[...base,r,soft,cardPurge,deckPurge,edit,unseen,restored,cardRestore];
  const s=materialize(history,epoch);
  expect(s).toEqual(materialize([...history].reverse(),epoch));
  expect(s.decks).toEqual([]);expect(deletedDecks(s)).toEqual([]);
  expect(activeCards(s)).toEqual([]);expect(makeQueue(s,'practice',[],epoch)).toEqual([]);
  expect(s.cards).toHaveLength(2);expect(s.cards.every(c=>c.deleted&&c.purged)).toBe(true);
  expect(s.cards.find(c=>c.id===card.id)!.reviews).toEqual([r]);
  expect(validateEvents(history)).toEqual(history);
  expect(()=>validateEvents([{...deckPurge,payload:{permanent:'yes'}}])).toThrow();
  const pending=materialize([...base,{...deckPurge,deps:['missing']}],epoch);
  expect(pending.decks).toHaveLength(1);expect(pending.cards[0].purged).toBe(false);
 });

 it('replays canonical merged reviews identically, marks concurrent answers, and removes only an undone rating',()=>{
  const r1=op('r1','review',review,['a1'],3);
  const r2=op('r2','review',{...review,rating:1,elapsedDays:2,previousReviewIds:['r1'],prediction:.8},['r1'],4,'pc',4,'card',epoch+2*DAY);
  const phone=op('rp','review',{...review,rating:4,elapsedDays:3,previousReviewIds:['r1'],prediction:.7},['r1'],4,'phone',1,'card',epoch+3*DAY);
  const records=[...base,r1,r2,phone],s=materialize(records);
  expect(s).toEqual(materialize([...records].reverse()));expect(s.cards[0].concurrentReviews).toBe(true);expect(s.cards[0].reviews).toHaveLength(3);
  const undone=materialize([...records,op('undo','review.undo',{reviewId:'r2'},['r2','rp'],5)]);
  expect(undone.cards[0].reviews.map(r=>r.id)).toEqual(['r1','rp']);expect(undone.cards[0].concurrentReviews).toBe(false);
  const expected=schedule(schedule(null,3,epoch,0,.9,'fsrs7'),4,epoch+3*DAY,3,.9,'fsrs7');
  expect(undone.cards[0].memory).toEqual(expected);expect(undone.events.some(e=>e.id==='r2')).toBe(true);
 });
 it('tracks ancestors through edits and preserves payload-recorded elapsed time despite clock skew',()=>{
  const r1=op('r1','review',review,['a1'],3),edit=op('edit','card.put',card,['r1'],4);
  const r2=op('r2','review',{...review,elapsedDays:1.25,previousReviewIds:['r1']},['edit'],5,'pc',5,'card',epoch+2*DAY);
  const records=[...base,r1,edit,r2];
  expect(causalHeads(records,[r1,r2]).map(e=>e.id)).toEqual(['r2']);
  const s=materialize(records),expected=schedule(schedule(null,3,epoch,0,.9,'fsrs7'),3,epoch+2*DAY,1.25,.9,'fsrs7');
  expect(s.cards[0].memory).toEqual(expected);expect(s.cards[0].concurrentReviews).toBe(false);
 });
 it('keeps dependent changes pending until required history arrives and uses contiguous cursors',()=>{
  const missing=op('child','card.put',card,['not-yet'],5,'phone',2);
  expect(materialize([missing]).pending).toHaveLength(1);
  expect(cursorOf([missing])).toEqual({phone:0});
  const parent=op('not-yet','deck.put',deck,[],4,'phone',1);
  expect(materialize([missing,parent]).pending).toHaveLength(0);expect(cursorOf([missing,parent])).toEqual({phone:2});
 });
 it('keeps deleted decks out of study and restores cards, goals and review history after a concurrent edit',()=>{
  const other=op('other','card.put',{...card,id:'already-deleted'},['a1'],3,'pc',3,'already-deleted');
  const otherDelete=op('other-delete','card.delete',{},['other'],4,'pc',4,'already-deleted');
  const r=op('r1','review',review,['a1'],5,'pc',5);
  const goal={id:'goal',name:'Подготовка',date:'2026-11-30',deckIds:['deck'],minutes:20,retention:.9,importance:{}};
  const g=op('g1','goal.put',goal,['r1','other-delete'],6,'pc',6);
  const before=materialize([...base,other,otherDelete,r,g],epoch);
  const removed=op('deck-removed','deck.delete',{},['g1'],7,'pc',7,'deck');
  const edit=op('offline-deck-edit','deck.put',{...deck,name:'Уточнённое название'},['d1'],7,'phone',1,'deck');
  const history=[...before.events,removed,edit],deleted=materialize(history,epoch);
  expect(deleted.decks).toEqual([]);expect(activeCards(deleted)).toEqual([]);
  expect(makeQueue(deleted,'review',[],epoch)).toEqual([]);
  expect(goalForecast(deleted,goal,epoch).selected).toHaveLength(0);
  expect(deletedDecks(deleted).map(d=>d.name)).toEqual(['Уточнённое название']);
  expect(deleted.cards.find(c=>c.id===card.id)!.reviews).toHaveLength(1);
  expect(deleted).toEqual(materialize([...history].reverse(),epoch));
  const restored=materialize([...history,op('deck-restored','deck.put',deletedDecks(deleted)[0],entityHeads(deleted.events,deck.id,'deck.').map(e=>e.id),8,'pc',8,'deck')],epoch);
  expect(restored.decks[0].name).toBe('Уточнённое название');expect(deletedDecks(restored)).toEqual([]);
  expect(activeCards(restored).map(c=>c.id)).toEqual([card.id]);
  expect(restored.cards.find(c=>c.id==='already-deleted')!.deleted).toBe(true);
  expect(restored.cards.find(c=>c.id===card.id)!.memory).toEqual(before.cards.find(c=>c.id===card.id)!.memory);
  expect(restored.goals).toEqual(before.goals);expect(goalForecast(restored,goal,epoch).selected).toHaveLength(1);
  expect(()=>validateEvents(restored.events)).not.toThrow();
 });
 it('validates malformed payloads before writing',()=>{expect(()=>validateEvents([{...base[0],payload:{...deck,retention:1.8}}])).toThrow();});
});
describe('queue, shared day and goals',()=>{
 it('counts daily limits after deduplicating cloze siblings and respecting deck limits',()=>{
  const cards=[...Array.from({length:4},(_,i)=>op('c'+i,'card.put',{...card,id:'c'+i,type:'cloze',front:'{{c1::Один}} {{c2::Два}}',clozeIndex:i+1,siblingId:'siblings'},['d1'],i+2,'pc',i+2,'c'+i)),op('extra','card.put',{...card,id:'extra'},['d1'],6,'pc',6,'extra')];
  const s=materialize([base[0],...cards]);s.settings.newPerDay=2;
  expect(makeQueue(s,'review',[],epoch).map(c=>c.id)).toEqual(['c0','extra']);
  expect(makeQueue(s,'exam',[],epoch)).toHaveLength(2);
  s.decks[0].newPerDay=0;expect(makeQueue(s,'review',[],epoch)).toHaveLength(0);
 });
 it('resets memory only for reviews preceding a meaningful change',()=>{
  const r1=op('r1','review',review,['a1'],3),edit=op('reset','card.put',{...card,resetMemory:true},['r1'],4);
  expect(materialize([...base,r1,edit]).cards[0].memory).toBeNull();
  const r2=op('r2','review',{...review,cardVersion:'reset'},['reset'],5);expect(materialize([...base,r1,edit,r2]).cards[0].reviews.map(e=>e.id)).toEqual(['r2']);
 });
 it('shares a study day and resolves date deadlines in the selected time zone including daylight saving',()=>{
  expect(studyDay(Date.UTC(2026,9,2,0,30),'Europe/Moscow',4)).toBe('2026-10-01');
  expect(studyDay(Date.UTC(2026,9,2,1,30),'Europe/Moscow',4)).toBe('2026-10-02');
  expect(new Date(dateEnd('2026-10-02','Europe/Moscow')).toISOString()).toBe('2026-10-02T20:59:59.999Z');
  expect(new Date(dateEnd('2026-03-08','America/New_York')).toISOString()).toBe('2026-03-09T03:59:59.999Z');
 });
 it('a higher goal target changes intervals and future workload',()=>{
  const r=op('r1','review',review,['a1'],3),goal={id:'goal',name:'Проверка',date:'2026-10-30',deckIds:['deck'],minutes:20,retention:.97,importance:{}};
  const without=materialize([...base,r],epoch),withGoal=materialize([...base,r,op('goal','goal.put',goal,['r1'],4)],epoch);
  expect(withGoal.cards[0].memory!.due).toBeLessThan(without.cards[0].memory!.due);
  expect(goalForecast(without,goal,epoch).estimatedMinutes).toBeGreaterThanOrEqual(goalForecast(without,{...goal,retention:.7},epoch).estimatedMinutes);
 });
});
