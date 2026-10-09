import { test, expect, devices, type Page } from '@playwright/test';

async function records(page:Page):Promise<any[]>{
 return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('events').objectStore('events').getAll();q.onsuccess=()=>{resolve(q.result.sort((a:any,b:any)=>a.clock-b.clock));db.close();};q.onerror=()=>reject(q.error);};
 }));
}
async function nav(page:Page,name:string){
 if(await page.locator('.mobile-header').isVisible())await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
 await page.locator('.sidebar').getByRole('button',{name:new RegExp('^'+name)}).click();
}
async function boot(page:Page,count=59){
 await page.context().route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Тест без ПК"}'}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.getByRole('button',{name:'Импорт .md',exact:true}).click();const dialog=page.getByRole('dialog');
 const source='---\ndeck: Материал к сроку\n---\n'+Array.from({length:count},(_,i)=>'## [basic] Пункт '+(i+1)+'\nВопрос '+(i+1)+'?\n:::answer\nОтвет '+(i+1)).join('\n\n');
 await dialog.getByLabel('Или вставь текст').fill(source);await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);
}
async function chooseTomorrow(page:Page){
 const date=await page.evaluate(()=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(Date.now()).map(v=>[v.type,v.value]));
  return new Date(Date.parse(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 });
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Дата',{exact:true}).click();
 const calendar=dialog.getByRole('group',{name:'Выбор даты'});
 await calendar.getByRole('combobox',{name:'Год',exact:true}).selectOption(date.slice(0,4));
 await calendar.getByRole('combobox',{name:'Месяц',exact:true}).selectOption(String(Number(date.slice(5,7))-1));
 await calendar.locator('[data-date="'+date+'"]').click();
}
async function createGoal(page:Page,name='Два дня'){
 await nav(page,'Цели');await page.getByRole('button',{name:'Добавить цель',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Название',{exact:true}).fill(name);await chooseTomorrow(page);return dialog;
}

test('uses automatic and editable goal pace above ordinary limits and persists it offline',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);const dialog=await createGoal(page);
 await expect(dialog.getByLabel('Темп новых карточек')).toHaveValue('auto');
 await expect(dialog.locator('.goal-pace-preview>strong')).toHaveText('30 новых в день');
 await expect(dialog.locator('.goal-pace-preview')).toContainText('59 из 59');
 await dialog.getByRole('button',{name:'Сохранить цель',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.goal-pace-metric strong')).toHaveText('30');
 await page.getByRole('button',{name:'Учиться по цели',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 30');
 await page.getByRole('button',{name:'Завершить',exact:true}).click();await nav(page,'Сегодня');
 await page.getByRole('button',{name:'Начать повторение',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 20');
 await page.getByRole('button',{name:'Завершить',exact:true}).click();await nav(page,'Цели');
 await page.getByRole('button',{name:'Изменить темп',exact:true}).click();
 await dialog.getByLabel('Темп новых карточек').selectOption('manual');
 await dialog.getByLabel('Новых в день для этой цели').fill('20');await dialog.getByLabel('Минут в день',{exact:true}).fill('1');
 await expect(dialog.locator('.goal-pace-preview .notice')).toHaveCount(2);
 await dialog.getByLabel('Новых в день для этой цели').fill('50');await dialog.getByLabel('Минут в день',{exact:true}).fill('60');
 await expect(dialog.locator('.goal-pace-preview>strong')).toHaveText('50 новых в день');
 await dialog.getByRole('button',{name:'Сохранить цель',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.context().setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();await nav(page,'Цели');
 await expect(page.locator('.goal-pace-metric strong')).toHaveText('50');await expect(page.locator('.goal-pace-metric')).toContainText('вручную');
 await page.getByRole('button',{name:'Учиться по цели',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 50');
 const history=await records(page);expect(history.filter(e=>e.kind==='goal.put').at(-1).payload.newPerDay).toBe(50);
 expect(history.filter(e=>e.kind==='settings.put')).toHaveLength(0);expect(errors).toEqual([]);
});

test('keeps phone controls within the screen and resumes first assessments after using the manual new allowance',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined,viewport:{width:320,height:568},screen:{width:320,height:568}} as any),page=await context.newPage();
 try{
  await boot(page,6);await nav(page,'Настройки');await page.getByLabel('Размер текста').selectOption('extra');await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size','extra');
  const dialog=await createGoal(page,'Темп на телефоне');
  await dialog.getByLabel('Темп новых карточек').selectOption('manual');await dialog.getByLabel('Новых в день для этой цели').fill('2');
  for(const width of [320,375,428]){
   await page.setViewportSize({width,height:926});
   expect(await dialog.locator('.form-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   expect(await dialog.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('input:not([type=checkbox]),select,.date-trigger,footer button')].every(control=>{const r=control.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right;});})).toBe(true);
  }
  await page.setViewportSize({width:428,height:926});await dialog.locator('.goal-pace-preview').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/ui/goal-pace-phone-editor.png'});
  await dialog.getByRole('button',{name:'Сохранить цель',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/ui/goal-pace-phone.png',fullPage:true});
  await page.getByRole('button',{name:'Учиться по цели',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 2');
  await page.getByRole('button',{name:'Прочитал — проверить позже',exact:true}).click();
  await expect(page.locator('.question-markdown')).toHaveText('Вопрос 2?');await page.getByRole('button',{name:'Прочитал — проверить позже',exact:true}).click();
  await expect(page.locator('.session-introduction')).toHaveCount(0);await page.getByRole('button',{name:'Завершить',exact:true}).click();
  await expect(page.locator('.goal-card .goal-pace-details')).toContainText('На сегодня ещё 0 новых');
  await expect(page.locator('.goal-card .goal-pace-details')).toContainText('без первой оценки: 2');
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();await nav(page,'Цели');
  await expect(page.locator('.goal-card .goal-pace-details')).toContainText('На сегодня ещё 0 новых');
  await page.getByRole('button',{name:'Учиться по цели',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 2');
  await expect(page.locator('.session-introduction')).toHaveCount(0);await expect(page.getByRole('button',{name:/Показать ответ/})).toBeVisible();
  expect((await records(page)).filter(e=>e.kind==='study.introduce')).toHaveLength(2);
 }finally{await context.close();}
});
