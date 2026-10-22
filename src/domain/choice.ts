import type {ChoiceOption} from './types';
export function choiceProblem(options:ChoiceOption[]=[]):string{
 if(options.length<2||options.length>12)return 'Нужно от 2 до 12 вариантов ответа';
 if(options.some(o=>!o.text.trim()||o.text.length>10000||(o.feedback?.length||0)>10000))return 'Заполни варианты; текст и пояснение — до 10 000 символов';
 if(!options.some(o=>o.correct))return 'Отметь хотя бы один правильный вариант';
 if(options.every(o=>o.correct))return 'Нужен хотя бы один неверный вариант';
 if(new Set(options.map(o=>o.id)).size!==options.length||options.some(o=>!o.id))return 'Идентификаторы вариантов должны отличаться';
 if(new Set(options.map(o=>o.text.normalize('NFC').trim().replace(/\s+/g,' '))).size!==options.length)return 'Варианты ответа не должны повторяться';
 return '';
}
export function checkChoiceAnswer(options:ChoiceOption[],selected:string[]){
 const chosen=new Set(selected),correct=options.filter(o=>o.correct);
 return correct.length>0&&chosen.size===selected.length&&chosen.size===correct.length&&correct.every(o=>chosen.has(o.id));
}
export function shuffleChoices(options:ChoiceOption[],random= Math.random){
 const ids=options.map(o=>o.id);for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}return ids;
}
export function choiceAnswerMarkdown(options:ChoiceOption[]=[]){return options.filter(o=>o.correct).map(o=>o.text).join('\n\n');}
