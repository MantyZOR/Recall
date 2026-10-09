import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FSRS7_DEFAULT, recall7, step7, interval7, schedule, DAY } from '../../src/domain/fsrs';
import { clipWeights } from '../../src/domain/optimizer';
import type { Memory, Rating } from '../../src/domain/types';
let core:any;
beforeAll(async()=>{const result=await WebAssembly.instantiate(readFileSync('public/fsrs7.wasm'));core=result.instance.exports;});
const full=(s:{stability:number;stabilityFast:number;difficulty:number}):Memory=>({...s,reps:0,lapses:0,ease:2.5,box:0,lastAt:0,due:0});
function close(a:number,b:number,tolerance=0.00025){expect(Number.isFinite(a)).toBe(true);expect(Math.abs(a-b)).toBeLessThan(Math.max(0.00005,Math.abs(b)*tolerance));}
describe('FSRS-7: source Rust WASM versus TypeScript fallback',()=>{
 it('agrees on fractional-day histories, all ratings and personalized weights',()=>{
  for(const w of [FSRS7_DEFAULT,clipWeights(FSRS7_DEFAULT.map((v,i)=>v*(i%2?1.04:.97)))]){
   w.forEach((v,i)=>core.set_parameter(i,v));
   for(const initial of [1,2,3,4] as Rating[]){
    let m:Memory|null=null;
    for(let i=0;i<40;i++){
     const t=[0,1/1440,.015,.3,1,7,30,365][i%8],r=(i?1+i%4:initial) as Rating,js=step7(m,t,r,w);
     core.next(m?.stability||0,m?.difficulty||0,m?.stabilityFast||0,t,r);
     close(js.stability,core.get_s());close(js.stabilityFast,core.get_f());close(js.difficulty,core.get_d());
     m=full(js);
     for(const days of [0,.005,.25,3,100])close(recall7(m,days,w),core.recall(m.stability,m.difficulty,m.stabilityFast,days));
     for(const target of [.7,.9,.97])close(interval7(m,target,w),core.interval(m.stability,m.difficulty,m.stabilityFast,target),.002);
    }
   }
  }
 });
 it('has decreasing recall, shorter intervals for higher target, and defined learning floors',()=>{
  const m=full(step7(null,0,3));
  expect(recall7(m,1)).toBeGreaterThan(recall7(m,7));
  expect(interval7(m,.97)).toBeLessThan(interval7(m,.7));
  for(const model of ['fsrs7','fsrs6','sm2','leitner'] as const)for(const rating of [1,2,3,4] as Rating[]){
   const next=schedule(null,rating,1000,0,.9,model);expect(next.due).toBeGreaterThan(1000);expect(Number.isFinite(next.stability)).toBe(true);expect(next.lastAt).toBe(1000);
  }
 });
});
