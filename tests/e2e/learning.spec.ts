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
async function boot(page:Page,source:string){
 await page.context().route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Тест без ПК"}'}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.getByRole('button',{name:'Импорт .md',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Или вставь текст').fill(source);await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);
}
async function start(page:Page){await page.getByRole('button',{name:'Начать повторение',exact:true}).click();}
async function grade(page:Page){await page.getByRole('button',{name:/Показать ответ/}).click();await page.locator('.rating-3').click();}
async function reachableIntroductions(page:Page){
 await expect(page.locator('.mobile-bottom')).toBeHidden();
 const bounds=await page.locator('.introduction-actions button').evaluateAll(buttons=>buttons.map(el=>{
  const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
  return {x:b.x,right:b.right,y:b.y,bottom:b.bottom,height:b.height,hit:!!hit&&el.contains(hit),width:innerWidth,viewportHeight:innerHeight};
 }));
 expect(bounds).toHaveLength(2);
 for(const b of bounds){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(b.width);expect(b.y).toBeGreaterThanOrEqual(62);expect(b.bottom).toBeLessThanOrEqual(b.viewportHeight);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.hit).toBe(true);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
}

test('reads without a rating, interleaves three other cards and preserves primary study after answer undo',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const source='---\ndeck: Первое знакомство\n---\n## [input] Незнакомое слово\nresilient\n:::answer\nстойкий\n:::notes\nЭто пояснение для изучения.\n\n'+[2,3,4].map(n=>'## [basic] Знакомая '+n+'\nВопрос '+n+'?\n:::answer\nОтвет '+n).join('\n\n');
 await boot(page,source);await start(page);
 await expect(page.locator('.session-introduction')).toBeVisible();await expect(page.locator('.answer-section')).toContainText('стойкий');await expect(page.locator('.answer-notes')).toHaveAttribute('open','');
 await expect(page.getByPlaceholder('Твой ответ…')).toHaveCount(0);await expect(page.locator('.rating')).toHaveCount(0);
 await page.getByRole('button',{name:'Прочитал — проверить позже',exact:true}).click();
 await expect(page.locator('.question-markdown')).toHaveText('Вопрос 2?');
 let history=await records(page);expect(history.filter(e=>e.kind==='study.introduce')).toHaveLength(1);expect(history.filter(e=>e.kind==='review')).toHaveLength(0);
 for(const n of [2,3,4]){
  await expect(page.locator('.question-markdown')).toHaveText('Вопрос '+n+'?');
  await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await expect(page.locator('.answer-section')).toHaveCount(0);await grade(page);
 }
 await expect(page.getByPlaceholder('Твой ответ…')).toBeVisible();await expect(page.locator('.question-markdown')).toHaveText('resilient');await expect(page.locator('.answer-section')).toHaveCount(0);
 await page.getByPlaceholder('Твой ответ…').fill('стойкий');await grade(page);
 await expect(page.locator('.session-summary')).toBeVisible();await expect(page.locator('.introduction-summary')).toContainText('Первичное изучение: 1 карточка');
 history=await records(page);const card=history.find(e=>e.kind==='card.put'&&e.payload.title==='Незнакомое слово');
 const learned=history.find(e=>e.kind==='review'&&e.entityId===card.entityId);expect(learned.payload.context).toBe('practice');expect(learned.payload.prediction).toBeNull();
 await page.getByRole('button',{name:'Отменить последнюю оценку',exact:true}).click();await expect(page.getByPlaceholder('Твой ответ…')).toBeVisible();await expect(page.locator('.session-introduction')).toHaveCount(0);
 await page.getByPlaceholder('Твой ответ…').fill('стойкий');await grade(page);await expect(page.locator('.session-summary')).toBeVisible();
 expect((await records(page)).filter(e=>e.kind==='study.introduce')).toHaveLength(1);
 await page.getByRole('button',{name:'Вернуться к сегодня',exact:true}).click();await nav(page,'Статистика');
 await expect(page.getByRole('region',{name:'Статистика первичного изучения'})).toContainText('1 карточка');
 await expect(page.locator('.stats-metrics>div').nth(1).locator('strong')).toHaveText('4');expect(errors).toEqual([]);
});

test('keeps both learning actions reachable on phones and resumes an unread assessment offline after reload',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined,viewport:{width:320,height:568},screen:{width:320,height:568}} as any),page=await context.newPage();
 try{
  const source='---\ndeck: Учусь без ПК\n---\n## [input] Первая локальная\nВведите число\n:::answer\n42\n:::notes\n'+('Пояснение для изучения. '.repeat(100))+'\n\n'+String.fromCharCode(96).repeat(3)+'python\nprint(42)\n'+String.fromCharCode(96).repeat(3);
  await boot(page,source);await nav(page,'Настройки');await page.getByLabel('Размер текста').selectOption('extra');await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size','extra');await nav(page,'Сегодня');await context.setOffline(true);await start(page);
  await expect(page.locator('.answer-notes .hljs-keyword,.answer-notes .hljs-built_in')).not.toHaveCount(0);
  for(const size of [{width:320,height:568},{width:428,height:500},{width:740,height:390}]){
   await page.setViewportSize(size);await reachableIntroductions(page);
  }
  await page.setViewportSize({width:428,height:926});await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await reachableIntroductions(page);
  await page.screenshot({path:'test-results/ui/primary-study-phone.png'});
  await page.getByRole('button',{name:'Прочитал — проверить позже',exact:true}).click();await expect(page.getByPlaceholder('Твой ответ…')).toBeVisible();
  expect((await records(page)).filter(e=>e.kind==='review')).toHaveLength(0);
  await page.getByRole('button',{name:'Завершить',exact:true}).click();await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();await start(page);
  await expect(page.locator('.session-introduction')).toHaveCount(0);await expect(page.getByPlaceholder('Твой ответ…')).toBeVisible();await expect(page.locator('.answer-section')).toHaveCount(0);
  await page.getByPlaceholder('Твой ответ…').fill('42');await grade(page);await expect(page.locator('.session-summary')).toBeVisible();
  const history=await records(page);expect(history.filter(e=>e.kind==='study.introduce')).toHaveLength(1);expect(history.filter(e=>e.kind==='review')).toHaveLength(1);
  await page.getByRole('button',{name:'Вернуться к сегодня',exact:true}).click();await nav(page,'Статистика');await expect(page.getByRole('region',{name:'Статистика первичного изучения'})).toContainText('1 карточка');
 }finally{await context.close();}
});

test('can skip a known cloze and keeps answers hidden in an exam with no introduction record',async({page})=>{
 await boot(page,'---\ndeck: Уже знакомо\n---\n## [cloze] Формула\nДва плюс два — {{c1::четыре}}.\n:::notes\nСложение двух пар.');
 await start(page);await expect(page.locator('.answer-section')).toContainText('четыре');
 await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await expect(page.locator('.answer-section')).toHaveCount(0);await expect(page.locator('.question-markdown')).not.toContainText('четыре');
 await page.getByRole('button',{name:'Завершить',exact:true}).click();
 await nav(page,'Цели');await page.getByRole('button',{name:'Добавить цель',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Название',{exact:true}).fill('Проверка знакомого');await dialog.getByRole('button',{name:'Сохранить цель',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Пробная проверка',exact:true}).click();await expect(page.locator('.session-introduction')).toHaveCount(0);await expect(page.locator('.answer-section')).toHaveCount(0);
 await grade(page);await expect(page.locator('.session-summary')).toBeVisible();
 const history=await records(page);expect(history.filter(e=>e.kind==='study.introduce')).toHaveLength(0);expect(history.find(e=>e.kind==='review').payload.context).toBe('exam');
});
