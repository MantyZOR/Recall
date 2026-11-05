import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='win32'||process.arch!=='x64')throw Error('RecallSetup is built on Windows x64.');
const out=path.join(root,'out'),work=path.join(out,'installer-build'),payload=path.resolve(process.argv[2]||path.join(out,'Recall-portable-win-x64.zip'));
const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version)||!existsSync(payload))throw Error('Build and package Recall before creating the installer.');
const manifest=JSON.parse(readFileSync(path.join(out,'Recall-portable-win-x64','package.json'),'utf8'));
if(manifest.version!==version)throw Error('Portable payload and installer versions differ.');
const digest=createHash('sha256').update(readFileSync(payload)).digest('hex');
mkdirSync(work,{recursive:true});
const build=path.join(work,'ReleaseBuild.cs');
writeFileSync(build,'[assembly:System.Reflection.AssemblyTitle("Recall Setup")]\n[assembly:System.Reflection.AssemblyFileVersion("'+version+'.0")]\ninternal static class ReleaseBuild { public const string Version="'+version+'"; public const string Digest="'+digest+'"; }\n');
const framework=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319');
const csc=path.join(framework,'csc.exe');
if(!existsSync(csc))throw Error('The Windows .NET Framework compiler is missing.');
const maintenance=path.join(work,'RecallMaintenance.exe'),installer=path.join(out,'RecallSetup.exe');
function compile(target,args){
 const references=[
  'System.Windows.Forms.dll','System.IO.Compression.dll','System.Web.Extensions.dll',
  path.join(framework,'System.Xaml.dll'),
  ...['PresentationFramework','PresentationCore','WindowsBase'].map(name=>path.join(framework,'WPF',name+'.dll'))
 ].map(file=>'/reference:'+file);
 const result=spawnSync(csc,['/nologo','/target:winexe','/platform:x64','/optimize+','/utf8output','/codepage:65001',...references,'/win32icon:'+path.join(root,'public/icon.ico'),'/out:'+target,...args,build,path.join(root,'scripts/RecallSetup.cs')],{windowsHide:true,encoding:'utf8'});
 if(result.status!==0)throw Error(result.error?.message||result.stdout+result.stderr);
}
compile(maintenance,['/define:MAINTENANCE']);
const resources=[
 [payload,'Recall.Payload'],[maintenance,'Recall.Maintenance'],
 [path.join(root,'scripts/recall-setup.xaml'),'Recall.Setup'],
 [path.join(root,'scripts/recall-windows-theme.xaml'),'Recall.Theme'],
 [path.join(root,'public/icon-192.png'),'Recall.Icon']
];
compile(installer,resources.map(([file,name])=>'/resource:'+file+','+name));
const report={version,file:path.relative(root,installer),bytes:statSync(installer).size,sha256:createHash('sha256').update(readFileSync(installer)).digest('hex'),payloadSha256:digest};
writeFileSync(path.join(out,'installer-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
