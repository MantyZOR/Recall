import {useRef,useState} from 'react';
import {Download,Share2,Upload} from 'lucide-react';
import {connectionFile,readConnectionFile} from '../storage/peer-file';
import {download} from '../storage/archive';
import {Button} from './common';

export function PeerFileOutput({code,answer}:{code:string;answer:boolean}){
 const [hint,setHint]=useState('');
 const save=()=>{const file=connectionFile(code,answer);download(file.name,file,file.type);setHint('Передай этот файл на другое устройство и открой его кнопкой «Открыть файл подключения» внутри Recall.');};
 const share=async()=>{
  const file=connectionFile(code,answer);
  if(!navigator.share||!navigator.canShare?.({files:[file]})){save();return;}
  try{await navigator.share({files:[file],title:answer?'Recall — ответный файл':'Recall — приглашение'});setHint('На другом устройстве открой этот файл в Recall. Затем вернись сюда для подтверждения обмена.');}
  catch(e){if((e as DOMException).name==='AbortError')return;setHint('Не удалось открыть меню отправки. Нажми «Скачать файл» и передай его удобным способом.');}
 };
 return <div className="peer-file-output"><div className="peer-actions">{typeof navigator.share==='function'&&<Button onClick={()=>void share()}><Share2 size={17}/>{answer?'Передать файл ответа':'Передать приглашение'}</Button>}<Button kind="secondary" onClick={save}><Download size={17}/>{answer?'Скачать файл ответа':'Скачать файл приглашения'}</Button></div>{answer&&<p className="hint">Камера на ПК не нужна. Передай файл через мессенджер, общий диск или другим удобным способом. Это только настройки подключения; карточки в файл не входят.</p>}{hint&&<p className="hint" role="status">{hint}</p>}</div>;
}
export function PeerFileInput({onCode,disabled}:{onCode:(code:string)=>void;disabled:boolean}){
 const input=useRef<HTMLInputElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dragging,setDragging]=useState(false);
 const load=async(files:FileList|null)=>{
  if(disabled||busy||!files?.length)return;
  if(files.length!==1){setError('Выбери один файл подключения');return;}
  setBusy(true);setError('');try{onCode(await readConnectionFile(files[0]));}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <div className={'peer-file-input '+(dragging?'dragging':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void load(e.dataTransfer.files);}}>
  <Button kind="secondary" disabled={disabled||busy} onClick={()=>input.current?.click()}><Upload size={17}/>{busy?'Читаем файл…':'Открыть файл подключения'}</Button>
  <input ref={input} type="file" hidden aria-label="Файл подключения Recall" accept=".json,.recall-link,.txt,application/json,text/plain" onChange={e=>{void load(e.target.files);e.target.value='';}}/>
  <p className="hint">Выбери или перетащи сюда файл приглашения / ответа с другого устройства.</p>{error&&<p className="warning-text" role="alert">{error}</p>}
 </div>;
}
