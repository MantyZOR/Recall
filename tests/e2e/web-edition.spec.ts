import {test,expect,devices} from '@playwright/test';
test('public web edition boots without a PC, caches its subpath and exposes a compact phone pairing flow',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],viewport:{width:428,height:926}}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:17890/Recall/?page=devices');await expect(page.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await expect(page.getByText('Подключение через службу на ПК',{exact:true})).toHaveCount(0);
  const manifest=await (await page.request.get('http://127.0.0.1:17890/Recall/manifest.webmanifest')).json();expect(manifest.scope).toBe('/Recall/');
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.getByText('Дополнительно: разовый прямой обмен',{exact:true}).click();await page.getByRole('button',{name:'Новое подключение',exact:true}).click();await page.getByRole('button',{name:'Создать приглашение',exact:true}).click();await expect(page.getByLabel('Код приглашения',{exact:true})).toHaveValue(/^recall-peer:1:/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await expect(page.getByRole('img',{name:'QR прямого обмена'})).toBeVisible();
  await page.screenshot({path:'test-results/ui/peer-phone.png',fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();expect(errors).toEqual([]);
 }finally{await context.close();}
});
