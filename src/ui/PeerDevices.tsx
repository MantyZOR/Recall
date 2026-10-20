import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import QRCode from 'qrcode';
import { PeerScanner } from './PeerScanner';
import { PeerFileInput, PeerFileOutput } from './PeerFiles';
import { ArrowLeftRight, Camera, CheckCircle2, Copy, Link2, MonitorSmartphone, Plus, Unplug, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { LocalIdentity } from '../domain/types';
import { PUBLIC_RECALL_URL, forgetPeer, peers, renameLocalDevice, type Peer } from '../storage/peer-identity';
import { PeerSession, type PeerProgress } from '../storage/peer-sync';
import { QrCollector, qrParts } from '../storage/peer-qr';
import { Button, Dialog } from './common';

const date=(at:number)=>new Intl.DateTimeFormat('ru',{dateStyle:'medium',timeStyle:'short'}).format(at);
type Props={who:LocalIdentity;notify:(text:string,error?:boolean)=>void};
export function PeerDevices({who,notify}:Props){
 const [devices,setDevices]=useState<Peer[]>([]),[pairing,setPairing]=useState<{expectedId?:string}|null>(null),[name,setName]=useState(who.name),[forget,setForget]=useState<Peer|null>(null);
 useEffect(()=>{const sub=liveQuery(peers).subscribe(setDevices);return()=>sub.unsubscribe();},[]);
 return <section className="peer-devices" aria-label="Прямой обмен между устройствами">
  <div className="panel peer-intro"><div className="peer-heading"><MonitorSmartphone size={27}/><div><h2>Телефон, ноутбук, другой телефон</h2><p>Обмен напрямую в общей сети. Служба на ПК не нужна.</p></div></div>
   <div className="peer-actions"><Button onClick={()=>setPairing({})}><Plus size={17}/>Новое подключение</Button><a className="button secondary" href={PUBLIC_RECALL_URL} target="_blank" rel="noreferrer">Открыть Recall на другом устройстве</a></div>
   <p className="hint">На новом устройстве открой <a href={PUBLIC_RECALL_URL} target="_blank" rel="noreferrer">mantyzor.github.io/Recall</a>, затем раздел «Устройства». Первый запуск страницы требует интернета. После подготовки офлайн-кэша можно обмениваться в локальной сети.</p>
   <details><summary>Как проходит обмен</summary><ol><li>На одном устройстве создай приглашение. На другом выбери «У меня есть код» и отсканируй его.</li><li>Сохрани или передай файл ответа на первое устройство и открой его в Recall. Камера на ПК не нужна. Вместо файлов можно вставлять коды текстом.</li><li>На обоих устройствах подтверди объединение. Карточки, изображения, цели, настройки обучения и история объединятся.</li></ol><p>Держи обе страницы открытыми до завершения. Для следующего обмена создаётся новое подключение. На устройстве с твоими карточками открывай прежнюю иконку или прежний адрес Recall: у разных адресов отдельные базы. Сохранённые данные работают отдельно; акцентный цвет, размер текста и доступ к службе ПК остаются своими на каждом устройстве.</p></details>
  </div>
  <div className="panel peer-roster"><h2>Мои устройства</h2><form className="peer-name" onSubmit={async e=>{e.preventDefault();try{await renameLocalDevice(name);notify('Имя устройства сохранено');}catch(e){notify((e as Error).message,true);}}}><label>Это устройство<input aria-label="Имя этого устройства" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><Button type="submit" kind="secondary" disabled={name.trim()===who.name}>Сохранить имя</Button></form>
   {!devices.length&&<p className="hint">Здесь появятся устройства, на которых ты подтвердил прямой обмен. Даты относятся к обмену именно с этим устройством.</p>}
   {devices.map(peer=><article className="peer-row" key={peer.id}><div><strong>{peer.name}</strong><small>{peer.lastSync?'Последний обмен: '+date(peer.lastSync):'Устройство добавлено · обмен ещё не завершён'}</small><small>ID {peer.id.slice(0,8)} · ключ {peer.fingerprint.slice(0,12)}</small></div><div className="peer-actions"><Button kind="secondary" onClick={()=>setPairing({expectedId:peer.id})}><ArrowLeftRight size={16}/>Обменяться</Button><button className="icon-button" aria-label={'Забыть устройство '+peer.name} onClick={()=>setForget(peer)}><Unplug size={18}/></button></div></article>)}
  </div>
  {pairing&&<PeerDialog expectedId={pairing.expectedId} onClose={()=>setPairing(null)}/>}
  {forget&&<Dialog title="Забыть устройство?" onClose={()=>setForget(null)}><p>«{forget.name}» исчезнет из этого списка вместе с запомненным ключом. Карточки на обоих устройствах сохранятся. Подключиться снова можно через новые QR-коды.</p><Button kind="danger" onClick={async()=>{try{await forgetPeer(forget.id);setForget(null);}catch(e){notify((e as Error).message,true);}}}>Забыть устройство</Button></Dialog>}
 </section>;
}

function PeerDialog({onClose,expectedId}:{onClose:()=>void;expectedId?:string}){
 const session=useRef<PeerSession|null>(null),alive=useRef(true),collector=useRef(new QrCollector());
 const [mode,setMode]=useState<'choose'|'offer'|'answer'>('choose'),[output,setOutput]=useState(''),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[scanner,setScanner]=useState(false),[copied,setCopied]=useState(false),[copyHint,setCopyHint]=useState(''),[progress,setProgress]=useState<PeerProgress|null>(null);
 useEffect(()=>{alive.current=true;let timer:ReturnType<typeof setTimeout>|undefined,hiddenAt=0,hiddenLimit=60000;const close=()=>{session.current?.close();session.current=null;if(alive.current)setProgress(current=>current?.stage==='done'?current:{stage:'error',text:'Соединение закрыто после сворачивания. Уже полученные данные сохранены. Создай новые коды для продолжения.'});};const hide=()=>{clearTimeout(timer);if(document.visibilityState==='hidden'){hiddenAt=Date.now();hiddenLimit=session.current?.connected?60000:180000;timer=setTimeout(close,hiddenLimit);}else{if(hiddenAt&&Date.now()-hiddenAt>=hiddenLimit)close();hiddenAt=0;}};document.addEventListener('visibilitychange',hide);const leave=()=>{if(session.current?.connected)close();};window.addEventListener('pagehide',leave);return()=>{alive.current=false;clearTimeout(timer);session.current?.close();document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',leave);};},[]);
 const reset=()=>{collector.current=new QrCollector();session.current?.close();session.current=null;setOutput('');setInput('');setMode('choose');setProgress(null);setBusy(false);setCopied(false);setCopyHint('');};
 const run=async(action:()=>Promise<void>)=>{if(!alive.current)return;setBusy(true);try{await action();}catch(e){if(alive.current)setProgress({stage:'error',text:(e as Error).message});}finally{if(alive.current)setBusy(false);}};
 const createSession=()=>session.current=new PeerSession(value=>{if(alive.current)setProgress(value);},expectedId);
 const create=()=>run(async()=>{setMode('offer');const value=await createSession().offer();if(alive.current)setOutput(value);});
 const consume=(code=input)=>run(async()=>{
  if(mode==='offer'){await session.current!.complete(code);if(alive.current)setOutput('');}
  else{setMode('answer');const value=await createSession().answer(code);if(alive.current)setOutput(value);}
 });
 const linked=progress&&['connected','waiting','syncing','done'].includes(progress.stage),failed=progress?.stage==='error';
 if(scanner)return <PeerScanner collector={collector.current} onRead={setInput} onClose={()=>setScanner(false)} onCode={code=>{setScanner(false);setInput(code);void consume(code);}}/>;
 return <Dialog title="Прямой обмен" onClose={onClose} wide>
  <div className="peer-dialog">
   {mode==='choose'&&!progress&&<><p>Оба устройства должны быть в одной сети, с открытым Recall.</p><div className="peer-actions"><Button onClick={create}><Link2 size={17}/>Создать приглашение</Button><Button kind="secondary" onClick={()=>setMode('answer')}>У меня есть код</Button></div></>}
   {progress&&<div className={'notice peer-progress '+(failed?'warning':'')} role="status"><strong>{progress.stage==='done'&&<CheckCircle2 size={18}/>} {progress.text}</strong>{progress.peer&&<p>Устройство: {progress.peer}</p>}{progress.stage==='syncing'&&<p>Изменений отправлено: {progress.sent||0} · получено: {progress.received||0}</p>}</div>}
   {!linked&&!failed&&mode!=='choose'&&<>
    {output&&<section className="peer-code"><h3>{mode==='offer'?'1. Передай приглашение второму устройству':'2. Передай файл ответа первому устройству'}</h3><PeerFileOutput code={output} answer={mode==='answer'}/>{mode==='offer'?<PeerQR value={output}/>:<details className="peer-answer-qr"><summary>Показать QR-код ответа, если на другом устройстве есть камера</summary><PeerQR value={output}/></details>}<label>{mode==='offer'?'Код приглашения':'Ответный код'}<textarea aria-label={mode==='offer'?'Код приглашения':'Ответный код'} readOnly value={output} rows={2} onFocus={e=>e.target.select()}/></label><Button kind="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(output);setCopied(true);setCopyHint('');}catch{setCopyHint('Выдели код в поле и скопируй вручную.');}}}><Copy size={16}/>{copied?'Скопировано':'Скопировать код'}</Button>{copyHint&&<p className="hint">{copyHint}</p>}</section>}
    {(mode==='answer'&&!output||mode==='offer'&&output)&&<section className="peer-input"><h3>{mode==='offer'?'3. Открой файл ответа со второго устройства':'1. Прими приглашение с другого устройства'}</h3><PeerFileInput disabled={busy} onCode={code=>{setInput(code);void consume(code);}}/><Button kind="secondary" disabled={busy} onClick={()=>setScanner(true)}><Camera size={17}/>Сканировать QR-код</Button><label>{mode==='offer'?'Вставить ответный код':'Вставить приглашение'}<textarea aria-label={mode==='offer'?'Вставить ответный код':'Вставить приглашение'} value={input} rows={3} onChange={e=>setInput(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false}/></label><Button disabled={!input.trim()||busy} onClick={()=>consume()}>{busy?'Подключаем…':mode==='offer'?'Завершить подключение':'Создать ответный код'}</Button></section>}
   </>}
   {progress?.stage==='connected'&&<><p>Проверь имя второго устройства. Обмен объединит обе библиотеки, включая удаления и историю ответов. Личные карточки передаются только после подтверждения на обеих сторонах.</p><Button onClick={()=>run(async()=>{await session.current!.accept();})} disabled={busy}>Объединить данные</Button></>}
   {progress?.stage==='done'&&<><p>Если во время передачи ты менял карточки в другой вкладке, передай эти новые изменения следующим обменом.</p><Button onClick={onClose}>Готово</Button></>}
   {failed&&<Button kind="secondary" onClick={reset}>Начать заново</Button>}
   <p className="hint">Окно не закрывай. Для отправки файла можно ненадолго переключиться в другое приложение и вернуться. Во время обмена карточками держи оба экрана открытыми. Если браузер прервал соединение, создай новое подключение. Гостевая сеть или VPN могут мешать прямому обмену.</p>
  </div>
 </Dialog>;
}

function PeerQR({value}:{value:string}){
 const parts=qrParts(value),[index,setIndex]=useState(0),[image,setImage]=useState(''),[error,setError]=useState(''),[playing,setPlaying]=useState(true);
 useEffect(()=>{let active=true;QRCode.toDataURL(parts[index],{width:400,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}}).then(src=>{if(active)setImage(src);}).catch(()=>{if(active)setError('QR не удалось построить. Скопируй код текстом.');});return()=>{active=false;};},[value,index]);
 // A timeout starts after each displayed frame, including manual navigation.
 useEffect(()=>{if(parts.length<2||!playing||!image)return;const timer=setTimeout(()=>setIndex(i=>(i+1)%parts.length),4000);return()=>clearTimeout(timer);},[value,parts.length,playing,image]);
 const step=(delta:number)=>{setPlaying(false);setIndex(i=>(i+delta+parts.length)%parts.length);};
 return <div className="peer-qr"><p className="hint">Читай кнопкой «Сканировать QR-код» внутри Recall на другом устройстве.</p>{image&&<img src={image} alt="QR прямого обмена"/>}{error&&<p>{error}</p>}{parts.length>1&&<><div className="peer-qr-controls"><button className="icon-button" aria-label="Предыдущая часть QR" onClick={()=>step(-1)}><ChevronLeft size={20}/></button><span aria-live="polite">Часть {index+1} из {parts.length}</span><button className="icon-button" aria-label="Следующая часть QR" onClick={()=>step(1)}><ChevronRight size={20}/></button></div><Button kind="secondary" onClick={()=>setPlaying(v=>!v)}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Пауза QR':'Автосмена QR'}</Button><p className="hint">{playing?'Части меняются раз в 4 секунды. Держи камеру наведённой до сбора всех частей.':'QR на паузе. Когда сканер прочитает эту часть, переключи на следующую стрелкой.'}</p></>}</div>;
}
