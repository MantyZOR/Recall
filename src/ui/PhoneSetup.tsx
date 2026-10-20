import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, QrCode, ShieldCheck, Unplug } from 'lucide-react';
import type { ServerStatus } from './Devices';
import { Button } from './common';
export function QR({value}:{value:string}){
 const [src,setSrc]=useState('');
 useEffect(()=>{let active=true;QRCode.toDataURL(value,{width:240,margin:2,errorCorrectionLevel:'M',color:{dark:'#27233f',light:'#ffffff'}}).then(url=>{if(active)setSrc(url);});return()=>{active=false;};},[value]);
 return src?<img className="qr-image" src={src} alt="QR-код для подключения"/>:<div className="qr-placeholder"/>;
}
type Props={status:ServerStatus|null;pair:{url:string;code:string;expiresAt:number}|null;now:number;busy:boolean;create:()=>void;revoke:()=>void};
export function PhoneSetup({status,pair,now,busy,create,revoke}:Props){
 const [platform,setPlatform]=useState<'ios'|'android'>(/Android/.test(navigator.userAgent)?'android':'ios'),ios=platform==='ios';
 return <>
  <section className="panel phone-setup"><div className="section-title"><h2>Первое подключение телефона</h2><span className="model-tag"><ShieldCheck size={13}/>ЛОКАЛЬНЫЙ HTTPS</span></div>
   <div className="segments phone-platform" aria-label="Платформа телефона"><button aria-pressed={ios} className={ios?'selected':''} onClick={()=>setPlatform('ios')}>iPhone</button><button aria-pressed={!ios} className={!ios?'selected':''} onClick={()=>setPlatform('android')}>Android</button></div>
   <div className="setup-steps">
    <div className="setup-step"><span className="step-number">1</span><div><h3>{ios?'Установи профиль сертификата':'Установи сертификат CA'}</h3>
     <p>ПК и телефон должны быть в одной сети. Просканируй QR камерой телефона.</p>
     {ios?<p>Разреши загрузку профиля в Safari. В настройках открой «Профиль загружен» → «Установить». Установка завершена, когда внутри профиля видна кнопка «Удалить профиль».</p>:<p>Скачай файл, затем найди в настройках телефона «Установить сертификат» и выбери сертификат центра сертификации (CA). Обычно это «Безопасность → Другие настройки безопасности → Шифрование и учётные данные»; названия зависят от производителя.</p>}
     {status?.bootstrapOrigin?<><QR value={status.bootstrapOrigin+(ios?'/recall.mobileconfig':'/ca.crt')}/><a href={status.bootstrapOrigin+(ios?'/recall.mobileconfig':'/ca.crt')} target="_blank" rel="noreferrer">{ios?'Установить профиль сертификата':'Скачать сертификат для Android'}</a><p className="hint">Вся инструкция на телефоне: <a href={status.bootstrapOrigin} target="_blank" rel="noreferrer">{status.bootstrapOrigin}</a></p></>:<div className="notice">В меню запуска Recall раскрой «Настройка сети», выбери адрес ПК и нажми «Настроить адрес и HTTPS».</div>}
    </div></div>
    <div className="setup-step"><span className="step-number">2</span><div><h3>{ios?'Включи доверие и добавь приложение':'Добавь приложение из Chrome'}</h3>
     {ios?<><p>В iPhone: «Настройки → Основные → Об этом устройстве». Прокрути до самого низа, открой «Настройки доверия сертификатов» и включи полное доверие Recall Local CA.</p><p>Открой адрес ниже в Safari без предупреждения о сертификате. «Поделиться → На экран Домой», включи «Открыть как веб-приложение» и запусти новую иконку.</p></>:<><p>Открой адрес ниже в Chrome. Он должен открыться без ошибки сертификата. Затем «⋮ → Установить и создать ярлык → Установить»; в некоторых версиях — «Установить приложение» или «Добавить на главный экран».</p><p>Запусти Recall с новой иконки. После первого обмена обучение и редактирование работают без ПК.</p></>}
     {status?.origin&&<><a className="local-address" href={status.origin} target="_blank" rel="noreferrer">{status.origin}</a><QR value={status.origin}/></>}
     <a href={ios?'https://support.apple.com/ru-ru/102390':'https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=ru'} target="_blank" rel="noreferrer">{ios?'Инструкция Apple':'Инструкция Google Chrome'}</a>
     {!ios&&<p className="hint">Браузерные функции проверяем в Chromium. Полное подключение на реальном Android ещё требует проверки.</p>}
    </div></div>
    <div className="setup-step"><span className="step-number">3</span><div><h3>Свяжи устройства</h3><p>В Recall, открытом с установленной иконки, выбери «Устройства» и просканируй этот QR или введи одноразовый код. После обмена дождись завершения подготовки работы без сети.</p>
     {pair&&pair.expiresAt>now?<><QR value={pair.url}/><div className="pair-code">{pair.code}</div><p className="hint">Код действует ещё {Math.ceil((pair.expiresAt-now)/1000)} сек</p><Button kind="secondary" onClick={create} disabled={busy}>Обновить код</Button></>:<Button disabled={busy||!status?.https} onClick={create}><QrCode size={17}/>Создать QR сопряжения</Button>}
    </div></div>
   </div>
  </section>
  <details className="certificate-details phone-reinstall"><summary>Если удалил приложение или сменил телефон</summary><p>Добавь Recall на экран телефона снова. Если сертификат и доверие сохранились, устанавливать их заново не нужно.</p><p>На ПК отключи старое сопряжение кнопкой выше и создай новый код. Открой новую иконку Recall на телефоне, свяжи устройства и дождись загрузки материала с ПК. При необходимости восстанови полный архив в настройках.</p><p>Изменения возвращаются с ПК, если успели синхронизироваться. Для ещё не переданных изменений нужна заранее сохранённая копия. Можно подключить несколько устройств; отключать существующие для добавления нового не нужно.</p></details>
  {status?.fingerprint&&<details className="certificate-details"><summary>Адрес и сертификат</summary><p>Постоянный адрес: <strong>{status.origin}</strong>. Закрепи IP компьютера в домашнем роутере. Адрес определяет место локальных данных телефона; перед сменой сохрани полный архив.</p><p>Сертификат сервера до {status.expires?.slice(0,10)}.</p><small>Отпечаток корневого сертификата SHA-256</small><code>{status.fingerprint}</code></details>}
 </>;
}
