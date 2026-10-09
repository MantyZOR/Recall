import type { Goal, Snapshot } from './types';
import { activeCards, todayIntroducedIds } from './reducer';
import { calendarDate, dateEnd, dateStart, shiftedDate } from './time';
import { DAY } from './fsrs';

export function goalPace(s:Snapshot,g:Goal,now=Date.now()){
 const selected=activeCards(s).filter(c=>g.deckIds.includes(c.deckId)),deadline=dateEnd(g.date,s.settings.timeZone);
 const today=calendarDate(now,s.settings.timeZone);
 const distance=Math.round((Date.parse(g.date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/DAY);
 const days=deadline>=now?Math.max(0,distance+1):0;
 const fresh=selected.filter(c=>!c.memory&&!c.introductions.length),learning=selected.filter(c=>!c.memory&&c.introductions.length);
 const introducedIds=todayIntroducedIds(s,now),goalDecks=new Set(g.deckIds);
 const introducedToday=s.cards.filter(c=>goalDecks.has(c.deckId)&&introducedIds.has(c.id)).length;
 // Include today's completed introductions so the allowance cannot refill after each answer.
 const requiredNewPerDay=days&&fresh.length?Math.ceil((fresh.length+introducedToday)/days):0;
 const automatic=g.newPerDay===null||g.newPerDay===undefined,newPerDay=automatic?requiredNewPerDay:g.newPerDay!;
 const remainingToday=days?Math.max(0,newPerDay-introducedToday):0;
 const dailyStarts=Array.from({length:Math.min(days,Math.max(1,fresh.length+learning.length))},(_,i)=>i===0?now:dateStart(shiftedDate(today,i),s.settings.timeZone,s.settings.dayStartsAt));
 return {selected,deadline,days,fresh,learning,introducedToday,requiredNewPerDay,automatic,newPerDay,remainingToday,dailyStarts};
}
