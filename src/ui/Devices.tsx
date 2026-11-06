import {useEffect,useState} from 'react';
import {liveQuery} from 'dexie';
import {RefreshCw,Plus,Link2,Unplug} from 'lucide-react';
import type {Connection} from '../domain/types';
import {desktopApi,isLocalDesktop,pairServer,verifyServerOrigin} from '../storage/sync';
import {getMeta} from '../storage/db';
import {advertisedLocalOrigin,connections,connectionKey,connectionOrigin,forgetConnection,saveConnection,localServerOrigin,type SyncReport} from '../storage/connections';
import {readLanCode} from '../domain/lan-pairing.mjs';
import {PhoneSetup} from './PhoneSetup';
import {Button,PageHeader,Dialog} from './common';
export interface ServerStatus {serverId:string;origin:string|null;localOrigin?:string|null;joinOrigin?:string|null;https:boolean;bootstrapOrigin?:string;fingerprint?:string;expires?:string;devices:{id:string;name:string;role:string;lastSeen:number;lastSync:number;cursor:Record<string,number>}[];backupCount:number;lastBackup:string|null;events:number;}
type Props={connection?:Connection;status:ServerStatus|null;sync:()=>Promise<void>;syncing:boolean;error:string;syncHint:string;refresh:()=>Promise<void>;notify:(m:string,e?:boolean)=>void;};
const date=(at?:number)=>at?new Intl.DateTimeFormat('ru',{dateStyle:'short',timeStyle:'short'}).format(at):'Ещё не синхронизировались';
export function Devices({connection,status,sync,syncing,error,syncHint,refresh,notify}:Props){
 const [all,setAll]=useState<Connection[]>([]),[report,setReport]=useState<SyncReport>(),[editing,setEditing]=useState<Connection|'new'|null>(null),[forget,setForget]=useState<Connection|null>(null),[revoke,setRevoke]=useState<string|null>(null);
 const [pair,setPair]=useState<{code:string;expiresAt:number}|null>(null),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{const sub=liveQuery(async()=>({all:await connections(),report:await getMeta<SyncReport>('syncReport')})).subscribe(value=>{setAll(value.all);setReport(value.report);});const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{sub.unsubscribe();clearInterval(timer);};},[]);
 useEffect(()=>{void getMeta<string>('pairSecret').then(secret=>{if(secret)setEditing('new');});},[]);
 useEffect(()=>{if(connection?.role==='desktop')void refresh();},[connection?.role,refresh]);
 const create=async()=>{setBusy(true);try{setPair(await desktopApi('pair/create',{lan:true}));await refresh();}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}};
 const revokeDevice=async(id?:string)=>{setBusy(true);try{await desktopApi('pair/revoke',id?{deviceId:id}:{});await refresh();setRevoke(null);notify('Доступ отключён. Карточки сохранены.');}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}};
 return <><PageHeader eyebrow="ТВОИ ДАННЫЕ НА ТВОИХ УСТРОЙСТВАХ" title="Устройства и синхронизация" description="Подключи один раз. Дальше — одна кнопка, без новых кодов.">{connection&&<Button disabled={syncing} onClick={()=>sync()}><RefreshCw size={17} className={syncing?'spin':''}/>{syncing?'Синхронизируем…':'Синхронизировать'}</Button>}</PageHeader>
 <section className="panel persistent-sync"><h2>ПК, ноутбук и телефон</h2><p>Открывай Recall рядом с любым подключённым компьютером в той же сети. Телефон передаст недостающие изменения второму компьютеру, когда вы снова окажетесь в одной сети.</p><p className="hint">На компьютере должна работать служба Recall. Интернет не нужен. На телефоне открывай прежнюю иконку.</p>
 <Button kind="secondary" onClick={()=>setEditing('new')}><Plus size={17}/>Добавить компьютер</Button>
 {syncHint&&<p className="hint">{syncHint}</p>}{error&&<p className="warning-text" role="alert">{error}</p>}
 {report&&<div className="notice sync-result" role="status"><strong>{report.synced.length?'Синхронизация завершена'+(report.unavailable.length?' с доступными компьютерами':''):'Синхронизация не завершена'}</strong>{report.synced.length>0&&<p>Обновлены: {report.synced.join(', ')}.</p>}{report.unavailable.length>0&&<p>Недоступны: {report.unavailable.map(c=>c.name).join(', ')}. Данные сохранены здесь; повтори синхронизацию, когда эти компьютеры будут доступны.</p>}<small>{date(report.at)}</small></div>}
 </section>
 {isLocalDesktop()&&<section className="panel persistent-sync"><h2>Код для телефона или ноутбука</h2><p>На другом устройстве в той же сети открой Recall → <strong>Устройства → Добавить компьютер</strong> и введи код с этого ПК.</p>
 {status&&!status.https&&<p className="hint">Сначала настрой подключение телефона в меню запуска Recall.</p>}
 {pair&&pair.expiresAt>now?<><div className="pair-code">{pair.code}</div><p className="hint">Одноразовый код · осталось {Math.ceil((pair.expiresAt-now)/60000)} мин.</p><div className="device-actions"><Button kind="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(pair.code);notify('Код скопирован');}catch{notify('Выдели код и скопируй его вручную.',true);}}}>Копировать код</Button><Button kind="ghost" disabled={busy} onClick={create}>Обновить код подключения</Button></div></>:<Button disabled={busy||Boolean(status&&!status.https)} onClick={create}><Link2 size={17}/>Создать код подключения</Button>}
 {status?.devices.filter(d=>d.role!=='desktop').map(d=><div className="saved-connection" key={d.id}><div><strong>{d.name}</strong><small>Последняя синхронизация с этим ПК: {date(d.lastSync)}</small></div><Button kind="ghost" onClick={()=>setRevoke(d.id)}><Unplug size={16}/>Отключить доступ</Button></div>)}
 <details className="certificate-details"><summary>Первое подключение телефона</summary><PhoneSetup status={status}/></details>
 </section>}
 <section className="panel persistent-sync"><h2>Сохранённые подключения</h2>{!all.length&&<p>Введи код с компьютера. Адрес Recall подставит сам.</p>}{all.map(c=><div className="saved-connection" key={connectionKey(c)}><div><strong>{c.name||c.localOrigin||connectionOrigin(c)}</strong><small>Последняя синхронизация: {date(c.lastSync)}</small>{c.error&&<small className="warning-text">{c.error}</small>}</div><div className="device-actions"><Button kind="ghost" onClick={()=>setEditing(c)}>Настроить</Button>{c.role!=='desktop'&&<Button kind="ghost" onClick={()=>setForget(c)}>Забыть подключение</Button>}</div></div>)}</section>
 {editing&&<ConnectionEditor value={editing} close={()=>setEditing(null)} saved={async()=>{setEditing(null);await sync();await refresh();notify('Подключение сохранено. Теперь используй «Синхронизировать сейчас».');}}/>}
 {forget&&<Dialog title="Забыть подключение?" onClose={()=>setForget(null)}><p>Карточки и история сохранятся на всех устройствах. Для повторного подключения потребуется одноразовый код.</p><Button kind="danger" onClick={async()=>{await forgetConnection(forget);setForget(null);}}>Забыть подключение</Button></Dialog>}
 {revoke&&<Dialog title="Отключить доступ устройства?" onClose={()=>setRevoke(null)}><p>Отключится только выбранное устройство. Его карточки останутся у него; для повторного подключения потребуется новый код.</p><Button kind="danger" disabled={busy} onClick={()=>void revokeDevice(revoke)}>Отключить доступ</Button></Dialog>}
 </>;
}
function ConnectionEditor({value,close,saved}:{value:Connection|'new';close:()=>void;saved:()=>Promise<void>}){
 const editing=value!=='new',own=editing&&value.role==='desktop';
 const [address,setAddress]=useState(editing?connectionOrigin(value):''),[name,setName]=useState(editing?value.name||'':''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[legacy,setLegacy]=useState(false),[showSetup,setShowSetup]=useState(false);
 const invite=readLanCode(code);
 useEffect(()=>{if(!editing)void getMeta<string>('pairSecret').then(secret=>{if(secret){setAddress(location.origin);setCode(secret);setLegacy(true);}});},[editing]);
 const submit=async()=>{setBusy(true);setError('');try{
  if(editing){
   const origin=localServerOrigin(address);
   if(origin!==connectionOrigin(value)){
    const health=await verifyServerOrigin(origin,value.serverId);
    await saveConnection({...value,origin,localOrigin:advertisedLocalOrigin(health.localOrigin)||value.localOrigin,name:name.trim()||origin,error:'',failures:0,nextAttemptAt:0});
   }else await saveConnection({...value,name:name.trim()||origin});
  }else if(invite)await pairServer(invite.origin,invite.code,name);
  else if(legacy)await pairServer(address,code,name);
  else throw Error('Введи весь код с компьютера, например H7J2K-406281.');
  await saved();
 }catch(e){const network=e instanceof Error&&['TypeError','TimeoutError','AbortError'].includes(e.name);setShowSetup(network&&Boolean(invite));setError(network?'Компьютер не отвечает. Проверь общую сеть, запущенный Recall и доверие сертификату.':(e as Error).message);}finally{setBusy(false);}};
 return <Dialog title={editing?'Настроить подключение':'Добавить компьютер'} onClose={close}>
  <form className="connection-form" onSubmit={e=>{e.preventDefault();if(!busy)void submit();}}>
   {!editing&&<><p>На компьютере, который добавляешь, открой Recall через «Открыть на ПК». В разделе «Устройства» нажми «Создать код подключения».</p><label>Код подключения<input value={code} maxLength={48} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="H7J2K-406281" onChange={e=>{setCode(e.target.value);setError('');setShowSetup(false);}}/></label></>}
   {editing?<label>Название<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>:null}
   {editing&&value.localOrigin&&<p className="hint">Постоянное имя: {value.localOrigin}</p>}
   {!own&&<details open={legacy||undefined} onToggle={e=>setLegacy(e.currentTarget.open)}><summary>{editing?'Резервный адрес':'Дополнительные параметры'}</summary>
    {!editing&&<label>Название (необязательно)<input value={name} maxLength={80} placeholder="Домашний ПК или ноутбук" onChange={e=>setName(e.target.value)}/></label>}
    <label>Адрес Recall {editing?'':'(для старой версии)'}<input type="text" value={address} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://192.168.1.20:8443" onChange={e=>setAddress(e.target.value)}/></label>
   </details>}
   {error&&<p className="warning-text" role="alert">{error}</p>}
   {showSetup&&invite&&<p className="hint"><a href={invite.setupOrigin} target="_blank" rel="noreferrer">Настроить сертификат этого ПК в Safari</a>. После настройки вернись сюда и нажми «Подключить компьютер».</p>}
   <Button type="submit" disabled={busy||(!editing&&!invite&&!(legacy&&address&&code))}>{busy?'Подключаем…':editing?'Сохранить подключение':'Подключить компьютер'}</Button>
  </form>
 </Dialog>;
}
