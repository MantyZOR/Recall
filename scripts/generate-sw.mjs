import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const web=process.env.RECALL_WEB_BUILD==='1',base=web?'/Recall/':'/';
const dist=path.resolve(web?'dist-web':'dist');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk(dist).filter(p=>!p.endsWith('sw.js')&&path.basename(p)!=='.nojekyll');
const worker=readFileSync(new URL('../src/sw/worker.js',import.meta.url),'utf8');
const hash=createHash('sha256').update(worker);
for(const file of files)hash.update(path.relative(dist,file)).update(readFileSync(file));
const cache='recall-shell-'+hash.digest('hex').slice(0,16);
const urls=files.map(file=>base+path.relative(dist,file).replaceAll('\\','/'));
urls.push(base);
writeFileSync(path.join(dist,'sw.js'),'const BASE='+JSON.stringify(base)+';\nconst CACHE='+JSON.stringify(cache)+';\nconst URLS='+JSON.stringify(urls)+';\n'+worker);
console.log('Offline shell generated: '+urls.length+' local resources.');
