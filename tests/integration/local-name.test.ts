import {it,expect} from 'vitest';
import multicastDNS from 'multicast-dns';
import {serveLocalName} from '../../server/local-name.mjs';
it('answers only its own local name with current addresses after changing networks and closes the socket',async()=>{
 const name='recall-0123456789ab.local',port=15353;let address='192.168.1.22';
 const stop=serveLocalName(name,{port,addresses:()=>[address]}),client=multicastDNS({port});
 const query=()=>new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{client.removeListener('response',receive);reject(Error('No mDNS response'));},3000);const receive=(packet:any)=>{const a=packet.answers.find((a:any)=>a.name===name&&a.type==='A');if(a){clearTimeout(timer);client.removeListener('response',receive);resolve(a.data);}};client.on('response',receive);client.query(name,'A');});
 try{expect(await query()).toBe('192.168.1.22');address='10.0.0.8';await new Promise(r=>setTimeout(r,150));expect(await query()).toBe('10.0.0.8');}finally{stop();client.destroy();}
});
