import type { Operation, Memory, Rating, ParameterSet } from './types';
import { FSRS7_DEFAULT, step7, recall7, DAY } from './fsrs';
export interface TrainingItem {id:string;reviews:Operation[];}
const BOUNDS=[[.0001,50],[.0001,100],[.0001,100],[.0001,100],[1,10],[.001,4],[.1,4],[0,4],[0,1.2],[.3,3],[.01,1.5],[.1,1],[0,3.5],[0,1],[1,7],[0,4],[0,2],[.5,6],[.001,1.5],[.001,1],[0,5],[0,1],[1,7],[.01,.25],[.01,.95],[.2,.85],[.5,.99],[.01,1],[.1,1],[0,.9],[.1,1.1],[0,1],[0,.6],[0,.6]];
export function clipWeights(values:number[]){const w=values.map((v,i)=>Math.min(BOUNDS[i][1],Math.max(BOUNDS[i][0],v)));for(let i=1;i<4;i++)w[i]=Math.max(w[i-1],w[i]);w[26]=Math.max(w[26],w[25]);return w;}
export function scoreWeights(items:TrainingItem[],weights:number[],cutoff:number,partition:'train'|'test'){
 let total=0,n=0;
 for(const item of items){let m:Memory|null=null;for(const e of item.reviews){const elapsed=m?Math.max(0,(e.at-m.lastAt)/DAY):0;
  if(m&&e.payload.context!=='practice'&&!e.payload.hints&&elapsed>0&&((partition==='train')===(e.at<=cutoff))){
   const p=Math.max(.000001,Math.min(.999999,recall7(m,elapsed,weights))),yes=Number(e.payload.rating)>1;total-=yes?Math.log(p):Math.log(1-p);n++;
  }
  const state=step7(m,elapsed,Number(e.payload.rating) as Rating,weights);
  m={...state,reps:((m as Memory|null)?.reps||0)+1,lapses:0,ease:2.5,box:0,lastAt:Math.max(e.at,(m as Memory|null)?.lastAt||0),due:0};
 }}
 return {loss:n?total/n:Infinity,n};
}
export function optimize(items:TrainingItem[],progress:(percent:number)=>void):ParameterSet {
 const dates=items.flatMap(c=>c.reviews.slice(1).filter(e=>e.payload.context!=='practice'&&!e.payload.hints).map(e=>e.at)).sort((a,b)=>a-b);
 if(dates.length<400)throw new Error('Нужно не менее 400 повторений с прогнозом');
 const cutoff=dates[Math.floor(dates.length*.8)-1];
 let best=[...FSRS7_DEFAULT],train=scoreWeights(items,best,cutoff,'train');
 const objective=(w:number[])=>scoreWeights(items,w,cutoff,'train').loss+.002*w.reduce((sum,v,i)=>sum+Math.pow((v-FSRS7_DEFAULT[i])/Math.max(.1,FSRS7_DEFAULT[i]),2),0)/34;
 let bestObjective=objective(best);
 for(let pass=0;pass<8;pass++){const scale=.25*Math.pow(.65,pass);for(let j=0;j<34;j++){for(const sign of [-1,1]){
   const trial=[...best];trial[j]+=sign*Math.max(.04,Math.abs(best[j]))*scale;const clipped=clipWeights(trial),loss=objective(clipped);if(loss<bestObjective){best=clipped;bestObjective=loss;}
  }progress(Math.round((pass*34+j+1)/(8*34)*100));}}
 const standard=scoreWeights(items,FSRS7_DEFAULT,cutoff,'test'),fitted=scoreWeights(items,best,cutoff,'test');
 if(standard.n<50||train.n<200)throw new Error('Недостаточно независимых поздних ответов для проверки');
 return {id:crypto.randomUUID(),algorithm:'fsrs7',values:best,trainedAt:Date.now(),trainingCount:train.n,testCount:fitted.n,trainCutoff:cutoff,defaultLoss:standard.loss,fittedLoss:fitted.loss};
}


