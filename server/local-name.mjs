import multicastDNS from 'multicast-dns';
import {networkInterfaces} from 'node:os';
import {createSocket} from 'node:dgram';
import {isRecallLocalName} from '../src/domain/lan-pairing.mjs';

const privateIP=value=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(value);
const ipv4=value=>value.split('.').reduce((sum,part)=>(sum<<8)|Number(part),0);
export function localAddresses(preferredName,remoteAddress=''){
 const interfaces=Object.entries(networkInterfaces()).filter(([name])=>!/vEthernet|Docker|WSL|VPN|Virtual|ZeroTier|Tailscale/i.test(name))
  .flatMap(([name,items])=>(items||[]).filter(i=>i.family==='IPv4'&&!i.internal&&privateIP(i.address)).map(i=>({...i,name})));
 const sameNetwork=privateIP(remoteAddress)?interfaces.filter(i=>(ipv4(i.address)&ipv4(i.netmask))===(ipv4(remoteAddress)&ipv4(i.netmask))):[];
 const candidates=sameNetwork.length?sameNetwork:interfaces;
 return [...new Set(candidates.sort((a,b)=>Number(b.name===preferredName)-Number(a.name===preferredName)).map(i=>i.address))];
}
// Answer only for this installation's unique, certificate-bound hostname.
// No discovery scan, periodic advertisements, study data or secrets on multicast.
export function serveLocalName(names,{port=5353,addresses=remote=>localAddresses(undefined,remote)}={}){
 const ours=new Set(Array.isArray(names)?names:[names]);
 if([...ours].some(name=>!isRecallLocalName(name)))throw Error('Invalid Recall local hostname');
 const socket=createSocket({type:'udp4',reuseAddr:true}),mdns=multicastDNS({port,socket});
 const last=new Map();
 mdns.on('error',()=>{}); // A blocked multicast socket must not stop the local service.
 mdns.on('query',(packet,remote)=>{
  const data=addresses(remote?.address)[0];if(!data)return;
  const answers=[];
  for(const q of packet.questions||[]){
   const name=q.name.toLowerCase().replace(/\.$/,''),key=name+'@'+data;
   if(!ours.has(name)||!['A','ANY'].includes(q.type)||Date.now()-(last.get(key)||0)<100)continue;
   if(last.size>64)last.clear();last.set(key,Date.now());
   answers.push({name,type:'A',ttl:10,flush:true,data});
  }
  if(answers.length){try{socket.setMulticastInterface(data);}catch{}mdns.respond({answers});}
 });
 return ()=>{try{mdns.destroy();}catch{/* Socket may have failed to bind. */}};
}
