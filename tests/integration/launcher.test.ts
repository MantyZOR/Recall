import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, lstatSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const parent=path.resolve('test-results'),dir=path.join(parent,'launcher-'+randomUUID()),port=19787;
const env={...process.env,RECALL_DATA_DIR:path.join(dir,'data'),RECALL_CERTS_DIR:path.join(dir,'certs'),RECALL_PORT:String(port),RECALL_TLS_PORT:'19443',RECALL_BOOTSTRAP_PORT:'19788'};
function run(file:string,args:string[],custom=env):Promise<{code:number;text:string}>{
 return new Promise((resolve,reject)=>{const child=spawn(file,args,{env:custom,cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',()=>{});child.on('error',reject);child.on('exit',code=>resolve({code:code??1,text:output.trim()}));});
}
const cli=(extra:string[]=[],custom=env)=>run(process.execPath,['scripts/launch.mjs','--json','--no-browser',...extra],custom);
const stop=(custom=env)=>run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/stop.ps1'],custom);
const health=async()=>{try{return await (await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(500)})).json();}catch{return null;}};
beforeAll(()=>{for(const p of [parent,dir])if(lstatExists(p)&&lstatSync(p).isSymbolicLink())throw Error('Linked test path');mkdirSync(dir,{recursive:true});});
function lstatExists(p:string){try{lstatSync(p);return true;}catch{return false;}}
afterAll(async()=>{if(await health()){const r=await stop();if(r.code)throw Error('Test service ownership was not confirmed');}const resolved=path.resolve(dir);if(!resolved.startsWith(parent+path.sep)||lstatSync(resolved).isSymbolicLink())throw Error('Unsafe cleanup');rmSync(resolved,{recursive:true});});
describe.skipIf(process.platform!=='win32')('owned launcher and native menu',()=>{
 it('starts only one background service for concurrent launches and exposes no control token',async()=>{
  const results=await Promise.all([cli(),cli()]);for(const r of results){expect(r.code,r.text).toBe(0);expect(JSON.parse(r.text).desktopOrigin).toBe('http://localhost:'+port);expect(JSON.parse(r.text).ready).toBe(true);}
  const control=JSON.parse(readFileSync(path.join(env.RECALL_DATA_DIR,'control.json'),'utf8'));expect((await health()).serverId).toBe(control.serverId);
  for(const r of results)expect(r.text).not.toContain(control.token);
  expect(Number(readFileSync(path.join(env.RECALL_DATA_DIR,'service.pid'),'utf8'))).toBeGreaterThan(0);
 });
 it('refuses a different data directory on an occupied Recall port and leaves the service intact',async()=>{
  const foreign={...env,RECALL_DATA_DIR:path.join(dir,'foreign')};
  const launch=await cli([],foreign);expect(launch.code).toBe(1);expect(JSON.parse(launch.text).error).toContain('другой копией');
  expect((await stop(foreign)).code).toBe(1);expect((await health()).ok).toBe(true);
 });
 it('runs the actual WPF startup action without opening a console or enabling Windows autostart',async()=>{
  const r=await run('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File','scripts/launcher.ps1','-SmokeTest']);
  expect(r.code,r.text).toBe(0);const result=JSON.parse(r.text);expect(result).toMatchObject({Ready:true,Desktop:'http://localhost:'+port,StopEnabled:true,Autostart:false});
 });
 it('stops only the owned listener, can restart from the native menu and stops again',async()=>{
  expect((await stop()).code).toBe(0);expect(await health()).toBeNull();
  const r=await run('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File','scripts/launcher.ps1','-SmokeTest']);
  expect(r.code,r.text).toBe(0);expect(JSON.parse(r.text).Ready).toBe(true);
  expect((await stop()).code).toBe(0);expect(await health()).toBeNull();
 });
});
