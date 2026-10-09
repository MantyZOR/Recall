import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { cpSync,existsSync,mkdirSync,readFileSync,rmSync,lstatSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import path from 'node:path';
const source=path.resolve('out/Recall-portable-win-x64'),parent=path.resolve('test-results'),dir=path.join(parent,'portable-'+randomUUID()),port=19887;
const env={...process.env,RECALL_DATA_DIR:path.join(dir,'data'),RECALL_CERTS_DIR:path.join(dir,'certs'),RECALL_PORT:String(port),RECALL_TLS_PORT:'19444',RECALL_BOOTSTRAP_PORT:'19888'};
function run(file:string,args:string[]):Promise<{code:number;text:string}>{return new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd:dir,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>resolve({code:code??1,text:output.trim()}));});}
const node=path.join(dir,'runtime/node.exe');
const stop=()=>run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'scripts/stop.ps1')]);
const health=async()=>{try{return await (await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(500)})).json();}catch{return null;}};
describe.skipIf(process.platform!=='win32'||!existsSync(source))('clean portable Windows package',()=>{
 beforeAll(()=>{for(const p of [parent,source])if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('Linked test path');mkdirSync(dir,{recursive:true});cpSync(source,dir,{recursive:true});});
 afterAll(async()=>{if(await health()){const r=await stop();if(r.code)throw Error('Cannot stop owned test service');}const resolved=path.resolve(dir);if(!resolved.startsWith(parent+path.sep)||lstatSync(resolved).isSymbolicLink())throw Error('Unsafe cleanup');rmSync(resolved,{recursive:true});});
 it('contains the declared hashes, licenses and runtime while excluding working state',()=>{
  expect(existsSync(path.join(dir,'data'))).toBe(false);expect(existsSync(path.join(dir,'certs'))).toBe(false);expect(existsSync(path.join(dir,'tools'))).toBe(false);
  const release=JSON.parse(readFileSync(path.join(dir,'RELEASE.json'),'utf8'));expect(release.privateDataIncluded).toBe(false);
  expect(release.node).toBe('v24.21.0');expect(release.nodeRuntime.url).toMatch(/^https:\/\/nodejs.org\/dist\//);expect(createHash('sha256').update(readFileSync(node)).digest('hex')).toBe(release.nodeRuntime.sha256);
  for(const f of release.files){expect(path.resolve(dir,f.path).startsWith(dir+path.sep)).toBe(true);expect(createHash('sha256').update(readFileSync(path.join(dir,f.path))).digest('hex')).toBe(f.sha256);}
  expect(readFileSync(path.join(dir,'runtime/LICENSE.txt'),'utf8')).toContain('Node.js');expect(existsSync(path.join(dir,'THIRD-PARTY-NOTICES.json'))).toBe(true);
 });
 it('starts and stops with its bundled Node, generates fresh HTTPS and serves Android/iPhone setup without a development installation',async()=>{
  const tls=await run(node,['scripts/setup-tls.mjs','--address','127.0.0.1']);expect(tls.code,tls.text).toBe(0);
  const start=await run(node,['scripts/launch.mjs','--json','--no-browser']);expect(start.code,start.text).toBe(0);
  const status=JSON.parse(start.text);expect(status.phoneOrigin).toBe('https://127.0.0.1:19444');expect(status.setupQr).toMatch(/^data:image\/png;base64,/);
  const html=await (await fetch('http://127.0.0.1:19888/')).text();expect(html).toContain('Android · Chrome');expect(html).toContain('Если удалил приложение');
  const ui=await (await fetch('http://localhost:'+port+'/')).text();expect(ui).toContain('Recall');
  const native=await run('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File','scripts/launcher.ps1','-SmokeTest']);expect(native.code,native.text).toBe(0);expect(JSON.parse(native.text).Ready).toBe(true);
  expect((await stop()).code).toBe(0);expect(await health()).toBeNull();
 },30000);
});
