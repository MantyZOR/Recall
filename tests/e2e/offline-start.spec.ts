import { test, expect, devices, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function records(page:Page):Promise<any[]>{
 return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const open=indexedDB.open('recall-local-v1');
  open.onsuccess=()=>{const db=open.result,q=db.transaction('events').objectStore('events').getAll();q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};
 }));
}
async function prime(page:Page,topic:string){
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.getByRole('button',{name:'Импорт .md',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Или вставь текст').fill('---\ndeck: '+topic+'\n---\n## [input] '+topic+'\nКороткий локальный вопрос\n:::answer\nответ');
 await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 const card=(await records(page)).find(e=>e.kind==='card.put'&&e.payload.title===topic);
 return card.entityId;
}
async function answer(page:Page,topic:string){
 await page.locator('.mobile-bottom').getByRole('button',{name:'Колоды',exact:true}).click();
 await page.locator('.deck-tile').filter({hasText:topic}).getByRole('button',{name:/Повторить/}).click();
 if(await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).count())await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();
 await page.getByPlaceholder('Твой ответ…').fill('ответ');
 await page.getByRole('button',{name:/Показать ответ/}).click();
 await page.getByRole('button',{name:/Нормально/}).click();
}
test('opens cached Recall while Wi-Fi stays online and the PC never responds, then syncs saved answers',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),page=await context.newPage();
 let release=()=>{},blocked=true;const gate=new Promise<void>(resolve=>{release=resolve;});
 try{
  const topic='Wi-Fi включён, ПК недоступен '+randomUUID().slice(0,8),cardId=await prime(page,topic);
  const pending:string[]=[];
  await context.route('**/*',async route=>{
   if(!blocked){await route.continue().catch(()=>{});return;}
   pending.push(new URL(route.request().url()).pathname);
   await gate;await route.continue().catch(()=>{});
  });
  expect(await page.evaluate(()=>navigator.onLine)).toBe(true);
  const response=await page.reload({waitUntil:'domcontentloaded',timeout:5000});
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible({timeout:5000});
  expect(await page.evaluate(()=>navigator.onLine)).toBe(true);
  await expect.poll(()=>pending.some(path=>path.startsWith('/api/'))).toBe(true);
  expect(pending).not.toContain('/');
  await answer(page,topic);
  const review=(await records(page)).find(e=>e.kind==='review'&&e.entityId===cardId);
  expect(review).toBeTruthy();
  blocked=false;release();
  await page.getByRole('button',{name:/Вернуться к сегодня/}).click();
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
  await page.locator('.sidebar nav').getByRole('button',{name:/^Устройства/}).click();
  const sync=page.getByRole('button',{name:'Синхронизировать',exact:true});
  await expect(sync).toBeEnabled();await sync.click();await expect(sync).toBeEnabled();
  await expect.poll(()=>page.evaluate(({device,seq})=>new Promise<boolean>(resolve=>{
   const open=indexedDB.open('recall-local-v1');
   open.onsuccess=()=>{const db=open.result,q=db.transaction('meta').objectStore('meta').get('connection');q.onsuccess=()=>{resolve((q.result?.value?.ack?.[device]||0)>=seq);db.close();};};
  }),{device:review.deviceId,seq:review.seq})).toBe(true);
 }finally{blocked=false;release();await context.close();}
});

test('opens saved cards when an uncached memory module hangs and uses the local calculation fallback',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),page=await context.newPage();
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 try{
  const topic='Локальный расчёт '+randomUUID().slice(0,8),cardId=await prime(page,topic);
  await page.evaluate(async()=>{
   for(const name of await caches.keys())if(name.startsWith('recall-shell-'))await (await caches.open(name)).delete('/fsrs7.wasm');
  });
  let held=0;
  await context.route('**/fsrs7.wasm',async route=>{held++;await gate;await route.continue().catch(()=>{});});
  await page.reload({waitUntil:'domcontentloaded',timeout:5000});
  await expect(page.getByText('Открываем Recall…',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible({timeout:5000});
  expect(held).toBeGreaterThan(0);expect(await page.evaluate(()=>navigator.onLine)).toBe(true);
  await answer(page,topic);
  const review=(await records(page)).find(e=>e.kind==='review'&&e.entityId===cardId);
  expect(review?.payload.rating).toBe(3);
 }finally{release();await context.close();}
});

test('shows a bounded recovery page if the application cache is missing, then restores offline opening',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),page=await context.newPage();
 let release=()=>{},blocked=true;const gate=new Promise<void>(resolve=>{release=resolve;});
 try{
  const topic='Восстановление сохранённой версии '+randomUUID().slice(0,8),cardId=await prime(page,topic);
  await page.evaluate(async()=>{
   for(const name of await caches.keys())if(name.startsWith('recall-shell-')){
    const cache=await caches.open(name);await cache.delete('/index.html');await cache.delete('/');
   }
   const unrelated=await caches.open('another-application');
   await unrelated.put('/index.html',new Response('<h1>Другая страница</h1>',{headers:{'Content-Type':'text/html'}}));
  });
  await context.route('**/*',async route=>{
   if(blocked){await gate;}
   await route.continue().catch(()=>{});
  });
  const response=await page.reload({waitUntil:'domcontentloaded',timeout:7000});
  expect(response?.status()).toBe(503);expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading',{name:'Нужно загрузить Recall',exact:true})).toBeVisible();
  await expect(page.getByText('На этом устройстве не найдена сохранённая версия приложения.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>navigator.onLine)).toBe(true);
  expect((await records(page)).some(e=>e.entityId===cardId)).toBe(true);
  blocked=false;release();
  await page.getByRole('link',{name:'Попробовать снова',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await expect.poll(()=>page.evaluate(async()=>{
   const names=(await caches.keys()).filter(name=>name.startsWith('recall-shell-'));
   for(const name of names)if(await (await caches.open(name)).match('/index.html'))return true;
   return false;
  })).toBe(true);
  await context.setOffline(true);await page.reload();
  await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  expect((await records(page)).some(e=>e.entityId===cardId)).toBe(true);
 }finally{blocked=false;release();await context.close();}
});
