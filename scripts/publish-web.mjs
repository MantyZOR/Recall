// Publishes the static application only. Personal databases and credentials never enter dist-web.
import {spawnSync} from 'node:child_process';
import {cpSync,mkdtempSync,readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=process.cwd(),source=path.resolve('dist-web'),remote='https://github.com/MantyZOR/Recall.git';
function git(args,cwd=root){const result=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},timeout:120000});if(result.status!==0)throw Error('Git operation failed: '+args[0]+'\n'+result.stderr);return result.stdout.trim();}
if(git(['remote','get-url','origin'])!==remote)throw Error('Expected the MantyZOR/Recall repository');
function audit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(lstatSync(file).isSymbolicLink())throw Error('A static build must not contain links');if(/^(data|certs|node_modules|\.git|\.env|control\.json)$/i.test(entry.name)||/\.(sqlite|key|pem|pfx|recall\.zip)$/i.test(entry.name))throw Error('Private file in static build');if(entry.isDirectory())audit(file);else{const text=readFileSync(file,'utf8');if(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]{20,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/.test(text))throw Error('Credential in static build');}}}
audit(source);
const manifest=JSON.parse(readFileSync(path.join(source,'manifest.webmanifest'),'utf8'));if(manifest.scope!=='/Recall/'||!readFileSync(path.join(source,'sw.js'),'utf8').includes('"/Recall/"'))throw Error('Run npm run build:web before publishing');
const target=mkdtempSync(path.join(tmpdir(),'recall-web-'));
git(['init','-b','gh-pages'],target);git(['remote','add','origin',remote],target);
git(['config','user.name',git(['config','user.name'])],target);git(['config','user.email',git(['config','user.email'])],target);
if(git(['ls-remote','--heads',remote,'gh-pages'])){git(['fetch','--depth=1','origin','gh-pages'],target);git(['checkout','-B','gh-pages','FETCH_HEAD'],target);git(['rm','-r','-f','--ignore-unmatch','--','.'],target);}
cpSync(source,target,{recursive:true});writeFileSync(path.join(target,'.nojekyll'),'');
git(['add','--all'],target);
if(git(['status','--porcelain'],target)){const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;git(['commit','-m','Publish Recall web '+version],target);git(['push','origin','gh-pages:gh-pages'],target);}
console.log('Published gh-pages. Enable GitHub Pages for gh-pages / (root). URL: https://mantyzor.github.io/Recall/');
