import {describe,it,expect} from 'vitest';
import {PeerChannel} from '../../src/storage/peer-channel';
class Wire extends EventTarget {
 peer!:Wire;readyState='open';binaryType='arraybuffer';bufferedAmount=0;bufferedAmountLowThreshold=0;chunks:number[]=[];
 onmessage:((e:{data:unknown})=>void)|null=null;onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;
 send(value:string|ArrayBuffer){if(this.readyState!=='open')throw Error('closed');if(typeof value!=='string')this.chunks.push(value.byteLength);queueMicrotask(()=>this.peer.onmessage?.({data:value}));}
 close(){if(this.readyState==='closed')return;this.readyState='closed';this.dispatchEvent(new Event('close'));this.onclose?.();queueMicrotask(()=>this.peer.onclose?.());}
}
const wire=()=>{const a=new Wire(),b=new Wire();a.peer=b;b.peer=a;return [a,b] as const;};
describe('bounded peer data channel',()=>{
 it('round-trips an image in 16 KiB pieces and handles crossed ordered requests',async()=>{
  const [a,b]=wire(),errors:Error[]=[];
  const left=new PeerChannel(a as unknown as RTCDataChannel,async(_method,payload)=>({payload}),e=>errors.push(e));
  const right=new PeerChannel(b as unknown as RTCDataChannel,async(_method,payload,blob)=>({payload,blob}),e=>errors.push(e));
  try{
   const bytes=new Uint8Array(500123);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
   const [echo,cross]=await Promise.all([left.call('image',{title:'Картинка'},new Blob([bytes])),right.call('cross',{value:42})]);
   expect(echo.payload).toEqual({title:'Картинка'});expect(new Uint8Array(await echo.blob!.arrayBuffer())).toEqual(bytes);expect(cross.payload).toEqual({value:42});
   expect(a.chunks.length).toBeGreaterThan(30);expect(Math.max(...a.chunks,...b.chunks)).toBeLessThanOrEqual(16384);expect(errors).toEqual([]);
  }finally{left.close();right.close();}
 });
 it('rejects an oversized frame before invoking the application handler',async()=>{
  const [a,b]=wire();let calls=0;const errors:Error[]=[];
  const receiver=new PeerChannel(b as unknown as RTCDataChannel,async()=>{calls++;},e=>errors.push(e));
  a.send(JSON.stringify({frame:1,json:2,blob:8*1024*1024+1}));
  await new Promise(resolve=>setTimeout(resolve,10));expect(calls).toBe(0);expect(errors[0].message).toContain('размер');receiver.close();
 });
 it('rejects pending requests on cancellation and ignores later packets',async()=>{
  const [a,b]=wire();const sender=new PeerChannel(a as unknown as RTCDataChannel,async()=>{},()=>{});
  b.onmessage=()=>{};const pending=sender.call('waiting');sender.close();await expect(pending).rejects.toThrow('остановлен');
 });
});
