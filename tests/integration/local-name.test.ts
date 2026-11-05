import {it,expect} from 'vitest';
import multicastDNS from 'multicast-dns';
import {serveLocalName} from '../../server/local-name.mjs';
it('serves the short enrollment name and the persistent name after an address change',async()=>{
 const name='recall-0123456789ab.local',alias='recall-h7j2k.local',port=15353;let address='192.168.1.22';
 const stop=serveLocalName([name,alias],{port,addresses:()=>[address]}),client=multicastDNS({port});
 const query=(hostname:string)=>new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{client.removeListener('response',receive);reject(Error('No mDNS response'));},3000);const receive=(packet:any)=>{const a=packet.answers.find((a:any)=>a.name===hostname&&a.type==='A');if(a){clearTimeout(timer);client.removeListener('response',receive);resolve(a.data);}};client.on('response',receive);client.query(hostname,'A');});
 try{expect(await query(alias)).toBe('192.168.1.22');expect(await query(name)).toBe('192.168.1.22');address='10.0.0.8';expect(await query(name)).toBe('10.0.0.8');expect(await query(alias)).toBe('10.0.0.8');}finally{stop();client.destroy();}
});
