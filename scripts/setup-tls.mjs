import 'reflect-metadata';
import { certificateProfile } from '../server/certificate-profile.mjs';
import * as x509 from '@peculiar/x509';
import { webcrypto, randomBytes, X509Certificate } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.resolve(process.env.RECALL_CERTS_DIR||path.join(root,'certs'));
mkdirSync(dir,{recursive:true});
const entries=Object.entries(networkInterfaces()).flatMap(([name,items])=>(items||[]).filter(i=>i.family==='IPv4'&&!i.internal).map(i=>({name,address:i.address})));
const preferred=entries.filter(i=>!/vEthernet|Docker|WSL|VPN|Virtual|ZeroTier|Tailscale/i.test(i.name));
const explicit=process.argv.indexOf('--address'),address=explicit>=0?process.argv[explicit+1]:(preferred[0]||entries[0])?.address;
if(!address||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)||address.split('.').some(x=>+x>255)){console.error('Укажи постоянный IPv4 компьютера: npm run setup:tls -- --address 192.168.1.10');process.exit(1);}
const configPath=path.join(dir,'config.json');
if(existsSync(configPath)&&!process.argv.includes('--renew')){writeFileSync(path.join(dir,'Recall-Local-CA.mobileconfig'),certificateProfile(readFileSync(path.join(dir,'rootCA.cer'))));const config=JSON.parse(readFileSync(configPath,'utf8'));console.log('HTTPS уже настроен: '+config.origin+'\nДля обновления сертификата: --renew. Корневой ключ сохранится.');process.exit(0);}
x509.cryptoProvider.set(webcrypto);
const algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:4096,publicExponent:new Uint8Array([1,0,1])};
const caKeyPath=path.join(dir,'rootCA-key.pem'),caPath=path.join(dir,'rootCA.pem');
function pem(label,bytes){return '-----BEGIN '+label+'-----\n'+Buffer.from(bytes).toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END '+label+'-----\n';}
function unpem(source){return Buffer.from(source.replace(/-----[^-]+-----|\s/g,''),'base64');}
let ca,caKey;
if(existsSync(caKeyPath)&&existsSync(caPath)){ca=new x509.X509Certificate(readFileSync(caPath,'utf8'));caKey=await webcrypto.subtle.importKey('pkcs8',unpem(readFileSync(caKeyPath,'utf8')),algorithm,true,['sign']);}
else{const keys=await webcrypto.subtle.generateKey(algorithm,true,['sign','verify']);caKey=keys.privateKey;
 ca=await x509.X509CertificateGenerator.createSelfSigned({name:'CN=Recall Local CA',serialNumber:randomBytes(16).toString('hex'),keys,notBefore:new Date(Date.now()-86400000),notAfter:new Date(Date.now()+10*365*86400000),signingAlgorithm:algorithm,extensions:[new x509.BasicConstraintsExtension(true,0,true),new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign|x509.KeyUsageFlags.cRLSign,true),await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)]});
 writeFileSync(caKeyPath,pem('PRIVATE KEY',await webcrypto.subtle.exportKey('pkcs8',caKey)),{mode:0o600});writeFileSync(caPath,ca.toString('pem'));writeFileSync(path.join(dir,'rootCA.cer'),Buffer.from(ca.rawData));
}
writeFileSync(path.join(dir,'Recall-Local-CA.mobileconfig'),certificateProfile(Buffer.from(ca.rawData)));
const serverAlgorithm={...algorithm,modulusLength:2048},serverKeys=await webcrypto.subtle.generateKey(serverAlgorithm,true,['sign','verify']),expires=new Date(Date.now()+365*86400000);
const cert=await x509.X509CertificateGenerator.create({subject:'CN=Recall Local',issuer:ca.subject,publicKey:serverKeys.publicKey,signingKey:caKey,serialNumber:randomBytes(16).toString('hex'),notBefore:new Date(Date.now()-86400000),notAfter:expires,signingAlgorithm:algorithm,extensions:[new x509.BasicConstraintsExtension(false,undefined,true),new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature|x509.KeyUsageFlags.keyEncipherment,true),new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1']),new x509.SubjectAlternativeNameExtension([{type:'ip',value:address},{type:'ip',value:'127.0.0.1'},{type:'dns',value:'localhost'}]),await x509.SubjectKeyIdentifierExtension.create(serverKeys.publicKey),await x509.AuthorityKeyIdentifierExtension.create(ca.publicKey)]});
writeFileSync(path.join(dir,'server-key.pem'),pem('PRIVATE KEY',await webcrypto.subtle.exportKey('pkcs8',serverKeys.privateKey)),{mode:0o600});
writeFileSync(path.join(dir,'server.pem'),cert.toString('pem')+'\n'+ca.toString('pem'));
const fingerprint=new X509Certificate(ca.toString('pem')).fingerprint256;
writeFileSync(configPath,JSON.stringify({address,origin:'https://'+address+':8443',bootstrapOrigin:'http://'+address+':8788',expires:expires.toISOString(),fingerprint},null,2));
if(!process.env.RECALL_CERTS_DIR&&process.platform==='win32'&&process.env.USERNAME){
 const user=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+process.env.USERNAME;
 const calls=[[dir,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],...['config.json','rootCA.pem','rootCA.cer','rootCA-key.pem','server.pem','server-key.pem','Recall-Local-CA.mobileconfig'].map(name=>[path.join(dir,name),'/inheritance:r','/grant:r',user+':F','SYSTEM:F'])];
 for(const args of calls){const result=spawnSync('icacls.exe',args,{windowsHide:true,encoding:'utf8'});if(result.status!==0)console.warn('Не удалось настроить права '+args[0]+'. Проверь доступ владельца через свойства файла.');}
}
console.log('Готово. Постоянный адрес PWA: https://'+address+':8443\nСертификат для iPhone: http://'+address+':8788/recall.mobileconfig\nКорневой отпечаток: '+fingerprint+'\nЗакрепи этот IP в домашнем роутере. Перезапусти Recall и открой «Устройства».');



