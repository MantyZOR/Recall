import multicastDNS from 'multicast-dns';
import {networkInterfaces} from 'node:os';
import {createSocket} from 'node:dgram';

export function localAddresses(preferredName){const entries=Object.entries(networkInterfaces()).filter(([name])=>!/vEthernet|Docker|WSL|VPN|Virtual|ZeroTier|Tailscale/i.test(name));const preferred=entries.filter(([name,items])=>name===preferredName&&items?.some(i=>i.family==='IPv4'&&!i.internal));return [...new Set((preferred.length?preferred:entries).flatMap(([,items])=>(items||[]).filter(i=>i.family==='IPv4'&&!i.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(i.address)).map(i=>i.address)))];}
// Answer only for this installation's unique, certificate-bound hostname.
// No discovery scan, periodic advertisements, study data or secrets on multicast.
export function serveLocalName(name,{port=5353,addresses=localAddresses}={}){
 if(!/^recall-[a-f0-9]{12}\.local$/.test(name))throw Error('Invalid Recall local hostname');
 const socket=createSocket({type:'udp4',reuseAddr:true}),mdns=multicastDNS({port,socket});let last=0;
 mdns.on('error',()=>{}); // A blocked multicast socket must not stop the local service.
 mdns.on('query',packet=>{
  if(Date.now()-last<100||!packet.questions?.some(q=>q.name.toLowerCase().replace(/\.$/,'')===name&&['A','ANY'].includes(q.type)))return;
  const answers=addresses().map(address=>({name,type:'A',ttl:30,flush:true,data:address}));
  if(answers.length){last=Date.now();try{socket.setMulticastInterface(answers[0].data);}catch{}mdns.respond({answers});}
 });
 return ()=>{try{mdns.destroy();}catch{/* Socket may have failed to bind. */}};
}
