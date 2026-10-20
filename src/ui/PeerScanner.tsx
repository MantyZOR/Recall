import {useEffect,useRef,useState} from 'react';
import jsQR from 'jsqr';
import type {QrCollector} from '../storage/peer-qr';
import {Button,Dialog} from './common';

export function PeerScanner({onClose,onCode,onRead,collector}:{onClose:()=>void;onCode:(code:string)=>void;onRead:(code:string)=>void;collector:QrCollector}){
 const video=useRef<HTMLVideoElement>(null),[decoded,setDecoded]=useState('');
 const [hint,setHint]=useState(()=>collector.progress.received?`Уже прочитано частей: ${collector.progress.received} из ${collector.progress.total}. Продолжай с оставшихся частей.`:'Наведи камеру на QR внутри Recall. Держи QR целиком в квадратном окне. Можно поставить показ QR на паузу на другом устройстве.');
 useEffect(()=>{
  let stopped=false,stream:MediaStream|undefined,frame=0,last='',lastAt=0,lastFrame=0;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const release=()=>{stopped=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop());if(video.current)video.current.srcObject=null;};
  if(!navigator.mediaDevices?.getUserMedia){setHint('Камера недоступна. Закрой сканер и открой файл подключения.');return;}
  void navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280}},audio:false}).then(async media=>{
   stream=media;if(stopped){media.getTracks().forEach(track=>track.stop());return;}
   if(video.current){video.current.srcObject=media;await video.current.play();}
   const scan=()=>{
    if(stopped)return;
    if(performance.now()-lastFrame<350){frame=requestAnimationFrame(scan);return;}lastFrame=performance.now();
    const view=video.current;
    if(view&&view.readyState>=2&&view.videoWidth&&view.videoHeight&&ctx){
     // The preview and decoding use the same central square; camera memory is bounded.
     const side=Math.min(view.videoWidth,view.videoHeight),size=Math.min(720,side);
     if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;}
     ctx.drawImage(view,(view.videoWidth-side)/2,(view.videoHeight-side)/2,side,side,0,0,size,size);
     const pixels=ctx.getImageData(0,0,size,size),qr=jsQR(pixels.data,size,size,{inversionAttempts:'dontInvert'});
     if(qr&&(qr.data!==last||Date.now()-lastAt>2000)){
      last=qr.data;lastAt=Date.now();
      try{
       const result=collector.read(qr.data);
       if(result.code){release();setDecoded(result.code);setHint('Все части прочитаны. Камера выключена.');onRead(result.code);return;}
       setHint(`Прочитано частей: ${result.received} из ${result.total}. Держи камеру наведённой или переключи QR стрелкой на другом устройстве.`);
      }catch(e){setHint((e as Error).message);}
     }
    }
    frame=requestAnimationFrame(scan);
   };scan();
  }).catch(()=>{if(!stopped){release();setHint('Не удалось открыть камеру. Разреши доступ или закрой сканер и открой файл подключения.');}});
  return release;
 },[collector]);
 return <Dialog title="Сканировать прямой обмен" onClose={onClose}><div className="scanner peer-scanner">
  {decoded?<><h3>Код прочитан</h3><p role="status">{hint}</p><p>Это только настройки соединения. Нажми «Продолжить подключение», чтобы перейти к следующему шагу. Карточки ещё не передаются.</p><Button onClick={()=>onCode(decoded)}>Продолжить подключение</Button></>:<><video ref={video} playsInline muted autoPlay/><p role="status">{hint}</p><p className="hint">Прочитанные части сохранятся, если закрыть сканер и открыть его снова в этом подключении.</p></>}
 </div></Dialog>;
}
