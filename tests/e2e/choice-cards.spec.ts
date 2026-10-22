import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
async function nav(p:Page,name:string){if(await p.getByRole('button',{name:'Открыть меню',exact:true}).isVisible())await p.getByRole('button',{name:'Открыть меню',exact:true}).click();await p.locator('.sidebar nav').getByRole('button',{name:new RegExp('^'+name)}).click();}
async function records(page:Page){return page.evaluate(()=>new Promise<any[]>(resolve=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('events').objectStore('events').getAll();q.onsuccess=()=>{db.close();resolve(q.result.sort((a,b)=>a.clock-b.clock));};};}));}
async function boot(page:Page){await page.context().route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Без службы"}'}));await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();}
async function importExample(page:Page){await page.getByRole('button',{name:'Импорт .md',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Или вставь текст').fill(readFileSync('examples/choice.md','utf8'));await expect(dialog.locator('.import-preview h3')).toHaveText('2 карточек');await expect(dialog.locator('.error-text')).toHaveCount(0);await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);}
const normal=(p:Page)=>p.locator('.rating-buttons').getByRole('button',{name:/^Нормально/});
const again=(p:Page)=>p.locator('.rating-buttons').getByRole('button',{name:/^Не вспомнил/});
const order=(p:Page)=>p.locator('.study-card .choice-option').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-option-id')));

test('single and multiple choice grade exact sets, keep order while answering, repeat with a fresh shuffle, undo and reopen offline on a phone',async({browser})=>{
 const context=await browser.newContext({viewport:{width:428,height:926},isMobile:true,hasTouch:true}),page=await context.newPage();
 await context.addInitScript(()=>{Math.random=()=>0;});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await boot(page);await importExample(page);await nav(page,'Колоды');await page.getByRole('button',{name:'Практика всей колоды',exact:true}).click();await page.getByRole('button',{name:'Начать практику',exact:true}).click();
  await expect(page.getByText('ПЕРВИЧНОЕ ИЗУЧЕНИЕ',{exact:true})).toBeVisible();await expect(page.locator('.choice-verdict').filter({hasText:'Правильный вариант'})).toHaveCount(1);await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();
  await expect(page.getByRole('radio')).toHaveCount(4);await expect(page.getByRole('button',{name:/^Проверить ответ/})).toBeDisabled();await expect(page.getByText('Apple — яблоко.',{exact:true})).toHaveCount(0);
  expect(await order(page)).toEqual(['o2','o3','o4','o1']);await page.getByRole('radio',{name:'Груша',exact:true}).check();const before=await order(page);await page.getByRole('button',{name:/^Проверить ответ/}).click();expect(await order(page)).toEqual(before);
  await expect(normal(page)).toBeDisabled();await expect(page.getByText('Груша — pear.',{exact:true})).toBeVisible();await expect(page.getByRole('radio').first()).toBeDisabled();await again(page).click();
  await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await expect(page.getByRole('checkbox')).toHaveCount(4);await expect(page.locator('.choice-option .katex').first()).toBeVisible();
  await page.locator('.choice-option[data-option-id="o1"] input').check();await page.getByRole('button',{name:/^Проверить ответ/}).click();await expect(normal(page)).toBeDisabled();await again(page).click();
  // The single-answer card returns without an introduction; change the random source
  // before the next presentation to prove that a new permutation is actually used.
  await page.getByRole('radio',{name:'Яблоко',exact:true}).check();await page.getByRole('button',{name:/^Проверить ответ/}).click();await expect(normal(page)).toBeEnabled();await page.evaluate(()=>{Math.random=()=>.999;});await normal(page).click();
  await expect(page.getByRole('checkbox')).toHaveCount(4);await expect.poll(()=>order(page)).toEqual(['o1','o2','o3','o4']);await page.locator('.choice-option[data-option-id="o1"] input').check();await page.locator('.choice-option[data-option-id="o2"] input').check();await page.getByRole('button',{name:/^Проверить ответ/}).click();await expect(normal(page)).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);await page.screenshot({path:'test-results/ui/choice-phone.png',fullPage:true});await normal(page).click();await expect(page.getByRole('heading',{name:'Ещё немного осталось с тобой.',exact:true})).toBeVisible();
  let reviews=(await records(page)).filter(e=>e.kind==='review');expect(reviews.map(e=>e.payload.rating)).toEqual([1,1,3,3]);expect(reviews[3].payload.choiceAnswer).toEqual({selectedIds:['o1','o2'],correct:true});
  await page.getByRole('button',{name:'Отменить последнюю оценку',exact:true}).click();await expect(page.getByRole('button',{name:/^Проверить ответ/})).toBeDisabled();await page.getByRole('button',{name:'Завершить',exact:true}).click();
  await nav(page,'Карточки');await page.getByRole('button',{name:/Предпросмотр/}).first().click();await expect(page.getByRole('dialog',{name:'Просмотр карточек'}).locator('.choice-option')).toHaveCount(4);await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));await context.setOffline(true);await page.reload();await nav(page,'Карточки');expect((await records(page)).filter(e=>e.kind==='card.put').every(e=>e.payload.options?.length===4)).toBe(true);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('creates choice cards manually, validates options, previews formulas, and delivers the updated AI kit',async({page})=>{
 await boot(page);await importExample(page);await nav(page,'Карточки');await page.getByRole('button',{name:'Новая карточка',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Выбор ответа',exact:true}).click();
 await dialog.getByLabel('Вопрос',{exact:true}).fill('Какие равенства верны?');await dialog.getByLabel('Текст варианта 1',{exact:true}).fill('$2+2=4$');await dialog.getByLabel('Текст варианта 2',{exact:true}).fill('$1+1=2$');await dialog.getByLabel('Правильный вариант 2',{exact:true}).check();
 await dialog.getByRole('button',{name:'Сохранить карточку',exact:true}).click();await expect(page.getByText('Нужен хотя бы один неверный вариант',{exact:true}).first()).toBeVisible();await dialog.getByRole('button',{name:'Добавить вариант',exact:true}).click();await dialog.getByLabel('Текст варианта 3',{exact:true}).fill('$2+2=5$');
 await dialog.getByRole('button',{name:'Предпросмотр',exact:true}).click();await expect(dialog.locator('.editor-preview .katex')).toHaveCount(3);await dialog.getByRole('button',{name:'Сохранить карточку',exact:true}).click();await expect(dialog).toHaveCount(0);
 const saved=(await records(page)).filter(e=>e.kind==='card.put').at(-1)!.payload;expect(saved.type).toBe('choice');expect(saved.back).toBe('');expect(saved.options.filter((o:any)=>o.correct)).toHaveLength(2);
 await nav(page,'Сегодня');await page.getByRole('button',{name:'Импорт .md',exact:true}).click();dialog=page.getByRole('dialog');const downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'Набор для ИИ и импорта',exact:true}).click();const kit=unzipSync(readFileSync((await (await downloaded).path())!));
 expect(strFromU8(kit['ai-prompt.md'])).toContain(':::option correct');expect(strFromU8(kit['ai-prompt.md'])).toContain('ВСЕ правильные');expect(strFromU8(kit['examples/choice.md'])).toBe(readFileSync('examples/choice.md','utf8'));
});
