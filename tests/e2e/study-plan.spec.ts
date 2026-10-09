import { test,expect,devices,type Page } from '@playwright/test';
async function boot(page:Page,kind='limits'){
 await page.context().route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Тест без ПК"}'}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.evaluate(async(kind)=>{
  const at=Date.now(),events:any[]=[];let clock=0;
  const put=(kind:string,entityId:string,payload:any,deps:string[]=[],time=at)=>{
   const id='seed'+(++clock);events.push({id,kind,entityId,payload,deps,clock,seq:clock,deviceId:'seed',at:time});return id;
  };
  const deck=(id:string,name:string)=>put('deck.put',id,{id,name,description:'Материал',color:'#7269dd',icon:'Aa',algorithm:'fsrs7',retention:.9,newPerDay:20});
  const card=(id:string,deckId:string,dep:string,extra:any={})=>put('card.put',id,{id,deckId,title:'Вопрос '+id,type:'basic',front:'Вопрос '+id+'?',back:'Ответ '+id,notes:'',aliases:[],tags:[],...extra},[dep]);
  const review=(id:string,version:string,time:number)=>put('review',id,{cardId:id,cardVersion:version,rating:3,elapsedDays:0,durationMs:10000,context:'review',hints:false,model:'FSRS-7/rust-scalar-v1',paramsId:'fsrs7-defaults-v1',retention:.9,prediction:null,previousReviewIds:[],sessionId:'seed'},[version],time);
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).map(v=>[v.type,v.value]));
  const date=new Date(Date.parse(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z')+8*86400000).toISOString().slice(0,10);
  const goal=(id:string,name:string,deckIds:string[])=>put('goal.put',id,{id,name,date,minutes:20,retention:.9,deckIds,importance:{},newPerDay:null});
  if(kind==='cloze'){
   const dep=deck('cloze','Пропуски');
   for(let i=1;i<=3;i++)card('cloze'+i,'cloze',dep,{type:'cloze',front:'{{c1::один}} {{c2::два}} {{c3::три}}',clozeIndex:i,siblingId:'source'});
  }else if(kind==='complete'){
   const dep=deck('done','Знакомая тема'),version=card('done-card','done',dep);review('done-card',version,at-1000);goal('done-goal','Продолжаем помнить',['done']);
  }else{
   const theory=deck('theory','Ревёрс теория'),practice=deck('reverse','Ревёрс практика'),ml=deck('ml','Machine Learning');
   for(let i=0;i<19;i++)card('theory'+i,'theory',theory);
   for(let i=0;i<8;i++)card('reverse'+i,'reverse',practice);
   for(let i=0;i<25;i++){const id='learned'+i;review(id,card(id,'ml',ml),at-1000);}
   for(let i=0;i<9;i++){const id='due'+i;review(id,card(id,'ml',ml),at-7*86400000);}
   goal('ml-goal','МашинЛёрнинг',['ml']);goal('reverse-goal','Реверс',['theory','reverse']);
  }
  await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('recall-local-v1');request.onsuccess=()=>{const database=request.result,tx=database.transaction('events','readwrite');events.forEach(e=>tx.objectStore('events').put(e));tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
 },kind);
 await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
}
async function nav(page:Page,name:string){
 if(await page.locator('.mobile-header').isVisible())await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
 await page.locator('.sidebar').getByRole('button',{name:new RegExp('^'+name)}).click();
}
async function records(page:Page){
 return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('recall-local-v1');r.onsuccess=()=>{const database=r.result,q=database.transaction('events').objectStore('events').getAll();q.onsuccess=()=>{database.close();resolve(q.result);};q.onerror=()=>reject(q.error);};}));
}
test('explains exhausted ordinary limits and shows the same nine due cards and three goal introductions that actually launch',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await nav(page,'Колоды');
 const theory=page.locator('.deck-tile').filter({has:page.getByRole('button',{name:'Ревёрс теория',exact:true})});
 await expect(theory).toContainText('19');await expect(theory).toContainText('0 знакомых');
 await expect(theory.getByRole('button',{name:'Лимит новых на сегодня',exact:true})).toBeDisabled();
 await expect(theory).toContainText('Эти карточки ещё не изучены');await expect(page.getByText('Всё повторено',{exact:true})).toHaveCount(0);
 await nav(page,'Цели');const ml=page.locator('.goal-card').filter({has:page.getByRole('heading',{name:'МашинЛёрнинг',exact:true})});
 await expect(ml.locator('.study-plan-status')).toContainText('Сейчас доступно: 9 карточек');await expect(ml.locator('.study-plan-counts')).toContainText('Повторить: 9');
 await ml.getByRole('button',{name:'Учиться по цели',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 9');await page.getByRole('button',{name:'Завершить',exact:true}).click();
 const reverse=page.locator('.goal-card').filter({has:page.getByRole('heading',{name:'Реверс',exact:true})});
 await expect(reverse.locator('.study-plan-counts')).toContainText('Новые: 3');await reverse.getByRole('button',{name:'Учиться по цели',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 3');
 expect(errors).toEqual([]);
});
test('can practice a blocked untouched deck and keeps real practice assessments and its reduced goal allowance offline',async({page})=>{
 await boot(page);await nav(page,'Колоды');const theory=page.locator('.deck-tile').filter({has:page.getByRole('button',{name:'Ревёрс теория',exact:true})});
 await theory.getByRole('button',{name:'Практика всей колоды',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('В занятии: 19 карточек из 19');await expect(dialog).toContainText('Оценки влияют на расписание');
 await dialog.getByLabel('Минут для этого занятия').fill('45');await dialog.getByRole('button',{name:'Начать практику',exact:true}).click();
 await expect(page.locator('.session-header')).toContainText('Дополнительная практика');await expect(page.locator('.session-time')).toContainText('45 мин');await expect(page.locator('.session-progress>span')).toHaveText('1 / 19');
 await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await page.getByRole('button',{name:/Показать ответ/}).click();await page.locator('.rating-3').click();
 await expect.poll(async()=>(await records(page)).filter(e=>e.kind==='review'&&e.payload.context==='practice').length).toBe(1);
 await page.getByRole('button',{name:'Завершить',exact:true}).click();await nav(page,'Цели');const reverse=page.locator('.goal-card').filter({has:page.getByRole('heading',{name:'Реверс',exact:true})});
 await expect(reverse.locator('.study-plan-counts')).toContainText('Новые: 2');await page.context().setOffline(true);await page.reload();await nav(page,'Цели');
 await expect(page.locator('.goal-card').filter({has:page.getByRole('heading',{name:'Реверс',exact:true})}).locator('.study-plan-counts')).toContainText('Новые: 2');
});
test('keeps a completed current plan disabled, shows its next review and allows additional goal practice',async({page})=>{
 await boot(page,'complete');await nav(page,'Цели');const goal=page.locator('.goal-card');
 await expect(goal.getByRole('button',{name:'Учиться по цели',exact:true})).toBeDisabled();await expect(goal).toContainText('Сейчас доступно: 0 карточек');
 await expect(goal).toContainText('Ближайшее назначенное повторение');await expect(goal).toContainText('Это не означает, что материал выучен навсегда');
 await goal.getByRole('button',{name:'Практика всех карточек',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('В занятии: 1 карточка из 1');
 await page.getByRole('dialog').getByRole('button',{name:'Начать практику',exact:true}).click();await expect(page.locator('.session-header')).toContainText('Дополнительная практика');
});
test('can include all cloze siblings in full practice on a narrow offline phone without changing scheduled separation',async({browser})=>{
 const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined,viewport:{width:320,height:568},screen:{width:320,height:568}} as any),page=await context.newPage();
 try{
  await boot(page,'cloze');await context.setOffline(true);await page.reload();await nav(page,'Колоды');
  await expect(page.locator('.study-plan-counts')).toContainText('Новые: 1');await page.getByRole('button',{name:'Практика всей колоды',exact:true}).click();const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('В занятии: 1 карточка из 3');await dialog.getByLabel('Разнести связанные пропуски').uncheck();await expect(dialog).toContainText('В занятии: 3 карточки из 3');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);await page.screenshot({path:'test-results/ui/practice-phone-dialog.png'});
  await dialog.getByRole('button',{name:'Начать практику',exact:true}).click();await expect(page.locator('.session-progress>span')).toHaveText('1 / 3');
  await page.getByRole('button',{name:'Завершить',exact:true}).click();await expect(page.locator('.study-plan-counts')).toContainText('Новые: 1');
 }finally{await context.close();}
});
