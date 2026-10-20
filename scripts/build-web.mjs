import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const env={...process.env,RECALL_WEB_BUILD:'1',VITE_PUBLIC_APP:'true'};
for(const args of [['scripts/generate-import-guide.mjs'],['node_modules/typescript/bin/tsc','-b'],['scripts/generate-wiki.mjs'],['node_modules/vite/bin/vite.js','build','--outDir','dist-web']]){
 const result=spawnSync(process.execPath,args,{env,windowsHide:true,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
const manifest=JSON.parse(readFileSync('dist-web/manifest.webmanifest','utf8'));
for(const key of ['id','start_url','scope'])manifest[key]='/Recall/';
for(const icon of manifest.icons)icon.src='/Recall/'+icon.src.replace(/^\//,'');
writeFileSync('dist-web/manifest.webmanifest',JSON.stringify(manifest));
writeFileSync('dist-web/.nojekyll','');
const result=spawnSync(process.execPath,['scripts/generate-sw.mjs'],{env,windowsHide:true,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
