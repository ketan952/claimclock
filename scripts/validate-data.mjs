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
for(const r of rows) {
  if(seen.has(r.id)) throw Error(`Duplicate row ${r.id}`); seen.add(r.id);
  if(!r.source_url?.startsWith('https://') || !r.retrieved_on) throw Error(`Missing provenance ${r.id}`);
  const vals=['lt1h','h1_2','h2_6','h6_12','h12_24','gt24h'].map(k=>r[k]);
  if(vals.some(v=>v!==null && (typeof v!=='number'||v<0))) throw Error(`Bad bucket ${r.id}`);
}
console.log(`Validated ${contacts.length} contacts and ${rows.length} disclosure rows`);
