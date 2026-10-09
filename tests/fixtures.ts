import type { Operation, Deck, Card, Review } from '../src/domain/types';
export const deck:Deck={id:'deck',name:'Проверка',description:'',color:'#7269dd',icon:'Aa',retention:.9,algorithm:'fsrs7',newPerDay:20};
export const card:Card={id:'card',deckId:deck.id,title:'Первый',type:'basic',front:'Вопрос?',back:'Ответ',notes:'',aliases:[],tags:[]};
export const epoch=Date.UTC(2026,9,2,9);
export const review:Review={cardId:card.id,cardVersion:'a1',rating:3,elapsedDays:0,durationMs:12000,context:'review',hints:false,model:'FSRS-7/rust-scalar-v1',paramsId:'fsrs7-defaults-v1',retention:.9,prediction:null,previousReviewIds:[],sessionId:'session'};
export function op(id:string,kind:string,payload:object={},deps:string[]=[],clock=1,device='pc',seq=clock,entityId=kind.startsWith('deck.')?'deck':kind.startsWith('goal.')?'goal':'card',at=epoch):Operation{
 return {id,deviceId:device,seq,clock,deps,at,kind,entityId,payload:payload as Record<string,unknown>};
}
export const base=[op('d1','deck.put',deck,[],1),op('a1','card.put',card,['d1'],2)];
