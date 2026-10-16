import { readFile } from 'node:fs/promises';
const read = async n => JSON.parse(await readFile(`data/${n}.json`,'utf8'));
const contacts=await read('contacts');
for(const c of contacts) {
  if(!c.id || !c.source_url?.startsWith('https://') || !c.verified_on || !c.evidence) throw Error(`Unverified contact ${c.id}`);
  const source = (s, label) => {
    if (!s?.source_url?.startsWith('https://') || !/^\d{4}-\d{2}-\d{2}$/.test(s.verified_on ?? '') || !s.evidence?.trim()) throw Error(`Missing field provenance ${c.id}.${label}`);
  };
  for (const field of ['gro_email','gro_phone','helpline','claims_email']) if(c[field]) source(c.field_sources?.[field],field);
  for (const [i,l] of (c.escalation_levels ?? []).entries()) {
    if(!l.source_label || !l.role || !l.role_hi || !Number.isInteger(l.level)) throw Error(`Invalid escalation role ${c.id}.${i}`);
    for (const field of ['role','email','phone']) if(l[field]) source(l.field_sources?.[field],`escalation_levels[${i}].${field}`);
  }
  if(c.kind==='insurer') {
    if(c.own_page?.browser_status!=='verified' || !c.own_page?.source_url?.startsWith('https://')) throw Error(`Missing own-page browser review ${c.id}`);
    if(!c.irdai_baseline?.source_url?.startsWith('https://')) throw Error(`Missing regulator baseline ${c.id}`);
    for(const field of ['gro_email','gro_phone']) if(c.irdai_baseline[field]) source(c.irdai_baseline.field_sources?.[field],`irdai_baseline.${field}`);
  }
}
const rows=await read('nl48');
const seen=new Set();
let incomplete=0, flagged=0;
for(const r of rows) {
  if(seen.has(r.id)) throw Error(`Duplicate row ${r.id}`); seen.add(r.id);
  if(!r.source_url?.startsWith('https://') || !r.retrieved_on) throw Error(`Missing provenance ${r.id}`);
  const vals=['lt1h','h1_2','h2_6','h6_12','h12_24','gt24h'].map(k=>r[k]);
  if(!['percent','count'].includes(r.unit)) throw Error(`Bad unit ${r.id}`);
  if(vals.some(v=>v!==null && (typeof v!=='number'||!Number.isFinite(v)||v<0||(r.unit==='percent'&&v>100)))) throw Error(`Bad bucket ${r.id}`);
  if(r.unit==='percent') {
    const sum=vals.reduce((n,v)=>n+(v??0),0),complete=vals.every(v=>v!==null);
    if(sum>101+1e-9||(complete&&sum<99-1e-9)) throw Error(`Bucket sum outside 100±1 ${r.id}: ${sum}`);
    if(!complete) incomplete++;
    if(vals.slice(3).reduce((n,v)=>n+(v??0),0)>10+1e-9||vals.includes(100)) flagged++;
  }
}
// Plan catalog (M20): every stated rule carries its own published source, date and quoted evidence; unknown rules are null.
const plans=await read('plans');
const insurerIds=new Set(contacts.filter(c=>c.kind==='insurer').map(c=>c.id));
const planIds=new Set();
const ruleKeys=['room_rent','copay','ped_waiting_months','specific_waiting_months','initial_waiting_days','consumables','health_checkup'];
let statedRules=0;
for(const p of plans){
  if(!/^[a-z0-9-]+$/.test(p.id)||planIds.has(p.id)) throw Error(`Invalid or duplicate plan id ${p.id}`); planIds.add(p.id);
  if(!insurerIds.has(p.insurer_id)) throw Error(`Unknown insurer for plan ${p.id}`);
  if(!p.name?.trim()||!['health','life','motor'].includes(p.kind)||!['retail','senior','basic','group'].includes(p.segment)) throw Error(`Invalid plan metadata ${p.id}`);
  if(!p.rules||Object.keys(p.rules).some(k=>!ruleKeys.includes(k))||ruleKeys.some(k=>!(k in p.rules))) throw Error(`Plan ${p.id} must declare exactly ${ruleKeys.join(', ')}`);
  for(const [key,rule] of Object.entries(p.rules)){
    if(rule===null) continue; statedRules++;
    if(!rule.source_url?.startsWith('https://')||!/^\d{4}-\d{2}-\d{2}$/.test(rule.verified_on??'')||!rule.evidence?.trim()) throw Error(`Missing provenance ${p.id}.${key}`);
    if(/_months$|_days$/.test(key)){ if(!Number.isInteger(rule.value)||rule.value<0||rule.value>120) throw Error(`Bad duration ${p.id}.${key}`); }
    else if(key==='consumables'){ if(!['included','rider','optional','excluded'].includes(rule.value)) throw Error(`Bad consumables value ${p.id}`); }
    else if(typeof rule.value!=='string'||!rule.value.trim()) throw Error(`Bad rule text ${p.id}.${key}`);
    if(key==='health_checkup'&&!['cashless','reimbursement','unknown'].includes(rule.mode)) throw Error(`Bad health check-up mode ${p.id}`);
  }
}
console.log(`Validated ${contacts.length} contacts and ${rows.length} disclosure rows; ${incomplete} incomplete sums preserve unknowns; ${flagged} rows trigger manual re-verification flags; ${plans.length} plans with ${statedRules} sourced rules`);
