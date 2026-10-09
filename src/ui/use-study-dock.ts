import { useEffect, useRef } from 'react';

// Reserve the actual dock height and keep its controls above the on-screen keyboard.
export function useStudyDock(active:boolean){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const controls=ref.current,shell=controls?.closest<HTMLElement>('.app-shell');
  if(!active||!controls||!shell)return;
  const viewport=window.visualViewport;
  const measure=()=>shell.style.setProperty('--study-dock-height',Math.ceil(controls.getBoundingClientRect().height)+'px');
  const position=()=>{
   const typing=Boolean(document.activeElement?.matches('input,textarea,[contenteditable="true"]'));
   const gap=viewport&&typing&&Math.abs(viewport.scale-1)<.01?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
   const keyboard=gap>100;
   shell.style.setProperty('--study-dock-bottom',keyboard?Math.round(gap)+'px':'0px');
   shell.style.setProperty('--study-safe-area',keyboard?'0px':'env(safe-area-inset-bottom,0px)');
   measure();
  };
  const observer=new ResizeObserver(measure);observer.observe(controls);
  viewport?.addEventListener('resize',position);viewport?.addEventListener('scroll',position);
  window.addEventListener('resize',position);document.addEventListener('focusin',position);document.addEventListener('focusout',position);
  position();
  return ()=>{
   observer.disconnect();viewport?.removeEventListener('resize',position);viewport?.removeEventListener('scroll',position);
   window.removeEventListener('resize',position);document.removeEventListener('focusin',position);document.removeEventListener('focusout',position);
   for(const name of ['--study-dock-height','--study-dock-bottom','--study-safe-area'])shell.style.removeProperty(name);
  };
 },[active]);
 return ref;
}
