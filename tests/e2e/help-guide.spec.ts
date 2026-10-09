import { test, expect, devices, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DAY, schedule } from '../../src/domain/fsrs';
import { exampleMemory } from '../../src/ui/help-memory';

test.use({actionTimeout:15000});
async function navigateHelp(page:Page) {
 const menu=page.getByRole('button',{name:'Открыть меню',exact:true});
 if(await menu.isVisible())await menu.click();
 await page.locator('.sidebar nav').getByRole('button',{name:/^Справка/}).click();
}
async function help(page:Page) {
 await page.context().route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Тест без ПК"}'}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await navigateHelp(page);
 await expect(page.getByRole('heading',{name:'Как устроен Recall',exact:true})).toBeVisible();
}
async function savedEvents(page:Page) {
 return page.evaluate(()=>new Promise<string>((resolve,reject)=>{
  const req=indexedDB.open('recall-local-v1');req.onsuccess=()=>{const db=req.result,query=db.transaction('events').objectStore('events').getAll();query.onsuccess=()=>{resolve(JSON.stringify(query.result));db.close();};query.onerror=()=>reject(query.error);};
 }));
}
async function step(page:Page,name:string) {
 await page.getByRole('navigation',{name:'Шаги знакомства'}).getByRole('button',{name:new RegExp(name+'$')}).click();
}
async function algorithms(page:Page) {
 await page.getByRole('navigation',{name:'Темы справки'}).getByRole('button',{name:/Алгоритмы повторения/}).click();
 await expect(page.getByRole('region',{name:'Лаборатория алгоритмов'})).toBeVisible();
}
async function fits(page:Page) {
 const result=await page.locator('.wiki-article').evaluate(article=>{
  const elements=[article,...article.querySelectorAll('.help-step-nav,.help-example,.help-callouts,.help-rating,.help-rating strong,.help-lab-controls,.help-chart,.help-algorithm-section,select,input,summary')];
  return elements.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {class:el.className,left:r.left,right:r.right,client:el.clientWidth,scroll:el.scrollWidth,width:innerWidth};});
 });
 for(const box of result){expect(box.left,JSON.stringify(box)).toBeGreaterThanOrEqual(0);expect(box.right,JSON.stringify(box)).toBeLessThanOrEqual(box.width+1);expect(box.scroll,JSON.stringify(box)).toBeLessThanOrEqual(box.client+2);}
}

test('beginner examples explain real controls without recording learning or settings',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await help(page);const before=await savedEvents(page);
 await expect(page.getByRole('region',{name:'Пример экрана Сегодня'})).toContainText('12');
 await page.screenshot({path:'test-results/ui/help-desktop-today.png',fullPage:true});
 await page.getByRole('region',{name:'Пример экрана Сегодня'}).getByRole('button',{name:'Начать повторение'}).click();
 const card=page.getByRole('region',{name:'Учебная карточка'});
 await card.getByRole('button',{name:/Прочитал/}).click();await expect(card.getByText('Стойкий, способный восстановиться.',{exact:true})).toBeHidden();
 await card.getByRole('button',{name:'Показать ответ',exact:true}).click();
 await expect(card.getByRole('group',{name:'Оценки в учебном примере'}).getByRole('button')).toHaveCount(4);
 await card.getByRole('button',{name:'Легко',exact:true}).click();await expect(card.getByRole('status')).toContainText('Легко → через');
 await expect(page.locator('.session')).toHaveCount(0);
 await step(page,'Колода и цель');const goal=page.getByRole('region',{name:'Пример цели и режимов'});
 await expect(goal).toContainText('30 новых в день');await goal.getByRole('button',{name:'Практика всех карточек',exact:true}).click();await expect(goal.getByRole('status')).toContainText('все 59');
 await goal.getByRole('button',{name:'Пробная проверка',exact:true}).click();await expect(goal.getByRole('status')).toContainText('тоже сохраняются и меняют расписание');
 await step(page,'Настройки');const settings=page.getByRole('region',{name:'Пример влияния настроек'}),interval=settings.getByTestId('guide-settings-interval');
 const initial=Number(await interval.getAttribute('data-days'));await settings.getByLabel('Новых в день',{exact:true}).selectOption('40');await settings.getByLabel('Бюджет сессии, мин',{exact:true}).selectOption('10');
 await expect(settings.getByRole('status')).toContainText('40 новых');await expect(settings.getByRole('status')).toContainText('10 мин');
 expect(Number(await interval.getAttribute('data-days'))).toBe(initial);
 await settings.getByRole('slider').fill('97');expect(Number(await interval.getAttribute('data-days'))).toBeLessThan(initial);
 await step(page,'Устройства');const offline=page.getByRole('region',{name:'Пример работы без компьютера'});
 await offline.getByRole('button',{name:'Выключить ПК в примере'}).click();await expect(offline).toContainText('Учёба работает');await expect(offline.getByRole('status')).toContainText('расчёт интервалов');
 await page.getByRole('button',{name:'Подробнее в справке'}).click();await expect(page.getByRole('heading',{name:'Офлайн и синхронизация',exact:true})).toBeVisible();
 expect(await savedEvents(page)).toBe(before);expect(errors).toEqual([]);
});

test('algorithm lab uses actual scheduling, responds to ratings and explains deep search results',async({page})=>{
 await help(page);const before=await savedEvents(page);await algorithms(page);
 const lab=page.getByRole('region',{name:'Лаборатория алгоритмов'}),interval=lab.getByTestId('lab-interval');
 const expected=(retention:number,algorithm:'fsrs7'|'fsrs6',elapsed=7,rating:1|2|3|4=3)=>{
  const memory=exampleMemory(algorithm),at=memory.lastAt+elapsed*DAY;return (schedule(memory,rating,at,elapsed,retention,algorithm).due-at)/DAY;
 };
 const value=async()=>Number(await interval.getAttribute('data-days'));
 expect(Math.abs(await value()-expected(.9,'fsrs7'))/expected(.9,'fsrs7')).toBeLessThan(.001);
 await page.screenshot({path:'test-results/ui/help-desktop-algorithms.png',fullPage:true});
 const at90=await value();await lab.getByRole('slider').fill('97');expect(await value()).toBeLessThan(at90);
 expect(Math.abs(await value()-expected(.97,'fsrs7'))/expected(.97,'fsrs7')).toBeLessThan(.001);
 const curve=await lab.getByTestId('lab-curve').getAttribute('d');
 await lab.getByRole('button',{name:'Не вспомнил',exact:true}).click();expect(await value()).toBeLessThan(at90);expect(await lab.getByTestId('lab-curve').getAttribute('d')).not.toBe(curve);
 await lab.getByLabel('После прошлого ответа',{exact:true}).selectOption('0.125');await lab.getByLabel('Модель',{exact:true}).selectOption('fsrs6');
 await lab.getByRole('button',{name:'Нормально',exact:true}).click();expect(await value()).toBeCloseTo(expected(.97,'fsrs6',.125),5);
 await lab.getByText('Что хранится в этом примере?',{exact:true}).click();await expect(lab).toContainText('округляет прошедшее время');
 await page.screenshot({path:'test-results/ui/help-desktop-fsrs6.png',fullPage:true});
 await page.getByRole('textbox',{name:'Поиск по справке'}).fill('34 общих параметра');
 const chapter=page.locator('.help-algorithm-section').filter({hasText:'FSRS-7: трудность и две компоненты памяти'});
 await expect(chapter).toHaveAttribute('open','');await expect(chapter.getByText('медленная устойчивость FSRS-7 сама по себе не означает «повторить через столько дней»',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Поиск по справке'}).fill('Лейтнер');await algorithms(page);
 await expect(page.locator('.help-algorithm-section').filter({hasText:'Лейтнер: семь коробок'})).toHaveAttribute('open','');
 await expect(page.locator('.wiki-article')).toContainText('1, 2, 4, 8, 16, 32 и 64 дня');
 expect(await savedEvents(page)).toBe(before);
});

test('help remains usable offline on a phone, at narrow widths and with large dark text',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max']});const page=await context.newPage();
 try{
  await help(page);const before=await savedEvents(page);await context.setOffline(true);await page.reload();
  await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await navigateHelp(page);
  for(const name of ['Сегодня','Карточка','Колода и цель','Настройки','Устройства']){await step(page,name);await fits(page);}
  await step(page,'Карточка');const card=page.getByRole('region',{name:'Учебная карточка'});await card.getByRole('button',{name:/Уже знаю/}).click();await card.getByRole('button',{name:'Показать ответ'}).click();
  await fits(page);await page.screenshot({path:'test-results/ui/help-phone-card.png',fullPage:true});
  await algorithms(page);const lab=page.getByRole('region',{name:'Лаборатория алгоритмов'});
  await lab.getByRole('slider').fill('95');await expect(lab).toContainText('Цель: 95%');await fits(page);
  await page.screenshot({path:'test-results/ui/help-phone-algorithms.png',fullPage:true});
  await page.setViewportSize({width:320,height:750});await page.evaluate(()=>{document.documentElement.dataset.textSize='extra';document.documentElement.dataset.theme='dark';document.documentElement.dataset.accent='emerald';});
  await fits(page);await page.screenshot({path:'test-results/ui/help-phone-narrow-dark.png',fullPage:true});
  for(const title of ['FSRS-7: трудность и две компоненты памяти','Как правильно выбирать четыре оценки','Ранние повторы, просрочка и наши минимальные интервалы']){
   const section=page.locator('.help-algorithm-section').filter({hasText:title});await section.locator('summary').click();await expect(section).toHaveAttribute('open','');await fits(page);await section.locator('summary').click();
  }
  await page.getByRole('navigation',{name:'Темы справки'}).getByRole('button',{name:/Как устроен Recall/}).click();
  for(const name of ['Сегодня','Карточка','Колода и цель','Настройки','Устройства']){await step(page,name);await fits(page);}
  await page.getByRole('textbox',{name:'Поиск по справке'}).fill('Начало учебного дня');
  await expect(page.locator('.wiki-article')).toContainText('когда обновляется суточный лимит');await expect(page.getByRole('button',{name:'Открыть интерактивные примеры'})).toBeVisible();
  expect(await savedEvents(page)).toBe(before);
 }finally{await context.close();}
});

test('downloaded help includes explanations of interactive examples and full algorithm chapters',async({page})=>{
 await help(page);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать справку',exact:true}).click();const file=await downloaded;
 expect(file.suggestedFilename()).toBe('Recall — мини-вики.md');
 const text=readFileSync((await file.path())!,'utf8');
 for(const expected of ['Пять учебных экранов','34 общих параметра','21 общий параметр','400 подходящих повторений','1, 2, 4, 8, 16, 32 и 64 дня','0,125 дня','не создаёт оценку памяти','model_v7.rs','Корзины и резервные копии','4bc0a0979f95dd01cc653031b6f2a01429e4c32b'])expect(text).toContain(expected);
});
