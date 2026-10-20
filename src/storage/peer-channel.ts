// One ordered data channel, small packets and bounded buffering. No media tracks or relay.
type Packet={id?:number;reply?:number;method?:string;payload?:unknown;error?:string;blob?:Blob};
type Handler=(method:string,payload:unknown,blob?:Blob)=>Promise<{payload?:unknown;blob?:Blob}|void>;
const CHUNK=16*1024,MAX_JSON=4*1024*1024,MAX_BLOB=8*1024*1024;
export class PeerChannel {
 private next=0;private queue=Promise.resolve();private stopped=false;
 private waiting=new Map<number,{resolve:(packet:Packet)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private incoming?:{json:number;blob:number;received:number;parts:Uint8Array[];blobs:BlobPart[]};
 private receiveQueue=Promise.resolve();private receiveTimer?:ReturnType<typeof setTimeout>;
 private handling=0;private lastRequest=0;private handlers=Promise.resolve();
 constructor(private channel:RTCDataChannel,private handler:Handler,private onError:(e:Error)=>void){
  channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=64*1024;
  channel.onmessage=e=>{this.receiveQueue=this.receiveQueue.then(()=>this.receive(e.data)).catch(e=>this.fail(e));};
  channel.onclose=()=>this.fail(Error('Соединение закрыто. Уже полученные изменения сохранены; обмен можно повторить.'));
  channel.onerror=()=>this.fail(Error('Обмен прервался. Подключи устройства ещё раз.'));
 }
 async call(method:string,payload?:unknown,blob?:Blob):Promise<Packet>{
  if(this.stopped)throw Error('Соединение закрыто');
  const id=++this.next;
  const response=new Promise<Packet>((resolve,reject)=>{const timer=setTimeout(()=>{this.waiting.delete(id);const error=Error('Второе устройство не ответило. Держи обе страницы открытыми.');reject(error);this.fail(error);},90000);this.waiting.set(id,{resolve,reject,timer});});
  // Attach the rejection handler before sending, including failures of the send itself.
  const result=response.then(packet=>{if(packet.error)throw Error(packet.error);return packet;});
  this.send({id,method,payload,blob}).catch(e=>this.fail(e));return result;
 }
 private send(packet:Packet){
  const send=async()=>{
   if(this.stopped)throw Error('Соединение закрыто');
   const {blob,...content}=packet,json=new TextEncoder().encode(JSON.stringify(content));
   if(json.length>MAX_JSON||(blob?.size||0)>MAX_BLOB)throw Error('Пакет превышает допустимый размер');
   await this.write(JSON.stringify({frame:1,json:json.length,blob:blob?.size||0}));
   for(let i=0;i<json.length;i+=CHUNK)await this.write(json.slice(i,i+CHUNK).buffer);
   if(blob)for(let i=0;i<blob.size;i+=CHUNK)await this.write(await blob.slice(i,i+CHUNK).arrayBuffer());
  };
  const task=this.queue.then(send);this.queue=task.catch(()=>{});return task;
 }
 private async write(data:string|ArrayBuffer){
  if(this.stopped||this.channel.readyState!=='open')throw Error('Соединение закрыто');
  if(this.channel.bufferedAmount>256*1024)await new Promise<void>((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);this.channel.removeEventListener('bufferedamountlow',ready);this.channel.removeEventListener('close',closed);};
   const ready=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(Error('Соединение закрыто'));};
   const timer=setTimeout(()=>{cleanup();reject(Error('Передача остановилась'));},30000);
   this.channel.addEventListener('bufferedamountlow',ready,{once:true});this.channel.addEventListener('close',closed,{once:true});
   if(this.channel.bufferedAmount<=64*1024)ready();
  });
  if(this.stopped)throw Error('Соединение закрыто');
  if(typeof data==='string')this.channel.send(data);else this.channel.send(data);
 }
 private async receive(data:unknown){
  if(this.stopped)return;
  clearTimeout(this.receiveTimer);
  if(typeof data==='string'){
   if(this.incoming||data.length>200)throw Error('Нарушен порядок пакетов');
   const frame=JSON.parse(data);
   if(frame.frame!==1||!Number.isSafeInteger(frame.json)||frame.json<2||frame.json>MAX_JSON||!Number.isSafeInteger(frame.blob)||frame.blob<0||frame.blob>MAX_BLOB)throw Error('Некорректный размер пакета');
   this.incoming={json:frame.json,blob:frame.blob,received:0,parts:[],blobs:[]};
  }else{
   const frame=this.incoming;
   if(!frame||!(data instanceof ArrayBuffer)||!data.byteLength||data.byteLength>CHUNK||frame.received+data.byteLength>frame.json+frame.blob)throw Error('Повреждён пакет');
   if(frame.received<frame.json){if(frame.received+data.byteLength>frame.json)throw Error('Повреждён заголовок');frame.parts.push(new Uint8Array(data));}else frame.blobs.push(data);
   frame.received+=data.byteLength;
   if(frame.received===frame.json+frame.blob){
    this.incoming=undefined;const json=new Uint8Array(frame.json);let offset=0;for(const part of frame.parts){json.set(part,offset);offset+=part.length;}
    const packet:Packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(json));
    if(frame.blob)packet.blob=new Blob(frame.blobs);
    if(packet.reply!==undefined){const pending=this.waiting.get(packet.reply);if(!pending)throw Error('Неожиданный ответ');this.waiting.delete(packet.reply);clearTimeout(pending.timer);pending.resolve(packet);}
    else{
     if(!Number.isSafeInteger(packet.id)||packet.id!<=this.lastRequest||typeof packet.method!=='string'||packet.method.length>30||this.handling>=8)throw Error('Неожиданный запрос');
     this.lastRequest=packet.id!;this.handling++;
     this.handlers=this.handlers.then(async()=>{if(this.stopped)return;try{const result=await this.handler(packet.method!,packet.payload,packet.blob);await this.send({reply:packet.id,...result});}catch(e){try{await this.send({reply:packet.id,error:String((e as Error).message||e).slice(0,300)});}catch{/* The other side may already have closed. */}this.fail(e);}}).finally(()=>{this.handling--;});
    }
   }
  }
  if(this.incoming)this.receiveTimer=setTimeout(()=>this.fail(Error('Пакет получен не полностью. Повтори обмен.')),30000);
 }
 private fail(reason:unknown){if(this.stopped)return;const error=reason instanceof Error?reason:Error(String(reason));this.close(error);this.onError(error);}
 close(error=Error('Обмен остановлен')){
  if(this.stopped)return;this.stopped=true;clearTimeout(this.receiveTimer);this.incoming=undefined;
  for(const pending of this.waiting.values()){clearTimeout(pending.timer);pending.reject(error);}this.waiting.clear();
  this.channel.onmessage=null;this.channel.onclose=null;this.channel.onerror=null;this.channel.close();
 }
}
