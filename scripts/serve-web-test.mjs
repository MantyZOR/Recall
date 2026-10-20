// Local test fixture for the public /Recall/ build, with no data or API service.
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist-web');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/Recall/')){res.writeHead(404);res.end();return;}let file=path.resolve(root,decodeURIComponent(url.pathname.slice('/Recall/'.length))||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}if(statSync(file).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}}).listen(17890,'127.0.0.1');
