import { parse, stringify } from 'yaml';
import type { Card, CardType, Deck } from './types';
export type ImportedCard=Omit<Card,'id'|'deckId'>;
export interface ParsedMarkdown{deck:Partial<Deck>;cards:ImportedCard[];errors:string[];warnings:string[];}
const typeNames:Record<string,CardType>={basic:'basic',input:'input',cloze:'cloze','вопрос':'basic','ввод':'input','пропуски':'cloze'};
export const MARKDOWN_EXAMPLE=String.raw`---
deck: Английский и не только
description: Мои первые карточки
retention: 0.9
---

## [input] Переведи слово
resilient
:::answer
стойкий
:::aliases
устойчивый; жизнестойкий
:::tags
английский, слова

## [basic] Производная
Чему равна производная $x^n$?
:::answer
$$\frac{d}{dx}x^n = nx^{n-1}$$
:::notes
Степень уменьшается на единицу.

## [cloze] Как работает память
{{c1::Активное воспроизведение}} и
{{c2::интервальные повторения}} помогают сохранять знания.
:::notes
Каждый номер создаёт отдельную связанную карточку.
`;
export function clozeGroups(text:string){return [...new Set([...text.matchAll(/\{\{c(\d+)::([\s\S]*?)\}\}/g)].map(m=>+m[1]))].sort((a,b)=>a-b);}
export function clozeDisplay(text:string,index:number,answer=false,hints=false){return text.replace(/\{\{c(\d+)::([\s\S]*?)\}\}/g,(_,n:string,value:string)=>{const [content,hint]=value.split('::');return +n===index?(answer?content:(hints&&hint?'〔'+hint+'〕':'〔…〕')):content;});}
export function clozeHasHint(text:string,index:number){return [...text.matchAll(/\{\{c(\d+)::([\s\S]*?)\}\}/g)].some(m=>+m[1]===index&&Boolean(m[2].split('::')[1]?.trim()));}
export function clozeAnswer(text:string,index:number){return [...text.matchAll(/\{\{c(\d+)::([\s\S]*?)\}\}/g)].filter(m=>+m[1]===index).map(m=>m[2].split('::')[0]).join('; ');}
export function parseMarkdown(source:string):ParsedMarkdown {
 const result:ParsedMarkdown={deck:{},cards:[],errors:[],warnings:[]};source=source.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 const front=source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
 if(front){try{const meta=parse(front[1],{maxAliasCount:0});if(meta&&typeof meta==='object'){result.deck={name:String(meta.deck||meta.name||'Новая колода'),description:String(meta.description||''),retention:typeof meta.retention==='number'?meta.retention:.9};}}catch{result.errors.push('Не удалось прочитать заголовок YAML');}source=source.slice(front[0].length);}
 let section:'front'|'back'|'notes'|'aliases'|'tags'='front',card:ImportedCard|undefined,fence='',startLine=0;
 const finish=()=>{if(!card)return;card.front=card.front.trim();card.back=card.back.trim();card.notes=card.notes.trim();
  if(!card.front)card.front=card.title;
  if(card.type==='cloze'){const groups=clozeGroups(card.front);if(groups.some(g=>g<1||g>99))result.errors.push('Строка '+startLine+': номера пропусков — от 1 до 99');else if(!groups.length)result.errors.push('Строка '+startLine+': нет пропусков {{c1::ответ}}');else {const siblingId=crypto.randomUUID();for(const clozeIndex of groups)result.cards.push({...card,clozeIndex,siblingId});}}
  else if(!card.back)result.errors.push('Строка '+startLine+': отсутствует :::answer или ответ');else result.cards.push(card);
 };
 source.split('\n').forEach((line,i)=>{
  const fm=line.match(/^\s*(`{3,}|~{3,})/);if(fm){if(!fence)fence=fm[1];else if(fence[0]===fm[1][0]&&fm[1].length>=fence.length&&line.trim()===fm[1])fence='';}
  const heading=!fence&&line.match(/^## (?:\[([^\]]+)\] )?(.*)$/);
  if(heading){finish();const type=typeNames[(heading[1]||'basic').toLowerCase()];if(!type)result.errors.push('Строка '+(i+1)+': неизвестный тип '+heading[1]);card={title:heading[2].trim(),type:type||'basic',front:'',back:'',notes:'',aliases:[],tags:[]};section='front';startLine=i+1;return;}
  const divider=!fence&&line.match(/^:::(answer|notes|aliases|tags)\s*$/);
  if(divider&&card){section=(divider[1]==='answer'?'back':divider[1]) as typeof section;return;}
  if(card){if(section==='aliases')card.aliases.push(...line.split(';').map(x=>x.trim()).filter(Boolean));else if(section==='tags')card.tags.push(...line.split(',').map(x=>x.trim()).filter(Boolean));else card[section]+=line+'\n';}
 });
 finish();if(!result.cards.length&&!result.errors.length)result.errors.push('Карточки начинаются с ## [basic] Заголовок. Скачай пример формата.');
 return result;
}
export function exportMarkdown(deck:Deck,cards:Card[]) {
 const header='---\n'+stringify({deck:deck.name,description:deck.description,retention:deck.retention})+'---\n\n',seen=new Set<string>();
 return header+cards.filter(c=>{if(c.type!=='cloze'||!c.siblingId)return true;if(seen.has(c.siblingId))return false;seen.add(c.siblingId);return true;}).map(c=>'## ['+c.type+'] '+c.title+'\n'+c.front+(c.back?'\n:::answer\n'+c.back:'')+(c.notes?'\n:::notes\n'+c.notes:'')+(c.aliases.length?'\n:::aliases\n'+c.aliases.join('; '):'')+(c.tags.length?'\n:::tags\n'+c.tags.join(', '):'')+'\n').join('\n');
}
export function normalizedAnswer(value:string){return value.normalize('NFC').trim().toLocaleLowerCase('ru').replace(/\s+/g,' ').replace(/ё/g,'е');}
export function checkTypedAnswer(answer:string,card:Card){const expected=card.type==='cloze'?clozeAnswer(card.front,card.clozeIndex||1):card.back;if(expected.length>80||expected.includes('\n')||/[`$]/.test(expected))return null;return [expected,...card.aliases].some(v=>normalizedAnswer(v)===normalizedAnswer(answer));}



