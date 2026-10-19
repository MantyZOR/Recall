import { test, expect, devices, type Page } from '@playwright/test';

async function nav(page:Page,name:string){
 if(await page.locator('.mobile-header').isVisible())await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
 await page.locator('.sidebar').getByRole('button',{name:new RegExp('^'+name)}).click();
}
async function records(page:Page){
 return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const d=r.result,q=d.transaction('events').objectStore('events').getAll();q.onsuccess=()=>{d.close();resolve(q.result);};q.onerror=()=>reject(q.error);};
 }));
}
async function boot(page:Page,history=false){
 await page.context().route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Тест без ПК"}'}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.evaluate(async(history)=>{
  const now=Date.now(),events:any[]=[];let clock=0;
  const put=(kind:string,entityId:string,payload:any,deps:string[]=[],at=now)=>{
   const id='seed'+(++clock);events.push({id,kind,entityId,payload,deps,clock,seq:clock,deviceId:'seed',at});return id;
  };
  const deckId='reading',dep=put('deck.put',deckId,{id:deckId,name:'Пак для просмотра',description:'Формулы, код и пропуски',color:'#7269dd',icon:'Aa',algorithm:'fsrs7',retention:.9,newPerDay:20});
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const card=(id:string,title:string,type:string,front:string,back:string,extra:any={})=>put('card.put',id,{id,deckId,title,type,front,back,notes:'Подробное пояснение',aliases:[],tags:[],...extra},[dep]);
  const basic=card('basic','Формула и код','basic','Объясни $x^2$.','Код:\n\n'+String.fromCharCode(96).repeat(3)+'js\nconst square = x => x * x;\n'+String.fromCharCode(96).repeat(3)+'\n\n![Пиксель](asset:'+hash+')');
  card('input','Перевод слова','input','cat','кот',{aliases:['кошка']});
  card('cloze','Закон Ньютона','cloze','Сила: {{c1::масса::величина}} × ускорение.','Дополнение к пропуску',{clozeIndex:1,siblingId:'newton'});
  const date=new Date(now+5*86400000).toISOString().slice(0,10);
  put('goal.put','test',{id:'test',name:'Проверка пака',date,minutes:20,retention:.9,deckIds:[deckId],importance:{},newPerDay:null});
  if(history){
   let previous='';
   for(const offset of [400,200,60,0]){
    const id=put('review','basic',{cardId:'basic',cardVersion:basic,rating:offset===0?1:3,elapsedDays:previous?1:0,durationMs:5000,context:'review',hints:false,model:'FSRS-7/rust-scalar-v1',paramsId:'fsrs7-defaults-v1',retention:.9,prediction:previous?.9:null,previousReviewIds:previous?[previous]:[],sessionId:'history'},[basic,...(previous?[previous]:[])],now-offset*86400000);
    previous=id;
   }
  }
  await new Promise<void>((resolve,reject)=>{
   const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{
    const d=r.result,t=d.transaction(['events','attachments'],'readwrite');
    events.forEach(e=>t.objectStore('events').put(e));
    t.objectStore('attachments').put({id:hash,name:'pixel.png',type:'image/png',blob:new Blob([bytes],{type:'image/png'})});
    t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);
   };
  });
 },history);
 await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
}
test('previews the filtered pack with rich content offline without creating assessments',async({page})=>{
 await boot(page);await nav(page,'Карточки');const before=await records(page);
 await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();const reader=page.getByRole('dialog',{name:'Просмотр карточек'});
 await expect(reader.locator('[role=status]')).toHaveText('1 / 3');await expect(reader.locator('.katex')).not.toHaveCount(0);
 await expect(reader.locator('code.hljs')).toBeVisible();await expect(reader.locator('.hljs-keyword')).not.toHaveCount(0);
 const image=reader.getByRole('img',{name:'Пиксель'});await image.scrollIntoViewIfNeeded();await expect(image).toBeVisible();
 await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1);
 await expect(reader.getByRole('button',{name:/Показать ответ/})).toHaveCount(0);await expect(reader.getByRole('textbox')).toHaveCount(0);
 await reader.getByRole('button',{name:'Далее',exact:true}).click();await expect(reader).toContainText('кот');await expect(reader).toContainText('кошка');
 await reader.getByRole('button',{name:'Далее',exact:true}).click();await expect(reader).toContainText('Сила: масса × ускорение.');
 await expect(reader).not.toContainText('{{c1::');await expect(reader.getByRole('button',{name:'Далее',exact:true})).toBeDisabled();
 await reader.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByPlaceholder('Поиск по вопросу, ответу или тегам').fill('Закон Ньютона');
 await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();await expect(page.getByRole('dialog').locator('[role=status]')).toHaveText('1 / 1');
 await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.context().setOffline(true);await page.reload();await nav(page,'Карточки');
 await page.getByRole('button',{name:'Просмотр Формула и код',exact:true}).click();
 const offline=page.getByRole('dialog');const img=offline.getByRole('img',{name:'Пиксель'});await img.scrollIntoViewIfNeeded();
 await expect.poll(()=>img.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1);expect(await records(page)).toEqual(before);
});
test('stores test mistakes in Consider, clears only the study mark offline, and reopens after another error',async({page})=>{
 await boot(page);await nav(page,'Цели');await page.getByRole('button',{name:'Пробная проверка',exact:true}).click();
 await expect(page.locator('.session-progress>span')).toHaveText('1 / 3');
 for(let i=0;i<3;i++){await page.getByRole('button',{name:/Показать ответ/}).click();await page.locator(i===0?'.rating-1':'.rating-3').click();}
 await expect(page.locator('.session-summary')).toBeVisible();
 await expect(page.locator('.session-summary .notice')).toContainText('Формула и код');
 await page.getByRole('button',{name:'Разобрать карточки',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Изучил');
 await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('button',{name:'Вернуться к сегодня',exact:true}).click();await nav(page,'Карточки');
 await page.getByRole('button',{name:'Рассмотреть (1)',exact:true}).click();await expect(page.locator('.card-table-row')).toHaveCount(1);
 const before=(await records(page)).filter(e=>e.kind==='review');
 await page.context().setOffline(true);await page.reload();await nav(page,'Карточки');
 await page.getByRole('button',{name:'Рассмотреть (1)',exact:true}).click();await page.getByRole('button',{name:'Изучить карточки',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Изучил',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();await expect(page.getByRole('heading',{name:'Всё рассмотрено',exact:true})).toBeVisible();
 const after=await records(page);expect(after.filter(e=>e.kind==='review')).toEqual(before);expect(after.filter(e=>e.kind==='study.resolve')).toHaveLength(1);
 expect(after.filter(e=>e.kind==='study.introduce')).toHaveLength(0);
 await page.reload();await nav(page,'Карточки');await expect(page.getByRole('button',{name:'Рассмотреть (0)',exact:true})).toBeVisible();
 await nav(page,'Цели');await page.getByRole('button',{name:'Пробная проверка',exact:true}).click();await expect(page.locator('.question-markdown')).toContainText('Объясни');
 await page.getByRole('button',{name:/Показать ответ/}).click();await page.locator('.rating-1').click();await page.getByRole('button',{name:'Завершить',exact:true}).click();
 await nav(page,'Карточки');await page.getByRole('button',{name:'Рассмотреть (1)',exact:true}).click();await expect(page.locator('.card-table-row')).toContainText('Формула и код');
});
test('changes the activity range and count, keeps the choice, and contains scrolling on a narrow phone',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined,viewport:{width:320,height:568},screen:{width:320,height:568}} as any),page=await context.newPage();
 try{
  await boot(page,true);await nav(page,'Настройки');await page.getByLabel('Размер текста').selectOption('extra');await page.getByRole('button',{name:'Тёмное',exact:true}).click();await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-text-size','extra');await nav(page,'Статистика');const panel=page.locator('.activity-rhythm'),period=page.getByLabel('Период ритма');
  await expect(panel).toContainText('2 ответа за период');await expect(panel.locator('[data-date]')).toHaveCount(84);
  await period.selectOption('month');await expect(panel).toContainText('1 ответ за период');
  await period.selectOption('half-year');await expect(panel).toContainText('2 ответа за период');
  await period.selectOption('year');await expect(panel).toContainText('3 ответа за период');expect(await panel.locator('[data-date]').count()).toBeGreaterThanOrEqual(365);
  expect(await panel.locator('.activity-calendar-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  const monthRows=await panel.locator('.activity-months>span').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().top));expect(new Set(monthRows).size).toBe(1);
  await page.locator('.toast').waitFor({state:'hidden'});await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/ui/rhythm-phone-year.png'});
  await context.setOffline(true);await page.reload();await nav(page,'Статистика');await expect(page.getByLabel('Период ритма')).toHaveValue('year');
  await nav(page,'Карточки');await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();
  const reader=page.getByRole('dialog');await expect(reader.getByRole('button',{name:'Далее',exact:true})).toBeVisible();
  const studied=reader.getByRole('button',{name:'Изучил',exact:true});await expect(studied).toBeVisible();const studiedBox=await studied.boundingBox();expect(studiedBox!.y+studiedBox!.height).toBeLessThanOrEqual(568);
  const box=await reader.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(321);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/ui/reader-phone.png'});
 }finally{await context.close();}
});
