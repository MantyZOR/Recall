import { useCallback, useEffect, useRef, useState } from 'react';
import { getMeta, setMeta } from './db';
import { synchronize } from './sync';
import {connections} from './connections';
import { SyncController, syncRetry, type DevicePreferences, type SyncRetry, type SyncState } from './sync-policy';
export function useSync({ready,connected,preferences,initialRetry,eventCount,refresh}:{ready:boolean;connected:boolean;preferences:DevicePreferences;initialRetry?:SyncRetry;eventCount:number;refresh:(signal?:AbortSignal)=>Promise<void>}) {
 const available=useRef(connected);available.current=connected;
 const runner=useRef<SyncController|undefined>(undefined);
 const [state,setState]=useState<SyncState>({syncing:false,error:'',retry:syncRetry(initialRetry),paused:false});
 useEffect(()=>{
  if(!ready)return;
  const controller=new SyncController({
   maxAttempts:preferences.syncAttempts,retry:syncRetry(initialRetry),
   available:()=>available.current&&navigator.onLine&&document.visibilityState==='visible',
   run:async(signal,manual)=>{await synchronize(signal,manual);await refresh(signal);},
   persist:retry=>setMeta('syncRetryState',retry),change:setState
  });
  runner.current=controller;controller.start();
  const check=()=>controller.availabilityChanged();
  window.addEventListener('online',check);window.addEventListener('offline',check);document.addEventListener('visibilitychange',check);
  return()=>{controller.dispose();runner.current=undefined;window.removeEventListener('online',check);window.removeEventListener('offline',check);document.removeEventListener('visibilitychange',check);};
 },[ready,refresh]);
 useEffect(()=>{runner.current?.availabilityChanged();},[connected]);
 useEffect(()=>{void runner.current?.configure(preferences.syncAttempts);},[preferences.syncAttempts]);
 useEffect(()=>{runner.current?.localChange();},[eventCount]);
 const sync=useCallback(async()=>{if(!available.current)available.current=(await connections()).length>0;await runner.current?.manual();},[]);
 return {...state,sync,paused:preferences.syncAttempts===0||state.retry.failures>=preferences.syncAttempts};
}
