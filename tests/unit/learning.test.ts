import { describe, expect, it } from 'vitest';
import { materialize, makeQueue } from '../../src/domain/reducer';
import { needsIntroduction, deferIntroduction, introductionStats } from '../../src/domain/learning';
import { EventSchema } from '../../src/domain/protocol.mjs';
import { estimateSessionMinutes } from '../../src/domain/planner';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { base, card, deck, epoch, op, review } from '../fixtures';

const reading={cardId:card.id,cardVersion:'a1',durationMs:25000,context:'review',sessionId:'session'};
const introduced=op('read','study.introduce',reading,['a1'],3);
const second=op('second','card.put',{...card,id:'second'},['a1'],3,'pc',3,'second');
function limited(extra=20){return op('settings','settings.put',{...DEFAULT_SETTINGS,newPerDay:extra},[],1,'settings',1,'settings');}

describe('primary study without a memory assessment',()=>{
 it('introduces new cards outside exams and preserves an untouched scheduler, card version and heads',()=>{
  const fresh=materialize(base,epoch).cards[0];
  expect(needsIntroduction(fresh,'review')).toBe(true);expect(needsIntroduction(fresh,'practice')).toBe(true);expect(needsIntroduction(fresh,'exam')).toBe(false);
  const s=materialize([...base,introduced],epoch),c=s.cards[0];
  expect(c.memory).toBeNull();expect(c.reviews).toEqual([]);expect(c.version).toBe('a1');expect(c.heads).toEqual(['a1']);expect(c.conflicts).toEqual([]);
  expect(c.introductions.map(e=>e.id)).toEqual(['read']);expect(needsIntroduction(c,'review')).toBe(false);
  expect(introductionStats(s)).toEqual({cards:1,readings:1,durationMs:25000});
 });
 it('defers the first independent attempt behind up to three remaining queue entries',()=>{
  const queue=['a','b','c','d','e'];expect(deferIntroduction(queue,0)).toEqual(['a','b','c','d','a','e']);expect(queue).toEqual(['a','b','c','d','e']);
  expect(deferIntroduction(['a'],0)).toEqual(['a','a']);expect(deferIntroduction(['a','b'],1)).toEqual(['a','b','b']);
 });
 it('counts reading toward both daily limits while keeping unfinished learning available with zero new allowance',()=>{
  const s=materialize([...base,second,introduced,limited(1)],epoch);
  expect(makeQueue(s,'review',[],epoch).map(c=>c.id)).toEqual(['card']);
  const zero=materialize([...base,second,introduced,limited(0)],epoch);expect(makeQueue(zero,'review',[],epoch).map(c=>c.id)).toEqual(['card']);
  const lowDeck=op('deck-limit','deck.put',{...deck,newPerDay:1},['d1'],4,'pc',4,'deck');
  expect(makeQueue(materialize([...base,second,introduced,lowDeck],epoch),'review',[],epoch).map(c=>c.id)).toEqual(['card']);
 });
 it('charges the daily allowance once and can finish previous-day learning alongside a new card',()=>{
  const yesterday={...introduced,at:epoch-86400000};
  const answer=op('answer','review',{...review,context:'practice'},['read'],4);
  const s=materialize([...base,second,yesterday,answer,limited(1)],epoch);
  expect(makeQueue(s,'review',[],epoch).map(c=>c.id)).toEqual(['second']);
 });
 it('survives merged offline introductions without a content conflict or duplicate allowance charge',()=>{
  const phone={...introduced,id:'phone-read',deviceId:'phone',seq:1,payload:{...reading,durationMs:15000}};
  const s=materialize([...base,second,introduced,phone,limited(2)],epoch);
  expect(s.cards.find(c=>c.id===card.id)!.conflicts).toEqual([]);
  expect(introductionStats(s)).toEqual({cards:1,readings:2,durationMs:40000});
  expect(makeQueue(s,'review',[],epoch).map(c=>c.id)).toEqual(['card','second']);
 });
 it('keeps reading after answer undo and excludes pre-reset reading from the new study state',()=>{
  const answered=op('answer','review',review,['read'],4),undo=op('undo','review.undo',{reviewId:'answer'},['answer'],5);
  const restored=materialize([...base,introduced,answered,undo],epoch).cards[0];expect(restored.memory).toBeNull();expect(needsIntroduction(restored,'review')).toBe(false);
  const reset=op('reset','card.put',{...card,front:'Новый смысл',resetMemory:true},['answer'],5);
  const before=materialize([...base,introduced,answered,reset],epoch).cards[0];expect(before.introductions).toEqual([]);expect(needsIntroduction(before,'review')).toBe(true);
  const next=op('next-read','study.introduce',{...reading,cardVersion:'reset'},['reset'],6);
  expect(needsIntroduction(materialize([...base,introduced,answered,reset,next],epoch).cards[0],'review')).toBe(false);
 });
 it('buries related cloze cards after reading without blocking the original first attempt',()=>{
  const a={...base[1],payload:{...card,type:'cloze',front:'{{c1::один}} и {{c2::два}}',clozeIndex:1,siblingId:'siblings'}};
  const b={...second,payload:{...a.payload,id:'second',clozeIndex:2}};
  expect(makeQueue(materialize([base[0],a,b,introduced],epoch),'review',[],epoch).map(c=>c.id)).toEqual(['card']);
 });
 it('validates study records and includes time for reading in the session estimate',()=>{
  expect(EventSchema.safeParse(introduced).success).toBe(true);
  for(const payload of [{...reading,cardId:'another'},{...reading,cardVersion:''},{...reading,durationMs:-1},{...reading,context:'exam'}]){
   expect(EventSchema.safeParse({...introduced,payload}).success).toBe(false);
  }
  const current=materialize(base,epoch);expect(estimateSessionMinutes(current,current.cards)).toBe(1);
  const many=materialize([base[0],...Array.from({length:4},(_,i)=>op('card-'+i,'card.put',{...card,id:'card-'+i},['d1'],i+2,'pc',i+2,'card-'+i))],epoch);
  expect(estimateSessionMinutes(many,many.cards)).toBe(4);
 });
});
