import { test,expect,devices } from '@playwright/test';
test('opens the device page from the launcher, switches installation platforms and explains reinstalling',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?page=devices');await expect(page.getByRole('heading',{name:'Рядом. На связи.'})).toBeVisible();
 await page.getByText('Подключение через службу на ПК',{exact:true}).click();await expect(page.getByRole('heading',{name:'Первое подключение телефона'})).toBeVisible();
 await page.getByRole('button',{name:'Android',exact:true}).click();
 await expect(page.getByRole('link',{name:'Скачать сертификат для Android'})).toHaveAttribute('href','http://127.0.0.1:17888/ca.crt');
 await expect(page.getByRole('heading',{name:'Добавь приложение из Chrome'})).toBeVisible();
 await page.getByText('Если удалил приложение или сменил телефон',{exact:true}).click();await expect(page.locator('.phone-reinstall')).toContainText('отключи старое сопряжение');
 await page.getByRole('button',{name:'iPhone',exact:true}).click();await expect(page.getByRole('heading',{name:'Включи доверие и добавь приложение'})).toBeVisible();
 await page.screenshot({path:'test-results/ui/phone-setup-desktop.png',fullPage:true});expect(errors).toEqual([]);
});
test('serves a usable bootstrap guide on Android and studies cached cards without the PC',async({browser})=>{
 const context=await browser.newContext({...devices['Pixel 7'],viewport:{width:393,height:851},screen:{width:393,height:851}}),page=await context.newPage();
 try{
  await page.goto('http://127.0.0.1:17888/');await expect(page.getByRole('heading',{name:'Подключи телефон к Recall'})).toBeVisible();
  await page.getByText('Android · Chrome',{exact:true}).click();await expect(page.getByRole('link',{name:'Скачать сертификат Recall Local CA'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/ui/android-bootstrap.png',fullPage:true});
  await context.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Без ПК"}'}));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await page.getByRole('button',{name:'Импорт .md',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Или вставь текст').fill('---\ndeck: Android офлайн\n---\n## [basic] Слово\nhello\n:::answer\nпривет');
  await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await page.getByRole('button',{name:'Начать повторение',exact:true}).click();await expect(page.locator('.answer-section')).toContainText('привет');
  await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await page.getByRole('button',{name:/Показать ответ/}).click();await page.locator('.rating-3').click();
  await expect(page.locator('.session-summary')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 }finally{await context.close();}
});
