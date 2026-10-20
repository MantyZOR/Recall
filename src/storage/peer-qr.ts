const hash=(code:string)=>{let n=2166136261;for(let i=0;i<code.length;i++)n=Math.imul(n^code.charCodeAt(i),16777619);return (n>>>0).toString(16).padStart(8,'0');};
export function qrParts(code:string){
 if(code.length<=1000)return [code];
 const total=Math.ceil(code.length/1000),id=hash(code);
 if(total>12)throw Error('Код слишком большой для QR. Скопируй его текстом.');
 return Array.from({length:total},(_,i)=>`recall-qr:1:${id}:${i+1}:${total}:`+code.slice(i*1000,(i+1)*1000));
}
export class QrCollector {
 private id='';private total=0;private parts=new Map<number,string>();
 read(value:string):{code?:string;received:number;total:number}{
  if(value.startsWith('recall-peer:1:'))return {code:value,received:1,total:1};
  const match=/^recall-qr:1:([a-f0-9]{8}):(\d{1,2}):(\d{1,2}):([A-Za-z0-9_:-]+)$/.exec(value);
  if(!match)throw Error('Это не QR прямого обмена Recall');
  const [,id,indexText,totalText,part]=match,index=Number(indexText),total=Number(totalText);
  if(index<1||index>total||total<2||total>12||part.length>1000)throw Error('Повреждён QR');
  if(this.id!==id){this.id=id;this.total=total;this.parts.clear();}
  if(this.total!==total||(this.parts.has(index)&&this.parts.get(index)!==part))throw Error('Части QR не совпадают');
  this.parts.set(index,part);
  if(this.parts.size===total){const code=Array.from({length:total},(_,i)=>this.parts.get(i+1)!).join('');if(hash(code)!==id)throw Error('Код прочитан с ошибкой');return {code,received:total,total};}
  return {received:this.parts.size,total};
 }
}
