// Pairing metadata only; study records and device signing keys never enter this file.
const validCode=(code:unknown):code is string=>typeof code==='string'&&code.length<=12000&&/^recall-peer:1:[A-Za-z0-9_-]+$/.test(code);
export function connectionFile(code:string,answer:boolean){
 if(!validCode(code))throw Error('Некорректный код подключения');
 return new File([JSON.stringify({format:'recall-connection',version:1,code},null,2)],answer?'Recall-ответ.recall-link.json':'Recall-приглашение.recall-link.json',{type:'application/json'});
}
export async function readConnectionFile(file:File){
 if(file.size>20000)throw Error('Файл подключения слишком большой. Выбери файл приглашения или ответа Recall, а не архив карточек.');
 let value:unknown;try{value=JSON.parse(await file.text());}catch{throw Error('Это не файл подключения Recall');}
 if(!value||typeof value!=='object'||(value as {format?:unknown}).format!=='recall-connection'||(value as {version?:unknown}).version!==1||!validCode((value as {code?:unknown}).code))throw Error('Это не файл подключения Recall');
 return (value as {code:string}).code;
}
