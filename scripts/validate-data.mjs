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
const ruleKeys=['room_rent','copay','ped_waiting_months','specific_waiting_months','initial_waiting_days','consumables','health_checkup','pre_post_hospitalisation','sub_limits'];
const positiveInt=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max;
let statedRules=0;
for(const p of plans){
  if(!/^[a-z0-9-]+$/.test(p.id)||planIds.has(p.id)) throw Error(`Invalid or duplicate plan id ${p.id}`); planIds.add(p.id);
  if(!insurerIds.has(p.insurer_id)) throw Error(`Unknown insurer for plan ${p.id}`);
  if(!p.name?.trim()||!['health','life','motor'].includes(p.kind)||!['retail','senior','basic','group'].includes(p.segment)) throw Error(`Invalid plan metadata ${p.id}`);
  if(!p.rules||Object.keys(p.rules).some(k=>!ruleKeys.includes(k))||ruleKeys.some(k=>!(k in p.rules))) throw Error(`Plan ${p.id} must declare exactly ${ruleKeys.join(', ')}`);
  for(const [key,rule] of Object.entries(p.rules)){
    if(rule===null) continue; statedRules++;
    if(!rule.source_url?.startsWith('https://')||!/^\d{4}-\d{2}-\d{2}$/.test(rule.verified_on??'')||!rule.evidence?.trim()) throw Error(`Missing provenance ${p.id}.${key}`);
    if(/_months$|_days$/.test(key)){ if(!positiveInt(rule.value,120)) throw Error(`Bad duration ${p.id}.${key}`); }
    else if(key==='consumables'){ if(!['included','rider','optional','excluded'].includes(rule.value)) throw Error(`Bad consumables value ${p.id}`); }
    else if(key==='pre_post_hospitalisation'){
      // Structured only: each window is a day count or null (with a note explaining why), never prose.
      for(const side of ['pre_days','post_days']) if(rule[side]!==null&&!positiveInt(rule[side],365)) throw Error(`Bad ${side} ${p.id}`);
      if(rule.post_days===null&&!rule.note?.trim()) throw Error(`Unknown post-hospitalisation window needs a note ${p.id}`);
    }
    else if(typeof rule.value!=='string'||!rule.value.trim()) throw Error(`Bad rule text ${p.id}.${key}`);
    // Structured sub-fields drive the simulator; every one must be well-formed when present.
    if(key==='room_rent'){
      const category=rule.category;
      if(!['any','single_private_ac','single_private','twin_sharing','percent_si','rupee_cap','by_si'].includes(category)) throw Error(`Bad room category ${p.id}`);
      if(category==='percent_si'&&!(rule.percent>0&&rule.percent<=10)) throw Error(`Bad room percent ${p.id}`);
      if(category==='rupee_cap'&&!(Array.isArray(rule.cap_by_si)&&rule.cap_by_si.length&&rule.cap_by_si.every(([si,cap])=>Number.isInteger(si)&&si>0&&((cap.amount>0&&cap.percent===undefined)||(cap.percent>0&&cap.amount===undefined))))) throw Error(`Bad room cap table ${p.id}`);
      if(category==='by_si'&&!(Array.isArray(rule.category_by_si)&&rule.category_by_si.length>=2&&rule.category_by_si.every(([si,c])=>(si===null||(Number.isInteger(si)&&si>0))&&['any','single_private_ac','single_private','twin_sharing'].includes(c))&&rule.category_by_si[rule.category_by_si.length-1][0]===null)) throw Error(`Bad room category table ${p.id}`);
    }
    if(key==='copay'){
      if(!(typeof rule.percent==='number'&&rule.percent>=0&&rule.percent<=100)) throw Error(`Bad co-pay percent ${p.id}`);
      if(rule.conditional&&!(rule.conditional.percent>0&&rule.conditional.percent<=100&&['entry_age_61_plus'].includes(rule.conditional.when))) throw Error(`Bad conditional co-pay ${p.id}`);
    }
    if(key==='health_checkup'){
      if(!['cashless','reimbursement','unknown'].includes(rule.mode)) throw Error(`Bad health check-up mode ${p.id}`);
      const e=rule.eligibility;
      if(!e||!['day1','policy_year','after_first_year','claim_free_year','every_n_years'].includes(e.from)||(e.from==='every_n_years'&&!(Number.isInteger(e.every_years)&&e.every_years>=2))||(e.min_age!==undefined&&!positiveInt(e.min_age,99))) throw Error(`Bad health check-up eligibility ${p.id}`);
      const l=rule.limit;
      if(l!==null){
        if(l.type==='per_lakh'){ if(!(l.per_lakh>0&&(l.max_individual===null||l.max_individual>0)&&(l.max_floater===null||l.max_floater>0))) throw Error(`Bad per-lakh limit ${p.id}`); }
        else if(l.type==='percent_si'){ if(!(l.percent>0&&l.percent<=5&&(l.max===null||l.max>0))) throw Error(`Bad percent limit ${p.id}`); }
        else if(l.type==='table'){ if(!(Array.isArray(l.by_si)&&l.by_si.length&&l.by_si.every(([si,amount],i,all)=>si>0&&amount>0&&(i===0||si>all[i-1][0])))) throw Error(`Bad limit table ${p.id}`); }
        else if(l.type!=='package') throw Error(`Bad limit type ${p.id}`);
      }
    }
    if(key==='sub_limits'&&!(Array.isArray(rule.items)&&rule.items.every(i=>i.treatment?.trim()&&i.limit?.trim()))) throw Error(`Bad sub-limits ${p.id}`);
  }
}
console.log(`Validated ${contacts.length} contacts and ${rows.length} disclosure rows; ${incomplete} incomplete sums preserve unknowns; ${flagged} rows trigger manual re-verification flags; ${plans.length} plans with ${statedRules} sourced rules`);
