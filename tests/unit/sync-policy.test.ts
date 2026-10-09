import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { SyncController, devicePreferences, syncRetry, type SyncState, type SyncRetry } from '../../src/storage/sync-policy';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T10:00:00Z'));});
afterEach(()=>vi.useRealTimers());
function setup({limit=3,retry=syncRetry(),run=vi.fn(async()=>{throw new TypeError('Network unavailable');})}:{limit?:number;retry?:SyncRetry;run?:ReturnType<typeof vi.fn>}={}){
 let available=true,state:SyncState;
 const saved:SyncRetry[]=[];
 const controller=new SyncController({maxAttempts:limit,retry,run,available:()=>available,persist:async retry=>{saved.push({...retry});},change:value=>{state=value;}});
 controller.start();
 return {controller,run,saved,state:()=>state!,available:(value:boolean)=>{available=value;controller.availabilityChanged();}};
}
test('caps consecutive failures across edits, network events, a restart and failed manual retry',async()=>{
 const f=setup();
 await vi.advanceTimersByTimeAsync(1200);expect(f.run).toHaveBeenCalledTimes(1);
 for(let i=0;i<10;i++){f.controller.localChange();f.controller.availabilityChanged();}
 await vi.advanceTimersByTimeAsync(9999);expect(f.run).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);expect(f.run).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(30000);expect(f.run).toHaveBeenCalledTimes(3);expect(f.state().paused).toBe(true);
 for(let i=0;i<10;i++){f.controller.localChange();f.available(false);f.available(true);}
 await vi.advanceTimersByTimeAsync(600000);expect(f.run).toHaveBeenCalledTimes(3);
 const stored=f.saved.at(-1)!;f.controller.dispose();
 const restored=setup({retry:stored});
 await vi.advanceTimersByTimeAsync(600000);expect(restored.run).not.toHaveBeenCalled();
 await restored.controller.manual();expect(restored.run).toHaveBeenCalledTimes(1);expect(restored.state().paused).toBe(true);
 await vi.advanceTimersByTimeAsync(600000);expect(restored.run).toHaveBeenCalledTimes(1);restored.controller.dispose();
});
test('a successful manual exchange resumes auto polling with a fresh failure budget',async()=>{
 const run=vi.fn(async()=>{}),f=setup({retry:{failures:3,nextAttemptAt:0},run});
 expect(f.state().paused).toBe(true);await f.controller.manual();
 expect(f.state().paused).toBe(false);expect(f.state().retry.failures).toBe(0);expect(f.saved.at(-1)?.failures).toBe(0);
 await vi.advanceTimersByTimeAsync(59999);expect(run).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);
 run.mockRejectedValue(new TypeError('Network unavailable'));
 await vi.advanceTimersByTimeAsync(60000+10000+30000);
 expect(run).toHaveBeenCalledTimes(5);expect(f.state().paused).toBe(true);f.controller.dispose();
});
test('manual-only mode stays manual after successful exchange and reopening',async()=>{
 const run=vi.fn(async()=>{}),f=setup({limit:0,run});
 f.controller.localChange();await vi.advanceTimersByTimeAsync(600000);expect(run).not.toHaveBeenCalled();
 await f.controller.manual();expect(run).toHaveBeenCalledTimes(1);expect(f.state().paused).toBe(true);
 f.controller.localChange();f.available(false);f.available(true);await vi.advanceTimersByTimeAsync(600000);expect(run).toHaveBeenCalledTimes(1);
 f.controller.dispose();const reopened=setup({limit:0,retry:f.saved.at(-1),run});
 await vi.advanceTimersByTimeAsync(600000);expect(run).toHaveBeenCalledTimes(1);reopened.controller.dispose();
});
test('hidden or offline state cancels work without consuming an attempt',async()=>{
 const run=vi.fn((signal:AbortSignal)=>new Promise<void>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))),f=setup({run});
 f.available(false);await vi.advanceTimersByTimeAsync(600000);expect(run).not.toHaveBeenCalled();
 await f.controller.manual();expect(run).not.toHaveBeenCalled();expect(f.state().retry.failures).toBe(0);
 f.available(true);await vi.advanceTimersByTimeAsync(1200);expect(run).toHaveBeenCalledTimes(1);
 f.available(false);await vi.advanceTimersByTimeAsync(600000);
 expect(f.state().syncing).toBe(false);expect(f.state().retry.failures).toBe(0);expect(f.saved).toHaveLength(0);f.controller.dispose();
});
test('concurrent triggers share one exchange and transfer edits promptly after it completes',async()=>{
 let finish=()=>{};const run=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})),f=setup({run});
 await vi.advanceTimersByTimeAsync(1200);
 const manual=f.controller.manual();f.controller.localChange();f.controller.localChange();
 expect(run).toHaveBeenCalledTimes(1);finish();await manual;
 await vi.advanceTimersByTimeAsync(1199);expect(run).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);expect(run).toHaveBeenCalledTimes(2);finish();await f.controller.manual();f.controller.dispose();
});
test('changing the attempt limit resets a paused budget, keeping the same limit preserves it',async()=>{
 const f=setup({retry:{failures:3,nextAttemptAt:Date.now()+30000}});
 await f.controller.configure(3);expect(f.state().paused).toBe(true);expect(f.saved).toHaveLength(0);
 await f.controller.configure(1);expect(f.state().paused).toBe(false);
 await vi.advanceTimersByTimeAsync(1200);expect(f.run).toHaveBeenCalledTimes(1);expect(f.state().paused).toBe(true);f.controller.dispose();
});
test('a failure to persist the retry state stops automatic requests',async()=>{
 const run=vi.fn(async()=>{}),change=vi.fn();
 const controller=new SyncController({maxAttempts:3,retry:syncRetry(),available:()=>true,run,persist:async()=>{throw Error('Quota');},change});
 controller.start();await vi.advanceTimersByTimeAsync(600000);
 expect(run).toHaveBeenCalledTimes(1);expect(change.mock.calls.at(-1)?.[0].paused).toBe(true);controller.dispose();
});
test('local preferences and retry metadata reject invalid values without disabling safety limits',()=>{
 expect(devicePreferences()).toEqual({syncAttempts:3,textSize:'comfortable',accent:'violet'});
 expect(devicePreferences({syncAttempts:0,textSize:'extra',accent:'emerald'})).toEqual({syncAttempts:0,textSize:'extra',accent:'emerald'});
 expect(devicePreferences({syncAttempts:999,textSize:'bad' as any,accent:'invalid' as any})).toEqual({syncAttempts:3,textSize:'comfortable',accent:'violet'});
 expect(syncRetry({failures:-1,nextAttemptAt:NaN})).toEqual({failures:0,nextAttemptAt:0});
});
