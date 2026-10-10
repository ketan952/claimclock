export type EventName='session_started'|'clock_lock_copied'|'escalation_copied'|'delay_charge_generated'|'opt_in_submitted';
const counts:Partial<Record<EventName,number>>={};
let timer:ReturnType<typeof setTimeout>|undefined;
function hasConsent():boolean {
  try {return localStorage.getItem('claimclock:analytics')==='yes';}
  catch {return false;}
}
function discardPending() {
  for(const key of Object.keys(counts)) delete counts[key as EventName];
  if(timer!==undefined) clearTimeout(timer);
  timer=undefined;
}
export function track(name:EventName) {
  // Optional analytics must never break local work when browser storage is denied.
  if(!hasConsent()){discardPending();return;}
  counts[name]=Math.min(20,(counts[name]||0)+1);
  if(timer===undefined) timer=setTimeout(flush,15000);
}
async function flush() {
  const batch={...counts};discardPending();
  // Consent may have changed while this batch waited. Drop it without retry/replay.
  if(!hasConsent()||Object.keys(batch).length===0) return;
  try {await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({counts:batch}),keepalive:true});} catch { /* Optional counts are deliberately dropped. */ }
}
