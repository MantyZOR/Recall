import {describe,it,expect} from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {qrParts,QrCollector} from '../../src/storage/peer-qr';

function cameraFrame(text:string,width:number){
 const qr=QRCode.create(text,{errorCorrectionLevel:'M'}),modules=qr.modules.size,dim=width+40,raw=new Uint8ClampedArray(dim*dim*4);raw.fill(255);
 const scale=width/(modules+8);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  const col=Math.floor(x/scale)-4,row=Math.floor(y/scale)-4;
  if(col>=0&&row>=0&&col<modules&&row<modules&&qr.modules.get(row,col)){const at=((y+20)*dim+x+20)*4;raw[at]=raw[at+1]=raw[at+2]=20;}
 }
 // A small defocus models a camera, instead of testing a pristine PNG only.
 const blurred=raw.slice();
 for(let y=1;y<dim-1;y++)for(let x=1;x<dim-1;x++){
  let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=raw[((y+dy)*dim+x+dx)*4];
  const at=(y*dim+x)*4;blurred[at]=blurred[at+1]=blurred[at+2]=sum/9;
 }
 return {pixels:blurred,dim};
}
describe('QR camera readability',()=>{
 it('reconstructs realistic mixed-case invitation data from small defocused frames',()=>{
  let seed=123456;const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const code='recall-peer:1:'+Array.from({length:1100},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return alphabet[seed>>>26];}).join('');
  for(const width of [240,260,300]){
   const collector=new QrCollector();let actual='';
   for(const part of qrParts(code)){const {pixels,dim}=cameraFrame(part,width),qr=jsQR(pixels,dim,dim,{inversionAttempts:'dontInvert'});expect(qr?.data).toBe(part);actual=collector.read(qr!.data).code||'';}
   expect(actual).toBe(code);
  }
  // A device which has not updated yet may still show the old 1,000-character frames.
  const legacy=new QrCollector();
  expect(legacy.read('recall-qr:1:47fb1d1f:2:2:'+code.slice(1000)).received).toBe(1);
  expect(legacy.read('recall-qr:1:47fb1d1f:1:2:'+code.slice(0,1000)).code).toBe(code);
 });
});
