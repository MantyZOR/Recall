import { test, expect, devices, type Page, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const markdown=(count=1,type='basic')=>'---\ndeck: Проверка интерфейса\n---\n'+Array.from({length:count},(_,i)=>'## ['+type+'] Вопрос '+(i+1)+'\nСколько будет 6 × 7? Номер '+(i+1)+'\n:::answer\n42').join('\n\n');
async function boot(context:BrowserContext,page:Page){
 await context.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Тест без компьютера'})}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
}
async function openImport(page:Page){await page.getByRole('button',{name:'Импорт .md',exact:true}).click();return page.getByRole('dialog');}
async function importText(page:Page,text:string){
 const dialog=await openImport(page);await dialog.getByLabel('Или вставь текст').fill(text);
 await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);
}
async function nav(page:Page,name:string){
 if(await page.getByRole('button',{name:'Открыть меню',exact:true}).isVisible())await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
 if(name==='Настройки')await page.locator('.settings-nav').click();
 else await page.locator('.sidebar nav').getByRole('button',{name:new RegExp('^'+name)}).click();
}
async function save(page:Page){
 await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
 await expect(page.getByText('Настройки сохранены',{exact:true})).toBeVisible();
}
async function drop(page:Page,files:{name:string;bytes:Uint8Array}[]){
 const transfer=await page.evaluateHandle(files=>{
  const data=new DataTransfer();
  for(const file of files)data.items.add(new File([Uint8Array.from(file.bytes)],file.name));
  return data;
 },files.map(f=>({name:f.name,bytes:Array.from(f.bytes)})));
 try{
  await page.locator('body').dispatchEvent('dragover',{dataTransfer:transfer});
  await expect(page.locator('.import-body')).toHaveClass(/dragging/);
  await page.locator('body').dispatchEvent('drop',{dataTransfer:transfer});
  await expect(page.locator('.import-body')).not.toHaveClass(/dragging/);
 }finally{await transfer.dispose();}
}
async function noOverflow(page:Page){
 const result=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,x:scrollX}));
 expect(result.scroll,JSON.stringify(result)).toBeLessThanOrEqual(result.width+1);expect(result.x).toBe(0);
}
async function contrast(page:Page,selector:string){
 let ratios:number[]=[];
 // Saving the profile remounts Settings; wait for attached controls and computed colours.
 await expect.poll(async()=>{
  ratios=await page.locator(selector).evaluateAll(elements=>elements.map(el=>{
   const rgb=(s:string)=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
   const luminance=(s:string)=>{const c=rgb(s);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
   if(!el.isConnected)return NaN;
   const c=getComputedStyle(el),background=getComputedStyle(el.closest('button')!).backgroundColor,a=luminance(c.color),b=luminance(background);
   return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }));
  return ratios.length>0&&ratios.every(Number.isFinite);
 },{message:'Controls must have computed colours before measuring contrast'}).toBe(true);
 return ratios;
}

test('accepts dragged Markdown and ZIP, preserves preview after invalid drops, and keeps import resources in one place',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 try{
  await boot(context,page);let dialog=await openImport(page);const url=page.url();
  await expect(dialog.getByRole('button',{name:'Набор для ИИ и импорта',exact:true})).toHaveCount(1);
  for(const name of ['Вставить пример','Пример .md','Методичка по импорту'])await expect(dialog.getByRole('button',{name,exact:true})).toHaveCount(0);
  await drop(page,[{name:'cards.md',bytes:strToU8(markdown(20))}]);
  await expect(dialog.locator('.import-preview h3')).toHaveText('20 карточек');
  await expect(dialog.locator('.import-file-status')).toContainText('cards.md');expect(page.url()).toBe(url);
  await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(page.locator('.nav-count')).toHaveText('20');
  dialog=await openImport(page);
  await drop(page,[{name:'bad.txt',bytes:strToU8('bad')}]);await expect(page.getByText('Выбери Markdown (.md) или ZIP-архив',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Добавить карточки',exact:true})).toBeDisabled();
  await drop(page,[{name:'cards.zip',bytes:zipSync({'cards.md':strToU8(markdown())})}]);
  await expect(dialog.locator('.import-preview h3')).toHaveText('1 карточек');
  await drop(page,[{name:'one.md',bytes:strToU8(markdown())},{name:'two.md',bytes:strToU8(markdown(2))}]);
  await expect(page.getByText('Перетащи один Markdown-файл или ZIP-архив',{exact:true})).toBeVisible();
  await expect(dialog.locator('.import-file-status')).toContainText('cards.zip');await expect(dialog.locator('.import-preview h3')).toHaveText('1 карточек');
  await dialog.getByLabel('Или вставь текст').fill(markdown(2));await expect(dialog.locator('.import-preview h3')).toHaveText('2 карточек');
  await expect(dialog.locator('.import-file-status')).toHaveCount(0);
  await page.screenshot({path:'test-results/ui/import-desktop-refined.png'});
  await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
  await nav(page,'Справка');await page.getByRole('textbox',{name:'Поиск по справке'}).fill('Markdown');
  await page.getByRole('navigation',{name:'Темы справки'}).getByRole('button',{name:/Карточки и Markdown/}).click();
  await expect(page.locator('.wiki-article')).toContainText('Набор для ИИ и импорта');
  await expect(page.getByRole('button',{name:'Набор для ИИ и импорта',exact:true})).toHaveCount(0);
  await context.setOffline(true);await page.getByRole('button',{name:'Перейти к импорту',exact:true}).click();
  const downloaded=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'Набор для ИИ и импорта',exact:true}).click();
  const kit=unzipSync(readFileSync((await (await downloaded).path())!));
  expect(strFromU8(kit['import-guide.md'])).toBe(readFileSync('docs/markdown-format.md','utf8'));
  expect(kit['ai-prompt.md']).toBeDefined();expect(kit['template.md']).toBeDefined();expect(kit['examples/code-and-math.md']).toBeDefined();
 }finally{await context.close();}
});

test('centers the count, gives sidebar labels enough room, and persists six readable accents in both themes',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();let second:BrowserContext|undefined;
 try{
  await boot(context,page);await importText(page,markdown(20));
  const centered=await page.locator('.nav-count').evaluate(el=>{
   const box=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect();
   return {x:Math.abs(text.x+text.width/2-box.x-box.width/2),y:Math.abs(text.y+text.height/2-box.y-box.height/2)};
  });
  expect(centered.x).toBeLessThanOrEqual(1);expect(centered.y).toBeLessThanOrEqual(2);
  await nav(page,'Настройки');await page.getByLabel('Размер текста').selectOption('extra');await save(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size','extra');
  const labelsFit=await page.locator('.sidebar-sync>span:last-child').evaluate(el=>{
   const c=getComputedStyle(el),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;
   ctx.font=c.font;return ['Сохранено на компьютере','На твоих устройствах'].every(text=>ctx.measureText(text).width<=el.getBoundingClientRect().width);
  });
  expect(labelsFit).toBe(true);
  expect(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).scrollbarColor)).not.toBe('auto');
  const names=[['violet','Фиолетовый'],['blue','Синий'],['emerald','Изумрудный'],['berry','Ягодный'],['amber','Янтарный'],['slate','Графитовый']];
  for(const theme of ['Светлое','Тёмное']){
   for(const [id,name] of names){
    await page.getByRole('button',{name:theme,exact:true}).click();await page.getByRole('group',{name:'Акцентный цвет',exact:true}).getByRole('button',{name,exact:true}).click();await save(page);
    await expect(page.locator('html')).toHaveAttribute('data-accent',id);
    const ratios=await contrast(page,'.page-actions .button.primary');for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
    await nav(page,'Сегодня');const start=page.getByRole('button',{name:'Начать повторение',exact:true});
    await start.hover();expect(await start.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    for(const ratio of await contrast(page,'.hero-actions .button.primary'))expect(ratio).toBeGreaterThanOrEqual(4.5);
    await noOverflow(page);
    if(id==='emerald'&&theme==='Светлое')await page.screenshot({path:'test-results/ui/desktop-emerald.png',fullPage:true});
    await nav(page,'Настройки');
   }
  }
  await page.reload();await expect(page.getByRole('heading',{name:'Знания, которые остаются.'})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-accent','slate');
  await nav(page,'Настройки');await expect(page.getByRole('group',{name:'Акцентный цвет',exact:true}).getByRole('button',{name:'Графитовый',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'test-results/ui/desktop-settings-accents.png',fullPage:true});
  second=await browser.newContext();const other=await second.newPage();await boot(second,other);await expect(other.locator('html')).toHaveAttribute('data-accent','violet');
 }finally{await second?.close();await context.close();}
});

test('keeps settings and import inside narrow phones and makes ratings readable with large text',async({browser})=>{
 for(const width of [428,360,320]){
  const context=await browser.newContext({...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined,viewport:{width,height:926},screen:{width,height:926}} as any),page=await context.newPage();
  try{
   await boot(context,page);await nav(page,'Настройки');await page.getByLabel('Размер текста').selectOption('extra');
   await page.getByRole('group',{name:'Акцентный цвет',exact:true}).getByRole('button',{name:'Синий',exact:true}).click();
   await page.getByRole('button',{name:width===320?'Тёмное':'Светлое',exact:true}).click();await save(page);await noOverflow(page);
   const palette=await page.locator('.accent-picker button').evaluateAll(buttons=>buttons.map(button=>{const text=button.lastElementChild!,range=document.createRange();range.selectNodeContents(text);const label=range.getBoundingClientRect(),bounds=button.getBoundingClientRect();return label.left>=bounds.left&&label.right<=bounds.right&&range.getClientRects().length===1;}));
   expect(palette).toEqual([true,true,true,true,true,true]);
   await page.evaluate(()=>scrollTo({left:1000,top:500}));await noOverflow(page);
   const cdp=await context.newCDPSession(page);
   for(const direction of [-1,1]){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:500}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2+direction*90,y:500}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await noOverflow(page);
   }
   await cdp.detach();
   await page.screenshot({path:'test-results/ui/settings-refined-'+width+'.png',fullPage:true});
   await nav(page,'Сегодня');const dialog=await openImport(page);
   const file=await dialog.locator('.import-dropzone').boundingBox(),kit=await dialog.getByRole('button',{name:'Набор для ИИ и импорта',exact:true}).boundingBox();
   expect(Math.abs(file!.x-kit!.x)).toBeLessThanOrEqual(1);expect(Math.abs(file!.width-kit!.width)).toBeLessThanOrEqual(1);
   await noOverflow(page);await page.screenshot({path:'test-results/ui/import-refined-'+width+'.png'});
   await dialog.getByLabel('Или вставь текст').fill(markdown(1,'input'));await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();
   await page.getByRole('button',{name:'Начать повторение',exact:true}).click();await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await page.getByPlaceholder('Твой ответ…').fill('42');
   await page.getByRole('button',{name:/Показать ответ/}).click();await expect(page.locator('.rating-3 .rating-recommendation')).toHaveText('Рекомендуем');
   const buttons=await page.locator('.rating').evaluateAll(elements=>elements.map(el=>{
    const box=el.getBoundingClientRect();return {left:box.left,right:box.right,height:box.height,color:getComputedStyle(el).backgroundColor,label:parseFloat(getComputedStyle(el.querySelector('strong')!).fontSize),interval:parseFloat(getComputedStyle(el.querySelector('.rating-interval')!).fontSize)};
   }));
   expect(new Set(buttons.map(b=>b.color)).size).toBe(4);
   for(const button of buttons){expect(button.left).toBeGreaterThanOrEqual(0);expect(button.right).toBeLessThanOrEqual(width);expect(button.height).toBeGreaterThanOrEqual(44);expect(button.height).toBeLessThanOrEqual(80);expect(button.label).toBeGreaterThanOrEqual(17);expect(button.interval).toBeGreaterThanOrEqual(17);}
   for(const ratio of await contrast(page,'.rating strong'))expect(ratio).toBeGreaterThanOrEqual(4.5);
   for(const ratio of await contrast(page,'.rating .rating-interval'))expect(ratio).toBeGreaterThanOrEqual(4.5);
   await expect(page.locator('.mobile-bottom')).toBeHidden();
   const positions=await page.locator('.rating').evaluateAll(buttons=>buttons.map(el=>{const b=el.getBoundingClientRect();return {top:b.top,bottom:b.bottom};}));
   expect(new Set(positions.map(p=>p.top)).size).toBe(1);for(const position of positions)expect(position.bottom).toBeLessThanOrEqual(926);
   await noOverflow(page);await page.screenshot({path:'test-results/ui/ratings-refined-'+width+'.png'});
   await page.locator('.rating-buttons').screenshot({path:'test-results/ui/compact-ratings-'+width+'.png'});
   await page.locator('.rating-3').click();await expect(page.getByRole('heading',{name:'Ещё немного осталось с тобой.'})).toBeVisible();
  }finally{await context.close();}
 }
});
