import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync, strFromU8 } from 'fflate';
import { base, card, op, review } from '../fixtures';
const parent=path.resolve('test-results'),data=path.join(parent,'server-'+randomUUID()),port=18787,tlsPort=18443,bootstrapPort=18788;
let child:ChildProcess,token='',phoneToken='',pair:any,logs='';
const testCerts=path.join(data,'certs');let ca:Buffer;
function launch(){child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,RECALL_DATA_DIR:data,RECALL_CERTS_DIR:testCerts,RECALL_PORT:String(port),RECALL_TLS_PORT:String(tlsPort),RECALL_BOOTSTRAP_PORT:String(bootstrapPort)},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout?.on('data',b=>logs+=b);child.stderr?.on('data',b=>logs+=b);}
async function ready(){for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(logs);}
async function stop(){if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}}
function secure(route:string,body?:unknown,auth='',extra:Record<string,string>={},method?:string):Promise<{status:number;body:any;bytes:Buffer}>{
 return new Promise((resolve,reject)=>{const bytes=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));const req=httpsRequest({hostname:'localhost',port:tlsPort,path:'/api/'+route,method:method||(bytes?'POST':'GET'),ca,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(bytes?{'Content-Type':Buffer.isBuffer(body)?'image/png':'application/json','Content-Length':String(bytes.length)}:{}),...extra}},res=>{const chunks:Buffer[]=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const data=Buffer.concat(chunks);let value:any;try{value=JSON.parse(data.toString());}catch{value=data.toString();}resolve({status:res.statusCode!,body:value,bytes:data});});});req.on('error',reject);if(bytes)req.write(bytes);req.end();});
}
beforeAll(async()=>{mkdirSync(data,{recursive:true});const setup=spawnSync(process.execPath,['scripts/setup-tls.mjs','--address','127.0.0.1'],{env:{...process.env,RECALL_CERTS_DIR:testCerts},windowsHide:true,encoding:'utf8'});if(setup.status!==0)throw Error(setup.stderr);ca=readFileSync(path.join(testCerts,'rootCA.pem'));launch();await ready();const r=await fetch('http://127.0.0.1:'+port+'/api/local-bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});token=(await r.json()).token;expect(token).toBeTruthy();});
afterAll(async()=>{await stop();const resolved=path.resolve(data);if(!resolved.startsWith(parent+path.sep))throw Error('Unsafe test cleanup');rmSync(resolved,{recursive:true,force:true});});
describe('local TLS service, pairing, exchange and durable copies',()=>{
 it('requires authorization, rejects foreign origins and never exposes working data on the certificate endpoint',async()=>{
  expect((await secure('status')).status).toBe(401);expect((await secure('status',undefined,token,{Origin:'https://unrelated.example'})).status).toBe(403);
  const config=JSON.parse(readFileSync(path.join(testCerts,'config.json'),'utf8').replace(/^\uFEFF/,'')),host=new URL(config.bootstrapOrigin).hostname+':'+bootstrapPort;
  const r=await fetch('http://127.0.0.1:'+bootstrapPort+'/api/sync',{headers:{Host:host}});expect(r.headers.get('content-type')).toContain('text/html');expect((await r.text())).not.toContain(token);
  const cross=await fetch('http://127.0.0.1:'+port+'/api/local-bootstrap',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});expect(cross.status).toBe(403);
 });
 it('serves an installable Apple profile containing only the correct public root certificate',async()=>{
  const r=await fetch('http://127.0.0.1:'+bootstrapPort+'/recall.mobileconfig',{headers:{Host:'127.0.0.1:'+bootstrapPort}});expect(r.status).toBe(200);expect(r.headers.get('content-type')).toBe('application/x-apple-aspen-config');expect(r.headers.get('content-disposition')).toBeNull();
  const xml=await r.text();expect(xml).toContain('<plist version="1.0">');expect(xml).toContain('<string>Configuration</string>');expect(xml.match(/<string>com\.apple\.security\.root<\/string>/g)).toHaveLength(1);expect(xml).not.toContain(token);expect(xml).not.toContain('com.apple.mdm');
  const certificate=xml.match(/<data>([\s\S]*?)<\/data>/)?.[1];expect(certificate).toBeTruthy();expect(new X509Certificate(Buffer.from(certificate!,'base64')).fingerprint256).toBe(new X509Certificate(ca).fingerprint256);
  expect(readFileSync(path.join(testCerts,'Recall-Local-CA.mobileconfig'),'utf8')).toBe(xml);
 });
 it('serves platform setup and reinstallation instructions with only a public CA certificate',async()=>{
  const base='http://127.0.0.1:'+bootstrapPort,headers={Host:'127.0.0.1:'+bootstrapPort};
  const r=await fetch(base+'/',{headers}),html=await r.text();
  expect(r.status).toBe(200);expect(html).toContain('iPhone · Safari');expect(html).toContain('Android · Chrome');
  expect(html).toContain('Если удалил приложение');expect(html).toContain('data:image/png;base64,');
  expect(html).toContain('https://127.0.0.1:'+tlsPort);expect(html).not.toContain(token);
  expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
  const android=await fetch(base+'/ca.crt',{headers});expect(android.headers.get('content-disposition')).toContain('.crt');
  expect(Buffer.from(await android.arrayBuffer())).toEqual(readFileSync(path.join(testCerts,'rootCA.cer')));
  expect(new X509Certificate(Buffer.from(await (await fetch(base+'/ca.crt',{headers})).arrayBuffer())).ca).toBe(true);
 });
 it('creates one-use expiring pairing data and accepts it only via validated HTTPS',async()=>{
  pair=(await secure('pair/create',{},token)).body;expect(pair.code).toHaveLength(8);expect(pair.secret).toHaveLength(32);expect(pair.expiresAt-Date.now()).toBeLessThanOrEqual(120000);
  const r=await secure('pair/accept',{secret:pair.code,deviceId:'phone-test',name:'iPhone'});expect(r.status).toBe(200);phoneToken=r.body.token;
  expect((await secure('pair/accept',{secret:pair.code,deviceId:'second',name:'Other'})).status).toBe(403);
  expect((await secure('pair/create',{},phoneToken)).status).toBe(403);
 });
 it('deduplicates events, sends missing operations and tracks received data separately from stored data',async()=>{
  const first=await secure('sync',{events:base,cursor:{}},token);expect(first.status).toBe(200);expect(first.body.ack).toEqual({pc:2});expect(first.body.events).toHaveLength(2);
  const again=await secure('sync',{events:base,cursor:{pc:2}},token);expect(again.body.events).toEqual([]);
  const before=await secure('status',undefined,token);expect(before.body.devices.find((d:any)=>d.role==='phone').lastSync).toBe(0);
  const pulled=await secure('sync',{events:[],cursor:{}},phoneToken);expect(pulled.body.events).toHaveLength(2);
  await secure('sync/ack',{cursor:{pc:2}},phoneToken);
  const after=await secure('status',undefined,token);expect(after.body.devices.find((d:any)=>d.role==='phone').cursor).toEqual({pc:2});
 });
 it('rolls an entire batch back on any collision and retains both offline versions of a question',async()=>{
  const p=op('phone-edit','card.put',{...card,back:'С телефона'},['a1'],3,'phone',1);
  const changed={...base[1],payload:{...card,back:'Collision'}};
  expect((await secure('sync',{events:[p,changed],cursor:{}},phoneToken)).status).toBe(409);
  expect((await secure('status',undefined,token)).body.events).toBe(2);
  const pc=op('pc-edit','card.put',{...card,back:'С компьютера'},['a1'],3,'pc',3);
  expect((await secure('sync',{events:[pc,p],cursor:{}},token)).body.events).toHaveLength(4);
 });
 it('transfers hash-addressed binary images before related events and rejects corruption',async()=>{
  const bytes=Buffer.from([137,80,78,71,1,2,3]),hash=createHash('sha256').update(bytes).digest('hex');
  const c=op('image-card','card.put',{...card,id:'image',front:'![Пример](asset:'+hash+')'},['pc-edit'],4,'pc',4,'image');
  expect((await secure('sync',{events:[c],cursor:{}},token)).status).toBe(409);
  expect((await secure('asset/'+hash,Buffer.from('wrong'),token,{},'PUT')).status).toBe(400);
  expect((await secure('asset/'+hash,bytes,token,{'X-Asset-Name':encodeURIComponent('схема.png')},'PUT')).status).toBe(200);
  expect((await secure('sync',{events:[c],cursor:{}},token)).status).toBe(200);
  const asset=await secure('asset/'+hash,undefined,phoneToken);expect(asset.bytes).toEqual(bytes);
 });
 it('creates a readable SQLite snapshot with the entire journal',async()=>{
  expect((await secure('backup',{},token)).status).toBe(200);
  const files=readdirSync(path.join(data,'backups'));expect(files.length).toBeGreaterThan(0);
  const copy=new DatabaseSync(path.join(data,'backups',files.sort().at(-1)!),{readOnly:true});expect(copy.prepare('SELECT COUNT(*) n FROM events').get()!.n).toBe(5);copy.close();
  const recovered=path.join(data,'recovered.recall.zip');const exported=spawnSync(process.execPath,['scripts/export-backup.mjs','--snapshot',path.join(data,'backups',files.sort().at(-1)!),'--assets',path.join(data,'assets'),'--output',recovered],{windowsHide:true,encoding:'utf8'});expect(exported.status,exported.stderr+exported.stdout).toBe(0);
  const recoveredBytes=readFileSync(recovered),archive=unzipSync(recoveredBytes),manifest=JSON.parse(strFromU8(archive['manifest.json'])),history=JSON.parse(strFromU8(archive['events.json']));expect(manifest.format).toBe('recall-archive');expect(history).toHaveLength(5);expect(manifest.attachments).toHaveLength(1);expect(Array.from(archive[manifest.attachments[0].path])).toEqual([137,80,78,71,1,2,3]);expect(strFromU8(archive['events.json'])).not.toContain(token);expect(strFromU8(archive['manifest.json'])).not.toContain(phoneToken);
  const again=spawnSync(process.execPath,['scripts/export-backup.mjs','--snapshot',path.join(data,'backups',files.sort().at(-1)!),'--assets',path.join(data,'assets'),'--output',recovered],{windowsHide:true,encoding:'utf8'});expect(again.status).not.toBe(0);expect(readFileSync(recovered)).toEqual(recoveredBytes);
 });
 it('recovers the journal and authentication after a process restart',async()=>{
  await stop();launch();await ready();const status=await secure('status',undefined,token);expect(status.status).toBe(200);expect(status.body.events).toBe(5);expect((await secure('status',undefined,phoneToken)).status).toBe(200);
 });
 it('syncs primary study as an independent record and retains it after service restart',async()=>{
  const reading=op('study-read','study.introduce',{cardId:card.id,cardVersion:'pc-edit',durationMs:18000,context:'review',sessionId:'study'},['pc-edit'],5,'pc',5);
  const pushed=await secure('sync',{events:[reading],cursor:{}},token);expect(pushed.status).toBe(200);expect(pushed.body.events.find((e:any)=>e.id===reading.id)).toEqual(reading);
  const pulled=await secure('sync',{events:[],cursor:{}},phoneToken);expect(pulled.status).toBe(200);expect(pulled.body.events.find((e:any)=>e.id===reading.id).payload).not.toHaveProperty('rating');
  await stop();launch();await ready();const copy=await secure('sync',{events:[reading],cursor:{}},phoneToken);expect(copy.status).toBe(200);expect(copy.body.events.filter((e:any)=>e.id===reading.id)).toHaveLength(1);
 });
 it('syncs legacy, manual and automatic goal pace to the phone and keeps it after service restart',async()=>{
  const g={id:'legacy-goal',name:'Срок',date:'2026-10-20',minutes:30,retention:.9,deckIds:['deck'],importance:{}};
  const legacy=op('legacy-goal','goal.put',g,['study-read'],6,'pc',6,'legacy-goal');
  const manual=op('goal-manual','goal.put',{...g,id:'goal-pace',newPerDay:50},['legacy-goal'],7,'pc',7,'goal-pace');
  let pushed=await secure('sync',{events:[legacy,manual],cursor:{}},token);expect(pushed.status).toBe(200);
  let pulled=await secure('sync',{events:[],cursor:{}},phoneToken);
  expect(pulled.body.events.find((e:any)=>e.id===manual.id)).toEqual(manual);
  expect(pulled.body.events.find((e:any)=>e.id===legacy.id).payload).not.toHaveProperty('newPerDay');
  const auto=op('goal-auto','goal.put',{...g,id:'goal-pace',newPerDay:null},['goal-manual'],8,'pc',8,'goal-pace');
  pushed=await secure('sync',{events:[auto],cursor:{}},phoneToken);expect(pushed.status).toBe(200);
  await stop();launch();await ready();pulled=await secure('sync',{events:[],cursor:{}},token);
  expect(pulled.body.events.find((e:any)=>e.id===auto.id)).toEqual(auto);
 });
 it('revokes the old phone without deleting the journal and enforces HTTPS pairing',async()=>{
  expect((await secure('pair/revoke',{},token)).status).toBe(200);expect((await secure('status',undefined,phoneToken)).status).toBe(401);expect((await secure('status',undefined,token)).body.events).toBe(9);
  const r=await fetch('http://127.0.0.1:'+port+'/api/pair/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});expect(r.status).toBe(403);
 });
 it('syncs studied mistakes to another device and retains the mark after restart',async()=>{
  const mistake=op('attention-error','review',{...review,cardVersion:'pc-edit',context:'exam',rating:1},['pc-edit'],9,'attention',1);
  const studied=op('attention-studied','study.resolve',{cardId:card.id,reviewIds:[mistake.id]},[mistake.id],10,'attention',2);
  const result=await secure('sync',{events:[mistake,studied],cursor:{}},token);
  expect(result.status).toBe(200);
  const invite=(await secure('pair/create',{},token)).body;
  const phone=(await secure('pair/accept',{secret:invite.code,deviceId:'attention-phone',name:'Телефон'})).body.token;
  const pulled=await secure('sync',{events:[],cursor:{}},phone);
  expect(pulled.status).toBe(200);expect(pulled.body.events.find((e:any)=>e.id===studied.id)).toEqual(studied);
  await stop();launch();await ready();
  const after=await secure('sync',{events:[mistake,studied],cursor:{}},phone);
  expect(after.status).toBe(200);expect(after.body.events.filter((e:any)=>e.id===studied.id)).toHaveLength(1);
 });
});



