import { useCallback, useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { Home, Layers3, BookOpen, Target, BarChart3, Smartphone, Settings2, Menu, X, CheckCircle2, RefreshCw, Laptop, MoreHorizontal, CloudOff, AlertCircle, CircleHelp } from 'lucide-react';
import type { Snapshot, Connection, LocalIdentity, CardView, Deck, Goal, Context } from './domain/types';
import { DEFAULT_SETTINGS } from './domain/types';
import { activeCards, materialize, makeQueue } from './domain/reducer';
import { goalStudyPlan, goalCardOrder, studyPlan, studyEmptyDescription } from './domain/study-plan';
import { goalPace } from './domain/goal-pace';
import { addExamples } from './domain/actions';
import { db, getMeta, identity, setMeta } from './storage/db';
import { bootstrap, api } from './storage/sync';
import { useSync } from './storage/use-sync';
import type {SyncReport} from './storage/connections';
import { devicePreferences, type DevicePreferences, type SyncRetry } from './storage/sync-policy';
import { Dashboard } from './ui/Dashboard';
import { Decks, Library } from './ui/Library';
import { Session } from './ui/Session';
import { Goals } from './ui/Goals';
import { Wiki } from './ui/Wiki';
import { Stats } from './ui/Stats';
import { Devices, type ServerStatus } from './ui/Devices';
import { Settings } from './ui/Settings';
import { DeckEditor, CardEditor, ImportDialog } from './ui/Editors';
import { Button } from './ui/common';
import { PracticeSetup } from './ui/PracticeSetup';
type Page='today'|'decks'|'cards'|'goals'|'stats'|'devices'|'settings'|'wiki';
const NAV=[{id:'today',label:'Сегодня',icon:Home},{id:'decks',label:'Колоды',icon:Layers3},{id:'cards',label:'Карточки',icon:BookOpen},{id:'goals',label:'Цели',icon:Target},{id:'stats',label:'Статистика',icon:BarChart3},{id:'devices',label:'Устройства',icon:Smartphone},{id:'wiki',label:'Справка',icon:CircleHelp}] as const;
const EMPTY:Snapshot={decks:[],cards:[],goals:[],settings:DEFAULT_SETTINGS,parameters:{},events:[],pending:[]};
export default function App(){
 const [state,setState]=useState<{s:Snapshot;connection?:Connection;who:LocalIdentity;preferences:DevicePreferences;retry?:SyncRetry;report?:SyncReport}|null>(null),[loadError,setLoadError]=useState(''),[page,setPage]=useState<Page>(()=>{const next=new URLSearchParams(location.search).get('page');return next&&['today','decks','cards','goals','stats','devices','settings','wiki'].includes(next)?next as Page:'today';}),[mobileMenu,setMobileMenu]=useState(false),[deckFilter,setDeckFilter]=useState('all');
 const [deckEditor,setDeckEditor]=useState<Deck|true|null>(null),[cardEditor,setCardEditor]=useState<CardView|true|null>(null),[importing,setImporting]=useState(false),[session,setSession]=useState<{ids:string[];context:Context;minutes:number;id:string}|null>(null);
 const [practice,setPractice]=useState<{deckIds:string[];name:string;minutes:number;goal?:Goal}|null>(null);
 const [toast,setToast]=useState<{message:string;error:boolean}|null>(null),[status,setStatus]=useState<ServerStatus|null>(null),[update,setUpdate]=useState<ServiceWorker|null>(null),[now,setNow]=useState(Date.now()),[offlineReady,setOfflineReady]=useState(!import.meta.env.PROD||Boolean(navigator.serviceWorker?.controller));
 const reloadForUpdate=useRef(false);
 const notify=useCallback((message:string,error=false)=>setToast({message,error}),[]);
 const s=state?.s||EMPTY;
 const refresh=useCallback(async(signal?:AbortSignal)=>{try{setStatus(await api<ServerStatus>('status',undefined,undefined,signal));}catch{setStatus(null);}},[]);
 const preferences=state?.preferences||devicePreferences();
 const {sync,syncing,error:syncError,paused:syncPaused,retry}=useSync({ready:Boolean(state),connected:Boolean(state?.connection),preferences,initialRetry:state?.retry,eventCount:s.events.length,refresh});
 useEffect(()=>{const subscription=liveQuery(async()=>({s:materialize(await db.events.toArray()),connection:await getMeta<Connection>('connection'),who:await identity(),preferences:devicePreferences(await getMeta<DevicePreferences>('devicePreferences')),retry:await getMeta<SyncRetry>('syncRetryState'),report:await getMeta<SyncReport>('syncReport')})).subscribe({next:setState,error:e=>setLoadError(String(e))});bootstrap().catch(e=>notify((e as Error).message,true));return()=>subscription.unsubscribe();},[notify]);
 useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),toast.error?9000:4000);return()=>clearTimeout(timer);}},[toast]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{document.documentElement.setAttribute('data-text-size',preferences.textSize);},[preferences.textSize]);
 useEffect(()=>{document.documentElement.setAttribute('data-accent',preferences.accent);},[preferences.accent]);
 useEffect(()=>{if(syncError)setStatus(null);},[syncError]);
 useEffect(()=>{const mq=window.matchMedia('(prefers-color-scheme: dark)'),apply=()=>document.documentElement.setAttribute('data-theme',s.settings.theme==='system'?(mq.matches?'dark':'light'):s.settings.theme);apply();mq.addEventListener('change',apply);return()=>mq.removeEventListener('change',apply);},[s.settings.theme]);
 useEffect(()=>{if(!import.meta.env.PROD||!('serviceWorker'in navigator))return;let active=true;navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js').then(reg=>{if(!active)return;navigator.serviceWorker.ready.then(()=>{if(active)setOfflineReady(true);});if(reg.waiting)setUpdate(reg.waiting);reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)setUpdate(worker);});});}).catch(e=>notify('Офлайн-кэш ещё не готов: '+e.message,true));const reload=()=>{if(reloadForUpdate.current)location.reload();};navigator.serviceWorker.addEventListener('controllerchange',reload);return()=>{active=false;navigator.serviceWorker.removeEventListener('controllerchange',reload);};},[notify]);
 const navigate=(next:Page)=>{setPage(next);setMobileMenu(false);setSession(null);window.scrollTo(0,0);};
 const openDeck=(id:string)=>{setDeckFilter(id);navigate('cards');};
 const start=(deckIds:string[]=[],context:Context='review',minutes=s.settings.minutes,goal?:Goal,options:{includeSiblings?:boolean}={})=>{
  const at=Date.now(),pace=goal?goalPace(s,goal,at):undefined;
  if(pace&&!pace.days&&context==='review'){notify('Срок цели прошёл. Выбери новую дату для подготовки.');return;}
  const compare=goal&&pace?goalCardOrder(s,goal,pace.deadline):undefined;
  const plan=context==='review'?(goal?goalStudyPlan(s,goal,at):studyPlan(s,deckIds,at)):undefined;
  let queue=plan?plan.queue:makeQueue(s,context,deckIds,at,options);
  if(compare)queue=queue.sort(compare);
  if(!queue.length){
   notify(plan?studyEmptyDescription(plan,Boolean(goal)):'В выбранном материале нет доступных карточек.');return;
  }
  setSession({ids:queue.map(c=>c.id),context,minutes,id:crypto.randomUUID()});window.scrollTo(0,0);
 };
 const pending=state?.connection?s.events.filter(e=>e.seq>(state.connection?.ack?.[e.deviceId]||0)).length:s.events.length;
 const peer=status?.devices.find(d=>d.role==='phone'),peerHasAll=state&&peer?s.events.filter(e=>e.deviceId===state.who.id).every(e=>e.seq<=(peer.cursor[state.who.id]||0)):false;
 const syncHint=!state?.connection?'Добавь компьютер в «Устройствах»':preferences.syncAttempts===0?'Обмен только по кнопке':syncPaused?'Автообмен на паузе · нажми кнопку':syncError?retry.failures+' из '+preferences.syncAttempts+' неудачных попыток':'На твоих устройствах';
 const syncText=syncing?'Передаём изменения':state?.report?.synced.length&&state.report.unavailable.length?'Синхронизировано частично':!state?.connection?'Сохранено здесь':pending?'Сохранено здесь · '+pending+' изменений':state.connection.role==='phone'?'Копия на компьютере':peerHasAll?'Данные получены устройством':'Сохранено на компьютере';
 if(loadError)return <div className="fatal-error"><AlertCircle size={34}/><h1>Не удалось открыть локальную базу</h1><p>{loadError}</p><p>Открой приложение в обычном режиме браузера по постоянному адресу. Сохрани существующие резервные копии перед восстановлением.</p></div>;
 if(!state)return <div className="app-loading"><img src={import.meta.env.BASE_URL+'icon.svg'} alt="" width={54}/><p>Открываем твоё пространство…</p></div>;
 return <div className="app-shell"><header className="mobile-header"><button className="brand" onClick={()=>navigate('today')}><img src={import.meta.env.BASE_URL+'icon.svg'} alt=""/>Recall</button><button className="icon-button" aria-label="Открыть меню" onClick={()=>setMobileMenu(!mobileMenu)}>{mobileMenu?<X size={22}/>:<Menu size={22}/>}</button></header>
 <aside className={'sidebar '+(mobileMenu?'mobile-open':'')}><button className="brand" onClick={()=>navigate('today')}><img src={import.meta.env.BASE_URL+'icon.svg'} alt=""/>Recall<span>ТВОЁ ПРОСТРАНСТВО ЗНАНИЙ</span></button><nav aria-label="Главное меню">{NAV.map(item=><button key={item.id} className={page===item.id&&!session?'active':''} onClick={()=>navigate(item.id)}><item.icon size={19}/>{item.label}{item.id==='today'&&makeQueue(s,'review',[],now).length>0&&<span className="nav-count">{makeQueue(s,'review',[],now).length}</span>}</button>)}</nav><div className="sidebar-tip"><span className="tip-spark">✦</span><p>Понемногу.<br/><strong>Но регулярно.</strong></p><small>У каждого знания есть время вернуться.</small></div><div className="sidebar-bottom"><button className={'settings-nav '+(page==='settings'?'active':'')} onClick={()=>navigate('settings')}><Settings2 size={18}/>Настройки</button><button className="sidebar-sync" onClick={()=>navigate('devices')}><span className={'status-dot '+(syncing?'syncing':syncError||syncPaused?'offline':'')}/><span>{syncText}<small>{syncHint}</small></span></button><button className="sidebar-sync-action" disabled={syncing} onClick={()=>state.connection?sync():navigate('devices')}><RefreshCw size={17} className={syncing?'spin':''}/>{syncing?'Передаём…':state.connection?'Синхронизировать сейчас':'Настроить синхронизацию'}</button><div className="local-profile"><span><Laptop size={17}/></span><div>{state.who.name}<small>Личное приложение</small></div></div></div></aside>
 {mobileMenu&&<button className="menu-shade" aria-label="Закрыть меню" onClick={()=>setMobileMenu(false)}/>}
 <main className={session?'main-content session-content':'main-content'}><div className="top-status"><span><CheckCircle2 size={13}/>Сохранено на устройстве</span><button onClick={()=>navigate('devices')}><span className={'status-dot '+(syncError?'offline':'')}/>{syncText}</button></div>
 {!offlineReady&&<div className="notice offline-preparing">Готовим работу без сети. При первом запуске оставь приложение открытым несколько секунд.</div>}
 {update&&<div className="update-banner"><span>Доступна новая версия приложения</span><Button kind="secondary" disabled={Boolean(session)} onClick={()=>{if(update.state==='activated')location.reload();else{reloadForUpdate.current=true;update.postMessage('SKIP_WAITING');}}}>{session?'После сессии':'Обновить'}</Button></div>}
 {session?<Session key={session.id} s={s} ids={session.ids} context={session.context} minutes={session.minutes} onExit={()=>setSession(null)} edit={setCardEditor} notify={notify}/>:page==='today'?<Dashboard s={s} start={start} newCard={()=>setCardEditor(true)} newDeck={()=>setDeckEditor(true)} openDeck={openDeck} goals={()=>navigate('goals')} examples={()=>addExamples(s).then(()=>notify('Добавлены примеры слов, формул и кода')).catch(e=>notify(e.message,true))} importCards={()=>setImporting(true)}/>:page==='decks'?<Decks s={s} newDeck={()=>setDeckEditor(true)} edit={setDeckEditor} open={openDeck} start={start} practice={d=>setPractice({deckIds:[d.id],name:d.name,minutes:s.settings.minutes})} importCards={()=>setImporting(true)} notify={notify}/>:page==='cards'?<Library s={s} deckFilter={deckFilter} setDeckFilter={setDeckFilter} newCard={()=>setCardEditor(true)} edit={setCardEditor} importCards={()=>setImporting(true)} notify={notify}/>:page==='goals'?<Goals s={s} start={(g,c)=>start(g.deckIds,c,g.minutes,g)} practice={g=>setPractice({deckIds:g.deckIds,name:g.name,minutes:g.minutes,goal:g})} notify={notify}/>:page==='stats'?<Stats s={s} notify={notify}/>:page==='devices'?<Devices connection={state.connection} status={status} who={state.who} sync={sync} syncing={syncing} error={syncError} syncHint={syncPaused?syncHint:''} refresh={refresh} notify={notify}/>:page==='wiki'?<Wiki importCards={()=>setImporting(true)}/>:<Settings key={s.events.filter(e=>e.kind==='settings.put').at(-1)?.id||'settings'} s={s} who={state.who} status={status} preferences={preferences} refresh={refresh} notify={notify} importCards={()=>setImporting(true)}/>}
 {!session&&page==='cards'&&activeCards(s).length>0&&<div className="practice-link"><button className="text-button" onClick={()=>setPractice({deckIds:deckFilter==='all'?[]:[deckFilter],name:deckFilter==='all'?'Все колоды':s.decks.find(d=>d.id===deckFilter)?.name||'Выбранная колода',minutes:s.settings.minutes})}>Дополнительная практика</button><span>Вне очереди · отдельный контекст в истории</span></div>}
 </main><nav className="mobile-bottom" aria-label="Быстрая навигация">{NAV.slice(0,4).map(item=><button key={item.id} className={page===item.id&&!session?'active':''} onClick={()=>navigate(item.id)}><item.icon size={21}/><span>{item.label}</span></button>)}<button onClick={()=>setMobileMenu(!mobileMenu)}><MoreHorizontal size={22}/><span>Ещё</span></button></nav>
 {practice&&<PracticeSetup s={s} deckIds={practice.deckIds} name={practice.name} minutes={practice.minutes} onClose={()=>setPractice(null)} onStart={(minutes,includeSiblings)=>{start(practice.deckIds,'practice',minutes,practice.goal,{includeSiblings});setPractice(null);}}/>}
  {deckEditor&&<DeckEditor key={deckEditor===true?'new':deckEditor.id} s={s} base={deckEditor===true?undefined:deckEditor} onClose={()=>setDeckEditor(null)} notify={notify}/>}
 {cardEditor&&<CardEditor key={cardEditor===true?'new':cardEditor.id} s={s} base={cardEditor===true?undefined:cardEditor} deckId={deckFilter==='all'?undefined:deckFilter} onClose={()=>setCardEditor(null)} notify={notify}/>}
 {importing&&<ImportDialog s={s} onClose={()=>setImporting(false)} notify={notify}/>}
 {toast&&<div className={'toast '+(toast.error?'error':'')} role={toast.error?'alert':'status'}>{toast.error?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>}<span>{toast.message}</span><button aria-label="Закрыть уведомление" onClick={()=>setToast(null)}><X size={15}/></button></div>}
 </div>;
}





