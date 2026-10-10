export type EventName='session_started'|'clock_lock_copied'|'escalation_copied'|'delay_charge_generated'|'opt_in_submitted';
const counts:Partial<Record<EventName,number>>={};
let timer:ReturnType<typeof setTimeout>|undefined;
export function track(name:EventName) {
  if(localStorage.getItem('claimclock:analytics')!=='yes') return;
  counts[name]=Math.min(20,(counts[name]||0)+1);
  if(!timer) timer=setTimeout(flush,15000);
}
async function flush() {
  const batch={...counts};for(const k of Object.keys(counts)) delete counts[k as EventName];timer=undefined;
  try {await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({counts:batch}),keepalive:true});} catch { /* Optional counts are deliberately dropped. */ }
}
