import { test, expect, devices, type Page } from '@playwright/test';
const question='Длинный вопрос. '+('Важная часть вопроса для самостоятельного вспоминания. '.repeat(65));
const answer='Развёрнутый ответ.\n\n'+Array.from({length:70},(_,i)=>'Пункт '+(i+1)+': пояснение и критерии ответа.').join('\n\n');
async function boot(page:Page){
 await page.context().route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Тест без ПК"}'}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.getByRole('button',{name:'Импорт .md',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Или вставь текст').fill('---\ndeck: Компактное занятие\n---\n## [basic] Длинная карточка\n'+question+'\n:::answer\n'+answer);
 await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Начать повторение',exact:true}).click();
 await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();
}
async function visibleDock(page:Page,ratings:boolean){
 await expect(page.locator('.mobile-bottom')).toBeHidden();
 const result=await page.locator(ratings?'.rating':'.reveal-button').evaluateAll(elements=>elements.map(el=>{
  const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
  return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,hit:Boolean(hit&&el.contains(hit)),width:innerWidth,height:innerHeight};
 }));
 expect(result).toHaveLength(ratings?4:1);expect(new Set(result.map(b=>b.top)).size).toBe(1);
 for(const b of result){expect(b.top).toBeGreaterThanOrEqual(62);expect(b.bottom).toBeLessThanOrEqual(b.height);expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(b.width);expect(b.hit,JSON.stringify(b)).toBe(true);}
 return result.map(({top,bottom})=>({top,bottom}));
}
async function reviews(page:Page){
 return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const request=indexedDB.open('recall-local-v1');request.onsuccess=()=>{const db=request.result,q=db.transaction('events').objectStore('events').getAll();q.onsuccess=()=>{resolve(q.result.filter((e:any)=>e.kind==='review').sort((a:any,b:any)=>a.seq-b.seq));db.close();};q.onerror=()=>reject(q.error);};
 }));
}
test('keeps reveal and all four ratings reachable without scrolling long content and restores navigation after grading',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any),page=await context.newPage();
 try{
  await boot(page);expect(await page.evaluate(()=>scrollY)).toBe(0);await visibleDock(page,false);
  await page.getByRole('button',{name:/Показать ответ/}).click();
  await expect(page.locator('.answer-section .markdown>p').first()).toBeInViewport();
  const top=await visibleDock(page,true);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(1000);expect(await visibleDock(page,true)).toEqual(top);
  await expect(page.getByRole('button',{name:'Завершить',exact:true})).toBeInViewport();
  const end=await page.locator('.answer-section .markdown>p').last().boundingBox(),dock=await page.locator('.session-answer-controls').boundingBox();
  expect(end!.y+end!.height).toBeLessThanOrEqual(dock!.y);
  await page.screenshot({path:'test-results/ui/long-answer-fixed-controls.png'});
  await page.locator('.rating-buttons').screenshot({path:'test-results/ui/mobile-study-bar.png'});
  await page.getByRole('button',{name:/^Нормально/}).click();
  await expect(page.getByRole('heading',{name:'Ещё немного осталось с тобой.'})).toBeVisible();await expect(page.locator('.mobile-bottom')).toBeVisible();
  expect((await reviews(page)).at(-1).payload.rating).toBe(3);
  await page.getByRole('button',{name:'Отменить последнюю оценку',exact:true}).click();
  await visibleDock(page,false);expect(await page.evaluate(()=>scrollY)).toBe(0);
  await page.getByRole('button',{name:/Показать ответ/}).click();await visibleDock(page,true);
  await page.getByRole('button',{name:/^Легко/}).click();await expect(page.getByRole('heading',{name:'Ещё немного осталось с тобой.'})).toBeVisible();expect((await reviews(page)).at(-1).payload.rating).toBe(4);
  await page.getByRole('button',{name:'Вернуться к сегодня',exact:true}).click();await expect(page.locator('.mobile-bottom')).toBeVisible();
  expect(await page.locator('.app-shell').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--study-dock-height'))).toBe('');
 }finally{await context.close();}
});
test('keeps the compact row in short and narrow viewports and returns to the question after a failed answer',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined,viewport:{width:320,height:568},screen:{width:320,height:568}} as any),page=await context.newPage();
 try{
  await boot(page);await page.getByRole('button',{name:/Показать ответ/}).click();await visibleDock(page,true);
  for(const size of [{width:320,height:568},{width:428,height:500},{width:740,height:390}]){
   await page.setViewportSize(size);await visibleDock(page,true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  }
  await page.setViewportSize({width:320,height:568});await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await page.getByRole('button',{name:/^Не вспомнил/}).click();await visibleDock(page,false);
  expect(await page.evaluate(()=>scrollY)).toBe(0);expect((await reviews(page)).at(-1).payload.rating).toBe(1);
  await page.getByRole('button',{name:'Завершить',exact:true}).click();await expect(page.locator('.mobile-bottom')).toBeVisible();
 }finally{await context.close();}
});
