const DAY=86400000;
/** End of the chosen calendar date in the profile's IANA time zone. */
export function dateEnd(date:string,timeZone:string){
 const desired=new Date(date+'T23:59:59.999Z').getTime();
 let at=desired;
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){
  const p=Object.fromEntries(fmt.formatToParts(at).map(v=>[v.type,v.value]));
  const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second,999);
  const difference=desired-shown;at+=difference;if(!difference)break;
 }return at;
}
/** A local wall-clock hour on a calendar date, including offset changes. */
export function dateStart(date:string,timeZone:string,hour=0){
 const desired=new Date(date+'T'+String(hour).padStart(2,'0')+':00:00.000Z').getTime();
 let at=desired;
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){
  const p=Object.fromEntries(fmt.formatToParts(at).map(v=>[v.type,v.value]));
  const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  const difference=desired-shown;at+=difference;if(!difference)break;
 }return at;
}
export function calendarDate(at:number,timeZone:string){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).map(v=>[v.type,v.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
export function shiftedDate(date:string,days:number){return new Date(new Date(date+'T12:00:00Z').getTime()+days*DAY).toISOString().slice(0,10);}
