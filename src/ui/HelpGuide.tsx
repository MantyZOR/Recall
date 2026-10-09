import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CloudOff, Laptop, Smartphone, RefreshCw, BookOpen, SlidersHorizontal } from 'lucide-react';
import { DAY, intervalLabel, schedule } from '../domain/fsrs';
import type { Rating } from '../domain/types';
import { Button } from './common';
import { EXAMPLE_AT, exampleMemory, HELP_RATINGS } from './help-memory';

const STEPS = [
 {title:'Сегодня', subtitle:'Что учить сейчас', topic:'ratings'},
 {title:'Карточка', subtitle:'От чтения до оценки', topic:'ratings'},
 {title:'Колода и цель', subtitle:'Как выбрать занятие', topic:'goals'},
 {title:'Настройки', subtitle:'Что на что влияет', topic:'algorithms'},
 {title:'Устройства', subtitle:'Где всё сохраняется', topic:'offline'},
];
function Pin({n}:{n:number}) {return <span className="help-pin" aria-hidden="true">{n}</span>;}
function Callout({n,title,children}:{n:number;title:string;children:ReactNode}) {
 return <li><Pin n={n}/><div><strong>{title}</strong><p>{children}</p></div></li>;
}
function Example({title,children}:{title:string;children:ReactNode}) {
 return <section className="help-example" aria-label={title}><div className="help-example-label"><span className="help-live-dot"/>Учебный пример</div>{children}</section>;
}
function TodayExample({next}:{next:()=>void}) {
 return <div className="help-example-layout"><Example title="Пример экрана Сегодня">
  <div className="help-mini-heading"><BookOpen size={20}/><strong>Сегодня</strong></div>
  <div className="help-today-total"><Pin n={1}/><strong>12</strong><span>карточек сейчас доступно</span></div>
  <div className="help-counts"><div><strong>8</strong><span>повторить</span></div><div><strong>4</strong><span>новые</span></div></div>
  <Button onClick={next}>Начать повторение<ArrowRight size={16}/></Button>
  <p className="help-mini-note"><Pin n={2}/>Лимит новых: 20 в день</p>
 </Example><ol className="help-callouts">
  <Callout n={1} title="Число — очередь на сейчас">Сначала идут нужные повторы, затем новые карточки в пределах лимита. «Первая проверка» — материал, который уже прочитал, но ещё не оценил.</Callout>
  <Callout n={2} title="Лимит касается новых">20 в день ограничивает знакомство с новым материалом. Уже изученным карточкам назначает даты алгоритм.</Callout>
 </ol></div>;
}
function CardExample() {
 const [stage,setStage] = useState<'read'|'question'|'answer'|'rated'>('read');
 const [rating,setRating] = useState<Rating>(3);
 const choices = useMemo(()=>HELP_RATINGS.map(item=>schedule(null,item.rating,EXAMPLE_AT,0,.9,'fsrs7')),[]);
 const selected = HELP_RATINGS.find(item=>item.rating===rating)!;
 return <div className="help-example-layout"><Example title="Учебная карточка">
  <div className="help-mini-heading"><span className="help-deck-dot"/><strong>Английский · новая карточка</strong></div>
  <span className="help-mini-eyebrow">{stage==='read'?'Сначала изучи':stage==='rated'?'Оценка выбрана':'Попробуй вспомнить'}</span>
  <div className="help-demo-question">Что значит <strong>resilient</strong>?</div>
  {stage!=='question'&&<div className="help-demo-answer">Стойкий, способный восстановиться.</div>}
  {stage==='read'&&<div className="help-read-actions"><button className="button primary" onClick={()=>setStage('question')}>Прочитал<span>Проверить позже</span></button><button className="button secondary" onClick={()=>setStage('question')}>Уже знаю<span>Проверить сейчас</span></button></div>}
  {stage==='question'&&<Button onClick={()=>setStage('answer')}>Показать ответ</Button>}
  {stage==='answer'&&<div className="help-rating-grid" role="group" aria-label="Оценки в учебном примере">{HELP_RATINGS.map((item,i)=><button key={item.rating} className={'help-rating help-rating-'+item.rating} aria-label={item.name} onClick={()=>{setRating(item.rating);setStage('rated');}}><strong>{item.compact}</strong><span>{intervalLabel(choices[i].due-EXAMPLE_AT)}</span></button>)}</div>}
  {stage==='rated'&&<div className="help-demo-result" role="status"><CheckCircle2 size={19}/><div><strong>{selected.name} → через {intervalLabel(choices[rating-1].due-EXAMPLE_AT)}</strong><p>{selected.meaning}</p></div></div>}
  {stage!=='read'&&<button className="text-button help-reset" onClick={()=>setStage('read')}><RefreshCw size={14}/>Сначала</button>}
 </Example><ol className="help-callouts">
  <Callout n={1} title="Чтение — ещё не оценка">«Прочитал» знакомит с материалом. В настоящем занятии вопрос вернётся после нескольких других карточек — попробуешь без открытого ответа.</Callout>
  <Callout n={2} title="Оценка меняет следующий повтор">«Показать ответ» только раскрывает ответ. Затем выбери, как вспомнил. Срок под оценкой — следующий интервал по алгоритму.</Callout>
  <Callout n={3} title="Не вспомнил ≠ трудно">Если ответ не знал или подсмотрел, выбирай «Не вспомнил». «Трудно» означает, что всё же ответил правильно сам. Случайную оценку можно отменить в занятии.</Callout>
 </ol></div>;
}
function GoalExample() {
 const [mode,setMode] = useState<'goal'|'practice'|'exam'>('goal');
 const descriptions = {
  goal:'В этот примерный день доступны 30 новых. Завтра темп пересчитается по оставшимся карточкам и сроку. Нужные повторы добавляются отдельно.',
  practice:'Можно пройти все 59 карточек, включая те, которым ещё рано повторяться. Реальные оценки пересчитают память и следующие даты.',
  exam:'Проверка без предварительного чтения и подсказок. Её оценки тоже сохраняются и меняют расписание; это не безобидный тест без последствий.',
 };
 return <div className="help-example-layout"><Example title="Пример цели и режимов">
  <div className="help-mini-heading"><strong>Подготовка к зачёту</strong><Pin n={1}/></div>
  <div className="help-counts"><div><strong>59</strong><span>новых осталось</span></div><div><strong>2</strong><span>дня, включая сегодня</span></div></div>
  <div className="help-goal-pace"><strong>30 новых в день</strong><span>59 ÷ 2, округляем вверх</span></div>
  <div className="help-mode-buttons" role="group" aria-label="Пример режима занятия">
   <button className={'button '+(mode==='goal'?'primary':'secondary')} aria-pressed={mode==='goal'} onClick={()=>setMode('goal')}>Учиться по цели</button>
   <button className={'button '+(mode==='practice'?'primary':'secondary')} aria-pressed={mode==='practice'} onClick={()=>setMode('practice')}>Практика всех карточек</button>
   <button className={'button '+(mode==='exam'?'primary':'secondary')} aria-pressed={mode==='exam'} onClick={()=>setMode('exam')}>Пробная проверка</button>
  </div>
  <p className="help-outcome" role="status">{descriptions[mode]}</p>
 </Example><ol className="help-callouts">
  <Callout n={1} title="Колода хранит тему, цель — срок">У цели свой темп: автоматически по сроку или вручную. «Учиться по цели» использует его вместо обычного лимита новых.</Callout>
  <Callout n={2} title="История у карточки одна">Ответ в цели засчитывается и в колоде. Поэтому после занятия колода может показывать «Следующий повтор…».</Callout>
  <Callout n={3} title="Можно заниматься больше">Практика всей колоды открывает карточки вне расписания. Если обычная кнопка серая, проверь подпись: очередь может закончиться или лимит новых уже потрачен.</Callout>
 </ol></div>;
}
function SettingsExample() {
 const [retention,setRetention]=useState(90),[newCount,setNewCount]=useState(20),[minutes,setMinutes]=useState(20);
 const memory=useMemo(()=>exampleMemory('fsrs7'),[]);
 const at=memory.lastAt+7*DAY;
 const next=schedule(memory,3,at,7,retention/100,'fsrs7');
 return <div className="help-example-layout"><Example title="Пример влияния настроек">
  <div className="help-mini-heading"><SlidersHorizontal size={19}/><strong>Попробуй изменить</strong></div>
  <label>Новых в день<select aria-label="Новых в день" value={newCount} onChange={e=>setNewCount(+e.target.value)}>{[10,20,40].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
  <label>Бюджет сессии, мин<select aria-label="Бюджет сессии, мин" value={minutes} onChange={e=>setMinutes(+e.target.value)}>{[10,20,40].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
  <label>Желаемая память <strong>{retention}%</strong><input aria-label="Желаемая память в примере настроек" type="range" min={70} max={97} value={retention} onChange={e=>setRetention(+e.target.value)}/></label>
  <div className="help-outcome" role="status"><p>До <strong>{newCount}</strong> новых за день. Через <strong>{minutes} мин</strong> занятие предложит паузу.</p><p>После одинакового ответа «Нормально» следующий повтор этой примерной карточки: <strong data-testid="guide-settings-interval" data-days={(next.due-at)/DAY}>{intervalLabel(next.due-at)}</strong>.</p></div>
 </Example><ol className="help-callouts">
  <Callout n={1} title="Новые → объём знакомства">В обычном занятии действуют общий лимит и лимит колоды. Меньший может ограничить очередь.</Callout>
  <Callout n={2} title="Минуты → длина занятия">Это время сессии, а не число карточек и не интервал памяти. После сигнала можно продолжить.</Callout>
  <Callout n={3} title="Память → частота повторов">Для FSRS больший процент даёт более ранний повтор той же карточки. 90% — прогноз вероятности вспомнить к повтору, а не гарантия знания 90% колоды. SM-2 и Лейтнер этот процент не используют.</Callout>
 </ol></div>;
}
function OfflineExample() {
 const [online,setOnline]=useState(true);
 return <div className="help-example-layout"><Example title="Пример работы без компьютера">
  <div className="help-device-flow"><div><Smartphone size={30}/><strong>Телефон</strong><span><Check size={14}/>Учёба работает</span></div><span className="help-connection-line">{online?<RefreshCw size={19}/>:<CloudOff size={19}/>}</span><div><Laptop size={30}/><strong>Компьютер</strong><span>{online?'Служба включена':'Служба выключена'}</span></div></div>
  <button className="button secondary" aria-pressed={!online} onClick={()=>setOnline(v=>!v)}>{online?'Выключить ПК в примере':'Включить ПК в примере'}</button>
  <p className="help-outcome" role="status">{online?'Если устройства подключены, обмен передаёт карточки и историю. Расчёт следующей даты остаётся на устройстве, где учишься.':'На телефоне остаются карточки, изображения и расчёт интервалов. Изменения ждут обмена с ПК; включённый Wi-Fi не мешает запуску.'}</p>
 </Example><ol className="help-callouts">
  <Callout n={1} title="Учёба работает локально">После первой установки телефон учит и сохраняет ответы без ПК и интернета. Справка и эти примеры тоже доступны офлайн.</Callout>
  <Callout n={2} title="ПК нужен для обмена и обновления">Для синхронизации включи службу Recall и подключи устройства к одной сети. Подбор персональных параметров запускается на ПК; затем их можно передать телефону.</Callout>
  <Callout n={3} title="Копия защищает от потери">Синхронизация объединяет изменения, включая удаления. Для восстановления прошлого нужен полный архив из настроек или резервная копия на ПК.</Callout>
 </ol></div>;
}
export function HelpGuide({openTopic}:{openTopic:(id:string)=>void}) {
 const [step,setStep]=useState(0);
 return <section className="help-guide" aria-label="Знакомство с Recall">
  <p className="help-guide-intro">Добавь колоду и карточки, затем открой «Сегодня». Эти пять примеров можно нажимать — они помогают освоить кнопки и не меняют твою историю.</p><button className="text-button help-start-link" onClick={()=>openTopic('cards')}>Как добавить материал<ArrowRight size={15}/></button>
  <nav className="help-step-nav" aria-label="Шаги знакомства">{STEPS.map((item,i)=><button key={item.title} aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}><span>{i+1}</span><strong>{item.title}</strong></button>)}</nav>
  <div className="help-step-heading"><span>{step+1} / {STEPS.length}</span><h3>{STEPS[step].subtitle}</h3></div>
  {step===0&&<TodayExample next={()=>setStep(1)}/>}
  {step===1&&<CardExample/>}
  {step===2&&<GoalExample/>}
  {step===3&&<SettingsExample/>}
  {step===4&&<OfflineExample/>}
  <div className="help-guide-footer"><button className="text-button" onClick={()=>openTopic(STEPS[step].topic)}>Подробнее в справке<ArrowRight size={15}/></button><div><button className="icon-button" disabled={step===0} aria-label="Предыдущий пример" onClick={()=>setStep(v=>v-1)}><ArrowLeft size={19}/></button><Button kind="secondary" onClick={()=>setStep(v=>(v+1)%STEPS.length)}>{step===4?'К началу':'Дальше'}<ArrowRight size={16}/></Button></div></div>
 </section>;
}
