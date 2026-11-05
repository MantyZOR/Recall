import {createHash} from 'node:crypto';
import {createWriteStream,readFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {applicationRoot,dataPath,installed} from '../server/locations.mjs';

const repository='MantyZOR/Recall',assetName='RecallSetup.exe';
const tagPattern=/^v(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;
const parts=tag=>tagPattern.exec(tag)?.slice(1).map(Number);
export function selectInstaller(release,current){
 const latest=parts(release?.tag_name),now=parts('v'+current);
 if(!latest||!now||release.draft||release.prerelease)return null;
 const firstDifference=latest.map((n,i)=>n-now[i]).find(n=>n!==0)||0;
 if(firstDifference<=0)return null;
 const expected='https://github.com/'+repository+'/releases/download/'+release.tag_name+'/'+assetName;
 const asset=release.assets?.find(item=>item.name===assetName&&item.browser_download_url===expected);
 if(!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||'')||!Number.isSafeInteger(asset.size)||asset.size<1024||asset.size>128*1024*1024)
  throw Error('В релизе пока нет проверенного RecallSetup.exe.');
 return {tag:release.tag_name,version:release.tag_name.slice(1),url:expected,sha256:asset.digest.slice(7),size:asset.size};
}
export async function verifyInstallerDownload(response,file,asset){
 if(!response.ok||!response.body)throw Error('Не удалось скачать установщик.');
 let bytes=0;const hash=createHash('sha256');
 const verify=new Transform({transform(chunk,_encoding,callback){
  bytes+=chunk.length;if(bytes>asset.size)return callback(Error('Размер установщика не совпадает с релизом.'));
  hash.update(chunk);callback(null,chunk);
 }});
 try{
  await pipeline(Readable.fromWeb(response.body),verify,createWriteStream(file,{flags:'wx'}));
  if(bytes!==asset.size||hash.digest('hex')!==asset.sha256)throw Error('Контрольная сумма установщика не совпадает с релизом.');
 }catch(e){if(e.code!=='EEXIST'){try{unlinkSync(file);}catch{/* Download may not have created a file. */}}throw e;}
}
async function run(){
 if(!installed)throw Error('Для обновлений одним файлом сначала установи RecallSetup.exe.');
 const current=JSON.parse(readFileSync(path.join(applicationRoot,'package.json'),'utf8')).version;
 const response=await fetch('https://api.github.com/repos/'+repository+'/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'Recall-Windows-Updater'},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Error('Не удалось проверить обновление на GitHub.');
 const asset=selectInstaller(await response.json(),current),requested=process.argv[2];
 if(!requested){console.log(JSON.stringify({available:Boolean(asset),version:asset?.version,tag:asset?.tag}));return;}
 if(!asset||requested!==asset.tag)throw Error('Релиз изменился. Проверь обновления ещё раз.');
 const download=await fetch(asset.url,{signal:AbortSignal.timeout(60000),credentials:'omit'});
 const final=new URL(download.url);
 if(final.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(final.hostname))throw Error('Неожиданный адрес загрузки.');
 const directory=path.join(dataPath,'updates');mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'RecallSetup-'+asset.version+'-'+crypto.randomUUID()+'.exe');
 await verifyInstallerDownload(download,file,asset);
 console.log(JSON.stringify({path:file,version:asset.version}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(error=>{console.error(error.message);process.exitCode=1;});
