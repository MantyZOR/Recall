import {useId} from 'react';
import type {ChoiceOption} from '../domain/types';
import {Markdown} from './Markdown';
import '../choice-cards.css';

export function ChoiceOptions({options,order,selected=[],onChange,revealed=false,readOnly=false}:{options:ChoiceOption[];order?:string[];selected?:string[];onChange?:(ids:string[])=>void;revealed?:boolean;readOnly?:boolean}){
 const group=useId(),multiple=options.filter(o=>o.correct).length>1;
 const sorted=order?.length===options.length?order.map(id=>options.find(o=>o.id===id)!).filter(Boolean):options;
 return <fieldset className="choice-list"><legend>{readOnly?'Варианты ответа':multiple?'Выбери все правильные варианты':'Выбери один вариант'}</legend>{sorted.map(option=>{
  const picked=selected.includes(option.id),show=revealed||readOnly;
  const state=show?(option.correct?'is-correct':picked?'is-wrong':''):picked?'is-selected':'';
  return <div key={option.id} className={'choice-option '+state} data-option-id={option.id}>
   {readOnly?<div className="choice-option-content"><span className="choice-verdict">{option.correct?'Правильный вариант':'Неверный вариант'}</span><Markdown>{option.text}</Markdown></div>:<label className="choice-option-label"><input type={multiple?'checkbox':'radio'} name={group} checked={picked} disabled={revealed} onChange={()=>onChange?.(multiple?(picked?selected.filter(id=>id!==option.id):[...selected,option.id]):[option.id])}/><div className="choice-option-content"><Markdown>{option.text}</Markdown>{show&&<span className="choice-verdict">{option.correct?(picked?'Выбрано верно':'Правильный вариант · не выбран'):picked?'Выбрано ошибочно':'Неверный вариант'}</span>}</div></label>}
   {show&&option.feedback&&<div className="choice-feedback"><Markdown>{option.feedback}</Markdown></div>}
  </div>;
 })}</fieldset>;
}
