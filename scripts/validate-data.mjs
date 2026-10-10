import { readFile } from 'node:fs/promises';
const read = async n => JSON.parse(await readFile(`data/${n}.json`,'utf8'));
const contacts=await read('contacts');
for(const c of contacts) {
  if(!c.id || !c.source_url?.startsWith('https://') || !c.verified_on || !c.evidence) throw Error(`Unverified contact ${c.id}`);
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
