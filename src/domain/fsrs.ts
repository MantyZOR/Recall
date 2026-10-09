import type { Algorithm, Memory, Rating } from './types';
// Adapted from BSD-3-Clause open-spaced-repetition/fsrs-rs model_v7.rs.
// The bundled WASM executes the original Rust scalar implementation.
// TypeScript is a numerically validated fallback and powers worker simulations.
import { FSRS7_DEFAULT, FSRS6_DEFAULT } from './model-info.mjs';
export { FSRS7_DEFAULT, FSRS6_DEFAULT };
export const DAY=86_400_000;
const clamp=(x:number,min:number,max:number)=>Math.min(max,Math.max(min,x));
export const defaults=(algorithm:Algorithm)=>algorithm==='fsrs6'?FSRS6_DEFAULT:FSRS7_DEFAULT;
type WasmCore={set_parameter:(i:number,v:number)=>void; next:(s:number,d:number,f:number,t:number,r:number)=>void; get_s:()=>number;get_d:()=>number;get_f:()=>number;recall:(s:number,d:number,f:number,t:number)=>number;interval:(s:number,d:number,f:number,r:number)=>number};
let wasm:WasmCore|undefined;
export async function initMemoryCore() {
  try { const r=await fetch('/fsrs7.wasm',{signal:AbortSignal.timeout(3000)}); if (!r.ok) return; const result=await WebAssembly.instantiate(await r.arrayBuffer()); wasm=result.instance.exports as unknown as WasmCore;configuredWeights=undefined; } catch { /* Validated scalar fallback keeps offline learning available. */ }
}
let configuredWeights:number[]|undefined;
function setWeights(w:number[]) { if(w===configuredWeights)return;w.forEach((v,i)=>wasm!.set_parameter(i,v));configuredWeights=w; }
export function recall7(m:Pick<Memory,'stability'|'difficulty'|'stabilityFast'>, t:number, w=FSRS7_DEFAULT):number {
  t=Math.max(0,t); const s=Math.max(.0001,m.stability),f=Math.max(.0001,m.stabilityFast),d=clamp(m.difficulty,1,10);
  const decay1=-clamp(w[23]*Math.pow(f,w[33]-.3),.01,.95),factor1=Math.expm1(Math.min(60,Math.log(w[25])/decay1));
  const r1=Math.pow(1+factor1*t/f,decay1),decay2=-clamp(w[24],.01,.95),factor2=Math.pow(w[26],1/decay2)-1;
  const r2=Math.pow(1+factor2*Math.exp((d-5)*(w[32]-.3))*t/s,decay2);
  const weight1=w[27]*Math.pow(f,-w[29]),weight2=w[28]*Math.pow(s,w[30])*Math.exp((d-5)*(w[31]-.5));
  return (weight1*r1+weight2*r2)/(weight1+weight2)*(1-2e-5)+1e-5;
}
function setStability(w:number[],s:number,d:number,r:number,rating:Rating,start:number) {
  const fail=w[start+3]*(Math.pow(s+1,w[start+4])-1)*Math.exp((1-r)*w[start+5]),pls=Math.min(s,fail);
  const inc=Math.exp(w[start]-1.5)*(11-d)*Math.pow(s,-w[start+1])*Math.expm1((1-r)*w[start+2])*(rating===2?w[start+6]:1)*(rating===4?w[start+7]:1)+1;
  return clamp(rating===1?pls:Math.max(pls,s*inc),.0001,36500);
}
export function step7(m:Memory|null,t:number,rating:Rating,w=FSRS7_DEFAULT):Pick<Memory,'stability'|'difficulty'|'stabilityFast'> {
  if(!m) { const s=clamp(w[rating-1],.0001,36500);return {stability:s,difficulty:clamp(w[4]-Math.exp(w[5]*(rating-1))+1,1,10),stabilityFast:clamp(s*.8,.0001,36500)}; }
  const s=clamp(m.stability,.0001,36500),f=clamp(m.stabilityFast,.0001,36500),d=clamp(m.difficulty,1,10);
  const r=recall7({stability:s,stabilityFast:f,difficulty:d},t,w),slow=setStability(w,s,d,r,rating,7);
  const decay=-clamp(w[23]*Math.pow(f,w[33]-.3),.01,.95),factor=Math.expm1(Math.min(60,Math.log(w[25])/decay));
  let fast=setStability(w,f,d,Math.pow(1+factor*Math.max(0,t)/f,decay),rating,15);
  if(rating===1)fast=Math.min(fast,slow*.8);
  const delta=-w[6]*(rating-3)*(rating===1?r+.1:1);
  return {stability:slow,stabilityFast:clamp(fast,.0001,36500),difficulty:clamp(.01*(w[4]-Math.exp(w[5]*3)+1)+.99*(d+(10-d)*delta/9),1,10)};
}
export function interval7(m:Pick<Memory,'stability'|'difficulty'|'stabilityFast'>,target:number,w=FSRS7_DEFAULT) {
  target=clamp(target,.0001,.9999);if(target>=.9999)return 0;
  let lo=0,hi=Math.max(1,m.stability,m.stabilityFast);
  while(recall7(m,hi,w)>target&&hi<36500)hi=Math.min(36500,hi*2);
  for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(recall7(m,mid,w)>target)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}
export function recall6(m:Memory,t:number,w=FSRS6_DEFAULT) {const decay=-w[20],factor=Math.pow(.9,1/decay)-1;return Math.pow(1+factor*Math.round(Math.max(0,t))/Math.max(.0001,m.stability),decay);}
export function step6(m:Memory|null,t:number,r:Rating,w=FSRS6_DEFAULT):Pick<Memory,'stability'|'difficulty'|'stabilityFast'> {
  if(!m){const s=Math.max(.0001,w[r-1]);return {stability:s,stabilityFast:s,difficulty:clamp(w[4]-Math.exp(w[5]*(r-1))+1,1,10)};}
  t=Math.round(Math.max(0,t)); const s=m.stability,d=m.difficulty,ret=recall6(m,t,w);
  const delta=-w[6]*(r-3),nextD=clamp(w[7]*(w[4]-Math.exp(w[5]*3)+1)+(1-w[7])*(d+(10-d)*delta/9),1,10);
  let nextS:number;
  if(t<1){nextS=s*Math.exp(w[17]*(r-3+w[18]))*Math.pow(s,-w[19]);if(r>=2)nextS=Math.max(s,nextS);}
  else if(r===1){nextS=Math.min(w[11]*Math.pow(d,-w[12])*(Math.pow(s+1,w[13])-1)*Math.exp((1-ret)*w[14]),s/Math.exp(w[17]*w[18]));}
  else nextS=s*(1+Math.exp(w[8])*(11-d)*Math.pow(s,-w[9])*Math.expm1((1-ret)*w[10])*(r===2?w[15]:1)*(r===4?w[16]:1));
  nextS=clamp(nextS,.0001,36500);return {stability:nextS,stabilityFast:nextS,difficulty:nextD};
}
export function prediction(m:Memory|null,at:number,algorithm:Algorithm,w?:number[]):number|null {
  if(!m||!['fsrs7','fsrs6'].includes(algorithm))return null;
  const t=Math.max(0,(at-m.lastAt)/DAY);
  if(algorithm==='fsrs6')return recall6(m,t,w||FSRS6_DEFAULT);
  if(wasm){setWeights(w||FSRS7_DEFAULT);return wasm.recall(m.stability,m.difficulty,m.stabilityFast,t);}
  return recall7(m,t,w||FSRS7_DEFAULT);
}
export function schedule(m:Memory|null,rating:Rating,at:number,elapsedDays:number,retention:number,algorithm:Algorithm,w?:number[],computeDue=true):Memory {
  const base:Memory={stability:0,stabilityFast:0,difficulty:5,reps:0,lapses:0,ease:2.5,box:0,lastAt:at,due:at};
  let next={...(m||base)},days:number;
  if(algorithm==='fsrs7') {
    const params=w||FSRS7_DEFAULT;
    if(wasm) {setWeights(params);wasm.next(m?.stability||0,m?.difficulty||0,m?.stabilityFast||0,Math.max(0,elapsedDays),rating);Object.assign(next,{stability:wasm.get_s(),difficulty:wasm.get_d(),stabilityFast:wasm.get_f()});days=computeDue?wasm.interval(next.stability,next.difficulty,next.stabilityFast,retention):0;}
    else {Object.assign(next,step7(m,elapsedDays,rating,params));days=computeDue?interval7(next,retention,params):0;}
  } else if(algorithm==='fsrs6') {
    const params=w||FSRS6_DEFAULT;Object.assign(next,step6(m,elapsedDays,rating,params));
    days=computeDue?next.stability/(Math.pow(.9,-1/params[20])-1)*(Math.pow(retention,-1/params[20])-1):0;
  } else if(algorithm==='sm2') {
    const q=({1:0,2:3,3:4,4:5})[rating];
    next.ease=Math.max(1.3,next.ease+.1-(5-q)*(.08+(5-q)*.02));
    next.reps=rating===1?0:next.reps+1;
    days=rating===1?1:next.reps===1?1:next.reps===2?6:Math.max(1,next.stability*next.ease);
    next.stability=days;next.stabilityFast=days;
  } else {next.box=rating===1?0:Math.min(6,next.box+1);days=[1,2,4,8,16,32,64][next.box];next.stability=days;next.stabilityFast=days;}
  // These are explicit learning floors, separate from the memory model.
  const floor=rating===1?1/1440:rating===2?6/1440:rating===3?10/1440:30/1440;
  next.due=at+clamp(days,floor,36500)*DAY;next.lastAt=at;
  if(algorithm!=='sm2')next.reps=(m?.reps||0)+1;
  next.lapses=(m?.lapses||0)+(rating===1?1:0);return next;
}
export function intervalDays(m:Memory,retention:number,algorithm:Algorithm,w?:number[]){
 if(algorithm==='fsrs7'){if(wasm){setWeights(w||FSRS7_DEFAULT);return wasm.interval(m.stability,m.difficulty,m.stabilityFast,retention);}return interval7(m,retention,w||FSRS7_DEFAULT);}
 if(algorithm==='fsrs6'){const p=w||FSRS6_DEFAULT;return m.stability/(Math.pow(.9,-1/p[20])-1)*(Math.pow(retention,-1/p[20])-1);}
 return Math.max(1/1440,(m.due-m.lastAt)/DAY);
}
export function intervalLabel(ms:number) { if(ms<60_000)return '< 1 мин';if(ms<3_600_000)return Math.round(ms/60_000)+' мин';if(ms<DAY)return Math.round(ms/3_600_000)+' ч';if(ms<30*DAY)return Math.round(ms/DAY)+' дн';if(ms<365*DAY)return Math.round(ms/(30*DAY))+' мес';return (ms/(365*DAY)).toFixed(1)+' г'; }





