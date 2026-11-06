import {test,expect,devices} from '@playwright/test';
test('public web edition boots without a PC, caches its subpath and exposes a compact phone pairing flow',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],viewport:{width:428,height:926}}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:17890/Recall/?page=devices');await expect(page.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await expect(page.getByRole('button',{name:'Создать код подключения',exact:true})).toHaveCount(0);
  const manifest=await (await page.request.get('http://127.0.0.1:17890/Recall/manifest.webmanifest')).json();expect(manifest.scope).toBe('/Recall/');
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Устройства и синхронизация',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await expect(page.getByText(/разовый прямой обмен/i)).toHaveCount(0);
  await page.getByRole('button',{name:'Добавить компьютер',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Добавить компьютер',exact:true});
  await dialog.getByLabel('Код подключения',{exact:true}).fill('H7J2K-406281');
  await expect(dialog.getByRole('button',{name:'Подключить компьютер',exact:true})).toBeEnabled();
  await expect(dialog.getByLabel(/Адрес Recall/)).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/ui/sync-code-phone.png',fullPage:true});
  await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();expect(errors).toEqual([]);
 }finally{await context.close();}
});
