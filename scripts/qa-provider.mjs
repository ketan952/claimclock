/** Explicit operator QA: synthetic fixtures only. Never reads or sends documents/secrets. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin=process.env.QA_BASE_URL||'https://claimclock.ketan952.workers.dev';
if(process.env.QA_REAL_PROVIDER!=='1')throw Error('Set QA_REAL_PROVIDER=1 to run explicitly authorized synthetic inference.');
const fixtures=JSON.parse(await readFile('tests/fixtures/settlements.json','utf8')).fixtures.slice(0,10);
const config=await(await fetch(origin+'/api/config',{headers:{origin}})).json();if(!config.ai_enabled)throw Error('AI is not enabled');
const worker_source_sha256=createHash('sha256').update(await readFile('worker/app.ts')).digest('hex');
const result={worker_source_sha256,prompt_revision:'reported-assertions-and-amount-binding-v4',tested_at:new Date().toISOString(),origin,config,scope:'Ten synthetic minimal deduction lines. Provider explanations do not classify claims; deterministic answer-key accuracy is tested separately.',cases:[]};
for(const f of fixtures){
 const line=f.reviewed_deduction;
 const input=`Synthetic QA. Deduction Rs ${line.amount}: ${line.description}\n${line.policyClause?`Policy clause supplied: ${line.policyClause}. Calculation confirmed: ${line.policyCalculationConfirmed}.`:'Applicable policy clause not supplied.'}`;
 if(input.length>800)throw Error('Synthetic QA input exceeds application cap');
 const started=Date.now();const response=await fetch(origin+'/api/explain',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({consent:true,lines:input,language:'en'})});
 const body=await response.json();result.cases.push({id:f.id,title:f.title,input,expected_category:f.expected.category,expected_verdict:f.expected.status,answer_key:f.expected.rationale,http_status:response.status,latency_ms:Date.now()-started,...body});
 await writeFile('qa/provider-results.json',JSON.stringify(result,null,2)+'\n');console.log(`${f.id}: HTTP ${response.status}; explanation ${typeof body.explanation==='string'?'received':'unavailable'}`);
 if(f!==fixtures.at(-1))await new Promise(resolve=>setTimeout(resolve,23000));
}
