import { test, expect, devices, type Page, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { unzipSync, strFromU8 } from 'fflate';
const MD='---\ndeck: Проверка Markdown\n---\n\n## [input] Слово\nresilient\n:::answer\nстойкий\n:::aliases\nустойчивый\n\n## [basic] Производная\nЧему равна производная $x^n$?\n:::answer\n$$\\frac{d}{dx}x^n=nx^{n-1}$$\n\n## [basic] Код\nЧто делает код?\n:::answer\n```python\nprint(42)\n```\n\n## [cloze] Два пропуска\n{{c1::Один}} и {{c2::Два}}\n';
let context:BrowserContext,page:Page;
async function nav(p:Page,name:string){await p.locator('.sidebar nav').getByRole('button',{name:new RegExp('^'+name)}).click();}
async function events(p:Page):Promise<any[]>{return p.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,q=d.transaction('events').objectStore('events').getAll();q.onsuccess=()=>{resolve(q.result);d.close();};q.onerror=()=>reject(q.error);};}));}
async function meta(p:Page,key:string):Promise<any>{return p.evaluate(key=>new Promise<any>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,q=d.transaction('meta').objectStore('meta').get(key);q.onsuccess=()=>{resolve(q.result?.value);d.close();};q.onerror=()=>reject(q.error);};}),key);}
async function putMeta(p:Page,key:string,value:any){await p.evaluate(({key,value})=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,t=d.transaction('meta','readwrite');t.objectStore('meta').put({key,value});t.oncomplete=()=>{resolve();d.close();};t.onerror=()=>reject(t.error);};}),{key,value});}
async function importMD(p:Page,source:string){await nav(p,'Сегодня');await p.getByRole('button',{name:'Импорт .md',exact:true}).click();const dialog=p.getByRole('dialog');await dialog.getByLabel('Или вставь текст').fill(source);await expect(dialog.locator('.error-text')).toHaveCount(0);await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);}
async function sync(p:Page){await nav(p,'Устройства');await p.getByRole('button',{name:'Синхронизировать',exact:true}).click();await expect(p.getByRole('button',{name:'Синхронизировать',exact:true})).toBeEnabled();await expect.poll(async()=>Boolean((await meta(p,'connection'))?.lastSync)).toBe(true);}
async function editAnswer(p:Page,title:string,answer:string){await nav(p,'Карточки');await p.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');await p.locator('.card-question').filter({hasText:title}).click();const d=p.getByRole('dialog');await d.getByRole('textbox',{name:'Ответ',exact:true}).fill(answer);await d.getByRole('button',{name:'Сохранить карточку',exact:true}).click();await expect(d).toHaveCount(0);}
async function secure(route:string,body:any,auth=''):Promise<any>{return new Promise((resolve,reject)=>{const bytes=Buffer.from(JSON.stringify(body));const r=httpsRequest({hostname:'localhost',port:17443,path:'/api/'+route,method:'POST',ca:readFileSync('test-results/e2e-service/certs/rootCA.pem'),headers:{'Content-Type':'application/json','Content-Length':bytes.length,...(auth?{Authorization:'Bearer '+auth}:{})}},response=>{let text='';response.on('data',b=>text+=b);response.on('end',()=>response.statusCode===200?resolve(JSON.parse(text)):reject(Error(text)));});r.on('error',reject);r.end(bytes);});}
test.describe.serial('production app on independent browser stores',()=>{
 test.beforeAll(async({browser})=>{context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();});
 test.afterAll(async()=>{await context?.close();});
 test('imports the open format, grades, undoes, reloads, restores a deleted card and saves a goal',async()=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.screenshot({path:'test-results/ui/desktop-empty.png',fullPage:true});
  await importMD(page,MD);
  await nav(page,'Карточки');await expect(page.locator('.card-table-row')).toHaveCount(5);
  await nav(page,'Сегодня');await page.getByRole('button',{name:'Начать повторение',exact:true}).click();
  await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await page.getByPlaceholder('Твой ответ…').fill('УСТОЙЧИВЫЙ');await page.getByRole('button',{name:/Показать ответ/}).click();await expect(page.getByText('Короткий ответ верный.',{exact:false})).toBeVisible();
  await page.screenshot({path:'test-results/ui/desktop-learning.png',fullPage:true});
  await page.getByRole('button',{name:/Нормально/}).click();await page.getByRole('button',{name:'Отменить оценку',exact:true}).click();await expect(page.getByPlaceholder('Твой ответ…')).toBeVisible();
  let history=await events(page);expect(history.filter(e=>e.kind==='review')).toHaveLength(1);expect(history.filter(e=>e.kind==='review.undo')).toHaveLength(1);
  await page.getByPlaceholder('Твой ответ…').fill('стойкий');await page.getByRole('button',{name:/Показать ответ/}).click();await page.getByRole('button',{name:/Нормально/}).click();
  await expect(page.locator('.katex')).not.toHaveCount(0);
  await page.getByRole('button',{name:'Завершить',exact:true}).click();await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  expect((await events(page)).filter(e=>e.kind==='review')).toHaveLength(2);
  await nav(page,'Карточки');await page.getByRole('button',{name:'В корзину Код',exact:true}).click();await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('trash');await expect(page.locator('.card-table-row')).toHaveCount(1);
  await page.getByRole('button',{name:'Восстановить Код',exact:true}).click();await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');await expect(page.locator('.card-table-row')).toHaveCount(5);
  await nav(page,'Цели');await page.getByRole('button',{name:'Добавить цель',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Название',{exact:true}).fill('К собеседованию');await d.getByRole('button',{name:'Сохранить цель',exact:true}).click();await expect(page.getByRole('heading',{name:'К собеседованию'})).toBeVisible();
  expect(errors).toEqual([]);
 });
 test('merges independent offline answers and preserves simultaneous edits until an explicit resolution',async({browser})=>{
  await importMD(page,'---\ndeck: Независимое обучение\n---\n## [basic] Общий вопрос\nВопрос для двух устройств\n:::answer\nОдин ответ');
  await sync(page);
  const phone=await browser.newContext({viewport:{width:428,height:926}}),p=await phone.newPage();
  await p.goto('/');await expect(p.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  const who=await meta(p,'identity'),pc=await meta(page,'connection'),pair=await secure('pair/create',{},pc.token),connection=await secure('pair/accept',{secret:pair.secret,deviceId:who.id,name:'Тестовый телефон'});await putMeta(p,'connection',connection);await p.reload();
  // Desktop-sized automation uses a separate store; mobile layout is checked separately below.
  await p.setViewportSize({width:1440,height:1000});await sync(p);
  await context.setOffline(true);await phone.setOffline(true);
  for(const current of [page,p]){await nav(current,'Колоды');await current.locator('.deck-tile').filter({hasText:'Независимое обучение'}).getByRole('button',{name:/Повторить/}).click();await current.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await current.getByRole('button',{name:/Показать ответ/}).click();await current.getByRole('button',{name:current===page?/Нормально/:/Легко/}).click();await current.getByRole('button',{name:/Вернуться к сегодня/}).click();}
  await editAnswer(page,'Слово','ПК_Версия');await editAnswer(p,'Слово','Телефон_Версия');
  await context.setOffline(false);await phone.setOffline(false);await sync(page);await sync(p);await sync(page);
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('conflicts');await expect(page.locator('.card-table-row')).toHaveCount(1);
  await page.locator('.card-question').filter({hasText:'Слово'}).click();const conflict=page.getByRole('dialog');await expect(conflict.locator('.conflict-grid article')).toHaveCount(2);
  await conflict.locator('article').filter({hasText:'ПК_Версия'}).getByRole('button',{name:'Использовать эту версию'}).click();await sync(page);await sync(p);
  const history=await events(p),shared=history.find(e=>e.kind==='card.put'&&e.payload.title==='Общий вопрос').entityId;
  const answers=history.filter(e=>e.kind==='review'&&e.entityId===shared);expect(answers).toHaveLength(2);expect(new Set(answers.map(e=>e.deviceId)).size).toBe(2);expect(answers.every(e=>e.payload.previousReviewIds.length===0)).toBe(true);
  await nav(p,'Карточки');await p.getByRole('combobox',{name:'Статус карточек'}).selectOption('conflicts');await expect(p.locator('.card-table-row')).toHaveCount(0);
  await phone.setOffline(true);
  await nav(page,'Колоды');const sharedTile=page.locator('.deck-tile').filter({hasText:'Независимое обучение'});
  await sharedTile.getByRole('button',{name:'Удалить Независимое обучение',exact:true}).click();
  await page.getByRole('dialog',{name:'Удалить колоду?'}).getByRole('button',{name:'Отмена',exact:true}).click();await expect(sharedTile).toBeVisible();
  await sharedTile.getByRole('button',{name:'Удалить Независимое обучение',exact:true}).click();
  await page.getByRole('dialog',{name:'Удалить колоду?'}).getByRole('button',{name:'Удалить колоду',exact:true}).click();
  await expect(sharedTile).toHaveCount(0);await sync(page);
  await editAnswer(p,'Общий вопрос','Ответ уточнён без сети');
  await phone.setOffline(false);await sync(p);await sync(page);
  for(const current of [page,p]){
   await nav(current,'Карточки');await current.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');await current.getByRole('combobox',{name:'Фильтр колоды'}).selectOption('all');
   await expect(current.locator('.card-question').filter({hasText:'Общий вопрос'})).toHaveCount(0);
  }
  await nav(p,'Колоды');await p.getByRole('button',{name:/^Корзина колод/}).click();
  const deletedTile=p.locator('.deleted-deck').filter({hasText:'Независимое обучение'});
  await expect(deletedTile).toBeVisible();await deletedTile.getByRole('button',{name:'Восстановить колоду',exact:true}).click();await expect(deletedTile).toHaveCount(0);
  await sync(p);await sync(page);await nav(page,'Колоды');await expect(sharedTile).toBeVisible();await expect(sharedTile.locator('.tile-meta')).toContainText('1 знакомых');
  const restored=await events(page);expect(restored.filter(e=>e.kind==='review'&&e.entityId===shared)).toHaveLength(2);
  expect(restored.some(e=>e.kind==='card.put'&&e.entityId===shared&&e.payload.back==='Ответ уточнён без сети')).toBe(true);
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');const restoredQuestion=page.locator('.card-question').filter({hasText:'Общий вопрос'});await expect(restoredQuestion).toBeVisible();await restoredQuestion.click();const restoredEditor=page.getByRole('dialog');await expect(restoredEditor.getByRole('textbox',{name:'Ответ',exact:true})).toHaveValue('Ответ уточнён без сети');await restoredEditor.getByRole('button',{name:'Закрыть',exact:true}).click();

  await nav(page,'Статистика');const savedBefore=await page.locator('.stats-metrics>div').nth(1).locator('strong').innerText();
  await phone.setOffline(true);await nav(p,'Карточки');await p.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');
  await p.getByRole('button',{name:'В корзину Общий вопрос',exact:true}).click();await p.getByRole('combobox',{name:'Статус карточек'}).selectOption('trash');
  await p.getByRole('button',{name:'Восстановить Общий вопрос',exact:true}).click();await p.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');
  await expect(p.locator('.card-question').filter({hasText:'Общий вопрос'})).toBeVisible();
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');await page.getByRole('button',{name:'В корзину Общий вопрос',exact:true}).click();
  await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('trash');
  await page.getByRole('button',{name:'Удалить навсегда Общий вопрос',exact:true}).click();
  let confirmation=page.getByRole('dialog',{name:'Удалить карточки навсегда?'});
  await confirmation.getByRole('button',{name:'Отмена',exact:true}).click();await expect(page.locator('.card-table-row')).toHaveCount(1);
  await page.getByRole('button',{name:'Удалить навсегда Общий вопрос',exact:true}).click();
  confirmation=page.getByRole('dialog',{name:'Удалить карточки навсегда?'});
  await expect(confirmation).toContainText('Статистика ответов сохранится');
  await confirmation.getByRole('button',{name:'Удалить навсегда',exact:true}).click();await expect(page.locator('.card-table-row')).toHaveCount(0);
  await sync(page);await phone.setOffline(false);await sync(p);await sync(page);
  for(const current of [page,p]){
   await nav(current,'Карточки');await current.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');
   await expect(current.locator('.card-question').filter({hasText:'Общий вопрос'})).toHaveCount(0);
   await current.getByRole('combobox',{name:'Статус карточек'}).selectOption('trash');
   await expect(current.locator('.card-question').filter({hasText:'Общий вопрос'})).toHaveCount(0);
   const records=await events(current);expect(records.filter(e=>e.kind==='review'&&e.entityId===shared)).toHaveLength(2);
   expect(records.some(e=>e.entityId===shared&&e.payload.permanent===true)).toBe(true);
   await nav(current,'Статистика');await expect(current.locator('.stats-metrics>div').nth(1).locator('strong')).toHaveText(savedBefore);
  }

  await phone.setOffline(true);
  await nav(p,'Колоды');await p.locator('.deck-tile').filter({hasText:'Независимое обучение'}).getByRole('button',{name:'Открыть карточки',exact:true}).click();
  await p.getByRole('button',{name:'Новая карточка',exact:true}).click();
  const offlineEditor=p.getByRole('dialog',{name:'Новая карточка'});
  await offlineEditor.getByLabel('Короткое название').fill('Новая карточка офлайн');
  await offlineEditor.getByLabel('Вопрос',{exact:true}).fill('Вопрос, созданный без сети');
  await offlineEditor.getByLabel('Ответ',{exact:true}).fill('Ответ');
  await offlineEditor.getByRole('button',{name:'Сохранить карточку',exact:true}).click();
  await expect(p.locator('.card-question').filter({hasText:'Новая карточка офлайн'})).toBeVisible();
  await nav(page,'Колоды');await sharedTile.getByRole('button',{name:'Удалить Независимое обучение',exact:true}).click();
  await page.getByRole('dialog',{name:'Удалить колоду?'}).getByRole('button',{name:'Удалить колоду',exact:true}).click();
  await page.getByRole('button',{name:/^Корзина колод/}).click();
  const permanentTile=page.locator('.deleted-deck').filter({hasText:'Независимое обучение'});
  await permanentTile.getByRole('button',{name:'Удалить навсегда',exact:true}).click();
  const deckConfirmation=page.getByRole('dialog',{name:'Удалить колоду навсегда?'});
  await expect(deckConfirmation).toContainText('Статистика ответов сохранится');
  await page.setViewportSize({width:320,height:926});
  expect(await deckConfirmation.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await deckConfirmation.evaluate(el=>Array.from(el.querySelectorAll('footer button')).every(b=>b.getBoundingClientRect().right<=innerWidth))).toBe(true);
  await page.screenshot({path:'test-results/ui/mobile-deck-purge.png',fullPage:true});
  await deckConfirmation.getByRole('button',{name:'Отмена',exact:true}).click();await expect(permanentTile).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await permanentTile.getByRole('button',{name:'Удалить навсегда',exact:true}).click();
  await deckConfirmation.getByRole('button',{name:'Удалить навсегда',exact:true}).click();await expect(permanentTile).toHaveCount(0);
  await sync(page);await phone.setOffline(false);await sync(p);await sync(page);
  for(const current of [page,p]){
   await nav(current,'Колоды');await expect(current.locator('.deck-tile').filter({hasText:'Независимое обучение'})).toHaveCount(0);
   await current.getByRole('button',{name:/^Корзина колод/}).click();await expect(current.locator('.deleted-deck').filter({hasText:'Независимое обучение'})).toHaveCount(0);
   await nav(current,'Карточки');await current.getByRole('combobox',{name:'Фильтр колоды'}).selectOption('all');
   for(const mode of ['all','trash']){
    await current.getByRole('combobox',{name:'Статус карточек'}).selectOption(mode);
    await expect(current.locator('.card-question').filter({hasText:'Новая карточка офлайн'})).toHaveCount(0);
   }
   const records=await events(current);
   expect(records.some(e=>e.kind==='deck.delete'&&e.payload.permanent===true)).toBe(true);
   expect(records.some(e=>e.kind==='card.put'&&e.payload.title==='Новая карточка офлайн')).toBe(true);
   expect(records.filter(e=>e.kind==='review'&&e.entityId===shared)).toHaveLength(2);
   await nav(current,'Статистика');await expect(current.locator('.stats-metrics>div').nth(1).locator('strong')).toHaveText(savedBefore);
  }

  await phone.close();

 });
 test('stores images and formulas in IndexedDB, exports a complete archive and reopens offline',async()=>{
  await importMD(page,'---\ndeck: Иллюстрации\n---\n## [basic] Изображение и формула\nФормула $E=mc^2$\n:::answer\nСвязь массы и энергии');
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');await page.locator('.card-question').filter({hasText:'Изображение и формула'}).click();
  const d=page.getByRole('dialog');await d.locator('input[type=file]').first().setInputFiles('public/icon-192.png');await expect(d.getByRole('textbox',{name:'Вопрос',exact:true})).toHaveValue(/asset:/);
  await d.getByRole('button',{name:'Предпросмотр',exact:true}).click();await expect(d.locator('img[alt="icon-192.png"]')).toBeVisible();await d.getByRole('button',{name:'Сохранить карточку',exact:true}).click();
  await page.locator('.settings-nav').click();const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать полный архив'}).click();const download=await downloaded;const file=await download.path();const zipped=unzipSync(readFileSync(file!));expect(Object.keys(zipped).some(f=>f.startsWith('attachments/'))).toBe(true);expect(JSON.parse(strFromU8(zipped['events.json'])).some((e:any)=>e.kind==='review.undo')).toBe(true);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await nav(page,'Карточки');await page.locator('.card-question').filter({hasText:'Изображение и формула'}).click();const offline=page.getByRole('dialog');await offline.getByRole('button',{name:'Предпросмотр',exact:true}).click();const img=offline.locator('img[alt="icon-192.png"]');await expect(img).toBeVisible();expect(await img.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(192);await expect(offline.locator('.katex')).not.toHaveCount(0);
  await offline.getByRole('button',{name:'Закрыть',exact:true}).click();await context.setOffline(false);
 });
 test('fits the iPhone 12 Pro Max viewport, provides touch navigation and applies the dark theme',async({browser})=>{
  await nav(page,'Колоды');await page.getByRole('button',{name:'Новая колода',exact:true}).click();
  const deckEditor=page.getByRole('dialog',{name:'Новая колода'});await deckEditor.getByLabel('Название',{exact:true}).fill('ОченьДлинноеНазваниеКолодыДляПодготовкиКСобеседованиюИПовторенияМатериала');
  await deckEditor.getByRole('button',{name:'Сохранить колоду',exact:true}).click();await sync(page);
  const mobile=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),p=await mobile.newPage();await p.goto('/');await expect(p.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();await expect.poll(async()=>(await events(p)).length).toBeGreaterThan(0);await expect(p.getByText('ОченьДлинноеНазваниеКолодыДляПодготовкиКСобеседованиюИПовторенияМатериала',{exact:true})).toBeVisible();
  const noOverflow=async()=>expect(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await noOverflow();await p.screenshot({path:'test-results/ui/mobile-today.png',fullPage:true});await p.getByRole('button',{name:'Начать повторение',exact:true}).click();await noOverflow();await p.screenshot({path:'test-results/ui/mobile-learning.png',fullPage:true});await p.getByRole('button',{name:'Завершить',exact:true}).click();
  await p.locator('.mobile-bottom').getByRole('button',{name:'Карточки',exact:true}).click();await p.getByRole('button',{name:'Новая карточка',exact:true}).click();await noOverflow();await p.screenshot({path:'test-results/ui/mobile-editor.png',fullPage:true});await p.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await p.getByRole('button',{name:'Открыть меню',exact:true}).click();await nav(p,'Цели');await p.getByRole('button',{name:'Добавить цель',exact:true}).click();
  const goal=p.getByRole('dialog',{name:'Новая цель'});await goal.getByLabel('Название',{exact:true}).fill('Подготовка на телефоне');
  await goal.getByLabel('Дата',{exact:true}).click();const calendar=goal.getByRole('group',{name:'Выбор даты'});await calendar.getByRole('combobox',{name:'Год',exact:true}).selectOption('2026');await calendar.getByRole('combobox',{name:'Месяц',exact:true}).selectOption('10');await calendar.getByRole('button',{name:/^15 ноября 2026/}).click();await expect(goal.getByLabel('Дата',{exact:true})).toContainText('15 ноября 2026');await expect(goal.getByLabel('Дата',{exact:true})).toBeFocused();await goal.getByLabel('Минут в день',{exact:true}).fill('30');
  for(const width of [320,375,428]){
   await p.setViewportSize({width,height:926});
   const date=await goal.getByLabel('Дата',{exact:true}).boundingBox(),minutes=await goal.getByLabel('Минут в день',{exact:true}).boundingBox();
   expect(date).not.toBeNull();expect(minutes).not.toBeNull();expect(minutes!.y).toBeGreaterThanOrEqual(date!.y+date!.height+8);
   expect(await goal.locator('.form-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   expect(await goal.evaluate(el=>{
    const bounds=el.getBoundingClientRect();
    return Array.from(el.querySelectorAll('input:not([type=checkbox]),select,.date-trigger,footer button')).every(control=>{
     const b=control.getBoundingClientRect();return b.left>=bounds.left&&b.right<=bounds.right;
    });
   })).toBe(true);
   const cancel=await goal.getByRole('button',{name:'Отмена',exact:true}).boundingBox(),save=await goal.getByRole('button',{name:'Сохранить цель',exact:true}).boundingBox();
   expect(cancel!.x+cancel!.width<=save!.x||save!.x+save!.width<=cancel!.x||cancel!.y+cancel!.height<=save!.y||save!.y+save!.height<=cancel!.y).toBe(true);
   if(width===320)await p.screenshot({path:'test-results/ui/mobile-goal-narrow.png',fullPage:true});
   await goal.getByLabel('Дата',{exact:true}).click();const popup=goal.getByRole('group',{name:'Выбор даты'});expect(await popup.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(await popup.evaluate(el=>el.getBoundingClientRect().right<=innerWidth)).toBe(true);if(width===428)await p.screenshot({path:'test-results/ui/mobile-goal-calendar.png',fullPage:true});await goal.getByLabel('Дата',{exact:true}).click();
  }
  await p.screenshot({path:'test-results/ui/mobile-goal.png',fullPage:true});await goal.getByRole('button',{name:'Сохранить цель',exact:true}).click();
  await expect(p.getByRole('heading',{name:'Подготовка на телефоне',exact:true})).toBeVisible();await noOverflow();

  await p.getByRole('button',{name:'Открыть меню',exact:true}).click();await p.locator('.settings-nav').click();await p.getByRole('button',{name:'Тёмное',exact:true}).click();await p.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await expect(p.locator('html')).toHaveAttribute('data-theme','dark');await noOverflow();await p.screenshot({path:'test-results/ui/mobile-dark.png',fullPage:true});await mobile.close();
 });

 test('confirms bulk and filtered trash cleanup and opens searchable wiki offline',async({browser})=>{
  await importMD(page,'---\ndeck: Проверка корзины\n---\n## [basic] Удаление А\nПервый\n:::answer\nОтвет\n## [basic] Удаление Б\nВторой\n:::answer\nОтвет\n## [basic] Удаление В\nТретий\n:::answer\nОтвет');
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');
  for(const title of ['Удаление А','Удаление Б','Удаление В'])await page.getByRole('button',{name:'В корзину '+title,exact:true}).click();
  await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('trash');await expect(page.locator('.card-table-row')).toHaveCount(3);await sync(page);
  const mobile=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),p=await mobile.newPage();
  await p.goto('/');await expect(p.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await p.locator('.mobile-bottom').getByRole('button',{name:'Карточки',exact:true}).click();
  await p.getByRole('combobox',{name:'Статус карточек'}).selectOption('trash');await expect(p.locator('.card-table-row')).toHaveCount(3);
  await p.setViewportSize({width:320,height:926});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  for(const row of await p.locator('.card-table-row').all()){
   const bounds=await row.boundingBox(),restore=await row.getByRole('button',{name:/^Восстановить/}).boundingBox(),remove=await row.getByRole('button',{name:/^Удалить навсегда/}).boundingBox();
   expect(restore!.x+restore!.width).toBeLessThanOrEqual(remove!.x);expect(remove!.x+remove!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width);
  }
  await p.getByRole('button',{name:'Удалить навсегда Удаление В',exact:true}).click();
  await p.screenshot({path:'test-results/ui/mobile-permanent-delete.png',fullPage:true});
  await p.getByRole('dialog').getByRole('button',{name:'Отмена',exact:true}).click();await mobile.close();
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('trash');
  await page.getByRole('checkbox',{name:'Выбрать Удаление А',exact:true}).check();await page.getByRole('checkbox',{name:'Выбрать Удаление Б',exact:true}).check();
  await page.locator('.selection-bar').getByRole('button',{name:'Удалить навсегда',exact:true}).click();
  const confirmation=page.getByRole('dialog',{name:'Удалить карточки навсегда?'});await expect(confirmation).toContainText('Карточек к удалению: 2');
  await confirmation.getByRole('button',{name:'Удалить навсегда',exact:true}).click();await expect(page.locator('.card-table-row')).toHaveCount(1);
  await page.getByPlaceholder('Поиск по вопросу, ответу или тегам').fill('нет совпадений');await expect(page.locator('.card-table-row')).toHaveCount(0);
  await page.getByRole('button',{name:'Очистить всю корзину',exact:true}).click();await expect(confirmation).toContainText('Удаление В');
  await expect(confirmation).toContainText('Карточек к удалению: 1');await confirmation.getByRole('button',{name:'Удалить навсегда',exact:true}).click();
  await page.getByPlaceholder('Поиск по вопросу, ответу или тегам').fill('');await expect(page.locator('.card-table-row')).toHaveCount(0);await expect(page.getByRole('button',{name:'Очистить всю корзину',exact:true})).toBeDisabled();
  expect((await events(page)).filter(e=>e.kind==='card.delete'&&e.payload.permanent===true)).toHaveLength(4);
  await nav(page,'Справка');await page.getByRole('textbox',{name:'Поиск по справке'}).fill('Лейтнер');
  await page.getByRole('navigation',{name:'Темы справки'}).getByRole('button',{name:/Алгоритмы повторения/}).click();
  await expect(page.locator('.wiki-article')).toContainText('1, 2, 4, 8, 16, 32 и 64 дня');
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать справку',exact:true}).click();
  const file=await (await downloaded).path(),markdown=readFileSync(file!,'utf8');expect(markdown).toContain('FSRS-7');expect(markdown).toContain('Статистика ответов сохраняется');
  await page.getByRole('textbox',{name:'Поиск по справке'}).fill('ничего-такого-нет');await expect(page.getByRole('heading',{name:'В справке ничего не найдено',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Сбросить поиск',exact:true}).click();await expect(page.locator('.wiki-article')).toBeVisible();
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();await nav(page,'Справка');
  await page.getByRole('textbox',{name:'Поиск по справке'}).fill('Очистить всю корзину');await expect(page.locator('.wiki-article')).toContainText('Корзины и резервные копии');
  await page.setViewportSize({width:320,height:926});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/ui/mobile-wiki-trash.png',fullPage:true});
  await page.getByRole('textbox',{name:'Поиск по справке'}).fill('Лейтнер');await page.screenshot({path:'test-results/ui/mobile-wiki-algorithms.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('textbox',{name:'Поиск по справке'}).fill('');await page.screenshot({path:'test-results/ui/desktop-wiki.png',fullPage:true});
  await context.setOffline(false);
 });
 test('downloads the unified import kit and preserves highlighted card code on a narrow offline screen',async()=>{
  await nav(page,'Сегодня');await page.getByRole('button',{name:'Импорт .md',exact:true}).click();
  let dialog=page.getByRole('dialog');
  let downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'Набор для ИИ и импорта',exact:true}).click();
  const kit=unzipSync(readFileSync((await (await downloaded).path())!));
  expect(strFromU8(kit['import-guide.md'])).toBe(readFileSync('docs/markdown-format.md','utf8'));
  expect(strFromU8(kit['ai-prompt.md'])).toContain('## Готовый запрос');
  expect(strFromU8(kit['template.md'])).toContain('## [cloze]');
  await dialog.locator('input[type=file]').setInputFiles({name:'code-and-math.md',mimeType:'text/markdown',buffer:Buffer.from(kit['examples/code-and-math.md'])});
  await expect(dialog.locator('.import-preview h3')).toHaveText('6 карточек');
  await expect(dialog.locator('.error-text')).toHaveCount(0);await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');await page.getByRole('combobox',{name:'Фильтр колоды'}).selectOption('all');
  await page.locator('.card-question').filter({hasText:'Квадраты чисел в JavaScript'}).click();
  dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Предпросмотр',exact:true}).click();
  await expect(dialog.locator('.editor-preview .hljs-keyword').first()).toHaveText('const');
  await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();

  const sourceCode='function greet(name) {\n  const message = "'+'длинная строка '.repeat(24)+'";\n  return message + name;\n}\n';
  const unknown='## [basic] Это часть кода\n:::answer\n  <b>Обычный текст</b>\n';
  const html='<script>window.recallCodeExecuted = true</script>\n';
  const fence='\x60\x60\x60';
  await importMD(page,'---\ndeck: Проверка оформления кода\n---\n## [basic] Оформление кода\n'+fence+'javascript\n'+sourceCode+fence+'\n:::answer\n'+fence+'unknown-language\n'+unknown+fence+'\n\n'+fence+'html\n'+html+fence);
  await nav(page,'Карточки');await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');await page.getByRole('combobox',{name:'Фильтр колоды'}).selectOption('all');
  await page.locator('.card-question').filter({hasText:'Оформление кода'}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Предпросмотр',exact:true}).click();
  const code=dialog.locator('.editor-preview code.language-javascript');
  expect(await code.textContent()).toBe(sourceCode);await expect(code.locator('.hljs-keyword').first()).toHaveText('function');
  expect(await code.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
  expect(await code.evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('pre');
  expect(await code.locator('.hljs-keyword').first().evaluate(el=>getComputedStyle(el).color!==getComputedStyle(el.parentElement!).color)).toBe(true);
  expect(await dialog.locator('code.language-unknown-language').textContent()).toBe(unknown);
  expect(await dialog.locator('code.language-html').textContent()).toBe(html);
  expect(await page.evaluate(()=>Boolean((window as any).recallCodeExecuted))).toBe(false);
  await page.setViewportSize({width:320,height:926});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  expect(await code.evaluate(el=>el.parentElement!.scrollWidth>el.parentElement!.clientWidth)).toBe(true);
  await code.scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/ui/mobile-code-light.png'});
  await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await page.locator('.settings-nav').click();
  await page.getByRole('button',{name:'Тёмное',exact:true}).click();await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
  await expect(page.getByText('Настройки сохранены',{exact:true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
  await page.locator('.mobile-bottom').getByRole('button',{name:'Карточки',exact:true}).click();
  await page.getByRole('combobox',{name:'Статус карточек'}).selectOption('all');
  await page.locator('.card-question').filter({hasText:'Оформление кода'}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Предпросмотр',exact:true}).click();
  expect(await dialog.locator('code.language-javascript').textContent()).toBe(sourceCode);
  await expect(dialog.locator('code.language-javascript .hljs-keyword').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await dialog.locator('code.language-javascript').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/ui/mobile-code-dark-offline.png'});
  await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await nav(page,'Справка');
  await page.getByRole('textbox',{name:'Поиск по справке'}).fill('Markdown');
  await page.getByRole('navigation',{name:'Темы справки'}).getByRole('button',{name:/Карточки и Markdown/}).click();
  await expect(page.locator('.wiki-article')).toContainText('Набор для ИИ и импорта');
  await expect(page.getByRole('button',{name:'Методичка по импорту',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Перейти к импорту',exact:true}).click();
  downloaded=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'Набор для ИИ и импорта',exact:true}).click();
  const offlineKit=unzipSync(readFileSync((await (await downloaded).path())!));
  expect(strFromU8(offlineKit['examples/code-and-math.md'])).toBe(strFromU8(kit['examples/code-and-math.md']));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/ui/mobile-import-guide.png',fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});await context.setOffline(false);
 });

});

