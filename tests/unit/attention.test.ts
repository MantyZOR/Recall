import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { attentionByCard } from '../../src/domain/attention';
import { resolveAttention } from '../../src/domain/actions';
import { materialize, makeQueue } from '../../src/domain/reducer';
import { validateEvents } from '../../src/domain/protocol.mjs';
import { db, merge, snapshot } from '../../src/storage/db';
import { createArchive, importArchive, readImport } from '../../src/storage/archive';
import { base, card, op, review, epoch } from '../fixtures';

const fail=op('fail','review',{...review,rating:1,context:'exam'},['a1'],3);
const resolved=op('resolved','study.resolve',{cardId:card.id,reviewIds:['fail']},['fail'],4);
beforeAll(()=>db.open());
beforeEach(async()=>{await Promise.all([db.events.clear(),db.attachments.clear(),db.meta.clear()]);});

describe('cards to consider',()=>{
 it('retains mistakes from tests and normal sessions as one card without modifying its learning state',()=>{
  const again=op('again','review',{...review,rating:1,previousReviewIds:['fail']},['fail'],4);
  const s=materialize([...base,fail,again],epoch);
  expect(attentionByCard(s).get(card.id)?.map(e=>e.id)).toEqual(['fail','again']);
  const after=materialize([...base,fail,again,op('read','study.resolve',{cardId:card.id,reviewIds:['fail','again']},['fail','again'],5)],epoch);
  expect(attentionByCard(after).size).toBe(0);
  expect(after.cards[0].memory).toEqual(s.cards[0].memory);
  expect(after.cards[0].reviews).toEqual(s.cards[0].reviews);
  expect(makeQueue(after,'review',[],epoch).map(c=>c.id)).toEqual(makeQueue(s,'review',[],epoch).map(c=>c.id));
  expect(after.cards[0].heads).toEqual(s.cards[0].heads);
 });
 it('keeps unseen concurrent mistakes pending and reopens a card after a later error',()=>{
  const concurrent=op('phone-fail','review',{...review,rating:1},['a1'],3,'phone',1);
  const s=materialize([...base,resolved,concurrent,fail],epoch);
  expect(attentionByCard(s).get(card.id)?.map(e=>e.id)).toEqual(['phone-fail']);
  const later=op('later','review',{...review,rating:1,previousReviewIds:['fail']},['resolved'],5);
  expect(attentionByCard(materialize([...base,fail,resolved,later],epoch)).get(card.id)?.map(e=>e.id)).toEqual(['later']);
  expect(attentionByCard(s)).toEqual(attentionByCard(materialize([...base,fail,concurrent,resolved].reverse(),epoch)));
 });
 it('respects undone reviews, memory resets, deleted cards and deleted decks',()=>{
  const undo=op('undo','review.undo',{reviewId:'fail'},['fail'],4);
  const reset=op('reset','card.put',{...card,resetMemory:true},['fail'],4);
  const deleted=op('deleted','card.delete',{},['fail'],4);
  const deckDeleted=op('deck-deleted','deck.delete',{},['d1'],4);
  for(const change of [undo,reset,deleted,deckDeleted])expect(attentionByCard(materialize([...base,fail,change],epoch)).size).toBe(0);
 });
 it('does not apply a resolution before its required review arrives and validates its references',()=>{
  expect(materialize([...base,resolved],epoch).pending.map(e=>e.id)).toEqual(['resolved']);
  expect(attentionByCard(materialize([...base,fail,resolved],epoch)).size).toBe(0);
  expect(()=>validateEvents([{...resolved,deps:[]}])).toThrow();
  expect(()=>validateEvents([{...resolved,payload:{cardId:'other',reviewIds:['fail']}}])).toThrow();
  expect(()=>validateEvents([{...resolved,payload:{cardId:card.id,reviewIds:['fail','fail']}}])).toThrow();
  expect(()=>validateEvents([{...resolved,payload:{cardId:card.id}}])).toThrow();
 });
 it('stores the studied mark offline, is idempotent and round-trips it through a full archive',async()=>{
  await merge([...base,fail]);const before=await snapshot();
  expect(await resolveAttention(card.id)).toBe(true);expect(await resolveAttention(card.id)).toBe(false);
  const after=await snapshot(),mark=after.events.find(e=>e.kind==='study.resolve')!;
  expect(mark.deps).toContain('fail');expect(attentionByCard(after).size).toBe(0);
  expect(after.cards[0].memory).toEqual(before.cards[0].memory);
  expect(after.cards[0].reviews).toEqual(before.cards[0].reviews);
  const pack=await readImport(new File([(await createArchive()).slice().buffer],'consider.recall.zip'));
  if(!('events'in pack))throw Error('Expected full archive');
  await db.events.clear();await importArchive(pack);await importArchive(pack);
  expect(attentionByCard(await snapshot()).size).toBe(0);
  expect((await snapshot()).events.filter(e=>e.kind==='study.resolve')).toHaveLength(1);
  const later=op('new-fail','review',{...review,rating:1,previousReviewIds:['fail']},['fail'],mark.clock+1,'phone',1);
  await merge([later]);expect(attentionByCard(await snapshot()).get(card.id)?.map(e=>e.id)).toEqual(['new-fail']);
 });
 it('batches long histories within the protocol limit and does not acknowledge deleted cards',async()=>{
  const failures=Array.from({length:205},(_,i)=>op('f'+i,'review',{...review,rating:1},['a1'],i+3));
  await merge([...base,...failures]);expect(await resolveAttention(card.id)).toBe(true);
  const s=await snapshot(),marks=s.events.filter(e=>e.kind==='study.resolve');
  expect(marks).toHaveLength(3);expect(marks.every(e=>e.deps.length<=128)).toBe(true);expect(attentionByCard(s).size).toBe(0);
  await merge([op('trash','card.delete',{},['a1'],s.events.at(-1)!.clock+1,'phone',1)]);
  expect(await resolveAttention(card.id)).toBe(false);
 });
});
