import { cpSync,existsSync,readFileSync,writeFileSync,readdirSync,mkdirSync,rmSync,lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'out');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function guarded(target){
 const p=path.resolve(target);if(!p.startsWith(out+path.sep))throw Error('Package target must stay inside out.');
 for(const check of [root,out,p])if(existsSync(check)&&lstatSync(check).isSymbolicLink())throw Error('Package path is a link.');
 return p;
}
function fresh(name,kind){
 const target=guarded(path.join(out,name));
 if(existsSync(target)){
  if(['data','certs'].some(name=>existsSync(path.join(target,name))))throw Error('Refusing to replace a package folder containing local data or certificates: '+target);
  const receipt=path.join(target,'.recall-package.json');
  if(!existsSync(receipt)||JSON.parse(readFileSync(receipt,'utf8')).kind!==kind)throw Error('Refusing to replace an unrecognized directory: '+target);
  rmSync(target,{recursive:true});
 }
 mkdirSync(target,{recursive:true});writeFileSync(path.join(target,'.recall-package.json'),JSON.stringify({kind,generatedBy:'Recall package-release'}));return target;
}
function files(dir,prefix=''){
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  if(entry.name==='.recall-package.json')return [];
  const p=path.join(dir,entry.name);if(lstatSync(p).isSymbolicLink())throw Error('Links are not distributed: '+p);
  const relative=prefix+entry.name;
  return entry.isDirectory()?files(p,relative+'/'):[{file:p,name:relative,bytes:readFileSync(p)}];
 });
}
function zip(dir,name){
 const list=files(dir),archive=guarded(path.join(out,name)),content=Object.fromEntries(list.map(f=>[f.name,f.bytes]));
 writeFileSync(archive,zipSync(content,{level:6}));
 return {archive:path.relative(root,archive),files:list.length,unpackedMiB:Number((list.reduce((n,f)=>n+f.bytes.length,0)/1048576).toFixed(2)),zipMiB:Number((readFileSync(archive).length/1048576).toFixed(2))};
}
function copy(relative,target){const source=path.join(root,relative);if(!existsSync(source))throw Error('Required file is missing: '+relative);cpSync(source,path.join(target,relative),{recursive:true});}
function sourcePackage(){
 const target=fresh('Recall-source','source');
 for(const file of ['src','server','scripts','public','vendor','tests','examples','docs','.gitignore','README.md','package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','vitest.config.ts','playwright.config.ts','flashcards_concept.md','Start-Recall.cmd','Stop-Recall.cmd','Setup-iPhone.cmd','Setup-LAN.cmd','Export-Backup.cmd'])copy(file,target);
 for(const f of files(target)){
  if(/(^|\/)(data|certs|tools|node_modules|tmp|out|dist|\.git)(\/|$)/i.test(f.name)||/\.(sqlite|key|pem|pfx|recall\.zip)$/i.test(f.name))throw Error('Private or generated file in source package: '+f.name);
  if(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]{20,}/.test(f.bytes.toString('utf8')))throw Error('A private key must never be distributed: '+f.name);
 }
 return zip(target,'Recall-source.zip');
}
function locatePackage(name,from){
 const req=createRequire(path.join(from,'package.json'));let folder=path.dirname(req.resolve(name));
 while(folder!==path.dirname(folder)){
  const manifest=path.join(folder,'package.json');if(existsSync(manifest)&&JSON.parse(readFileSync(manifest,'utf8')).name===name)return folder;
  folder=path.dirname(folder);
 }throw Error('Cannot locate dependency: '+name);
}
function runtimeDependencies(){
 const result=new Set();
 function visit(name,from,optional=false){
  let folder;try{folder=locatePackage(name,from);}catch(e){if(optional)return;throw e;}
  if(!folder.startsWith(path.join(root,'node_modules')+path.sep))throw Error('Dependency is outside the workspace: '+name);
  if(result.has(folder))return;result.add(folder);
  const manifest=JSON.parse(readFileSync(path.join(folder,'package.json'),'utf8'));
  for(const dep of Object.keys(manifest.dependencies||{}))visit(dep,folder);
  for(const dep of Object.keys(manifest.optionalDependencies||{}))visit(dep,folder,true);
 }
 for(const name of ['zod','@peculiar/x509','reflect-metadata','fflate','qrcode'])visit(name,root);
 return [...result];
}
function thirdPartyNotices(target){
 const noticeRoot=path.join(target,'licenses');mkdirSync(noticeRoot,{recursive:true});
 const lock=JSON.parse(readFileSync(path.join(root,'package-lock.json'),'utf8')),notices=[];
 for(const [relative,locked]of Object.entries(lock.packages)){
  if(!relative||locked.dev)continue;
  const folder=path.join(root,relative),manifest=path.join(folder,'package.json');if(!existsSync(manifest))continue;
  const p=JSON.parse(readFileSync(manifest,'utf8')),dest=path.join(noticeRoot,p.name.replaceAll('/','__')+'-'+p.version);mkdirSync(dest,{recursive:true});
  const licenseFiles=readdirSync(folder).filter(name=>/^(licen[sc]e|notice)([.-].*)?$/i.test(name)&&lstatSync(path.join(folder,name)).isFile());
  for(const name of licenseFiles)cpSync(path.join(folder,name),path.join(dest,name));
  notices.push({name:p.name,version:p.version,license:p.license||locked.license||'See upstream',files:licenseFiles});
 }
 cpSync(path.join(root,'vendor/fsrs-rs/LICENSE'),path.join(noticeRoot,'fsrs-rs-LICENSE'));
 writeFileSync(path.join(target,'THIRD-PARTY-NOTICES.json'),JSON.stringify({dependencies:notices,fsrsSource:'4bc0a0979f95dd01cc653031b6f2a01429e4c32b'},null,2));
}
const bundledNode={version:'v24.21.0',url:'https://nodejs.org/dist/v24.21.0/win-x64/node.exe',sha256:'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32'};
async function nodeRuntime(){
 const cache=guarded(path.join(out,'node-'+bundledNode.version+'-win-x64.exe'));
 if(!existsSync(cache)||hash(readFileSync(cache))!==bundledNode.sha256){
  const response=await fetch(bundledNode.url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('Cannot obtain the official Node.js LTS runtime: '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(hash(bytes)!==bundledNode.sha256)throw Error('The Node.js runtime does not match the official SHA256 checksum.');
  writeFileSync(cache,bytes);
 }
 if(execFileSync(cache,['--version'],{windowsHide:true,encoding:'utf8'}).trim()!==bundledNode.version)throw Error('Unexpected bundled Node.js version.');
 return cache;
}
async function portablePackage(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('This package is built with a Windows x64 Node runtime.');
 const target=fresh('Recall-portable-win-x64','portable-win-x64');
 for(const file of ['dist','server','src/domain/protocol.mjs','Recall.exe','public/icon-192.png','public/icon.ico','scripts/launcher.ps1','scripts/autostart.ps1','scripts/launch.mjs','scripts/stop.ps1','scripts/allow-lan.ps1','scripts/setup-tls.mjs','scripts/export-backup.mjs','Start-Recall.cmd','Stop-Recall.cmd','Setup-iPhone.cmd','Setup-LAN.cmd','Export-Backup.cmd','docs/connection-guide.md'])copy(file,target);
 mkdirSync(path.join(target,'runtime'),{recursive:true});cpSync(await nodeRuntime(),path.join(target,'runtime/node.exe'));
 const licenseCache=guarded(path.join(out,'node-'+bundledNode.version+'-LICENSE.txt'));
 if(!existsSync(licenseCache)){
  const response=await fetch('https://raw.githubusercontent.com/nodejs/node/'+bundledNode.version+'/LICENSE',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Cannot obtain the matching Node.js license.');const license=await response.text();
  if(!license.includes('Node.js')||!license.includes('Permission is hereby granted'))throw Error('Unexpected Node license response.');
  writeFileSync(licenseCache,license);
 }
 cpSync(licenseCache,path.join(target,'runtime/LICENSE.txt'));
 const dependencies=runtimeDependencies();
 for(const folder of dependencies)cpSync(folder,path.join(target,path.relative(root,folder)),{recursive:true,filter:file=>file===folder||path.basename(file)!=='node_modules'});
 writeFileSync(path.join(target,'package.json'),JSON.stringify({name:'recall-portable',private:true,type:'module',version:JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version},null,2));
 thirdPartyNotices(target);
 writeFileSync(path.join(target,'START-HERE.txt'),'Recall — переносимая сборка для Windows 10/11 x64\r\n\r\nРаспакуй ВСЮ папку и открой Recall.exe. В меню видны адреса ПК и телефона, QR подключения и кнопка остановки. Автозапуск выключен; его можно включить отдельно.\r\n\r\nНа новом ПК: запусти Recall, раскрой «Настройка сети», выбери адрес и настрой HTTPS. Разреши своему телефону доступ в сети. Инструкция для iPhone и Android открывается по QR.\r\n\r\nЭта сборка не содержит личных карточек и сертификатов. Для переноса истории используй полный архив из настроек. Данные новой копии будут храниться рядом, в папке data. Одновременно запускай одну копию Recall на стандартных портах.\r\n\r\nПеред переносом в другую папку отключи её автозапуск и останови службу. На новом месте включи автозапуск снова, если нужен. Подробности: docs/connection-guide.md.\r\n\r\nAndroid: обучение рассчитано на Chrome/PWA; полный цикл на настоящем телефоне ещё требует проверки.\r\n');
 const content=files(target);
 if(content.some(f=>/(^|\/)(data|certs|tools|test-results|playwright-report)(\/|$)/i.test(f.name)))throw Error('Working state entered the portable package.');
 writeFileSync(path.join(target,'RELEASE.json'),JSON.stringify({platform:'win32-x64',node:bundledNode.version,nodeRuntime:bundledNode,createdAt:new Date().toISOString(),privateDataIncluded:false,files:content.map(f=>({path:f.name,bytes:f.bytes.length,sha256:hash(f.bytes)}))},null,2));
 return {...zip(target,'Recall-portable-win-x64.zip'),node:bundledNode.version,runtimePackages:dependencies.length};
}
mkdirSync(out,{recursive:true});
const mode=process.argv[2]||'all',result={};
if(mode==='all'||mode==='source')result.source=sourcePackage();
if(mode==='all'||mode==='portable')result.portable=await portablePackage();
if(!result.source&&!result.portable)throw Error('Use all, source or portable.');
writeFileSync(path.join(out,'package-report.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
