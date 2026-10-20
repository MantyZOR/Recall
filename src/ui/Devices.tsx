import {useEffect,useState} from 'react';
import {liveQuery} from 'dexie';
import {RefreshCw,Plus,Link2,Unplug} from 'lucide-react';
import type {Connection,LocalIdentity} from '../domain/types';
import {api,pairServer} from '../storage/sync';
import {getMeta} from '../storage/db';
import {connections,connectionOrigin,forgetConnection,saveConnection,localServerOrigin,type SyncReport} from '../storage/connections';
import {PeerDevices} from './PeerDevices';
import {PhoneSetup} from './PhoneSetup';
import {Button,PageHeader,Dialog} from './common';
export interface ServerStatus {serverId:string;origin:string|null;localOrigin?:string|null;https:boolean;bootstrapOrigin?:string;fingerprint?:string;expires?:string;devices:{id:string;name:string;role:string;lastSeen:number;lastSync:number;cursor:Record<string,number>}[];backupCount:number;lastBackup:string|null;events:number;}
type Props={connection?:Connection;status:ServerStatus|null;who:LocalIdentity;sync:()=>Promise<void>;syncing:boolean;error:string;syncHint:string;refresh:()=>Promise<void>;notify:(m:string,e?:boolean)=>void;};
const date=(at?:number)=>at?new Intl.DateTimeFormat('ru',{dateStyle:'short',timeStyle:'short'}).format(at):'Ещё не синхронизировались';
export function Devices({connection,status,who,sync,syncing,error,syncHint,refresh,notify}:Props){
 const [all,setAll]=useState<Connection[]>([]),[report,setReport]=useState<SyncReport>(),[editing,setEditing]=useState<Connection|'new'|null>(null),[forget,setForget]=useState<Connection|null>(null),[revoke,setRevoke]=useState<string|null>(null);
 const [pair,setPair]=useState<{url:string;code:string;expiresAt:number}|null>(null),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{const sub=liveQuery(async()=>({all:await connections(),report:await getMeta<SyncReport>('syncReport')})).subscribe(value=>{setAll(value.all);setReport(value.report);});const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{sub.unsubscribe();clearInterval(timer);};},[]);
 useEffect(()=>{void getMeta<string>('pairSecret').then(secret=>{if(secret)setEditing('new');});},[]);
 const create=async()=>{setBusy(true);try{setPair(await api('pair/create',{}));}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}};
 const revokeDevice=async(id?:string)=>{setBusy(true);try{await api('pair/revoke',id?{deviceId:id}:{});await refresh();setRevoke(null);notify('Доступ отключён. Карточки сохранены.');}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}};
 return <><PageHeader eyebrow="ТВОИ ДАННЫЕ НА ТВОИХ УСТРОЙСТВАХ" title="Устройства и синхронизация" description="Подключи один раз. Дальше — одна кнопка, без новых кодов.">{connection&&<Button disabled={syncing} onClick={()=>sync()}><RefreshCw size={17} className={syncing?'spin':''}/>{syncing?'Синхронизируем…':'Синхронизировать'}</Button>}</PageHeader>
 <section className="panel persistent-sync"><h2>ПК, ноутбук и телефон</h2><p>Дома синхронизируй все устройства. Вне дома телефон обменивается с ноутбуком. После возвращения домой нажми «Синхронизировать сейчас», чтобы передать недостающие изменения ПК.</p><p className="hint">На доступном компьютере должна работать служба Recall. На телефоне открывай прежнюю иконку: карточки и подключения остаются в ней. Устройства должны быть в одной локальной сети.</p>
 <Button kind="secondary" onClick={()=>setEditing('new')}><Plus size={17}/>Добавить компьютер</Button>
 {syncHint&&<p className="hint">{syncHint}</p>}{error&&<p className="warning-text" role="alert">{error}</p>}
 {report&&<div className="notice sync-result" role="status"><strong>{report.synced.length?'Синхронизация завершена'+(report.unavailable.length?' с доступными компьютерами':''):'Синхронизация не завершена'}</strong>{report.synced.length>0&&<p>Обновлены: {report.synced.join(', ')}.</p>}{report.unavailable.length>0&&<p>Недоступны: {report.unavailable.map(c=>c.name).join(', ')}. Данные сохранены здесь; повтори синхронизацию, когда эти компьютеры будут доступны.</p>}<small>{date(report.at)}</small></div>}
 </section>
 <section className="panel persistent-sync"><h2>Сохранённые подключения</h2>{!all.length&&<p>Добавь компьютер по его адресу и одноразовому коду. В следующий раз код не потребуется.</p>}{all.map(c=><div className="saved-connection" key={connectionOrigin(c)}><div><strong>{c.name||connectionOrigin(c)}</strong><span>{connectionOrigin(c)}</span><small>Последняя синхронизация: {date(c.lastSync)}</small>{c.error&&<small className="warning-text">{c.error}</small>}</div><div className="peer-actions"><Button kind="ghost" onClick={()=>setEditing(c)}>Название и адрес</Button><Button kind="ghost" onClick={()=>setForget(c)}>Забыть подключение</Button></div></div>)}</section>
 {connection?.role==='desktop'&&<section className="panel persistent-sync"><h2>Подключить телефон или ноутбук к этому ПК</h2><p>На другом устройстве открой «Добавить компьютер». Укажи адрес этого ПК и код ниже. Это нужно только один раз.</p><p className="local-address">{status?.localOrigin||status?.origin||'Сначала настрой HTTPS в меню запуска Recall.'}</p>{status?.localOrigin&&<p className="hint">Постоянное имя для смены Wi-Fi. Резервный адрес: {status.origin}. Доступ для нескольких устройств включается в меню запуска → «Настройка сети».</p>}{pair&&pair.expiresAt>now?<><div className="pair-code">{pair.code}</div><p className="hint">Код действует ещё {Math.ceil((pair.expiresAt-now)/1000)} сек.</p><Button kind="secondary" disabled={busy} onClick={create}>Обновить код подключения</Button></>:<Button disabled={busy||!status?.https} onClick={create}><Link2 size={17}/>Создать код подключения</Button>}
 {status?.devices.filter(d=>d.role!=='desktop').map(d=><div className="saved-connection" key={d.id}><div><strong>{d.name}</strong><small>Последняя синхронизация с этим ПК: {date(d.lastSync)}</small></div><Button kind="ghost" onClick={()=>setRevoke(d.id)}><Unplug size={16}/>Отключить доступ</Button></div>)}
 <details className="certificate-details"><summary>Первая настройка HTTPS на телефоне</summary><PhoneSetup status={status} pair={pair} now={now} busy={busy} create={create} revoke={()=>void revokeDevice()}/></details>
 </section>}
 <details className="legacy-devices"><summary>Дополнительно: разовый прямой обмен</summary><p className="hint">Этот отдельный способ требует нового подключения для каждого обмена. Для обычной синхронизации используй сохранённые компьютеры выше.</p><PeerDevices who={who} notify={notify}/></details>
 {editing&&<ConnectionEditor value={editing} close={()=>setEditing(null)} saved={async()=>{setEditing(null);await sync();await refresh();notify('Подключение сохранено. Теперь используй «Синхронизировать сейчас».');}}/>}
 {forget&&<Dialog title="Забыть подключение?" onClose={()=>setForget(null)}><p>Карточки и история сохранятся на всех устройствах. Для повторного подключения потребуется одноразовый код.</p><Button kind="danger" onClick={async()=>{await forgetConnection(connectionOrigin(forget));setForget(null);}}>Забыть подключение</Button></Dialog>}
 {revoke&&<Dialog title="Отключить доступ устройства?" onClose={()=>setRevoke(null)}><p>Отключится только выбранное устройство. Его карточки останутся у него; для повторного подключения потребуется новый код.</p><Button kind="danger" disabled={busy} onClick={()=>void revokeDevice(revoke)}>Отключить доступ</Button></Dialog>}
 </>;
}
function ConnectionEditor({value,close,saved}:{value:Connection|'new';close:()=>void;saved:()=>Promise<void>}){
 const editing=value!=='new',own=editing&&value.role==='desktop'&&connectionOrigin(value)===location.origin,[address,setAddress]=useState(editing?connectionOrigin(value):import.meta.env.VITE_PUBLIC_APP==='true'?'':location.origin),[name,setName]=useState(editing?value.name||'':''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!editing)void getMeta<string>('pairSecret').then(secret=>{if(secret)setCode(secret);});},[editing]);
 const submit=async()=>{setBusy(true);setError('');try{
  const origin=localServerOrigin(address);
  if(editing){
   if(origin!==connectionOrigin(value)){
    const status=await api<ServerStatus>('status',undefined,undefined,undefined,{...value,origin});if(status.serverId!==value.serverId)throw Error('Это другая установка Recall. Добавь её отдельным подключением.');
    // Persist the new address first; a failed check never loses the old connection.
    await saveConnection({...value,origin,name:name.trim()||origin,error:'',failures:0,nextAttemptAt:0});await forgetConnection(connectionOrigin(value));
   }else await saveConnection({...value,name:name.trim()||origin});
  }else await pairServer(origin,code,name);
  await saved();
 }catch(e){setError(e instanceof TypeError?'Нет соединения. Проверь адрес, службу Recall, доступ в локальной сети и доверие сертификату этого компьютера.':(e as Error).message);}finally{setBusy(false);}};
 return <Dialog title={editing?'Название и адрес компьютера':'Добавить компьютер'} onClose={close}><div className="connection-form"><p>На компьютере запусти Recall. {editing?'Если адрес в новой сети изменился, обнови его здесь. Код снова вводить не нужно.':'В «Устройствах» нажми «Создать код подключения». Введи его здесь один раз.'}</p><label>Название<input value={name} maxLength={80} placeholder="Например, домашний ПК или ноутбук" onChange={e=>setName(e.target.value)}/></label><label>Адрес Recall<input type="url" disabled={own} value={address} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://192.168.1.20:8443" onChange={e=>setAddress(e.target.value)}/></label>{!editing&&<label>Одноразовый код<input value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={e=>setCode(e.target.value.trim())}/></label>}<p className="hint">Для нового компьютера нужно один раз разрешить доступ в сети и установить доверие его сертификату на телефоне. Переустанавливать Recall на телефоне не нужно.</p>{error&&<p className="warning-text" role="alert">{error}</p>}<Button disabled={busy||!address||!editing&&!code} onClick={()=>void submit()}>{busy?'Подключаем…':editing?'Сохранить подключение':'Подключить компьютер'}</Button></div></Dialog>;
}
