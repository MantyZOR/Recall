import {test,expect,devices,type Page,type Locator} from '@playwright/test';

const mcc=String.raw`\frac{TP\cdot TN-FP\cdot FN}{\sqrt{(TP+FP)(TP+FN)(TN+FP)(TN+FN)}}`;
const sample=String.raw`---
deck: Формулы для проверки
---
## [basic] Формула MCC
Какая формула Matthews correlation coefficient (MCC)?
:::answer
Простая дробь: $\frac{a+b}{c+d}$.

Альтернативная запись: $${mcc}$.

$$
${mcc}
$$

Вложенные корни: $\sqrt{\frac{1+\sqrt{x^2+1}}{1+\frac{1}{x}}}$.
:::notes
Дроби и корни должны сохранять отступы между символами и линиями.
`;
async function nav(page:Page,name:string){
 if(await page.getByRole('button',{name:'Открыть меню',exact:true}).isVisible())await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
 await page.locator('.sidebar nav').getByRole('button',{name:new RegExp('^'+name)}).click();
}
async function checkFormulaLayout(root:Locator){
 await expect(root.locator('.katex-error')).toHaveCount(0);
 await root.page().evaluate(()=>document.fonts.ready);
 // A fraction uses smaller numerator/denominator glyphs and zero-height struts.
 // Incompatible KaTeX CSS left them full size and made the rule cross the text.
 const metrics=await root.locator('.mfrac').first().evaluate(el=>{
  const math=el.closest('.katex')!,size=el.querySelector('.sizing')!,strut=math.querySelector('.strut')!;
  return {ratio:parseFloat(getComputedStyle(size).fontSize)/parseFloat(getComputedStyle(math).fontSize),strutDisplay:getComputedStyle(strut).display};
 });
 expect(metrics.ratio).toBeCloseTo(.7,1);expect(metrics.strutDisplay).toBe('inline-block');
 for(const formula of await root.locator('.katex').all()){
  const bounds=await formula.evaluate(el=>{const math=el.getBoundingClientRect(),html=el.querySelector('.katex-html')!.getBoundingClientRect();return {mathTop:math.top,mathBottom:math.bottom,htmlTop:html.top,htmlBottom:html.bottom};});
  expect(bounds.htmlTop).toBeGreaterThanOrEqual(bounds.mathTop-1);expect(bounds.htmlBottom).toBeLessThanOrEqual(bounds.mathBottom+1);
 }
}

for(const phone of [false,true])test(`renders fractions and roots without collisions or page overflow (${phone?'phone':'desktop'})`,async({browser})=>{
 const context=await browser.newContext(phone?{...devices['iPhone 12 Pro Max'],defaultBrowserType:undefined} as any:{viewport:{width:1440,height:1100}}),page=await context.newPage();
 try{
  await context.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.goto('./');await page.getByRole('button',{name:'Импорт .md',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByLabel('Или вставь текст').fill(sample);await dialog.getByRole('button',{name:'Добавить карточки',exact:true}).click();await expect(dialog).toHaveCount(0);
  await nav(page,'Карточки');await page.getByRole('button',{name:'Предпросмотр',exact:true}).first().click();dialog=page.getByRole('dialog',{name:'Просмотр карточек'});
  await checkFormulaLayout(dialog);
  let scrolledInline=false;
  for(const width of phone?[320,375,428]:[1440]){
   await page.setViewportSize({width,height:phone?926:1100});
   for(const size of phone?['normal','extra']:['normal']){
    await page.locator('html').evaluate((el,size)=>el.setAttribute('data-text-size',size),size);
    expect(await dialog.locator('.card-reader-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await checkFormulaLayout(dialog);
    if(phone){
     const inline=dialog.locator('.card-reader-answer p').filter({hasText:'Альтернативная запись'}).locator('.katex');
     if(await inline.evaluate(el=>el.scrollWidth>el.clientWidth)){
      expect(await inline.evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft>0;})).toBe(true);scrolledInline=true;
     }
     await inline.evaluate(el=>{el.scrollLeft=0;});
     const display=dialog.locator('.katex-display');
     expect(await display.evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft>0;})).toBe(true);
     await display.evaluate(el=>{el.scrollLeft=0;});
    }
   }
  }
  if(phone)expect(scrolledInline).toBe(true);
  await page.locator('html').evaluate(el=>el.setAttribute('data-text-size','normal'));
  await dialog.locator('.card-reader-body').evaluate(el=>{el.scrollTop=0;});await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:`test-results/ui/math-reader-${phone?'phone':'desktop'}.png`,fullPage:true});
  await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.locator('.card-question').filter({hasText:'Формула MCC'}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Предпросмотр',exact:true}).click();
  await checkFormulaLayout(dialog.locator('.editor-preview'));await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
  await nav(page,'Сегодня');await page.getByRole('button',{name:'Начать повторение',exact:true}).click();
  await checkFormulaLayout(page.locator('.study-card'));
  await page.getByRole('button',{name:'Уже знаю — проверить',exact:true}).click();await page.getByRole('button',{name:/^Показать ответ/}).click();
  await checkFormulaLayout(page.locator('.study-card'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`test-results/ui/math-session-${phone?'phone':'desktop'}.png`,fullPage:true});
 }finally{await context.close();}
});
