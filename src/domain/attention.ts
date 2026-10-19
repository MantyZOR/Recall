import type { Operation, Snapshot } from './types';

/** Explicitly acknowledge only mistakes already seen on this device. New mistakes stay pending. */
export function attentionByCard(s:Snapshot):Map<string,Operation[]> {
 const resolved=new Map<string,Set<string>>();
 for(const event of s.events)if(event.kind==='study.resolve'){
  const ids=resolved.get(event.entityId)||new Set<string>();
  for(const id of event.payload.reviewIds as string[])ids.add(id);
  resolved.set(event.entityId,ids);
 }
 const decks=new Set(s.decks.map(d=>d.id)),result=new Map<string,Operation[]>();
 for(const card of s.cards){
  if(card.deleted||card.purged||card.conflicts.length||!decks.has(card.deckId))continue;
  const mistakes=card.reviews.filter(e=>Number(e.payload.rating)===1&&!resolved.get(card.id)?.has(e.id));
  if(mistakes.length)result.set(card.id,mistakes);
 }
 return result;
}
