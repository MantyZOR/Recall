import { test,expect,devices } from '@playwright/test';
test('opens the device page from the launcher, switches installation platforms and explains reinstalling',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?page=devices');await expect(page.getByRole('heading',{name:'Устройства и синхронизация'})).toBeVisible();
 await expect(page.getByText('Сертификат для первого подключения',{exact:true})).toBeVisible();
 await page.getByText('Сертификат для первого подключения',{exact:true}).click();
 const setup=page.locator('.phone-setup');
 await expect(setup.locator('a.local-address')).toHaveAttribute('href',/^http:\/\/recall-[0-9a-hjkmnp-tv-z]{5}\.local:17888$/);
 await setup.getByRole('button',{name:'Android',exact:true}).click();await expect(setup).toContainText('в Chrome страницу настройки');
 await setup.getByRole('button',{name:'iPhone',exact:true}).click();await expect(setup).toContainText('включи полное доверие');
 await page.screenshot({path:'test-results/ui/phone-setup-desktop.png',fullPage:true});expect(errors).toEqual([]);
 await page.goto('http://127.0.0.1:17888/');
 await page.getByText('Если удалил приложение или сменил телефон',{exact:true}).click();
 await expect(page.getByText('На ПК возвращаются только данные', {exact:false})).toBeVisible();
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
