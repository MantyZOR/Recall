import { useState } from 'react';
import type { Snapshot } from '../domain/types';
import { activeCards, makeQueue } from '../domain/reducer';
import { Button, Dialog, formatCount } from './common';
export function PracticeSetup({s,deckIds,name,minutes,onClose,onStart}:{s:Snapshot;deckIds:string[];name:string;minutes:number;onClose:()=>void;onStart:(minutes:number,includeSiblings:boolean)=>void}){
 const [budget,setBudget]=useState(minutes),[separate,setSeparate]=useState(s.settings.burySiblings);
 const selected=activeCards(s).filter(c=>!deckIds.length||deckIds.includes(c.deckId));
 const siblings=selected.some(c=>c.siblingId);
 const queue=makeQueue(s,'practice',deckIds,Date.now(),{includeSiblings:!separate});
 const valid=Number.isFinite(budget)&&budget>=1&&budget<=720;
 return <Dialog title="Дополнительная практика" onClose={onClose}>
  <div className="form-body">
   <p><strong>{name}</strong></p>
   <p className="practice-plan-note"><strong>Оценки влияют на расписание.</strong> Практика идёт вне обычной очереди. Реальные ответы пересчитывают память и могут изменить следующие даты.</p>
   <div className="practice-plan-count">В занятии: {formatCount(queue.length)} из {selected.length}</div>
   <div className="practice-plan-options">
    <label>Минут для этого занятия<input type="number" inputMode="numeric" min={1} max={720} value={budget} onChange={e=>setBudget(+e.target.value)}/></label>
    {siblings&&<label className="checkbox-label"><input type="checkbox" checked={separate} onChange={e=>setSeparate(e.target.checked)}/><span>Разнести связанные пропуски</span></label>}
   </div>
   {siblings&&<p className="practice-plan-note">{separate?'Из одного текста попадёт один пропуск. Сними переключатель, если хочешь проверить все карточки за одно занятие.':'Включены все связанные пропуски. Ответ предыдущей карточки может подсказать следующую.'}</p>}
   <details className="practice-plan-note"><summary>Как учитывается практика</summary><p>Новые карточки сначала изучим, знакомые проверим по памяти. Дневной лимит не ограничивает это занятие, но новые карточки учитываются в сегодняшнем расходе.</p><p>Заданный темп цели и обычные дневные лимиты сохраняются. Ответы практики исключены из подбора параметров и оценки качества прогнозов.</p></details>
  </div>
  <footer className="dialog-footer practice-plan-footer"><Button kind="secondary" onClick={onClose}>Отмена</Button><Button disabled={!queue.length||!valid} onClick={()=>onStart(budget,!separate)}>Начать практику</Button></footer>
 </Dialog>;
}
