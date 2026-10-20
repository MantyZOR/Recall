import {test,expect,type Page} from '@playwright/test';

async function boot(page:Page,name:string,web=false){
 await page.context().route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Без службы ПК"}'}));
 await page.goto(web?'http://127.0.0.1:17890/Recall/?page=devices':'/?page=devices');await expect(page.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();await page.getByText('Дополнительно: разовый прямой обмен',{exact:true}).click();
 await page.getByLabel('Имя этого устройства',{exact:true}).fill(name);await page.getByRole('button',{name:'Сохранить имя',exact:true}).click();
}
async function connect(a:Page,b:Page){
 await a.getByRole('button',{name:'Новое подключение',exact:true}).click();await a.getByRole('button',{name:'Создать приглашение',exact:true}).click();
 await expect(a.getByLabel('Код приглашения',{exact:true})).toHaveValue(/^recall-peer:1:/);const offer=await a.getByLabel('Код приглашения',{exact:true}).inputValue();
 await b.getByRole('button',{name:'Новое подключение',exact:true}).click();await b.getByRole('button',{name:'У меня есть код',exact:true}).click();await b.getByLabel('Вставить приглашение',{exact:true}).fill(offer);await b.getByRole('button',{name:'Создать ответный код',exact:true}).click();
 await expect(b.getByLabel('Ответный код',{exact:true})).toHaveValue(/^recall-peer:1:/);const answer=await b.getByLabel('Ответный код',{exact:true}).inputValue();
 await a.getByLabel('Вставить ответный код',{exact:true}).fill(answer);await a.getByRole('button',{name:'Завершить подключение',exact:true}).click();
 await expect(a.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();await expect(b.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();
}
async function finish(a:Page,b:Page){
 await a.getByRole('button',{name:'Объединить данные',exact:true}).click();await expect(a.getByRole('dialog',{name:'Прямой обмен'}).getByRole('status')).toContainText('Ждём подтверждения');
 await b.getByRole('button',{name:'Объединить данные',exact:true}).click();
  await expect(a.getByRole('dialog').getByRole('status')).toContainText('Обмен завершён',{timeout:30000});await a.getByRole('button',{name:'Готово',exact:true}).click();
  await expect(b.getByRole('dialog').getByRole('status')).toContainText('Обмен завершён',{timeout:30000});await b.getByRole('button',{name:'Готово',exact:true}).click();
}
async function data(page:Page){return page.evaluate(()=>new Promise<{events:any[];assets:any[];peers:any[]}>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,t=d.transaction(['events','attachments','meta']),e=t.objectStore('events').getAll(),a=t.objectStore('attachments').getAll(),m=t.objectStore('meta').get('peers');t.oncomplete=()=>{d.close();resolve({events:e.result,assets:a.result.map(v=>({id:v.id,size:v.blob.size})),peers:m.result?.value||[]});};t.onerror=()=>reject(t.error);};}));}
async function seed(page:Page,author:string,count:number,image=false){
 await page.evaluate(async({author,count,image})=>{
  const events:any[]=[];let seq=0,last='';
  const put=(kind:string,entityId:string,payload:any)=>{const id=author+'-'+(++seq);events.push({id,deviceId:author,seq,clock:seq,deps:last?[last]:[],at:Date.now(),kind,entityId,payload});last=id;return id;};
  const deckId=author+'-deck';put('deck.put',deckId,{id:deckId,name:author,description:'',color:'#7269dd',icon:'Aa',retention:.9,algorithm:'fsrs7',newPerDay:20});
  // More than one data-channel chunk; deterministic bytes let us verify the received SHA.
  const bytes=new Uint8Array(512*1024);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  let first='';
  for(let i=0;i<count;i++){const id=author+'-card'+i,v=put('card.put',id,{id,deckId,title:'Карточка '+i,type:'basic',front:'Вопрос '+i+(image&&i===0?' ![image](asset:'+hash+')':''),back:'Ответ '+i,notes:'',aliases:[],tags:[]});if(!i)first=v;}
  put('review',author+'-card0',{cardId:author+'-card0',cardVersion:first,rating:1,elapsedDays:0,durationMs:1000,context:'exam',hints:false,model:'FSRS-7/rust-scalar-v1',paramsId:'fsrs7-defaults-v1',retention:.9,prediction:null,previousReviewIds:[],sessionId:'test'});
  await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,t=d.transaction(['events','attachments'],'readwrite');for(const e of events)t.objectStore('events').put(e);if(image)t.objectStore('attachments').put({id:hash,name:'test.png',type:'image/png',blob:new Blob([bytes],{type:'image/png'})});t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};});
 },{author,count,image});
 await page.reload();await expect(page.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();await page.getByText('Дополнительно: разовый прямой обмен',{exact:true}).click();
}

test('direct WebRTC merges independent libraries, large images and reviews, remembers peers, and relays to a third profile',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext(),cc=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage(),c=await cc.newPage();
 const errors:string[]=[];for(const p of [a,b,c])p.on('pageerror',e=>errors.push(e.message));
 try{
  await boot(a,'Айфон');await boot(b,'Ноутбук',true);await boot(c,'Второй телефон');await seed(a,'a',61,true);await seed(b,'b',2);
  await connect(a,b);expect((await data(b)).events).toHaveLength(4);await finish(a,b);
  const da=await data(a),db=await data(b);expect(da.events).toHaveLength(67);expect(db.events).toEqual(da.events);expect(db.assets).toEqual(da.assets);expect(db.assets[0].size).toBe(512*1024);
  expect(da.peers[0]).toMatchObject({name:'Ноутбук',lastSync:expect.any(Number)});expect(db.peers[0].name).toBe('Айфон');
  // A repeated exchange is idempotent. Only local connection metadata changes.
  // A missing local image is repaired even when the event cursors are identical.
  await b.evaluate(()=>new Promise<void>(resolve=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,t=d.transaction('attachments','readwrite');t.objectStore('attachments').clear();t.oncomplete=()=>{d.close();resolve();};};}));
  await connect(a,b);await finish(a,b);expect((await data(a)).events).toEqual(da.events);expect((await data(b)).events).toEqual(da.events);expect((await data(b)).assets).toEqual(da.assets);
  await connect(b,c);await finish(b,c);const dc=await data(c);expect(dc.events).toEqual(da.events);expect(dc.assets).toEqual(da.assets);expect((await data(b)).peers).toHaveLength(2);
  expect(errors).toEqual([]);
 }finally{await ca.close();await cb.close();await cc.close();}
});

test('requires consent on both sides and closing a pending exchange leaves data unchanged and no success timestamp',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 try{
  await boot(a,'Источник');await boot(b,'Получатель');await seed(a,'a',2);await connect(a,b);
  await a.getByRole('button',{name:'Объединить данные',exact:true}).click();
  await expect(a.getByRole('dialog').getByRole('status')).toContainText('Ждём подтверждения');expect((await data(b)).events).toHaveLength(0);
  await a.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();await expect(b.getByRole('dialog').getByRole('status')).toContainText(/закрыто|прервался/);
  expect((await data(b)).events).toHaveLength(0);expect((await data(a)).peers[0].lastSync).toBeUndefined();
  await b.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();await connect(a,b);await finish(a,b);expect((await data(b)).events).toHaveLength(4);
 }finally{await ca.close();await cb.close();}
});

test('retains completed batches after a storage failure, resumes without duplicates and preserves goals and permanent deletions',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 try{
  await boot(a,'Источник');await boot(b,'Получатель');await seed(a,'a',61);
  await a.evaluate(()=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,t=d.transaction('events','readwrite'),s=t.objectStore('events');s.put({id:'a-64',deviceId:'a',seq:64,clock:64,deps:['a-63'],at:Date.now(),kind:'goal.put',entityId:'goal',payload:{id:'goal',name:'Сохранённая цель',date:'2027-01-01',minutes:20,retention:.9,deckIds:['a-deck'],importance:{},newPerDay:null}});s.put({id:'a-65',deviceId:'a',seq:65,clock:65,deps:['a-64'],at:Date.now(),kind:'card.delete',entityId:'a-card0',payload:{permanent:true}});t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};}));
  await b.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='events'&&value?.id==='a-51')throw new DOMException('Тест: хранилище заполнено','QuotaExceededError');return put.call(this,value,...args);};});
  await connect(a,b);await a.getByRole('button',{name:'Объединить данные',exact:true}).click();await b.getByRole('button',{name:'Объединить данные',exact:true}).click();
  await expect(b.getByRole('dialog').getByRole('status')).toContainText('хранилище заполнено');await expect(a.getByRole('button',{name:'Начать заново',exact:true})).toBeVisible();
  const partial=await data(b);expect(partial.events).toHaveLength(50);expect(partial.peers[0].lastSync).toBeUndefined();expect((await data(a)).peers[0].lastSync).toBeUndefined();
  await a.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();await b.reload();await expect(b.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();await b.getByText('Дополнительно: разовый прямой обмен',{exact:true}).click();
  await connect(a,b);await finish(a,b);const complete=await data(b);expect(complete.events).toHaveLength(65);expect(complete.events).toEqual((await data(a)).events);
  expect(complete.events.find(e=>e.id==='a-65').payload.permanent).toBe(true);expect(complete.events.find(e=>e.id==='a-64').payload.name).toBe('Сохранённая цель');expect(complete.events.filter(e=>e.kind==='review')).toHaveLength(1);
 }finally{await ca.close();await cb.close();}
});

test('rejects a corrupted image before acknowledging or committing its related cards',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 try{
  await boot(a,'Источник');await boot(b,'Получатель');await seed(a,'a',1,true);
  await a.evaluate(()=>new Promise<void>(resolve=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,t=d.transaction('attachments','readwrite'),s=t.objectStore('attachments'),q=s.getAll();q.onsuccess=()=>s.put({...q.result[0],blob:new Blob(['corrupted'],{type:'image/png'})});t.oncomplete=()=>{d.close();resolve();};};}));
  await connect(a,b);await a.getByRole('button',{name:'Объединить данные',exact:true}).click();await b.getByRole('button',{name:'Объединить данные',exact:true}).click();
  await expect(b.getByRole('dialog').getByRole('status')).toContainText('Изображение повреждено');
  expect((await data(b)).events).toHaveLength(0);expect((await data(b)).assets).toHaveLength(0);expect((await data(b)).peers[0].lastSync).toBeUndefined();
 }finally{await ca.close();await cb.close();}
});

async function camera(page:Page){
 await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#b0b0b0';ctx.fillRect(0,0,640,480);
  const stream=canvas.captureStream(10);
  // A camera produces continuous frames even when its subject is stationary.
  // Repaint a corner so an early canvas frame cannot be lost before video.play().
  let tick=0;const timer=setInterval(()=>{const track=stream.getVideoTracks()[0];if(track.readyState==='ended'){clearInterval(timer);return;}ctx.fillStyle=++tick%2?'#afafaf':'#b0b0b0';ctx.fillRect(0,0,2,2);(track as CanvasCaptureMediaStreamTrack).requestFrame();},100);
  navigator.mediaDevices.getUserMedia=async()=>stream;
  (window as any).__qrCamera={canvas,stream};
 });
}
async function scanFrames(source:Page,receiver:Page,resume=false){
 if(!await source.getByRole('button',{name:'Пауза QR',exact:true}).isVisible())await source.getByText('Показать QR-код ответа, если на другом устройстве есть камера',{exact:true}).click();
 await source.getByRole('button',{name:'Пауза QR',exact:true}).click();
 const img=source.getByRole('img',{name:'QR прямого обмена',exact:true});
 const count=Number((await source.locator('.peer-qr-controls>span').innerText()).match(/из (\d+)/)![1]);
 await camera(receiver);await receiver.getByRole('button',{name:'Сканировать QR-код',exact:true}).click();
 for(let i=0;i<count;i++){
  const src=await img.getAttribute('src');
  await receiver.evaluate(async(src)=>{
   const image=new Image();image.src=src!;await image.decode();
   const {canvas}=(window as any).__qrCamera,ctx=canvas.getContext('2d');
   ctx.filter='none';ctx.fillStyle='#b0b0b0';ctx.fillRect(0,0,640,480);ctx.filter='blur(0.5px)';ctx.drawImage(image,190,110,260,260);ctx.filter='none';
  },src);
  if(i<count-1){
   await expect(receiver.getByRole('dialog',{name:'Сканировать прямой обмен'}).getByRole('status')).toContainText(`Прочитано частей: ${i+1} из ${count}`);
   if(resume&&i===0){
    await receiver.getByRole('dialog',{name:'Сканировать прямой обмен'}).getByRole('button',{name:'Закрыть',exact:true}).click();
    expect(await receiver.evaluate(()=>(window as any).__qrCamera.stream.getTracks().every((t:MediaStreamTrack)=>t.readyState==='ended'))).toBe(true);
    await camera(receiver);await receiver.getByRole('button',{name:'Сканировать QR-код',exact:true}).click();
    await expect(receiver.getByRole('dialog',{name:'Сканировать прямой обмен'}).getByRole('status')).toContainText(`Уже прочитано частей: 1 из ${count}`);
   }
   await source.getByRole('button',{name:'Следующая часть QR',exact:true}).click();await expect(img).not.toHaveAttribute('src',src!);
  }
 }
 await expect(receiver.getByRole('heading',{name:'Код прочитан',exact:true})).toBeVisible();
 expect(await receiver.evaluate(()=>(window as any).__qrCamera.stream.getTracks().every((t:MediaStreamTrack)=>t.readyState==='ended'))).toBe(true);
 await receiver.getByRole('button',{name:'Продолжить подключение',exact:true}).click();await expect(receiver.getByRole('dialog',{name:'Сканировать прямой обмен'})).toHaveCount(0);
}
test('scans a defocused camera video in both directions, supports manual QR navigation, and releases cameras',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext({viewport:{width:428,height:926},isMobile:true,hasTouch:true});const a=await ca.newPage(),b=await cb.newPage();
 try{
  await boot(a,'Компьютер');await boot(b,'Телефон');await seed(a,'a',2);
  await a.getByRole('button',{name:'Новое подключение',exact:true}).click();await a.getByRole('button',{name:'Создать приглашение',exact:true}).click();await expect(a.getByRole('button',{name:'Пауза QR',exact:true})).toBeVisible();
  await b.getByRole('button',{name:'Новое подключение',exact:true}).click();await b.getByRole('button',{name:'У меня есть код',exact:true}).click();
  await scanFrames(a,b,true);await expect(b.getByLabel('Ответный код',{exact:true})).toHaveValue(/^recall-peer:1:/);
  await scanFrames(b,a);await expect(a.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();await expect(b.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();
  await finish(a,b);expect((await data(b)).events).toEqual((await data(a)).events);
 }finally{await ca.close();await cb.close();}
});

test('connects through invitation and answer files without requesting a camera, and recovers from a wrong file',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext({viewport:{width:428,height:926},isMobile:true,hasTouch:true});const a=await ca.newPage(),b=await cb.newPage();
 for(const context of [ca,cb])await context.addInitScript(()=>{(window as any).__cameraRequests=0;navigator.mediaDevices.getUserMedia=async()=>{(window as any).__cameraRequests++;throw new DOMException('No webcam','NotFoundError');};});
 try{
  await boot(a,'Без камеры');await boot(b,'Телефон');await seed(b,'phone',2);
  await a.getByRole('button',{name:'Новое подключение',exact:true}).click();await a.getByRole('button',{name:'Создать приглашение',exact:true}).click();await expect(a.getByLabel('Код приглашения',{exact:true})).toHaveValue(/^recall-peer:1:/);
  const offerPromise=a.waitForEvent('download');await a.getByRole('button',{name:'Скачать файл приглашения',exact:true}).click();const offer=await offerPromise;
  await b.getByRole('button',{name:'Новое подключение',exact:true}).click();await b.getByRole('button',{name:'У меня есть код',exact:true}).click();
  const offerPath=await offer.path();if(!offerPath)throw Error('No invitation file');await b.getByLabel('Файл подключения Recall',{exact:true}).setInputFiles(offerPath);
  await expect(b.getByLabel('Ответный код',{exact:true})).toHaveValue(/^recall-peer:1:/);await expect(b.getByRole('dialog',{name:'Прямой обмен'}).getByText('Камера на ПК не нужна.',{exact:false})).toBeVisible();
  await a.getByLabel('Файл подключения Recall',{exact:true}).setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{"format":"recall-archive","version":1}')});await expect(a.getByRole('alert')).toContainText('не файл подключения');
  const answerPromise=b.waitForEvent('download');await b.getByRole('button',{name:'Скачать файл ответа',exact:true}).click();const answer=await answerPromise;const path=await answer.path();if(!path)throw Error('No answer file');
  await a.getByLabel('Файл подключения Recall',{exact:true}).setInputFiles(path);
  await expect(a.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();await expect(b.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();
  await finish(a,b);expect((await data(a)).events).toEqual((await data(b)).events);expect(await a.evaluate(()=>(window as any).__cameraRequests)).toBe(0);expect(await b.evaluate(()=>(window as any).__cameraRequests)).toBe(0);
 }finally{await ca.close();await cb.close();}
});

test('keeps a phone pairing alive while sharing its answer file and returning from another app after two minutes',async({browser})=>{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 await cb.addInitScript(()=>{
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:async(value:ShareData)=>{
   const file=value.files![0];(window as any).__answerFile={name:file.name,text:await file.text()};
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  }});
 });
 try{
  await b.clock.install();await boot(a,'ПК');await boot(b,'Телефон');await seed(b,'phone',2);
  await a.getByRole('button',{name:'Новое подключение',exact:true}).click();await a.getByRole('button',{name:'Создать приглашение',exact:true}).click();await expect(a.getByLabel('Код приглашения',{exact:true})).toHaveValue(/^recall-peer:1:/);
  await b.getByRole('button',{name:'Новое подключение',exact:true}).click();await b.getByRole('button',{name:'У меня есть код',exact:true}).click();await b.getByLabel('Вставить приглашение',{exact:true}).fill(await a.getByLabel('Код приглашения',{exact:true}).inputValue());await b.getByRole('button',{name:'Создать ответный код',exact:true}).click();
  await expect(b.getByLabel('Ответный код',{exact:true})).toHaveValue(/^recall-peer:1:/);await b.getByRole('button',{name:'Передать файл ответа',exact:true}).click();await expect.poll(()=>b.evaluate(()=>Boolean((window as any).__answerFile))).toBe(true);
  await b.clock.fastForward(120000);await b.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(b.locator('.peer-progress.warning')).toHaveCount(0);await expect(b.getByLabel('Ответный код',{exact:true})).toHaveValue(/^recall-peer:1:/);
  const file=await b.evaluate(()=>(window as any).__answerFile);await a.getByLabel('Файл подключения Recall',{exact:true}).setInputFiles({name:file.name,mimeType:'application/json',buffer:Buffer.from(file.text)});
  await expect(a.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();await expect(b.getByRole('button',{name:'Объединить данные',exact:true})).toBeVisible();await finish(a,b);expect((await data(a)).events).toEqual((await data(b)).events);
 }finally{await ca.close();await cb.close();}
});
