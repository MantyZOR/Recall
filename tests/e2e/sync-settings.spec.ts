import { test, expect, devices, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
async function meta(page:Page,key:string):Promise<any>{
 return page.evaluate(key=>new Promise<any>((resolve,reject)=>{
  const open=indexedDB.open('recall-local-v1');open.onsuccess=()=>{const db=open.result,q=db.transaction('meta').objectStore('meta').get(key);q.onsuccess=()=>{resolve(q.result?.value);db.close();};q.onerror=()=>reject(q.error);};
 }),key);
}
async function menu(page:Page){await page.getByRole('button',{name:'Открыть меню',exact:true}).click({timeout:10000});}
async function settings(page:Page){await menu(page);await page.locator('.settings-nav').click();}
async function importCard(page:Page,title:string){
 await page.getByRole('button',{name:'Импорт .md',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Или вставь текст').fill('---\ndeck: '+title+'\n---\n## [basic] '+title+'\nВопрос\n:::answer\nОтвет');
 await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);
}
async function boot(page:Page){
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await expect.poll(async()=>(await meta(page,'connection'))?.lastSync||0).toBeGreaterThan(0);
}
test('stops after three failed exchanges, keeps the pause after reopening, and resumes only after a successful sidebar click',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),page=await context.newPage();
 let attempts=0,available=false;
 try{
  await page.clock.install();await boot(page);
  await context.route('**/api/**',async route=>{
   if(new URL(route.request().url()).pathname==='/api/sync')attempts++;
   if(available)await route.continue();else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'ПК выключен'})});
  });
  await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await page.clock.fastForward(1500);await expect.poll(async()=>(await meta(page,'syncRetryState'))?.failures).toBe(1);
  await page.clock.fastForward(11000);await expect.poll(async()=>(await meta(page,'syncRetryState'))?.failures).toBe(2);
  await page.clock.fastForward(31000);await expect.poll(async()=>(await meta(page,'syncRetryState'))?.failures).toBe(3);
  expect(attempts).toBe(3);
  await importCard(page,'Ждёт обмена '+randomUUID().slice(0,8));
  await page.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.fastForward(600000);expect(attempts).toBe(3);
  await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await page.clock.fastForward(600000);expect(attempts).toBe(3);expect((await meta(page,'syncRetryState')).failures).toBe(3);
  await menu(page);await expect(page.locator('.sidebar-sync small')).toContainText('Автообмен на паузе');
  await page.screenshot({path:'test-results/ui/mobile-sync-paused.png'});
  available=true;await page.getByRole('button',{name:'Синхронизировать сейчас',exact:true}).click();
  await expect.poll(async()=>(await meta(page,'syncRetryState'))?.failures).toBe(0);expect(attempts).toBeGreaterThan(3);
  await expect(page.locator('.sidebar-sync small')).toHaveText('На твоих устройствах');
 }finally{await context.close();}
});
test('saves readable text sizes and manual-only synchronization per device without resuming automatic requests',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),page=await context.newPage();
 let attempts=0;let second:Awaited<ReturnType<typeof browser.newContext>>|undefined;
 try{
  await page.clock.install();await boot(page);
  await settings(page);
  await expect(page.getByLabel('Попытки автосинхронизации')).toHaveValue('3');
  await page.getByLabel('Попытки автосинхронизации').selectOption('0');
  await page.getByLabel('Размер текста').selectOption('extra');
  await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
  await expect(page.getByText('Настройки сохранены',{exact:true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-text-size','extra');
  await expect.poll(()=>meta(page,'devicePreferences')).toEqual({syncAttempts:0,textSize:'extra',accent:'violet'});
  await context.route('**/api/**',async route=>{if(new URL(route.request().url()).pathname==='/api/sync')attempts++;await route.continue();});
  await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await importCard(page,'Ручной обмен '+randomUUID().slice(0,8));
  await page.clock.fastForward(600000);expect(attempts).toBe(0);
  await menu(page);await expect(page.locator('.sidebar-sync small')).toHaveText('Обмен только по кнопке');
  await page.getByRole('button',{name:'Синхронизировать сейчас',exact:true}).click();
  await expect(page.getByRole('button',{name:'Синхронизировать сейчас',exact:true})).toBeEnabled();
  expect(attempts).toBeGreaterThan(0);const count=attempts;
  await page.clock.fastForward(600000);expect(attempts).toBe(count);
  await page.locator('.settings-nav').click();await expect(page.getByLabel('Размер текста')).toHaveValue('extra');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/ui/mobile-settings-extra.png',fullPage:true});
  expect(await page.locator('.device-settings label').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(17);
  for(const name of ['Сегодня','Колоды','Карточки','Цели','Статистика','Устройства','Справка']){
   await menu(page);await page.locator('.sidebar nav').getByRole('button',{name:new RegExp('^'+name)}).click();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),name).toBe(true);
  }
  for(const width of [360,320]){
   const narrow=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined,viewport:{width,height:926},screen:{width,height:926}} as any),p=await narrow.newPage();
   try{
    await boot(p);await settings(p);await p.getByLabel('Размер текста').selectOption('extra');
    await p.getByLabel('Попытки автосинхронизации').selectOption('0');
    await p.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
    await expect(p.getByText('Настройки сохранены',{exact:true})).toBeVisible();
    await expect(p.locator('html')).toHaveAttribute('data-text-size','extra');
    for(const name of ['Сегодня','Колоды','Карточки','Цели','Статистика','Устройства','Справка']){
     await menu(p);await p.locator('.sidebar nav').getByRole('button',{name:new RegExp('^'+name)}).click();
     const layout=await p.evaluate(()=>{
     const w=document.documentElement.clientWidth;
     return {width:w,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll<HTMLElement>('body *')].map(el=>({class:String(el.className),right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,overflow:getComputedStyle(el).overflowX})).filter(r=>r.right>w+1).slice(-20)};
    });
    expect(layout.scroll,width+' '+name+' '+JSON.stringify(layout)).toBeLessThanOrEqual(layout.width+1);
    }
    await p.screenshot({path:'test-results/ui/mobile-extra-'+width+'.png',fullPage:true});
   }finally{await narrow.close();}
  }
  second=await browser.newContext();const other=await second.newPage();await boot(other);
  await other.locator('.settings-nav').click();await expect(other.getByLabel('Попытки автосинхронизации')).toHaveValue('3');
  await expect(other.getByLabel('Размер текста')).toHaveValue('comfortable');
 }finally{await second?.close();await context.close();}
});
