import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='win32')throw Error('Windows launcher is built on Windows.');
// Windows PowerShell 5.1 needs a BOM to read Russian script text as UTF-8.
for(const name of ['launcher.ps1','autostart.ps1','allow-lan.ps1','stop.ps1','build-core.ps1']){
 const file=path.join(root,'scripts',name);if(existsSync(file))writeFileSync(file,'\uFEFF'+readFileSync(file,'utf8').replace(/^\uFEFF/,''));
}
const png=readFileSync(path.join(root,'public/icon-192.png')),header=Buffer.alloc(22);
header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=192;header[7]=192;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
writeFileSync(path.join(root,'public/icon.ico'),Buffer.concat([header,png]));
const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
if(!existsSync(csc))throw Error('Windows .NET Framework compiler is unavailable.');
const result=spawnSync(csc,['/nologo','/target:winexe','/optimize+','/utf8output','/reference:System.Windows.Forms.dll','/win32icon:'+path.join(root,'public/icon.ico'),'/out:'+path.join(root,'Recall.exe'),path.join(root,'scripts/RecallLauncher.cs')],{windowsHide:true,encoding:'utf8'});
if(result.status!==0)throw Error(result.stdout+result.stderr);
console.log('Recall.exe created: the menu starts without a console.');
