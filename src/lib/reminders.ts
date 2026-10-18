const date=(s:string)=>{const d=new Date(`${s}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Invalid calendar date');return d;};
const ymd=(d:Date)=>d.toISOString().slice(0,10).replaceAll('-','');
function addMonths(d:Date,n:number){const day=d.getUTCDate();const out=new Date(d);out.setUTCDate(1);out.setUTCMonth(out.getUTCMonth()+n);const last=new Date(Date.UTC(out.getUTCFullYear(),out.getUTCMonth()+1,0)).getUTCDate();out.setUTCDate(Math.min(day,last));return out;}
const escape=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
function fold(line:string){let result='',current='';for(const char of line){if(new TextEncoder().encode(current+char).length>73){result+=current+'\r\n ';current='';}current+=char;}return result+current;}
export type CalendarEvent={when:Date;title:string;body:string;/** Days before the event for the display alarm; 0 means on the day. */alarmDays?:number};
/** An RFC 5545 all-day calendar with one display alarm per event: control characters stripped, text escaped, lines folded at 73 octets. */
export function buildCalendar(events:CalendarEvent[],product:string):string {
 if(!events.length)throw Error('No calendar events');
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const clean=(s:string)=>escape(s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,''));
 const lines=['BEGIN:VCALENDAR','VERSION:2.0',`PRODID:-//ClaimClock//${product.replace(/[^A-Za-z0-9 ]/g,'')}//EN`,'CALSCALE:GREGORIAN',...events.flatMap((e,i)=>{
  if(!Number.isFinite(e.when.getTime()))throw Error('Invalid event date');
  const alarm=Math.max(0,Math.floor(e.alarmDays??7));
  return ['BEGIN:VEVENT',`UID:${crypto.randomUUID()}-${i}@claimclock`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${ymd(e.when)}`,`SUMMARY:${clean(e.title)}`,`DESCRIPTION:${clean(e.body)}`,'BEGIN:VALARM','ACTION:DISPLAY',`TRIGGER:${alarm===0?'-PT0M':`-P${alarm}D`}`,`DESCRIPTION:${clean(e.title)}`,'END:VALARM','END:VEVENT'];
 }),'END:VCALENDAR'];
 return lines.map(fold).join('\r\n')+'\r\n';
}
export function reminders(complaintDate:string,responseDate?:string){
 const start=date(complaintDate);if(!Number.isFinite(start.getTime()))throw Error('Invalid complaint date');
 const day14=new Date(start.getTime()+14*86400000),day30=new Date(start.getTime()+30*86400000),trigger=responseDate?date(responseDate):addMonths(start,1);
 if(!Number.isFinite(trigger.getTime())||trigger<start)throw Error('Invalid response date');
 const year=addMonths(trigger,12);
 const events:CalendarEvent[]=[{when:day14,title:'ClaimClock: 14-day grievance follow-up',body:'Check the insurer response; consider Bima Bharosa if unresolved. You file your own complaint.'},{when:day30,title:'ClaimClock: review Ombudsman eligibility',body:'No reply for ONE CALENDAR MONTH, or an unsatisfactory/rejected response, is a prerequisite. Day30 may differ from one month. Check CIO rules; do not file in parallel before another forum.'},{when:year,title:'ClaimClock: check the Ombudsman one-year limit',body:`${responseDate?'Based on the response date you entered.':'PROVISIONAL: assumes no insurer reply for one calendar month after the grievance.'} Verify the actual triggering event and file well before this date. Information, not legal advice.`}];
 return buildCalendar(events,'Complaint reminders');
}
