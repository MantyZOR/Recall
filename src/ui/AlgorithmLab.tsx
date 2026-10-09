import { useId, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { DAY, intervalDays, intervalLabel, prediction, schedule } from '../domain/fsrs';
import type { Rating } from '../domain/types';
import { exampleMemory, HELP_RATINGS } from './help-memory';

const percent=(n:number)=>Math.round(n*100)+'%';
const decimal=(n:number)=>n.toLocaleString('ru-RU',{maximumFractionDigits:2});
export function AlgorithmLab() {
 const [algorithm,setAlgorithm]=useState<'fsrs7'|'fsrs6'>('fsrs7'),[familiar,setFamiliar]=useState(true);
 const [elapsed,setElapsed]=useState(7),[retention,setRetention]=useState(90),[rating,setRating]=useState<Rating>(3);
 const chartId=useId();
 const before=useMemo(()=>exampleMemory(algorithm,familiar),[algorithm,familiar]);
 const at=before.lastAt+elapsed*DAY;
 const choices=HELP_RATINGS.map(item=>schedule(before,item.rating,at,elapsed,retention/100,algorithm));
 const after=choices[rating-1],interval=(after.due-at)/DAY;
 const probability=prediction(before,at,algorithm)!;
 const horizon=Math.max(1,intervalDays(after,.9,algorithm)*2,interval*1.2);
 const y=(r:number)=>(1-r)/.5*180;
 const points=Array.from({length:101},(_,i)=>{
  const t=horizon*i/100, r=prediction(after,at+t*DAY,algorithm)!;
  return (i===0?'M':'L')+(440*i/100).toFixed(2)+','+y(r).toFixed(2);
 }).join(' ');
 const intervalX=interval/horizon*440;
 return <section className="algorithm-lab" aria-label="Лаборатория алгоритмов">
  <div className="help-lab-heading"><span><FlaskConical size={20}/>Попробуй сам</span><h3>От ответа к следующему повтору</h3></div>
  <p className="help-lab-intro">Одна выдуманная карточка, общие параметры модели. Расчёт тот же, что в занятии. Меняй условия — это пример, а не прогноз твоих результатов.</p>
  <div className="help-lab-controls">
   <label>Модель<select aria-label="Модель" value={algorithm} onChange={e=>setAlgorithm(e.target.value as typeof algorithm)}><option value="fsrs7">FSRS-7</option><option value="fsrs6">FSRS-6</option></select></label>
   <label>История карточки<select aria-label="История карточки" value={familiar?'familiar':'new'} onChange={e=>setFamiliar(e.target.value==='familiar')}><option value="new">Одна оценка «Нормально»</option><option value="familiar">Три оценки «Нормально»</option></select></label>
   <label>После прошлого ответа<select aria-label="После прошлого ответа" value={elapsed} onChange={e=>setElapsed(+e.target.value)}><option value={.125}>3 часа</option><option value={1}>1 день</option><option value={7}>7 дней</option><option value={30}>30 дней</option></select></label>
   <label className="help-retention-control">Желаемая память <strong>{retention}%</strong><input aria-label="Желаемая память в лаборатории" type="range" min={70} max={97} value={retention} onChange={e=>setRetention(+e.target.value)}/></label>
  </div>
  <div className="help-rating-grid" role="group" aria-label="Оценка в лаборатории">{HELP_RATINGS.map((item,i)=><button key={item.rating} className={'help-rating help-rating-'+item.rating} aria-label={item.name} aria-pressed={rating===item.rating} onClick={()=>setRating(item.rating)}><strong>{item.compact}</strong><span>{intervalLabel(choices[i].due-at)}</span></button>)}</div>
  <div className="help-lab-results" role="status">
   <div><span>До ответа</span><strong>{percent(probability)}</strong><small>прогноз вспомнить</small></div>
   <div><span>После оценки</span><strong>{decimal(after.difficulty)} / 10</strong><small>трудность карточки</small></div>
   <div><span>Следующий повтор</span><strong data-testid="lab-interval" data-days={interval}>{intervalLabel(after.due-at)}</strong><small>после выбранной оценки</small></div>
  </div>
  <div className="help-chart-caption"><strong>Кривая после оценки</strong><span>Прогноз памяти снижается со временем</span></div>
  <div className="help-chart">
   <div className="help-chart-y" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span></div>
   <div className="help-chart-plot"><svg viewBox="0 0 440 180" preserveAspectRatio="none" role="img" aria-labelledby={chartId+'-title '+chartId+'-desc'}>
    <title id={chartId+'-title'}>Вероятность вспомнить после оценки {HELP_RATINGS[rating-1].name}</title>
    <desc id={chartId+'-desc'}>Кривая {algorithm==='fsrs7'?'FSRS-7':'FSRS-6'}. Цель {retention} процентов. Следующий повтор через {intervalLabel(after.due-at)}. Вероятность к назначенному повтору около {percent(prediction(after,after.due,algorithm)!)}.</desc>
    {[0,.5,1].map(v=><line key={v} x1={0} y1={v*180} x2={440} y2={v*180} className="help-chart-grid"/>)}
    <line x1={0} y1={y(retention/100)} x2={440} y2={y(retention/100)} className="help-chart-target"/>
    <path d={points} className="help-chart-curve" data-testid="lab-curve"/>
    <line x1={intervalX} y1={0} x2={intervalX} y2={180} className="help-chart-next"/>
    <circle cx={intervalX} cy={y(prediction(after,after.due,algorithm)!)} r={4} className="help-chart-point"/>
   </svg><div className="help-chart-x" aria-hidden="true"><span>Сразу</span><span>{intervalLabel(horizon/2*DAY)}</span><span>{intervalLabel(horizon*DAY)}</span></div></div>
  </div>
  <div className="help-chart-legend"><span><i className="help-legend-curve"/>Прогноз</span><span><i className="help-legend-target"/>Цель: {retention}%</span><span><i className="help-legend-next"/>Дата повтора</span></div>
  <p className="help-mini-note">Больший процент сдвигает повтор ближе. До этой даты обычная очередь может быть пустой — для раннего занятия есть практика.</p>
  <details className="help-state-details"><summary>Что хранится в этом примере?</summary><p>История: {familiar?'«Нормально» в день 0, 3 и 12':'«Нормально» в день 0'}. Затем выбранная оценка спустя {elapsed===.125?'3 часа':elapsed+' дн'}.</p><p>{algorithm==='fsrs7'?<>Медленная устойчивость: {decimal(after.stability)}. Быстрая: {decimal(after.stabilityFast)}. Вместе с трудностью они задают общую кривую; ни одно из этих чисел само по себе не равно следующему интервалу.</>:<>Устойчивость S: {decimal(after.stability)} дня. В этой модели это время до 90% вероятности; фактический интервал зависит от выбранного процента.</>}</p><p>{algorithm==='fsrs7'?'FSRS-7 учитывает дробные дни.':'Наша FSRS-6 округляет прошедшее время до целых дней, поэтому кривая ступенчатая.'} Минимум после выбранной оценки: {[1,6,10,30][rating-1]} мин. Если математический интервал меньше, используется этот минимум.</p></details>
 </section>;
}
