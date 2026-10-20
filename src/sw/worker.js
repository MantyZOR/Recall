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
