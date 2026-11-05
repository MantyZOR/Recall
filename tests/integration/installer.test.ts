import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';

const setup=path.resolve('out/RecallSetup.exe'),parent=path.resolve('test-results');
const version=JSON.parse(readFileSync('package.json','utf8')).version;
function availablePort(){return new Promise<number>((resolve,reject)=>{
 const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(()=>resolve(typeof address==='object'&&address?address.port:0));});
});}
it.skipIf(process.platform!=='win32'||!existsSync(setup))('imports a portable folder, updates in place or into a new folder, and keeps data on uninstall',async()=>{
 mkdirSync(parent,{recursive:true});if(lstatSync(parent).isSymbolicLink())throw Error('Unsafe test path');
 const testRoot=mkdtempSync(path.join(parent,'installer-')),portable=path.join(testRoot,'Portable'),root=path.join(testRoot,'Installed Recall'),app=path.join(root,'app'),log=path.join(testRoot,'installer.log');
 const moved=path.join(testRoot,'Recall в новой папке'),movedApp=path.join(moved,'app');
 const port=await availablePort(),env={...process.env,RECALL_PORT:String(port),RECALL_DATA_DIR:undefined,RECALL_CERTS_DIR:undefined};
 function install(dir:string,extra:string[]=[]){
  const r=spawnSync(setup,['--quiet','--dir',dir,'--no-shortcuts','--log',log,...extra],{env,windowsHide:true,encoding:'utf8',timeout:35000});
  return {status:r.status,error:r.error?.message||'',log:existsSync(log)?readFileSync(log,'utf8'):''};
 }
 const healthy=async()=>{try{return await (await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(600)})).json();}catch{return null;}};
 let runningApp=app;
 const launch=(program=app)=>{
  runningApp=program;
  return spawnSync(path.join(program,'runtime/node.exe'),[path.join(program,'scripts/launch.mjs'),'--json','--no-browser'],{env,windowsHide:true,encoding:'utf8',timeout:18000});
 };
 const stop=()=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(runningApp,'scripts/stop.ps1')],{env,windowsHide:true,encoding:'utf8',timeout:20000});
 try{
  for(const folder of ['server','data/assets','certs'])mkdirSync(path.join(portable,folder),{recursive:true});
  for(const file of ['Recall.exe','server/index.mjs'])writeFileSync(path.join(portable,file),'portable fixture');
  const cert=Buffer.from([1,3,5,7,9]);writeFileSync(path.join(portable,'certs/rootCA.cer'),cert);
  writeFileSync(path.join(portable,'data/assets/example'),'attachment');
  const database=new DatabaseSync(path.join(portable,'data/recall.sqlite'));database.exec("CREATE TABLE existing_cards(text TEXT);INSERT INTO existing_cards VALUES('Сохранённая карточка');");database.close();
  writeFileSync(path.join(portable,'data/service.pid'),'123');writeFileSync(path.join(portable,'data/launch.lock'),'123');
  const initial=install(root,['--from',portable]);expect(initial.status,JSON.stringify(initial)).toBe(0);
  expect(readFileSync(path.join(app,'.recall-installed'),'utf8')).toBe(version);
  expect(readFileSync(path.join(root,'certs/rootCA.cer'))).toEqual(cert);
  expect(readFileSync(path.join(root,'data/recall.sqlite'))).toEqual(readFileSync(path.join(portable,'data/recall.sqlite')));
  expect(readFileSync(path.join(root,'data/assets/example'),'utf8')).toBe('attachment');
  expect(existsSync(path.join(root,'data/service.pid'))).toBe(false);
  expect(existsSync(path.join(root,'data/launch.lock'))).toBe(false);
  expect(existsSync(path.join(app,'data'))).toBe(false);
  writeFileSync(path.join(root,'личный.txt'),'сохранить');
  writeFileSync(path.join(app,'added-by-user.txt'),'user file');
  writeFileSync(path.join(app,'.recall-installed'),'0.5.9');
  const started=launch();expect(started.status,started.stdout||started.stderr).toBe(0);
  const before=await healthy();expect(before?.ok).toBe(true);
  const upgraded=install(root);expect(upgraded.status,JSON.stringify(upgraded)).toBe(0);
  expect(await healthy()).toBeNull();
  expect(readFileSync(path.join(app,'.recall-installed'),'utf8')).toBe(version);
  expect(readFileSync(path.join(root,'личный.txt'),'utf8')).toBe('сохранить');
  const preserved=readdirSync(root).find(n=>n.startsWith('saved-app-'));
  expect(readFileSync(path.join(root,preserved!,'added-by-user.txt'),'utf8')).toBe('user file');
  expect(readFileSync(path.join(root,'certs/rootCA.cer'))).toEqual(cert);
  expect(existsSync(path.join(portable,'data/recall.sqlite'))).toBe(true);
  expect(launch().status).toBe(0);expect((await healthy()).serverId).toBe(before.serverId);
  expect(install(path.join(root,'nested'),['--move-from',root]).status).toBe(1);
  expect((await healthy()).serverId).toBe(before.serverId);
  const transferred=install(moved,['--move-from',root]);expect(transferred.status,JSON.stringify(transferred)).toBe(0);
  expect(await healthy()).toBeNull();
  expect(readFileSync(path.join(app,'.recall-installed'),'utf8')).toBe(version);
  expect(readFileSync(path.join(movedApp,'.recall-installed'),'utf8')).toBe(version);
  expect(readFileSync(path.join(moved,'data/assets/example'),'utf8')).toBe('attachment');
  expect(readFileSync(path.join(moved,'certs/rootCA.cer'))).toEqual(cert);
  expect(launch(movedApp).status).toBe(0);expect((await healthy()).serverId).toBe(before.serverId);
  const verified=new DatabaseSync(path.join(moved,'data/recall.sqlite'),{readOnly:true});
  try{expect(verified.prepare('SELECT text FROM existing_cards').get()?.text).toBe('Сохранённая карточка');}finally{verified.close();}
  const maintenance=path.join(moved,'RecallMaintenance.exe');cpSync('out/installer-build/RecallMaintenance.exe',maintenance);
  const removed=spawnSync(maintenance,['--quiet','--no-shortcuts','--log',log],{env,windowsHide:true,timeout:25000});
  expect(removed.status,existsSync(log)?readFileSync(log,'utf8'):'').toBe(0);
  expect(existsSync(movedApp)).toBe(false);
  expect(await healthy()).toBeNull();
  expect(existsSync(path.join(root,'data/recall.sqlite'))).toBe(true);
  expect(existsSync(path.join(moved,'data/recall.sqlite'))).toBe(true);
  expect(readFileSync(path.join(moved,'certs/rootCA.cer'))).toEqual(cert);
  const occupied=path.join(testRoot,'Unrelated');mkdirSync(occupied);writeFileSync(path.join(occupied,'keep.txt'),'unrelated');
  expect(install(occupied).status).toBe(1);expect(readdirSync(occupied)).toEqual(['keep.txt']);
 }finally{
  if(await healthy())stop();
  if(testRoot.startsWith(parent+path.sep)&&!lstatSync(testRoot).isSymbolicLink())rmSync(testRoot,{recursive:true});
 }
},120000);

const maintenance=path.resolve('out/installer-build/RecallMaintenance.exe');
it.skipIf(process.platform!=='win32'||!existsSync(maintenance))('creates, retargets and removes its Windows shortcuts without overwriting another link',()=>{
 mkdirSync(parent,{recursive:true});if(lstatSync(parent).isSymbolicLink())throw Error('Unsafe test path');
 const folder=mkdtempSync(path.join(parent,'shortcut-'));
 try{
  const command=String.raw`
   $ErrorActionPreference='Stop'
   $type=[Reflection.Assembly]::LoadFrom($env:RECALL_TEST_MAINTENANCE).GetType('RecallSetup',$true)
   $ensure=$type.GetMethod('EnsureShortcut',[Reflection.BindingFlags]'NonPublic,Static')
   $remove=$type.GetMethod('RemoveShortcuts',[Reflection.BindingFlags]'NonPublic,Static')
   $folder=$env:RECALL_TEST_SHORTCUTS
   $old=[IO.Path]::Combine($folder,'First app\Recall.exe')
   $new=[IO.Path]::Combine($folder,'Новая папка\Recall.exe')
   foreach($target in @($old,$new)){
    $null=[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
    [IO.File]::WriteAllText($target,'shortcut fixture')
   }
   $shell=New-Object -ComObject WScript.Shell
   $unrelated=Join-Path $folder 'Recall.lnk'
   $existing=$shell.CreateShortcut($unrelated)
   $existing.TargetPath=Join-Path $env:WINDIR 'notepad.exe'
   $existing.Save()
   $null=$ensure.Invoke($null,@($folder,$old,$null,$false))
   if(@(Get-ChildItem -LiteralPath $folder -Filter '*.lnk').Count -ne 1){throw 'Desktop link created when unchecked'}
   $null=$ensure.Invoke($null,@($folder,$old,$null,$true))
   $recall=Get-ChildItem -LiteralPath $folder -Filter '*.lnk' | Where-Object {$_.FullName -ne $unrelated}
   $directory=(New-Object -ComObject Shell.Application).NameSpace($folder)
   if($directory.ParseName($recall.Name).GetLink.Path -ne $old){throw 'Incorrect shortcut target'}
   $null=$ensure.Invoke($null,@($folder,$new,$old,$false))
   $updated=$directory.ParseName($recall.Name).GetLink
   if($updated.Path -ne $new -or $updated.WorkingDirectory -ne [IO.Path]::GetDirectoryName($new)){throw 'Shortcut did not follow the move'}
   $null=$remove.Invoke($null,@($folder,$new))
   if((Test-Path -LiteralPath $recall.FullName) -or $shell.CreateShortcut($unrelated).TargetPath -ne $existing.TargetPath){throw 'Incorrect shortcut removed'}
  `;
  const check=spawnSync('powershell.exe',['-NoProfile','-STA','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{env:{...process.env,RECALL_TEST_MAINTENANCE:maintenance,RECALL_TEST_SHORTCUTS:folder},windowsHide:true,encoding:'utf8',timeout:15000});
  expect(check.status,check.error?.message||check.stdout+check.stderr).toBe(0);
 }finally{
  if(folder.startsWith(parent+path.sep)&&!lstatSync(folder).isSymbolicLink())rmSync(folder,{recursive:true});
 }
},20000);
