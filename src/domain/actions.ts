import type { Card, CardView, Deck, Snapshot } from './types';
import { append, db, snapshot } from '../storage/db';
import { entityHeads, deletedDecks, purgedDeckIds } from './reducer';
import { clozeGroups, type ImportedCard } from './markdown';
import { attentionByCard } from './attention';
import {choiceProblem} from './choice';
export function cardData(c:Card):Card {return {id:c.id,deckId:c.deckId,title:c.title,type:c.type,front:c.front,back:c.back,notes:c.notes,aliases:c.aliases,tags:c.tags,...(c.clozeIndex?{clozeIndex:c.clozeIndex}:{}),...(c.siblingId?{siblingId:c.siblingId}:{}),...(c.type==='choice'?{options:c.options}: {})};}
const importKey=(c:Pick<Card,'type'|'front'|'back'|'clozeIndex'|'options'>)=>JSON.stringify([c.type,c.front,c.back,c.clozeIndex,c.type==='choice'?c.options?.map(o=>({text:o.text,correct:o.correct,feedback:o.feedback||''})).sort((a,b)=>a.text.localeCompare(b.text)):undefined]);
export async function saveDeck(deck:Deck,s:Snapshot){
 await db.transaction('rw',db.events,db.meta,async()=>{
  if(purgedDeckIds((await snapshot()).events).has(deck.id))throw new Error('Колода уже удалена навсегда. Создай новую колоду.');
  const heads=entityHeads(s.events,deck.id,'deck.');await append('deck.put',deck.id,deck,heads.map(e=>e.id));
 });
}
export async function saveCard(data:Card,base:CardView|undefined,s:Snapshot,resetMemory=false){
 if(data.type==='choice'){const problem=choiceProblem(data.options);if(problem)throw Error(problem);}
 await db.transaction('rw',db.events,db.meta,async()=>{
  const current=await snapshot();
  if(base&&current.cards.some(c=>c.id===base.id&&c.purged))throw new Error('Карточка уже удалена навсегда. Изменения не сохранены.');
  if(purgedDeckIds(current.events).has(data.deckId))throw new Error('Колода уже удалена навсегда. Выбери другую колоду.');
  if(data.type==='cloze'){
   const groups=clozeGroups(data.front);if(!groups.length)throw new Error('Добавь хотя бы один пропуск: {{c1::ответ}}');
   const siblingId=base?.siblingId||crypto.randomUUID(),siblings=base?.siblingId?s.cards.filter(c=>c.siblingId===base.siblingId&&!c.deleted):base?[base]:[];
   for(const index of groups){const old=siblings.find(c=>c.clozeIndex===index),id=old?.id||(!base&&index===groups[0]?data.id:crypto.randomUUID());await append('card.put',id,{...cardData(data),id,siblingId,clozeIndex:index,resetMemory},old?.heads||[]);}
   for(const old of siblings.filter(c=>!groups.includes(c.clozeIndex||0)))await append('card.delete',old.id,{},old.heads);
  }else{const clean={...cardData(data)};delete clean.siblingId;delete clean.clozeIndex;await append('card.put',data.id,{...clean,resetMemory},base?.heads||[]);if(base?.siblingId)for(const other of s.cards.filter(c=>c.id!==base.id&&c.siblingId===base.siblingId&&!c.deleted))await append('card.delete',other.id,{},other.heads);}
 });
}
export async function importMarkdownCards(cards:ImportedCard[],deck:Deck,newDeck:boolean,assets:import('./types').Attachment[]=[]){
 let added=0,skipped=0;
 await db.transaction('rw',db.events,db.meta,db.attachments,async()=>{
  const s=await snapshot();
  if(newDeck)await saveDeck(deck,s);
  else if(!s.decks.some(d=>d.id===deck.id))throw new Error('Колода уже удалена. Выбери другую колоду для импорта.');
  await db.attachments.bulkPut(assets);
  const keys=new Set(s.cards.filter(c=>c.deckId===deck.id&&!c.deleted).map(importKey));
  for(const c of cards){const key=importKey(c);if(keys.has(key)){skipped++;continue;}keys.add(key);const id=crypto.randomUUID();await append('card.put',id,{...c,id,deckId:deck.id});added++;}
 });return {added,skipped};
}
export async function addExamples(s:Snapshot){
 const samples=[
 {name:'Английский',description:'Слова, которые пригодятся в жизни',color:'#7269dd',icon:'Aa',cards:[{title:'resilient',type:'input',front:'resilient',back:'стойкий',aliases:['устойчивый','жизнестойкий']},{title:'curiosity',type:'input',front:'curiosity',back:'любопытство'},{title:'to figure out',type:'basic',front:'Что означает **to figure out**?',back:'Разобраться, понять, найти решение.'}]},
 {name:'Математика',description:'Формулы с понятным смыслом',color:'#449f88',icon:'∑',cards:[{title:'Производная степени',type:'basic',front:'Чему равна производная $x^n$?',back:'$$\\frac{d}{dx} x^n=nx^{n-1}$$'},{title:'Правило произведения',type:'cloze',front:'Производная произведения: $(uv)\\prime = {{c1::u\\prime v + uv\\prime}}$.',back:'',clozeIndex:1}]},
 {name:'Программирование',description:'Понимать, объяснять, применять',color:'#d58d52',icon:'{}',cards:[{title:'Сложность поиска',type:'basic',front:'Какова сложность бинарного поиска и какое у него предусловие?',back:'**O(log n)**. Массив должен быть отсортирован.'},{title:'Замыкание',type:'basic',front:'Что такое замыкание в JavaScript?',back:'Функция сохраняет доступ к лексическому окружению, в котором была создана.\n\n```js\nfunction counter() {\n  let n = 0;\n  return () => ++n;\n}\n```'},{title:'SQL и транзакции',type:'basic',front:'Зачем сохранять оценку карточки и её состояние в одной транзакции?',back:'Чтобы при прерывании записи сохранить согласованность: либо записаны все изменения, либо ни одно.'}]}
 ];
 await db.transaction('rw',db.events,db.meta,async()=>{for(const sample of samples){const id=crypto.randomUUID();await saveDeck({id,name:sample.name,description:sample.description,color:sample.color,icon:sample.icon,algorithm:'fsrs7',retention:.9,newPerDay:20},s);for(const raw of sample.cards){const cid=crypto.randomUUID();await append('card.put',cid,{id:cid,deckId:id,title:raw.title,type:raw.type,front:raw.front,back:raw.back,notes:'',aliases:'aliases' in raw?raw.aliases:[],tags:[],...('clozeIndex' in raw?{clozeIndex:raw.clozeIndex,siblingId:crypto.randomUUID()}:{})});}}});
}



/** Reading a mistake is independent of the memory model and does not fabricate a review. */
export async function resolveAttention(cardId:string){
 return db.transaction('rw',db.events,db.meta,async()=>{
  const current=await snapshot(),card=current.cards.find(c=>c.id===cardId);
  const mistakes=attentionByCard(current).get(cardId)||[];
  if(!card||!mistakes.length)return false;
  for(let i=0;i<mistakes.length;i+=100){
   const reviewIds=mistakes.slice(i,i+100).map(e=>e.id);
   await append('study.resolve',cardId,{cardId,reviewIds},[...card.heads,...reviewIds]);
  }
  return true;
 });
}

export async function purgeCards(ids:string[]){
 return db.transaction('rw',db.events,db.meta,async()=>{
  const current=await snapshot(),picked=new Set(ids);
  const candidates=current.cards.filter(c=>picked.has(c.id)&&c.deleted&&!c.purged);
  for(const c of candidates)await append('card.delete',c.id,{permanent:true},c.heads);
  return candidates.length;
 });
}

export async function purgeDeck(id:string){
 return db.transaction('rw',db.events,db.meta,async()=>{
  const current=await snapshot();
  if(!deletedDecks(current).some(d=>d.id===id))return false;
  for(const c of current.cards.filter(c=>c.deckId===id&&!c.purged)){
   await append('card.delete',c.id,{permanent:true},c.heads);
  }
  await append('deck.delete',id,{permanent:true},entityHeads(current.events,id,'deck.').map(e=>e.id));
  return true;
 });
}
