import type { CardView, Goal, Snapshot } from './types';
import { activeCards, makeQueue, studyDay, todayIntroducedIds, type QueueOptions } from './reducer';
import { goalPace } from './goal-pace';
import { prediction } from './fsrs';
import { dateStart, shiftedDate } from './time';

export function goalCardOrder(s:Snapshot,g:Goal,deadline:number){
 const decks=new Map(s.decks.map(d=>[d.id,d]));
 const priority=(c:CardView)=>{
  const deck=decks.get(c.deckId)!;
  return (g.importance[c.deckId]||1)*(1-(prediction(c.memory,deadline,deck.algorithm,s.parameters[deck.algorithm]?.values)||0));
 };
 return (a:CardView,b:CardView)=>priority(b)-priority(a);
}

export function studyPlan(s:Snapshot,deckIds:string[]=[],now=Date.now(),options:QueueOptions={},enabled=true){
 const scope=new Set(deckIds),cards=activeCards(s).filter(c=>!scope.size||scope.has(c.deckId));
 const queue=enabled?makeQueue(s,'review',deckIds,now,options):[];
 const fresh=cards.filter(c=>!c.memory&&!c.introductions.length),learning=cards.filter(c=>!c.memory&&c.introductions.length);
 const newReady=queue.filter(c=>!c.memory&&!c.introductions.length).length;
 const firstReady=queue.filter(c=>!c.memory&&c.introductions.length).length;
 const repeatReady=queue.filter(c=>c.memory).length;
 const introduced=todayIntroducedIds(s,now),goalMode=options.goalNewPerDay!==undefined;
 const used=goalMode?s.cards.filter(c=>introduced.has(c.id)&&(!scope.size||scope.has(c.deckId))).length:introduced.size;
 const decks=new Map(s.decks.map(d=>[d.id,d])),introducedByDeck=new Map<string,number>();
 for(const c of s.cards)if(introduced.has(c.id))introducedByDeck.set(c.deckId,(introducedByDeck.get(c.deckId)||0)+1);
 const allowance=Math.max(0,(options.goalNewPerDay??s.settings.newPerDay)-used);
 const limited=fresh.length>0&&!newReady&&allowance===0;
 const deckLimited=!goalMode&&fresh.length>0&&!newReady&&allowance>0&&fresh.every(c=>{
  const deck=decks.get(c.deckId)!;
  return (introducedByDeck.get(deck.id)||0)>=deck.newPerDay;
 });
 const future=cards.filter(c=>c.memory&&c.memory.due>now).map(c=>c.memory!.due);
 const nextReviewAt=future.length?Math.min(...future):null;
 const resetAt=dateStart(shiftedDate(studyDay(now,s.settings.timeZone,s.settings.dayStartsAt),1),s.settings.timeZone,s.settings.dayStartsAt);
 const deferred=!newReady&&!firstReady&&!repeatReady&&(fresh.length>0||learning.length>0||cards.some(c=>c.memory&&c.memory.due<=now))&&!limited&&!deckLimited;
 const emptyReason=!enabled?'expired':!cards.length?'empty':limited?'new-limit':deckLimited?'deck-limit':deferred?'siblings':'scheduled';
 return {cards,queue,total:cards.length,ready:queue.length,newReady,firstReady,repeatReady,fresh:fresh.length,learning:learning.length,
  rated:cards.filter(c=>c.memory).length,allowance,newAllowance:Math.min(fresh.length,allowance),nextReviewAt,resetAt,emptyReason};
}
export type StudyPlan=ReturnType<typeof studyPlan>;

export function goalStudyPlan(s:Snapshot,g:Goal,now=Date.now()){
 const pace=goalPace(s,g,now);
 return studyPlan(s,g.deckIds,now,{goalNewPerDay:pace.newPerDay,compare:goalCardOrder(s,g,pace.deadline)},Boolean(pace.days));
}

export function studyEmptyLabel(plan:StudyPlan){
 return plan.emptyReason==='empty'?'Нет карточек':plan.emptyReason==='expired'?'Срок цели прошёл':
  plan.emptyReason==='new-limit'||plan.emptyReason==='deck-limit'?'Лимит новых на сегодня':
  plan.emptyReason==='siblings'?'Связанные карточки отложены':'Повторений сейчас нет';
}
export function studyEmptyDescription(plan:StudyPlan,goal=false){
 if(plan.emptyReason==='expired')return 'Выбери новую дату цели, чтобы продолжить подготовку по плану.';
 if(plan.emptyReason==='empty')return 'Добавь карточки или выбери колоды с материалом.';
 if(plan.emptyReason==='new-limit')return goal?'Темп новых по этой цели на сегодня выполнен. Его можно увеличить через «Изменить темп».':'Общий дневной лимит новых уже использован, в том числе в занятиях по целям. Эти карточки ещё не изучены.';
 if(plan.emptyReason==='deck-limit')return 'Дневной лимит новых этой колоды уже использован. Его можно увеличить в настройках колоды.';
 if(plan.emptyReason==='siblings')return 'Связанные пропуски разносятся по учебным дням, чтобы ответ одного не подсказывал другой.';
 return 'Знакомые карточки ждут назначенного времени. Это не означает, что материал выучен навсегда.';
}
export function studyDateTime(at:number,zone:string){
 return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:zone}).format(at);
}
