export type Algorithm = 'fsrs7' | 'fsrs6' | 'sm2' | 'leitner';
export type CardType = 'basic' | 'input' | 'cloze';
export type Rating = 1 | 2 | 3 | 4;
export type Context = 'review' | 'practice' | 'exam';
export interface Deck { id:string; name:string; description:string; color:string; icon:string; retention:number; algorithm:Algorithm; newPerDay:number; }
export interface Card { id:string; deckId:string; title:string; type:CardType; front:string; back:string; notes:string; aliases:string[]; tags:string[]; clozeIndex?:number; siblingId?:string; }
export interface Goal { id:string; name:string; date:string; minutes:number; retention:number; deckIds:string[]; importance:Record<string,number>; newPerDay?:number|null; }
export interface Settings { minutes:number; newPerDay:number; theme:'light'|'dark'|'system'; timeZone:string; dayStartsAt:number; inputMode:'auto-short'|'manual'; burySiblings:boolean; }
export const DEFAULT_SETTINGS:Settings={minutes:20,newPerDay:20,theme:'light',timeZone:'Europe/Moscow',dayStartsAt:4,inputMode:'auto-short',burySiblings:true};
export interface Operation { id:string; deviceId:string; seq:number; clock:number; deps:string[]; at:number; kind:string; entityId:string; payload:Record<string,unknown>; }
export interface Memory { stability:number; stabilityFast:number; difficulty:number; reps:number; lapses:number; ease:number; box:number; lastAt:number; due:number; }
export interface Introduction { cardId:string; cardVersion:string; durationMs:number; context:'review'|'practice'; sessionId:string; }
export interface Review { cardId:string; cardVersion:string; rating:Rating; elapsedDays:number; durationMs:number; context:Context; hints:boolean; model:string; paramsId:string; retention:number; prediction:number|null; previousReviewIds:string[]; sessionId:string; }
export interface CardView extends Card { version:string; heads:string[]; conflicts:Operation[]; deleted:boolean; purged:boolean; memory:Memory|null; reviews:Operation[]; introductions:Operation[]; concurrentReviews:boolean; }
export interface Snapshot { decks:Deck[]; cards:CardView[]; goals:Goal[]; settings:Settings; parameters:Record<string,ParameterSet>; events:Operation[]; pending:Operation[]; }
export interface ParameterSet { id:string; algorithm:'fsrs7'|'fsrs6'; values:number[]; trainedAt:number; trainingCount:number; testCount:number; trainCutoff:number; defaultLoss:number; fittedLoss:number; }
export interface Attachment { id:string; name:string; type:string; blob:Blob; }
export interface LocalIdentity { id:string; name:string; }
export interface Connection { token:string; serverId:string; role:'desktop'|'phone'; at:number; lastSync?:number; ack?:Record<string,number>; origin?:string; name?:string; error?:string; failures?:number; nextAttemptAt?:number; }
export const MODEL_NAMES:Record<Algorithm,string>={fsrs7:'FSRS-7',fsrs6:'FSRS-6',sm2:'SM-2',leitner:'Лейтнер'};

