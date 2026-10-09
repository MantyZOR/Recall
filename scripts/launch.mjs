import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=path.resolve(process.env.RECALL_DATA_DIR||path.join(root,'data'));
const certs=path.resolve(process.env.RECALL_CERTS_DIR||path.join(root,'certs'));
const port=Number(process.env.RECALL_PORT||8787),desktopOrigin='http://localhost:'+port;
const asJson=process.argv.includes('--json'),noBrowser=process.argv.includes('--no-browser');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const readJson=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function health(){try{const r=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(700)});return r.ok?await r.json():null;}catch{return null;}}
function belongs(status){
 const control=path.join(data,'control.json');
 return status&&existsSync(control)&&status.serverId===readJson(control).serverId;
}
async function describe(status){
 const configFile=path.join(certs,'config.json'),config=existsSync(configFile)?readJson(configFile):null;
 const addresses=Object.entries(networkInterfaces()).flatMap(([name,items])=>(items||[]).filter(i=>i.family==='IPv4'&&!i.internal).map(i=>({name,address:i.address})));
 const setup=config?new URL(config.bootstrapOrigin):null;if(setup)setup.port=String(process.env.RECALL_BOOTSTRAP_PORT||8788);
 const setupQr=setup?await (await import('qrcode')).default.toDataURL(setup.origin,{width:192,margin:2}):null;
 return {ready:true,desktopOrigin,phoneOrigin:status.origin||null,setupOrigin:setup?.origin||null,address:config?.address||null,addressAvailable:!config||addresses.some(i=>i.address===config.address),addresses,certificateExpires:config?.expires||null,setupQr};
}
async function start(){
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Нужен Node.js 24 или новее.');
 process.chdir(root);mkdirSync(data,{recursive:true});
 let status=await health();
 if(status){if(!belongs(status))throw Error('Порт '+port+' занят другой копией Recall. Останови её через её меню; данные разных папок не объединяются автоматически.');return describe(status);}
 const lock=path.join(data,'launch.lock');let descriptor;
 for(let i=0;i<80;i++){
  try{descriptor=openSync(lock,'wx');writeFileSync(descriptor,String(process.pid));break;}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   let live=true;
   try{process.kill(Number(readFileSync(lock,'utf8')),0);}catch(e){if(e.code==='ESRCH')live=false;}
   if(!live&&Date.now()-statSync(lock).mtimeMs>2000){try{unlinkSync(lock);}catch{}continue;}
   await pause(250);status=await health();
   if(status){if(!belongs(status))throw Error('Порт занят другой копией Recall.');return describe(status);}
  }
 }
 if(descriptor===undefined)throw Error('Другой запуск ещё выполняется. Подожди несколько секунд и повтори.');
 try{
  // Check again after the lock: an earlier launch may just have become ready.
  status=await health();if(status){if(!belongs(status))throw Error('Порт занят другой копией Recall.');return describe(status);}
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const installLog=openSync(path.join(data,'launcher.log'),'a');
  try{
   for(const [needed,args,message] of [[!existsSync(path.join(root,'node_modules')),['ci'],'Не удалось установить зависимости'],[!existsSync(path.join(root,'dist/index.html')),['run','build'],'Не удалось собрать приложение']]){
    if(!needed)continue;
    const result=spawnSync(npm,args,{cwd:root,stdio:['ignore',installLog,installLog],shell:process.platform==='win32',windowsHide:true});
    if(result.status!==0)throw Error(message+'. Подробности: data/launcher.log');
   }
  }finally{closeSync(installLog);}
  const log=openSync(path.join(data,'service.log'),'a');
  const child=spawn(process.execPath,[path.join(root,'server/index.mjs')],{cwd:root,detached:true,stdio:['ignore',log,log],windowsHide:true,env:{...process.env,RECALL_DATA_DIR:data,RECALL_CERTS_DIR:certs}});
  child.unref();closeSync(log);
  for(let i=0;i<60;i++){await pause(200);status=await health();if(status)break;if(child.exitCode!==null)break;}
  if(!status||!belongs(status))throw Error('Служба не запустилась. Подробности: data/service.log');
  writeFileSync(path.join(data,'service.pid'),String(child.pid));
  return describe(status);
 }finally{closeSync(descriptor);try{unlinkSync(lock);}catch{}}
}
try{
 let status;
 if(process.argv.includes('--status-only')){const current=await health();if(!belongs(current))throw Error('Служба этой папки остановлена.');status=await describe(current);}else status=await start();
 if(asJson)console.log(JSON.stringify(status));
 else{console.log('Recall готов: '+status.desktopOrigin);if(status.phoneOrigin)console.log('Телефон: '+status.phoneOrigin);if(status.setupOrigin)console.log('Первое подключение: '+status.setupOrigin);}
 if(!noBrowser&&process.platform==='win32')spawn('explorer.exe',[status.desktopOrigin],{windowsHide:true,stdio:'ignore'}).unref();
}catch(error){if(asJson)console.log(JSON.stringify({ready:false,error:error.message}));else console.error('Не удалось открыть Recall: '+error.message);process.exitCode=1;}
