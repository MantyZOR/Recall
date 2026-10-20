import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const data=path.resolve(process.env.RECALL_TEST_LAPTOP?'test-results/e2e-laptop-service':'test-results/e2e-service'),certs=path.join(data,'certs');
mkdirSync(data,{recursive:true});
const env={...process.env,RECALL_DATA_DIR:data,RECALL_CERTS_DIR:certs,RECALL_PORT:process.env.RECALL_TEST_LAPTOP?'17897':'17887',RECALL_TLS_PORT:process.env.RECALL_TEST_LAPTOP?'17453':'17443',RECALL_BOOTSTRAP_PORT:process.env.RECALL_TEST_LAPTOP?'17898':'17888'};
if(!existsSync(path.join(certs,'config.json'))){const r=spawnSync(process.execPath,['scripts/setup-tls.mjs','--address','127.0.0.1'],{env,windowsHide:true,stdio:'inherit'});if(r.status)process.exit(r.status);}
const child=spawn(process.execPath,['server/index.mjs'],{env,windowsHide:true,stdio:'inherit'});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.on('exit',code=>process.exit(code||0));
