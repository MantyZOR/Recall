import http from 'node:http';
import { certificateProfile } from './certificate-profile.mjs';
import { renderSetupPage } from './setup-page.mjs';
import https from 'node:https';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, createReadStream, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventSchema, canonical, cursorOf, assetIds } from '../src/domain/protocol.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=path.resolve(process.env.RECALL_DATA_DIR||path.join(root,'data'));
mkdirSync(data,{recursive:true});mkdirSync(path.join(data,'assets'),{recursive:true});mkdirSync(path.join(data,'backups'),{recursive:true});
const db=new DatabaseSync(path.join(data,'recall.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,device TEXT NOT NULL,seq INTEGER NOT NULL,clock INTEGER NOT NULL,json TEXT NOT NULL,UNIQUE(device,seq)); CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,tokenHash TEXT NOT NULL,lastSeen INTEGER NOT NULL,cursorJson TEXT NOT NULL DEFAULT \'{}\',lastSync INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,size INTEGER NOT NULL);');
const controlPath=path.join(data,'control.json');
const control=existsSync(controlPath)?JSON.parse(readFileSync(controlPath,'utf8')):{serverId:randomUUID(),desktopId:randomUUID(),token:randomBytes(32).toString('base64url')};
if(!existsSync(controlPath))writeFileSync(controlPath,JSON.stringify(control),{mode:0o600});
const hash=v=>createHash('sha256').update(v).digest('hex');
db.prepare('INSERT OR IGNORE INTO devices(id,name,role,tokenHash,lastSeen) VALUES(?,?,?,?,?)').run(control.desktopId,'Мой компьютер','desktop',hash(control.token),Date.now());
const certDirectory=path.resolve(process.env.RECALL_CERTS_DIR||path.join(root,'certs'));
const tlsConfigPath=path.join(certDirectory,'config.json');
const tlsConfig=!process.argv.includes('--http-only')&&existsSync(tlsConfigPath)?JSON.parse(readFileSync(tlsConfigPath,'utf8').replace(/^\uFEFF/,'')):null;
const port=Number(process.env.RECALL_PORT||8787),tlsPort=Number(process.env.RECALL_TLS_PORT||8443);
const bootstrapPort=Number(process.env.RECALL_BOOTSTRAP_PORT||8788);
const origin=tlsConfig?new URL(tlsConfig.origin):null;if(origin)origin.port=String(tlsPort);
const publicOrigin=origin?.origin||null,bootstrapOrigin=tlsConfig?new URL(tlsConfig.bootstrapOrigin):null;if(bootstrapOrigin)bootstrapOrigin.port=String(bootstrapPort);
const allowedHosts=new Set(['localhost:'+port,'127.0.0.1:'+port,...(tlsConfig?['localhost:'+tlsPort,'127.0.0.1:'+tlsPort,origin.host]:[])]);
const allowedOrigins=new Set([...allowedHosts].map(h=>(h.endsWith(':'+tlsPort)?'https://':'http://')+h));
if(process.argv.includes('--dev')){allowedOrigins.add('http://localhost:5173');allowedOrigins.add('http://127.0.0.1:5173');}
let pairing=null,lastBackup=0;
const rate=new Map();
function limited(req){const ip=req.socket.remoteAddress||'';const entry=rate.get(ip)||{at:Date.now(),count:0};if(Date.now()-entry.at>60000){entry.at=Date.now();entry.count=0;}entry.count++;rate.set(ip,entry);return entry.count>20;}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,max=8*1024*1024){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('Слишком большой запрос'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
async function jsonBody(req,max=5*1024*1024){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Object.assign(new Error('Ожидается JSON'),{status:415});try{return JSON.parse((await body(req,max)).toString('utf8'));}catch(e){if(e.status)throw e;throw Object.assign(new Error('Некорректный JSON'),{status:400});}}
function authenticate(req){const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!token)return null;const digest=hash(token);return db.prepare('SELECT id,name,role,lastSeen FROM devices WHERE tokenHash=?').get(digest)||null;}
function ensureOrigin(req){const requestOrigin=req.headers.origin;if(requestOrigin&&!allowedOrigins.has(requestOrigin))throw Object.assign(new Error('Недопустимый источник запроса'),{status:403});if(!allowedHosts.has(req.headers.host))throw Object.assign(new Error('Недопустимый адрес сервера'),{status:403});}
function loopback(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);}
function allEvents(){return db.prepare('SELECT json FROM events ORDER BY clock,device,seq,id').all().map(r=>JSON.parse(r.json));}
function backup(force=false){if(!force&&Date.now()-lastBackup<3600000)return;const stamp=new Date().toISOString().replace(/[:.]/g,'-');const target=path.join(data,'backups',stamp+'.sqlite');db.exec("VACUUM INTO '"+target.replaceAll("'","''")+"'");lastBackup=Date.now();const files=readdirSync(path.join(data,'backups')).filter(f=>f.endsWith('.sqlite')).sort();for(const f of files.slice(0,Math.max(0,files.length-30)))unlinkSync(path.join(data,'backups',f));}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.woff2':'font/woff2','.cer':'application/pkix-cert'};
async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 try {
  ensureOrigin(req);const url=new URL(req.url,'http://localhost'),route=url.pathname;
  if(route==='/api/health'&&req.method==='GET'){json(res,200,{ok:true,serverId:control.serverId,origin:publicOrigin,https:Boolean(tlsConfig)});return;}
  if(route==='/recall.mobileconfig'&&req.method==='GET'&&tlsConfig){res.writeHead(200,{'Content-Type':'application/x-apple-aspen-config','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(certificateProfile(readFileSync(path.join(certDirectory,'rootCA.cer'))));return;}
  if(route==='/ca.cer'&&req.method==='GET'&&tlsConfig){res.writeHead(200,{'Content-Type':'application/pkix-cert','Content-Disposition':'attachment; filename="Recall-Local-CA.cer"'});res.end(readFileSync(path.join(certDirectory,'rootCA.cer')));return;}
  if(route==='/api/local-bootstrap'&&req.method==='POST'){
   if(!loopback(req)||!/^localhost:|^127\.0\.0\.1:/.test(req.headers.host)||req.headers['sec-fetch-site']==='cross-site')throw Object.assign(new Error('Первоначальный доступ доступен только на ПК'),{status:403});
   await jsonBody(req);json(res,200,{token:control.token,serverId:control.serverId,role:'desktop',at:Date.now()});return;
  }
  if(route==='/api/pair/accept'&&req.method==='POST'){
   if(!req.socket.encrypted)throw Object.assign(new Error('Сопряжение выполняется через защищённый HTTPS-адрес'),{status:403});
   if(limited(req))throw Object.assign(new Error('Слишком много попыток. Подожди минуту.'),{status:429});
   const input=await jsonBody(req,4096),provided=String(input.secret||'');
   if(!pairing||pairing.expiresAt<Date.now()||!((/^[A-Za-z0-9_-]{32}$/.test(provided)&&timingSafeEqual(Buffer.from(provided),Buffer.from(pairing.secret)))||(/^[A-Z2-9]{8}$/.test(provided.toUpperCase())&&timingSafeEqual(Buffer.from(provided.toUpperCase()),Buffer.from(pairing.code)))))throw Object.assign(new Error('Код сопряжения истёк или неверен'),{status:403});
   if(db.prepare("SELECT id FROM devices WHERE role='phone'").get())throw Object.assign(new Error('Телефон уже подключён. Сначала отключи старое устройство на ПК.'),{status:409});
   if(typeof input.deviceId!=='string'||input.deviceId.length>160||typeof input.name!=='string'||!input.name.trim())throw Object.assign(new Error('Некорректное имя устройства'),{status:400});
   const token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO devices(id,name,role,tokenHash,lastSeen) VALUES(?,?,?,?,?)').run(input.deviceId,input.name.slice(0,80),'phone',hash(token),Date.now());pairing=null;
   json(res,200,{token,serverId:control.serverId,role:'phone',at:Date.now()});return;
  }
  if(route.startsWith('/api/')){
   const device=authenticate(req);if(!device){json(res,401,{error:'Подключи устройство к этому ПК'});return;}
   db.prepare('UPDATE devices SET lastSeen=? WHERE id=?').run(Date.now(),device.id);
   if(route==='/api/status'&&req.method==='GET'){
    const backups=readdirSync(path.join(data,'backups')).filter(f=>f.endsWith('.sqlite')).sort().reverse();
    json(res,200,{serverId:control.serverId,origin:publicOrigin,https:Boolean(tlsConfig),bootstrapOrigin:bootstrapOrigin?.origin,fingerprint:tlsConfig?.fingerprint,expires:tlsConfig?.expires,devices:db.prepare('SELECT id,name,role,lastSeen,lastSync,cursorJson FROM devices').all().map(d=>({...d,cursor:JSON.parse(d.cursorJson)})),backupCount:backups.length,lastBackup:backups[0]||null,events:db.prepare('SELECT COUNT(*) AS n FROM events').get().n});return;
   }
   if(route==='/api/pair/create'&&req.method==='POST'){
    if(device.role!=='desktop')throw Object.assign(new Error('Код создаётся на компьютере'),{status:403});
    if(!tlsConfig)throw Object.assign(new Error('Сначала настрой локальный HTTPS: npm run setup:tls'),{status:409});
    pairing={secret:randomBytes(24).toString('base64url'),code:Array.from(randomBytes(8),b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join(''),expiresAt:Date.now()+120000};
    json(res,200,{...pairing,url:publicOrigin+'/#pair='+pairing.secret});return;
   }
   if(route==='/api/pair/revoke'&&req.method==='POST'){if(device.role!=='desktop')throw Object.assign(new Error('Отключение доступно на ПК'),{status:403});db.prepare("DELETE FROM devices WHERE role='phone'").run();pairing=null;json(res,200,{ok:true});return;}
   if(route==='/api/backup'&&req.method==='POST'){if(device.role!=='desktop')throw Object.assign(new Error('Резервные копии создаются на ПК'),{status:403});backup(true);json(res,200,{ok:true});return;}
   if(route==='/api/assets/check'&&req.method==='POST'){const input=await jsonBody(req);if(!Array.isArray(input.ids)||input.ids.length>100000||input.ids.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw Object.assign(new Error('Некорректные вложения'),{status:400});const find=db.prepare('SELECT id FROM assets WHERE id=?');json(res,200,{missing:input.ids.filter(id=>!find.get(id))});return;}
   if(route.startsWith('/api/asset/')){
    const id=route.slice('/api/asset/'.length);if(!/^[a-f0-9]{64}$/.test(id))throw Object.assign(new Error('Некорректный ID файла'),{status:400});
    const file=path.join(data,'assets',id);
    if(req.method==='PUT'){
     const bytes=await body(req),type=String(req.headers['content-type']||'');if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type))throw Object.assign(new Error('Некорректный тип изображения'),{status:415});
     if(hash(bytes)!==id)throw Object.assign(new Error('Контрольная сумма изображения не совпадает'),{status:400});
     if(!existsSync(file))writeFileSync(file,bytes,{flag:'wx'});
     const name=decodeURIComponent(String(req.headers['x-asset-name']||'image')).slice(0,160);
     db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?,?,?)').run(id,name,type,bytes.length);json(res,200,{ok:true});return;
    }
    if(req.method==='GET'){const meta=db.prepare('SELECT name,type,size FROM assets WHERE id=?').get(id);if(!meta)throw Object.assign(new Error('Изображение не найдено'),{status:404});res.writeHead(200,{'Content-Type':meta.type,'Content-Length':meta.size,'X-Asset-Name':encodeURIComponent(meta.name),'Cache-Control':'no-store'});createReadStream(file).pipe(res);return;}
   }
   if(route==='/api/sync/ack'&&req.method==='POST'){const input=await jsonBody(req);if(!input.cursor||typeof input.cursor!=='object'||Object.values(input.cursor).some(n=>!Number.isSafeInteger(n)||n<0))throw Object.assign(new Error('Некорректное подтверждение'),{status:400});db.prepare('UPDATE devices SET cursorJson=?,lastSync=? WHERE id=?').run(JSON.stringify(input.cursor),Date.now(),device.id);json(res,200,{ok:true});return;}
   if(route==='/api/device/name'&&req.method==='POST'){const input=await jsonBody(req,4096);if(typeof input.name!=='string'||!input.name.trim())throw Object.assign(new Error('Введи имя устройства'),{status:400});db.prepare('UPDATE devices SET name=? WHERE id=?').run(input.name.slice(0,80),device.id);json(res,200,{ok:true});return;}
   if(route==='/api/sync'&&req.method==='POST'){
    const input=await jsonBody(req),incoming=input.events||[],cursor=input.cursor||{};
    if(!Array.isArray(incoming)||incoming.length>300||typeof cursor!=='object'||Object.values(cursor).some(n=>!Number.isSafeInteger(n)||n<0))throw Object.assign(new Error('Некорректный пакет обмена'),{status:400});
    const events=incoming.map(e=>EventSchema.parse(e));let changed=0;
    const read=db.prepare('SELECT json FROM events WHERE id=?'),readSeq=db.prepare('SELECT id FROM events WHERE device=? AND seq=?'),write=db.prepare('INSERT INTO events VALUES(?,?,?,?,?)'),readAsset=db.prepare('SELECT id FROM assets WHERE id=?');
    for(const id of assetIds(events))if(!readAsset.get(id))throw Object.assign(new Error('Сначала передай вложения'),{status:409});
    db.exec('BEGIN IMMEDIATE');
    try {
     const batch=new Map(events.map(e=>[e.id,e]));
     for(const e of events){
      const old=read.get(e.id);if(old){if(old.json!==canonical(e))throw Object.assign(new Error('Конфликт содержимого события'),{status:409});continue;}
      const same=readSeq.get(e.deviceId,e.seq);if(same&&same.id!==e.id)throw Object.assign(new Error('Конфликт номера события'),{status:409});
      for(const dep of e.deps){const parent=batch.get(dep)||JSON.parse(read.get(dep)?.json||'null');if(parent&&parent.clock>=e.clock)throw Object.assign(new Error('Нарушен порядок событий'),{status:400});}
      write.run(e.id,e.deviceId,e.seq,e.clock,canonical(e));changed++;
     }db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    if(changed)backup();
    const all=allEvents(),missing=all.filter(e=>e.seq>(cursor[e.deviceId]||0));
    json(res,200,{events:missing.slice(0,500),more:missing.length>500,ack:cursorOf(all),assetIds:assetIds(missing.slice(0,500))});return;
   }
   throw Object.assign(new Error('Маршрут не найден'),{status:404});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')throw Object.assign(new Error('Метод не поддерживается'),{status:405});
  const dist=path.join(root,'dist');let file=path.resolve(dist,'.'+decodeURIComponent(route));
  if(file!==dist&&!file.startsWith(dist+path.sep))throw Object.assign(new Error('Недопустимый путь'),{status:403});
  if(route==='/'||!path.extname(file))file=path.join(dist,'index.html');
  if(!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end('Приложение ещё не собрано. Выполни npm run build.');return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':route==='/sw.js'||path.extname(file)==='.html'?'no-cache':'public, max-age=86400'});
  if(req.method==='HEAD'){res.end();return;}createReadStream(file).pipe(res);
 }catch(e){if(res.headersSent){res.destroy();return;}json(res,e.status||(e.name==='ZodError'?400:500),{error:e.status||e.name==='ZodError'?e.message:'Не удалось выполнить операцию. Данные сохранены локально.'});if(!e.status&&e.name!=='ZodError')console.error(e.message);}
}
const servers=[];
const server=http.createServer(handler);servers.push(server);server.listen(port,'127.0.0.1',()=>console.log('Recall: http://localhost:'+port));
if(tlsConfig){const tls=https.createServer({key:readFileSync(path.join(certDirectory,'server-key.pem')),cert:readFileSync(path.join(certDirectory,'server.pem'))},handler);servers.push(tls);tls.listen(tlsPort,'0.0.0.0',()=>console.log('iPhone: '+publicOrigin));}
if(tlsConfig){
 const setupHtml=await renderSetupPage(publicOrigin);
 const certificateServer=http.createServer((req,res)=>{
  if(req.headers.host!==bootstrapOrigin.host){res.writeHead(403);res.end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const route=new URL(req.url,bootstrapOrigin.origin).pathname;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(route==='/recall.mobileconfig'){
   res.writeHead(200,{'Content-Type':'application/x-apple-aspen-config'});
   res.end(req.method==='HEAD'?undefined:certificateProfile(readFileSync(path.join(certDirectory,'rootCA.cer'))));return;
  }
  if(route==='/ca.cer'||route==='/ca.crt'){
   res.writeHead(200,{'Content-Type':route==='/ca.crt'?'application/x-x509-ca-cert':'application/pkix-cert','Content-Disposition':'attachment; filename="Recall-Local-CA.'+(route==='/ca.crt'?'crt':'cer')+'"'});
   res.end(req.method==='HEAD'?undefined:readFileSync(path.join(certDirectory,'rootCA.cer')));return;
  }
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?undefined:setupHtml);
 });
 servers.push(certificateServer);certificateServer.listen(bootstrapPort,'0.0.0.0',()=>console.log('Certificate setup: '+bootstrapOrigin.origin));
}
function shutdown(){for(const s of servers)s.close();db.close();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);






