import { type StudyPlan, studyDateTime, studyEmptyDescription } from '../domain/study-plan';
import { formatCount } from './common';
export function StudyStatus({plan,timeZone,goal=false,compact=false}:{plan:StudyPlan;timeZone:string;goal?:boolean;compact?:boolean}){
 const reset=plan.emptyReason==='new-limit'||plan.emptyReason==='deck-limit'||plan.emptyReason==='siblings';
 return <section className={'study-plan-status'+(compact?' compact':'')} aria-label="Доступно для занятия">
  <strong>Сейчас доступно: {formatCount(plan.ready)}</strong>
  <p className="study-plan-counts"><span>Повторить: <b>{plan.repeatReady}</b></span><span>Новые: <b>{plan.newReady}</b></span><span>Первая проверка: <b>{plan.firstReady}</b></span></p>
  {!plan.ready&&<p className="study-plan-explanation">{studyEmptyDescription(plan,goal)}</p>}
  {plan.nextReviewAt!==null&&<p className="study-plan-next">Ближайшее назначенное повторение: <time dateTime={new Date(plan.nextReviewAt).toISOString()}>{studyDateTime(plan.nextReviewAt,timeZone)}</time></p>}
  {!plan.ready&&reset&&<p className="study-plan-next">Новый учебный день: <time dateTime={new Date(plan.resetAt).toISOString()}>{studyDateTime(plan.resetAt,timeZone)}</time></p>}
 </section>;
}
