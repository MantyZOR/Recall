import { describe, expect, it } from 'vitest';
import { activityCalendar } from '../../src/domain/activity';
import { materialize, studyDay } from '../../src/domain/reducer';
import { base, op, review } from '../fixtures';

const noon=(date:string)=>Date.parse(date+'T12:00:00Z');
function history(){
 const dates=['2025-09-01','2026-01-05','2026-08-30','2026-10-19'];
 return materialize([...base,...dates.map((date,i)=>op('r'+i,'review',review,['a1'],i+3,'pc',i+3,'card',noon(date)))],noon('2026-10-19'));
}
describe('activity calendar periods',()=>{
 it('filters the count and dates independently for month, 12 weeks, half year and year',()=>{
  const s=history(),now=noon('2026-10-19');
  expect(activityCalendar(s,'month',now)).toMatchObject({start:'2026-09-20',end:'2026-10-19',total:1});
  expect(activityCalendar(s,'quarter',now)).toMatchObject({start:'2026-07-28',total:2});
  expect(activityCalendar(s,'half-year',now)).toMatchObject({start:'2026-04-20',total:2});
  expect(activityCalendar(s,'year',now)).toMatchObject({start:'2025-10-20',total:3});
  expect(activityCalendar(s,'quarter',now).days).toHaveLength(84);
  expect(activityCalendar(s,'year',now).days).toHaveLength(365);
 });
 it('clamps month ends and includes leap days without duplicating dates',()=>{
  const s=materialize(base),march=activityCalendar(s,'month',noon('2024-03-31'));
  expect(march.start).toBe('2024-03-01');expect(march.days).toHaveLength(31);
  const leap=activityCalendar(s,'year',noon('2024-03-01'));
  expect(leap.days).toHaveLength(366);expect(leap.days.some(d=>d.date==='2024-02-29')).toBe(true);
  expect(new Set(leap.days.map(d=>d.date)).size).toBe(leap.days.length);
 });
 it('uses the configured study day across clock changes and pads calendar weeks to Monday',()=>{
  const s=history();s.settings.timeZone='America/New_York';s.settings.dayStartsAt=4;
  const now=Date.parse('2026-11-01T07:30:00Z'),result=activityCalendar(s,'quarter',now);
  expect(result.end).toBe(studyDay(now,s.settings.timeZone,4));expect(result.end).toBe('2026-10-31');
  expect(result.days).toHaveLength(84);expect(result.cells.length%7).toBe(0);
  expect(new Set(result.days.map(d=>d.date)).size).toBe(84);
  const first=result.cells.findIndex(Boolean),date=new Date(result.start+'T12:00:00Z');
  expect(first).toBe((date.getUTCDay()+6)%7);
 });
 it('keeps archived-card activity but omits undone and out-of-range responses',()=>{
  const events=[...base,op('r','review',review,['a1'],3,'pc',3,'card',noon('2026-10-19'))];
  const deleted=op('trash','card.delete',{},['a1'],4);
  expect(activityCalendar(materialize([...events,deleted]),'month',noon('2026-10-19')).total).toBe(1);
  const undo=op('undo','review.undo',{reviewId:'r'},['r'],5);
  expect(activityCalendar(materialize([...events,deleted,undo]),'month',noon('2026-10-19')).total).toBe(0);
 });
});
