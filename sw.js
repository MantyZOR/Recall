const BASE="/Recall/";
const CACHE="recall-shell-dd91470e644a74af";
const URLS=["/Recall/assets/index-1oscM1c0.css","/Recall/assets/index-DGfh8dKk.js","/Recall/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2","/Recall/assets/KaTeX_AMS-Regular-DMm9YOAa.woff","/Recall/assets/KaTeX_AMS-Regular-DRggAlZN.ttf","/Recall/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf","/Recall/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff","/Recall/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2","/Recall/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff","/Recall/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2","/Recall/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf","/Recall/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf","/Recall/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff","/Recall/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2","/Recall/assets/KaTeX_Fraktur-Regular-CB_wures.ttf","/Recall/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2","/Recall/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff","/Recall/assets/KaTeX_Main-Bold-Cx986IdX.woff2","/Recall/assets/KaTeX_Main-Bold-Jm3AIy58.woff","/Recall/assets/KaTeX_Main-Bold-waoOVXN0.ttf","/Recall/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2","/Recall/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf","/Recall/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff","/Recall/assets/KaTeX_Main-Italic-3WenGoN9.ttf","/Recall/assets/KaTeX_Main-Italic-BMLOBm91.woff","/Recall/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2","/Recall/assets/KaTeX_Main-Regular-B22Nviop.woff2","/Recall/assets/KaTeX_Main-Regular-Dr94JaBh.woff","/Recall/assets/KaTeX_Main-Regular-ypZvNtVU.ttf","/Recall/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf","/Recall/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2","/Recall/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff","/Recall/assets/KaTeX_Math-Italic-DA0__PXp.woff","/Recall/assets/KaTeX_Math-Italic-flOr_0UB.ttf","/Recall/assets/KaTeX_Math-Italic-t53AETM-.woff2","/Recall/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf","/Recall/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2","/Recall/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff","/Recall/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2","/Recall/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff","/Recall/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf","/Recall/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf","/Recall/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff","/Recall/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2","/Recall/assets/KaTeX_Script-Regular-C5JkGWo-.ttf","/Recall/assets/KaTeX_Script-Regular-D3wIWfF6.woff2","/Recall/assets/KaTeX_Script-Regular-D5yQViql.woff","/Recall/assets/KaTeX_Size1-Regular-C195tn64.woff","/Recall/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf","/Recall/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2","/Recall/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf","/Recall/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2","/Recall/assets/KaTeX_Size2-Regular-oD1tc_U0.woff","/Recall/assets/KaTeX_Size3-Regular-CTq5MqoE.woff","/Recall/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf","/Recall/assets/KaTeX_Size3-Regular-gV2CO0n9.woff2","/Recall/assets/KaTeX_Size4-Regular-BF-4gkZK.woff","/Recall/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2","/Recall/assets/KaTeX_Size4-Regular-DWFBv043.ttf","/Recall/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff","/Recall/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2","/Recall/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf","/Recall/assets/optimizer.worker-DGNNTF0h.js","/Recall/fsrs7.wasm","/Recall/icon-180.png","/Recall/icon-192.png","/Recall/icon-512.png","/Recall/icon-maskable.png","/Recall/icon.ico","/Recall/icon.svg","/Recall/index.html","/Recall/manifest.webmanifest","/Recall/"];
const NETWORK_TIMEOUT_MS=4000;
async function networkResponse(request){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),NETWORK_TIMEOUT_MS);
 try{
  const response=await fetch(request,{signal:controller.signal});
  // Keep the deadline until the document/body is received, not just its headers.
  await response.clone().arrayBuffer();
  return response;
 }finally{clearTimeout(timer);}
}
function unavailablePage(){
 return new Response(`<!doctype html><html lang="ru"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recall</title><style>html{color-scheme:light dark}body{font:17px system-ui;max-width:560px;margin:15vh auto;padding:24px;line-height:1.65}h1{font-size:25px}a{color:#7067df}</style><main><h1>Нужно загрузить Recall</h1><p>На этом устройстве не найдена сохранённая версия приложения.</p><p>${BASE==='/'?'Включи компьютер с Recall, подключись к домашней сети и открой приложение ещё раз.':'Подключись к интернету и открой страницу Recall ещё раз.'} Дождись подготовки работы без сети.</p><p>Карточки и ответы хранятся отдельно на устройстве.</p><a href="${BASE}">Попробовать снова</a></main></html>`,{status:503,headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
 }});
}
async function cachedResponse(request,pathname){
 try{
  const cache=await caches.open(CACHE);
  return await cache.match(request)||await cache.match(pathname);
 }catch{return undefined;}
}
let repairing;
function repairShell(){
 if(repairing)return repairing;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 const requests=URLS.map(url=>new Request(new URL(url,self.location.origin),{cache:'reload',signal:controller.signal}));
 repairing=caches.open(CACHE).then(cache=>cache.addAll(requests)).catch(()=>{}).finally(()=>{clearTimeout(timer);repairing=undefined;});
 return repairing;
}
async function navigate(request){
 const cached=await cachedResponse(BASE+'index.html',BASE+'index.html');
 if(cached)return {response:cached};
 try{
  const response=await networkResponse(request);
  return {response,repair:response.ok};
 }catch{return {response:unavailablePage()};}
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
 caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('recall-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),
 self.clients.claim(),
])));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname==='/ca.cer')return;
 if(!url.pathname.startsWith(BASE))return;
 const applicationPage=url.pathname===BASE||url.pathname===BASE+'index.html'||!/\.[^/]*$/.test(url.pathname);
 if(request.mode==='navigate'&&applicationPage){
  const navigation=navigate(request);
  event.respondWith(navigation.then(result=>result.response));
  event.waitUntil(navigation.then(result=>result.repair?repairShell():undefined));
  return;
 }
 if(URLS.includes(url.pathname))event.respondWith(cachedResponse(request,url.pathname).then(cached=>cached||networkResponse(request)));
});
