import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const dist=path.resolve('dist');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk(dist).filter(p=>!p.endsWith('sw.js'));
const worker=readFileSync(new URL('../src/sw/worker.js',import.meta.url),'utf8');
const hash=createHash('sha256').update(worker);
for(const file of files)hash.update(path.relative(dist,file)).update(readFileSync(file));
const cache='recall-shell-'+hash.digest('hex').slice(0,16);
const urls=files.map(file=>'/'+path.relative(dist,file).replaceAll('\\','/'));
urls.push('/');
writeFileSync(path.join(dist,'sw.js'),'const CACHE='+JSON.stringify(cache)+';\nconst URLS='+JSON.stringify(urls)+';\n'+worker);
console.log('Offline shell generated: '+urls.length+' local resources.');
