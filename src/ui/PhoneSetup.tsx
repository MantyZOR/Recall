import {useState} from 'react';
import type {ServerStatus} from './Devices';

export function PhoneSetup({status}:{status:ServerStatus|null}){
 const [platform,setPlatform]=useState<'ios'|'android'>(/Android/.test(navigator.userAgent)?'android':'ios');
 const ios=platform==='ios',setup=status?.bootstrapOrigin;
 return <div className="phone-setup">
  <div className="segments phone-platform" aria-label="Платформа телефона"><button aria-pressed={ios} className={ios?'selected':''} onClick={()=>setPlatform('ios')}>iPhone</button><button aria-pressed={!ios} className={!ios?'selected':''} onClick={()=>setPlatform('android')}>Android</button></div>
  {setup?<ol className="setup-steps">
   <li>На телефоне открой в {ios?'Safari':'Chrome'} страницу настройки: <a className="local-address" href={setup} target="_blank" rel="noreferrer">{setup}</a>.</li>
   <li>{ios?'Установи профиль и включи полное доверие сертификату этого компьютера. Страница покажет, где это сделать.':'Установи сертификат компьютера по шагам на странице настройки.'}</li>
   <li>Открой Recall с прежней иконки. В разделе «Устройства» нажми «Добавить компьютер» и введи код с ПК. Если иконки ещё нет, добавь её со страницы настройки.</li>
  </ol>:<p>В меню Recall открой «Настройка сети» и нажми «Настроить адрес и HTTPS».</p>}
  {status?.fingerprint&&<details><summary>Проверить отпечаток сертификата</summary><code className="local-address">{status.fingerprint}</code></details>}
 </div>;
}
