import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readLanCode} from '../../src/domain/lan-pairing.mjs';

async function meta(page:Page,key:string){return page.evaluate(key=>new Promise<any>((resolve,reject)=>{const open=indexedDB.open('recall-local-v1');open.onsuccess=()=>{const db=open.result,q=db.transaction('meta').objectStore('meta').get(key);q.onsuccess=()=>{resolve(q.result?.value);db.close();};q.onerror=()=>reject(q.error);};}),key);}
async function putMeta(page:Page,key:string,value:unknown){
 await page.evaluate(({key,value})=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open('recall-local-v1');open.onsuccess=()=>{const db=open.result,t=db.transaction('meta','readwrite');t.objectStore('meta').put({key,value});t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};}),{key,value});
}
async function boot(page:Page,url:string){
 await page.goto(url+'?page=devices');await expect(page.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();
 await putMeta(page,'devicePreferences',{syncAttempts:0,textSize:'comfortable',accent:'violet'});
 await expect.poll(async()=>(await meta(page,'devicePreferences'))?.syncAttempts).toBe(0);
}
async function sync(page:Page){const action=page.locator('.sidebar-sync-action'),mobile=!await action.isVisible();if(mobile)await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await action.click();await expect(action).toBeEnabled();if(mobile)await page.locator('.sidebar nav').getByRole('button',{name:'Устройства',exact:true}).click();}
async function invite(page:Page){
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pair/create'&&r.request().method()==='POST');
 const button=page.getByRole('button',{name:'Создать код подключения',exact:true});
 if(await button.isVisible())await button.click();else await page.getByRole('button',{name:'Обновить код подключения',exact:true}).click();
 const code=(await (await response).json()).code;await expect(page.locator('.persistent-sync>.pair-code')).toHaveText(code);return code;
}
async function add(page:Page,name:string,code:string){
 await page.getByRole('button',{name:'Добавить компьютер',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Добавить компьютер'});
 await expect(dialog.getByLabel(/Адрес Recall/)).not.toBeVisible();
 await dialog.getByLabel('Код подключения',{exact:true}).fill(code.toLowerCase().replace('-',' '));
 await dialog.getByText('Дополнительные параметры',{exact:true}).click();
 await dialog.getByLabel('Название (необязательно)',{exact:true}).fill(name);
 await dialog.getByRole('button',{name:'Подключить компьютер',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.saved-connection').filter({has:page.getByText(name,{exact:true})})).toBeVisible();
}
async function seed(page:Page,author:string,kind='card'){
 return page.evaluate(async({author,kind})=>new Promise<string>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{
  const db=r.result,t=db.transaction('events','readwrite'),store=t.objectStore('events'),q=store.getAll();let id='';
  q.onsuccess=()=>{const all=q.result;let clock=Math.max(0,...all.map(e=>e.clock));
   if(kind==='card'){
    const deck=author+'-deck';id=author+'-card';store.put({id:author+'-1',deviceId:author,seq:1,clock:++clock,deps:[],at:Date.now(),kind:'deck.put',entityId:deck,payload:{id:deck,name:author,color:'#7269dd',description:'',icon:'Aa',algorithm:'fsrs7',retention:.9,newPerDay:20}});
    store.put({id:author+'-2',deviceId:author,seq:2,clock:++clock,deps:[author+'-1'],at:Date.now(),kind:'card.put',entityId:id,payload:{id,deckId:deck,title:author,type:'basic',front:'Вопрос '+author,back:'Ответ',notes:'',aliases:[],tags:[]}});
   }else{
    id=author;const parent=all.find(e=>e.kind==='card.put');store.put({id:author,deviceId:author,seq:1,clock:++clock,deps:[parent.id],at:Date.now(),kind:'card.delete',entityId:parent.entityId,payload:{permanent:true}});
   }
  };t.oncomplete=()=>{db.close();resolve(id);};t.onerror=()=>reject(t.error);
 };}),{author,kind});
}
async function eventIDs(page:Page){return page.evaluate(()=>new Promise<string[]>(resolve=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('events').objectStore('events').getAllKeys();q.onsuccess=()=>{db.close();resolve(q.result.map(String).sort());};};}));}
async function imageAndReview(page:Page,author:string){return page.evaluate(async author=>{
 const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0)),id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const db=r.result,t=db.transaction(['events','attachments'],'readwrite'),store=t.objectStore('events'),q=store.getAll();q.onsuccess=()=>{
  const events=q.result,parent=events.find(e=>e.kind==='card.put'&&e.deviceId===author.replace('-media','-away-phone')),clock=Math.max(...events.map(e=>e.clock));
  t.objectStore('attachments').put({id,name:'Рисунок телефона.png',type:'image/png',blob:new Blob([bytes],{type:'image/png'})});
  store.put({id:author+'-1',deviceId:author,seq:1,clock:clock+1,deps:[parent.id],at:Date.now(),kind:'card.put',entityId:parent.entityId,payload:{...parent.payload,type:'choice',front:'Выбери рисунок',back:'',options:[{id:'image',text:'![Рисунок](asset:'+id+')',correct:true,feedback:'Нужный рисунок'},{id:'wrong',text:'Другой вариант',correct:false}]}});
  store.put({id:author+'-2',deviceId:author,seq:2,clock:clock+2,deps:[author+'-1'],at:Date.now(),kind:'review',entityId:parent.entityId,payload:{cardId:parent.entityId,cardVersion:author+'-1',rating:3,elapsedDays:0,durationMs:12000,context:'review',hints:false,model:'FSRS-7/rust-scalar-v1',paramsId:'fsrs7-defaults-v1',retention:.9,prediction:null,previousReviewIds:[],sessionId:author,choiceAnswer:{selectedIds:['image'],correct:true}}});
 };t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};});return id;
},author);}
async function asset(page:Page,id:string){return page.evaluate(id=>new Promise<any>(resolve=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('attachments').objectStore('attachments').get(id);q.onsuccess=()=>{const a=q.result;db.close();resolve(a?{id:a.id,name:a.name,size:a.blob.size}:null);};};}),id);}

test('pairs using one short code, finds a laptop after an address change and carries data home without new codes',async({browser})=>{
 const home=await browser.newContext({ignoreHTTPSErrors:true}),laptop=await browser.newContext({ignoreHTTPSErrors:true}),phone=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:428,height:926},isMobile:true,hasTouch:true});
 const a=await home.newPage(),b=await laptop.newPage(),p=await phone.newPage(),tag=randomUUID().slice(0,8);let pairRequests=0;
 const servers=new Map<string,'home'|'laptop'>();
 let away=false;
 for(const context of [home,laptop,phone]){
  context.on('request',r=>{if(new URL(r.url()).pathname==='/api/pair/accept')pairRequests++;});
  // Simulated DNS / network reachability, real requests to two independent HTTPS services.
  await context.route(/^https:\/\/recall-[a-z0-9]+\.local:\d+\/api\//,async route=>{
   const url=new URL(route.request().url()),target=servers.get(url.hostname);
   if(!target||away&&target==='home'&&context!==home){await route.abort();return;}
   const port=target==='home'?17443:17453;
   const address=target==='laptop'&&away?'localhost':'127.0.0.1';
   const response=await route.fetch({url:'https://'+address+':'+port+url.pathname,maxRedirects:0,timeout:5000});
   await route.fulfill({response});
  });
 }
 const showCode=async(page:Page,host:'home'|'laptop')=>{
  const code=await invite(page),locator=readLanCode(code);expect(locator).not.toBeNull();
  servers.set(new URL(locator!.origin).hostname,host);
  const health=await page.request.get(new URL('/api/health',page.url()).href);
  servers.set(new URL((await health.json()).localOrigin).hostname,host);
  return code;
 };
 try{
  await boot(a,'http://localhost:17887/');await boot(b,'http://localhost:17897/');await boot(p,'http://127.0.0.1:17890/Recall/');
  await seed(a,tag+'-home');await sync(a);
  await add(b,'Домашний ПК',await showCode(a,'home'));
  await add(p,'Домашний ПК',await showCode(a,'home'));
  await add(p,'Ноутбук',await showCode(b,'laptop'));
  expect(pairRequests).toBe(3);await sync(p);await sync(b);await sync(a);
  expect(await eventIDs(p)).toEqual(await eventIDs(a));expect(await eventIDs(b)).toEqual(await eventIDs(a));
  // Upgrade a saved, IP-only phone connection without replacing its token.
  const original=await meta(p,'connection'),legacy={...original,origin:'https://127.0.0.1:17443'};
  delete legacy.localOrigin;
  const all=await meta(p,'syncConnections');
  await putMeta(p,'connection',legacy);await putMeta(p,'syncConnections',all.map((c:any)=>c.serverId===legacy.serverId?legacy:c));
  await sync(p);const remembered=await meta(p,'connection');expect(remembered.localOrigin).toMatch(/\.local:/);expect(remembered.token===original.token).toBe(true);
  await phone.route('https://127.0.0.1:17443/**',route=>route.abort());
  // Home is out of reach for both roaming devices; the laptop name now resolves to a new address.
  away=true;
  await seed(p,tag+'-away-phone');const image=await imageAndReview(p,tag+'-media');await seed(b,tag+'-away-laptop');await sync(b);
  await putMeta(p,'devicePreferences',{syncAttempts:3,textSize:'comfortable',accent:'violet'});
  await p.reload();await expect(p.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();
  await expect.poll(()=>eventIDs(p)).toContain(tag+'-away-laptop-2');await sync(b);
  expect(await eventIDs(p)).toEqual(await eventIDs(b));expect((await eventIDs(a)).some(id=>id.includes('away-phone'))).toBe(false);
  await expect(p.locator('.sync-result')).toContainText('Недоступны: Домашний ПК');await expect(p.locator('.sync-result')).toContainText('Обновлены: Ноутбук');
  await seed(p,tag+'-purge','purge');await sync(p);await sync(b);
  await p.reload();await expect(p.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();expect((await meta(p,'syncConnections')).length).toBe(2);
  away=false;
  await sync(p);await sync(a);await sync(b);
  expect(await eventIDs(a)).toEqual(await eventIDs(b));expect(await eventIDs(a)).toEqual(await eventIDs(p));expect(await eventIDs(a)).toContain(tag+'-purge');expect(pairRequests).toBe(3);
  expect(await asset(a,image)).toEqual(await asset(p,image));expect(await asset(b,image)).toEqual(await asset(p,image));expect((await asset(a,image)).name).toBe('Рисунок телефона.png');expect(await eventIDs(a)).toContain(tag+'-media-2');
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);await p.screenshot({path:'test-results/ui/multi-device-phone.png',fullPage:true});
 }finally{await home.close();await laptop.close();await phone.close();}
});
