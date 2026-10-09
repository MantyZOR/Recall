import { useEffect, useRef, type ReactNode } from 'react';
import { X, ArrowRight, BookOpen, Plus } from 'lucide-react';
export function Button({children,onClick,kind='primary',disabled=false,className='',type='button',title}:{children:ReactNode;onClick?:()=>void;kind?:'primary'|'secondary'|'ghost'|'danger';disabled?:boolean;className?:string;type?:'button'|'submit';title?:string}){return <button className={'button '+kind+' '+className} onClick={onClick} disabled={disabled} type={type} title={title}>{children}</button>;}
export function Dialog({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')closeRef.current();if(e.key==='Tab'){const items=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled),[role="dialog"] input,[role="dialog"] textarea,[role="dialog"] select,[role="dialog"] a[href]'));if(!items.length)return;const first=items[0],last=items.at(-1)!;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);const t=setTimeout(()=>document.querySelector<HTMLElement>('[role="dialog"] input,[role="dialog"] textarea,[role="dialog"] button')?.focus(),10);return()=>{document.removeEventListener('keydown',key);clearTimeout(t);previous?.focus();};},[]);
 return <div className="dialog-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} className={'dialog '+(wide?'wide':'')}><header><h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}
export function PageHeader({eyebrow,title,description,children}:{eyebrow?:string;title:string;description?:string;children?:ReactNode}){return <header className="page-header"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="page-actions">{children}</div></header>;}
export function Empty({title,description,children}:{title:string;description:string;children?:ReactNode}){return <div className="empty-state"><div className="empty-icon"><BookOpen size={29}/></div><h3>{title}</h3><p>{description}</p>{children}</div>;}
export function Progress({value,color}:{value:number;color?:string}){return <div className="progress"><div style={{width:Math.max(0,Math.min(100,value))+'%',background:color}}/></div>;}
export const COLORS=['#7269dd','#449f88','#d58d52','#5c92c9','#c773a5','#9b8b63'];
export function cleanText(s:string){return s.replace(/\{\{c\d+::(.*?)\}\}/gs,'$1').replace(/[#*`$\[\]]/g,'').replace(/asset:[a-f0-9]{64}/g,'изображение').trim();}
export const formatDate=(value:number|string)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'}).format(typeof value==='string'?new Date(value+'T12:00:00Z'):value);
export const formatCount=(n:number,forms=['карточка','карточки','карточек'])=>n+' '+(n%100>=11&&n%100<=14?forms[2]:n%10===1?forms[0]:n%10>=2&&n%10<=4?forms[1]:forms[2]);
export { ArrowRight, Plus };


