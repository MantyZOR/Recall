export type TextSize='comfortable'|'large'|'extra';
export const ACCENT_IDS=['violet','blue','emerald','berry','amber','slate'] as const;
export type Accent=typeof ACCENT_IDS[number];
export interface DevicePreferences {syncAttempts:number;textSize:TextSize;accent:Accent;}
export interface SyncRetry {failures:number;nextAttemptAt:number;}
export const DEFAULT_DEVICE_PREFERENCES:DevicePreferences={syncAttempts:3,textSize:'comfortable',accent:'violet'};
export function devicePreferences(value?:Partial<DevicePreferences>):DevicePreferences {
 return {syncAttempts:Number.isInteger(value?.syncAttempts)&&value!.syncAttempts!>=0&&value!.syncAttempts!<=10?value!.syncAttempts!:3,textSize:['comfortable','large','extra'].includes(value?.textSize||'')?value!.textSize!:'comfortable',accent:ACCENT_IDS.includes(value?.accent as Accent)?value!.accent!:'violet'};
}
export function syncRetry(value?:Partial<SyncRetry>):SyncRetry {
 return {failures:Number.isInteger(value?.failures)&&value!.failures!>=0?Math.min(10,value!.failures!):0,nextAttemptAt:Number.isFinite(value?.nextAttemptAt)&&value!.nextAttemptAt!>0?value!.nextAttemptAt!:0};
}
export interface SyncState {syncing:boolean;error:string;retry:SyncRetry;paused:boolean;}
interface Options {
 maxAttempts:number;retry:SyncRetry;available:()=>boolean;
 run:(signal:AbortSignal,manual:boolean)=>Promise<void>;persist:(retry:SyncRetry)=>Promise<void>;
 change:(state:SyncState)=>void;
}
const POLL_INTERVAL=60000;
const retryDelay=(failures:number)=>Math.min(120000,10000*3**Math.max(0,failures-1));
export class SyncController {
 private retry:SyncRetry;
 private maxAttempts:number;
 private timer?:ReturnType<typeof setTimeout>;
 private running?:Promise<void>;
 private controller?:AbortController;
 private active=false;
 private dirty=false;
 private error='';
 constructor(private options:Options){this.retry=syncRetry(options.retry);this.maxAttempts=devicePreferences({syncAttempts:options.maxAttempts}).syncAttempts;}
 get paused(){return this.maxAttempts===0||this.retry.failures>=this.maxAttempts;}
 private emit(){if(this.active)this.options.change({syncing:Boolean(this.running),error:this.error,retry:{...this.retry},paused:this.paused});}
 start(){this.active=true;this.emit();this.schedule(1200);}
 dispose(){this.active=false;this.clearTimer();this.controller?.abort();}
 private clearTimer(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;}
 private schedule(delay:number){
  this.clearTimer();
  if(!this.active||this.running||this.paused||!this.options.available())return;
  this.timer=setTimeout(()=>{this.timer=undefined;void this.attempt(false);},Math.max(delay,this.retry.failures?this.retry.nextAttemptAt-Date.now():0));
 }
 availabilityChanged(){
  if(!this.options.available()){this.clearTimer();this.controller?.abort();return;}
  this.schedule(1200);
 }
 localChange(){if(this.paused)return;if(this.running){this.dirty=true;return;}this.schedule(1200);}
 async configure(maxAttempts:number){
  if(this.maxAttempts===maxAttempts)return;
  this.maxAttempts=devicePreferences({syncAttempts:maxAttempts}).syncAttempts;this.retry={failures:0,nextAttemptAt:0};this.error='';
  this.clearTimer();this.emit();
  try{await this.options.persist({...this.retry});}catch(e){this.retry={failures:Math.max(1,this.maxAttempts),nextAttemptAt:0};this.error='Не удалось сохранить состояние обмена: '+String(e);this.emit();return;}
  this.schedule(1200);
 }
 manual(){return this.attempt(true);}
 private attempt(manual:boolean):Promise<void>{
  if(this.running)return this.running;
  if(!this.active||(!manual&&this.paused))return Promise.resolve();
  if(!this.options.available()){if(manual){this.error='Для обмена открой Recall и подключись к сети.';this.emit();}return Promise.resolve();}
  if(!manual&&this.retry.failures&&this.retry.nextAttemptAt>Date.now()){this.schedule(0);return Promise.resolve();}
  this.clearTimer();this.dirty=false;
  const controller=new AbortController();this.controller=controller;
  this.running=Promise.resolve().then(async()=>{
   try {
    await this.options.run(controller.signal,manual);
    if(controller.signal.aborted||!this.active)return;
    this.retry={failures:0,nextAttemptAt:Date.now()+POLL_INTERVAL};this.error='';
   }catch(e){
    if(controller.signal.aborted||!this.active)return;
    const failures=Math.min(10,this.retry.failures+1);
    this.retry={failures,nextAttemptAt:Date.now()+retryDelay(failures)};
    this.error=e instanceof Error&&['TimeoutError','AbortError','TypeError'].includes(e.name)?'Компьютер сейчас недоступен':e instanceof Error?e.message:String(e);
   }
   await this.options.persist({...this.retry});
  }).catch(e=>{this.retry={failures:Math.max(1,this.maxAttempts),nextAttemptAt:0};this.error='Не удалось сохранить состояние обмена: '+String(e);}).finally(()=>{
   this.running=undefined;this.controller=undefined;this.emit();
   this.schedule(this.error?0:this.dirty?1200:POLL_INTERVAL);
  });
  this.emit();return this.running;
 }
}
