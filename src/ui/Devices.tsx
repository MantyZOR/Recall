import { useEffect, useRef, useState } from 'react';
import { PhoneSetup, QR } from './PhoneSetup';
import jsQR from 'jsqr';
import { Laptop, Smartphone, RefreshCw, Link2, QrCode, Camera, Copy, ShieldCheck, CheckCircle2, CircleHelp, Unplug, Download, X } from 'lucide-react';
import type { Connection, LocalIdentity } from '../domain/types';
import { api, pairPhone } from '../storage/sync';
import { getMeta } from '../storage/db';
import { Button, PageHeader, Dialog, formatDate } from './common';
export interface ServerStatus {serverId:string;origin:string|null;https:boolean;bootstrapOrigin?:string;fingerprint?:string;expires?:string;devices:{id:string;name:string;role:string;lastSeen:number;lastSync:number;cursor:Record<string,number>}[];backupCount:number;lastBackup:string|null;events:number;}
type Props={connection?:Connection;status:ServerStatus|null;who:LocalIdentity;sync:()=>Promise<void>;syncing:boolean;error:string;syncHint:string;refresh:()=>Promise<void>;notify:(m:string,e?:boolean)=>void;};
export function Devices({connection,status,who,sync,syncing,error,syncHint,refresh,notify}:Props){
 const [pair,setPair]=useState<{url:string;code:string;expiresAt:number}|null>(null),[code,setCode]=useState(''),[scanner,setScanner]=useState(false),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
 const ios=/iPhone|iPad/.test(navigator.userAgent),phone=ios||/Android/.test(navigator.userAgent),standalone=window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
 useEffect(()=>{getMeta<string>('pairSecret').then(secret=>{if(secret)setCode(secret);});const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const create=async()=>{setBusy(true);try{setPair(await api('pair/create',{}));}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}};
 const connect=async(secret=code)=>{if(phone&&!standalone){notify('Сначала открой приложение с иконки на экране «Домой»',true);return;}setBusy(true);try{await pairPhone(secret);await sync();await refresh();notify('Устройства подключены. Локальные данные объединены.');setCode('');}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}};
 const revoke=async()=>{setBusy(true);try{await api('pair/revoke',{});await refresh();setPair(null);notify('Сопряжение отключено. Данные телефона сохраняются на нём.');}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}};
 const scanned=(url:string)=>{try{const parsed=new URL(url);if(parsed.origin!==location.origin)throw new Error('Код относится к другому адресу приложения');const secret=new URLSearchParams(parsed.hash.slice(1)).get('pair');if(!secret)throw new Error('Это не QR сопряжения');setScanner(false);setCode(secret);connect(secret);}catch(e){notify((e as Error).message,true);}};
 return <><PageHeader eyebrow="ТВОИ ДАННЫЕ НА ДВУХ УСТРОЙСТВАХ" title="Рядом. На связи." description="Компьютер и телефон обмениваются напрямую, когда доступны друг другу."><Button kind="secondary" disabled={syncing||!connection} onClick={()=>sync()}><RefreshCw size={17} className={syncing?'spin':''}/>{syncing?'Передаём…':'Синхронизировать'}</Button></PageHeader>
 {syncHint&&<div className="notice sync-paused"><strong>{syncHint}</strong><p>Карточки и ответы сохранены здесь. Нажми «Синхронизировать», когда ПК станет доступен. После успешного обмена автоматический режим возобновится, если он включён в настройках.</p></div>}
 <div className="device-overview"><div className="device-node current"><div><Laptop size={40}/></div><h3>{connection?.role==='phone'?'Мой компьютер':who.name}</h3><span>{status?'Служба доступна':'Ожидает соединения'}</span></div><div className="device-bridge"><span/><Link2 size={24}/><span/><small>Прямой защищённый обмен</small></div><div className="device-node"><div><Smartphone size={40}/></div><h3>{status?.devices.find(d=>d.role==='phone')?.name||(phone?who.name:'Мой телефон')}</h3><span>{status?.devices.some(d=>d.role==='phone')?'Устройство сопряжено':connection?.role==='phone'?'Устройство сопряжено':'Пока не подключён'}</span></div></div>
 <div className="sync-details"><CheckCircle2 size={18}/><div><strong>Ответы сохраняются на этом устройстве</strong><span>{connection?.lastSync?'Последний завершённый обмен с ПК: '+new Intl.DateTimeFormat('ru',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'}).format(connection.lastSync):'Обмен ещё не завершён. Обучение и редактирование работают локально.'}</span></div>{error&&<small className="warning-text">ПК сейчас недоступен · {error}</small>}</div>
 {phone&&!standalone&&<div className="notice warning"><strong>Открыта вкладка браузера</strong><p>Добавь приложение на главный экран через меню браузера (Safari на iPhone, Chrome на Android), затем открой с иконки. Сопряжение и загрузка рабочих данных выполняются внутри установленной PWA.</p></div>}
 {connection?.role==='desktop'?<PhoneSetup status={status} pair={pair} now={now} busy={busy} create={create} revoke={revoke}/>:!connection?<section className="panel phone-pair"><QrCode size={36}/><h2>Подключиться к компьютеру</h2><p>Открой Recall на ПК и создай код в разделе «Устройства».</p><Button kind="secondary" onClick={()=>setScanner(true)} disabled={phone&&!standalone}><Camera size={17}/>Сканировать QR</Button><label>Или одноразовый код<input value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="8 символов с компьютера" onChange={e=>setCode(e.target.value.trim())}/></label><Button disabled={!code||busy||(phone&&!standalone)} onClick={()=>connect()}>Подключить устройство</Button></section>:<section className="panel"><h2>Подключение сохранено</h2><p>Открывай приложение в общей сети с доступным ПК. Без сети продолжай учиться. Если автообмен на паузе, нажми «Синхронизировать», когда ПК снова будет доступен.</p></section>}
 <div className="device-notes"><p><ShieldCheck size={17}/>Доступ ограничен сопряжением. Максимум два устройства.</p><p><Download size={17}/>Полный архив в настройках — запасной способ переноса и восстановления.</p><p><CircleHelp size={17}/>Для обмена держи PWA открытой. Обучение доступно и с выключенным ПК.</p></div>
 {scanner&&<Scanner onClose={()=>setScanner(false)} onScan={scanned}/>}
 </>;
}
function Scanner({onClose,onScan}:{onClose:()=>void;onScan:(value:string)=>void}){
 const video=useRef<HTMLVideoElement>(null),[error,setError]=useState('');
 useEffect(()=>{let stopped=false,stream:MediaStream|undefined,frame=0;const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!navigator.mediaDevices?.getUserMedia){setError('Камера недоступна. Введи одноразовый код вручную.');return;}
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:640}},audio:false}).then(async media=>{stream=media;if(stopped){media.getTracks().forEach(t=>t.stop());return;}if(video.current){video.current.srcObject=media;await video.current.play();}
   const scan=()=>{if(stopped)return;const v=video.current;if(v&&v.readyState>=2&&ctx){canvas.width=v.videoWidth;canvas.height=v.videoHeight;ctx.drawImage(v,0,0);const img=ctx.getImageData(0,0,canvas.width,canvas.height),qr=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'});if(qr){stopped=true;media.getTracks().forEach(t=>t.stop());onScan(qr.data);return;}}frame=requestAnimationFrame(scan);};scan();
  }).catch(e=>setError('Камера недоступна: '+e.message+'. Введи одноразовый код вручную.'));
  return()=>{stopped=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());};
 },[]);
 return <Dialog title="Просканируй QR с компьютера" onClose={onClose}><div className="scanner"><video ref={video} playsInline muted autoPlay/><p>{error||'Наведи камеру на QR сопряжения в разделе «Устройства» на ПК.'}</p></div></Dialog>;
}




