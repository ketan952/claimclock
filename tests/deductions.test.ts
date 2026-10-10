import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classify,parseManualLines,verdictTotals} from '../src/lib/deductions.ts';
import type {Category,DeductionStatus,DeductionInput} from '../src/lib/deductions.ts';
import {knownIdentifiers,redact} from '../src/lib/redact.ts';
import {reminders} from '../src/lib/reminders.ts';

type Fixture={id:string;title:string;synthetic:boolean;letter:string;known_identifiers:string[];billed_amount:number;paid_amount:number;reviewed_deduction:DeductionInput;expected:{category:Category;status:DeductionStatus;rationale:string;rule_ids:string[]};primary_sources:{rule_id:string;source_url:string;paragraph:string}[];public_case_context:{id:string;url:string}[]};
const dataset=JSON.parse(readFileSync(new URL('./fixtures/settlements.json',import.meta.url),'utf8')) as {synthetic:boolean;ai_evaluated:boolean;ocr_evaluated:boolean;fixtures:Fixture[]};
const fixtures=dataset.fixtures;
const rules=JSON.parse(readFileSync(new URL('../data/rules.json',import.meta.url),'utf8')) as {id:string}[];
const evidence=JSON.parse(readFileSync(new URL('../research/user-evidence.json',import.meta.url),'utf8')) as {posts:{id:string;url:string}[]};

test('synthetic answer key spans all ten deduction categories and traceable evidence',()=>{
 assert.equal(dataset.synthetic,true);assert.equal(dataset.ai_evaluated,false);assert.equal(dataset.ocr_evaluated,false);assert.equal(fixtures.length,16);
 assert.deepEqual([...new Set(fixtures.map(f=>f.expected.category))].sort(),['co-pay','consumable','implant','package','reasonable-customary','room-rent','room-rent-cap','sub-limit','unexplained','unrelated'].sort());
 for(const f of fixtures){assert.equal(f.synthetic,true);assert.ok(f.letter.includes('NOT A REAL CLAIM'));assert.equal(f.billed_amount-f.paid_amount,f.reviewed_deduction.amount);assert.ok(f.expected.rationale.length>80);for(const s of f.primary_sources)assert.ok(rules.some(r=>r.id===s.rule_id));for(const p of f.public_case_context)assert.ok(evidence.posts.some(e=>e.id===p.id&&e.url===p.url));}
});

test('deterministic engine agrees with all sixteen reviewed fixture outcomes',()=>{
 const matching=fixtures.filter(f=>{const out=classify(f.reviewed_deduction);return out.category===f.expected.category&&out.status===f.expected.status;});
 assert.equal(matching.length,16,`${matching.length}/16 category-and-status agreement; this does not measure AI or OCR accuracy`);assert.ok(fixtures.filter(f=>f.expected.status==='likely valid').length===4);
});
for(const fixture of fixtures){
 test(`${fixture.id}: ${fixture.title}`,()=>{
  const out=classify(fixture.reviewed_deduction);
  assert.equal(out.category,fixture.expected.category,fixture.expected.rationale);
  assert.equal(out.status,fixture.expected.status,fixture.expected.rationale);
  assert.equal(out.amount,fixture.reviewed_deduction.amount);
  assert.ok(out.ruleIds.includes('deduction-reasons'));
  assert.ok(out.explanation.trim()&&out.explanation_hi.trim());
 });
}

test('policy terms default to verification until confirmed or explicitly reported absent',()=>{
 for(const id of ['S03','S04','S11','S12']){
  const input=fixtures.find(f=>f.id===id)!.reviewed_deduction;
  assert.equal(classify({...input,policyClause:undefined}).status,'policy term — verify');
  assert.equal(classify({...input,policyClause:'   '}).status,'policy term — verify');
  assert.equal(classify({...input,policyCalculationConfirmed:false}).status,'policy term — verify');
  assert.equal(classify({...input,noApplicablePolicyClause:true}).status,'challengeable');
  assert.equal(classify({...input,policyClause:undefined,noApplicablePolicyClause:false}).status,'policy term — verify');
 }
 for(const id of ['S09','S10','S14'])assert.equal(classify(fixtures.find(f=>f.id===id)!.reviewed_deduction).status,'policy term — verify');
 const noReason=fixtures.find(f=>f.id==='S08')!.reviewed_deduction;
 assert.equal(classify({...noReason,policyClause:'Refer to policy terms',policyCalculationConfirmed:true,noApplicablePolicyClause:true}).status,'no reason given');
});

test('room cap difference and associated-expense ratio remain separate even with policy confirmations',()=>{
 const direct=fixtures.find(f=>f.id==='S11')!.reviewed_deduction;assert.equal(classify(direct).category,'room-rent-cap');assert.equal(classify(direct).status,'likely valid');
 const associated=fixtures.find(f=>f.id==='S01')!.reviewed_deduction;const reviewed=classify({...associated,policyClause:'DEMO room-related associated charge clause',policyCalculationConfirmed:true});assert.equal(reviewed.category,'room-rent');assert.equal(reviewed.status,'challengeable');assert.ok(reviewed.ruleIds.includes('financial-limits-2024'));
});
test('implants are not labelled consumables solely because the denial calls them non-medical',()=>{
 const result=classify(fixtures.find(f=>f.id==='S13')!.reviewed_deduction);assert.equal(result.category,'implant');assert.equal(result.status,'challengeable');assert.match(result.explanation,/not automatically an excluded consumable/);
});
test('verdict totals preserve all amounts and monetary decimals in separate groups',()=>{
 const all=fixtures.map(f=>classify(f.reviewed_deduction));const totals=verdictTotals(all);
 assert.equal(totals['likely valid'],4500+14500+6000+10000);assert.equal(totals['no reason given'],3250);assert.equal(totals['policy term — verify'],12500+22000+6000);assert.equal(Object.values(totals).reduce((a,b)=>a+b,0),fixtures.reduce((sum,f)=>sum+f.reviewed_deduction.amount,0));
 assert.equal(verdictTotals([classify({id:'a',description:'Unexplained',amount:0.1}),classify({id:'b',description:'Unexplained',amount:0.2})])['no reason given'],0.3);
});

test('manual line input preserves Indian-currency amounts and isolates invalid lines',()=>{
 const out=parseManualLines('Reasonable and customary reduction | ₹1,23,456.50\nSurgical tape included in package\tRs. 2,400\nNo item-wise reason | INR 3250\nIncomplete row without amount\nNegative adjustment | -500\nZero reduction | 0');
 assert.deepEqual(out.inputs.map(v=>v.amount),[123456.50,2400,3250]);assert.deepEqual(out.errors,[4,5,6]);
 assert.equal(out.inputs[1].description,'Surgical tape included in package');
});

test('malformed amount grouping is rejected, not silently converted into a valid claim amount',()=>{
 const out=parseManualLines('Unexplained adjustment | 1,,250\nCo-payment | 12,34\nRoom rent | 1,234,567.89');
 assert.deepEqual(out.errors,[1,2]);assert.deepEqual(out.inputs.map(v=>v.amount),[1234567.89]);
});

test('known synthetic names and policy, claim and UHID identifiers leave no residue',()=>{
 for(const f of fixtures){
  const out=redact(f.letter,[...knownIdentifiers(f.letter),...f.known_identifiers]);
  for(const value of f.known_identifiers)assert.ok(!out.toLocaleLowerCase().includes(value.toLocaleLowerCase()),`${f.id} leaked ${value}`);
  assert.ok(out.length<=800);
 }
});

test('semicolon-separated headers supply each identifier for repeated narrative redaction',()=>{
 const source='Patient Name: Aditi Kulkarni; UHID: DEMO-UH-88371\nAditi Kulkarni disputes the package deduction of Rs 2,400.\nInsured Name: Aditi Kulkarni; Policy Number: DEMO-POL-32144';
 const out=redact(source,knownIdentifiers(source));
 assert.ok(!out.includes('Aditi Kulkarni'),'A name repeated in narrative must not survive because it was captured together with a second header field');
 assert.ok(!out.includes('DEMO-UH-88371'));assert.ok(!out.includes('DEMO-POL-32144'));
 assert.ok(out.includes('2,400'),'Redaction should retain the amount being reviewed');
});

test('explicit Hindi patient identifiers and mixed-case names are removed from shared descriptions',()=>{
 const source='मरीज़ नीलिमा शर्मा ने कटौती का कारण माँगा। nEeLiMa ShArMa questioned the adjustment. Policy: DEMO-HI-559900. Amount Rs 1,500.';
 const out=redact(source,['नीलिमा शर्मा','Neelima Sharma','DEMO-HI-559900']);
 assert.ok(!out.includes('नीलिमा शर्मा'));assert.ok(!/neelima sharma/i.test(out));assert.ok(!out.includes('DEMO-HI-559900'));
});

test('email, mobile, Aadhaar-shaped values, labelled address and dates are not sent as deduction text',()=>{
 const out=redact('Email: example.qa@invalid.test | Mobile: +91-9876543210 | ID: 1234 5678 9012\nAddress: 10 Demo Lane, Example City\nDOB: 17/03/1981\nDeduction: non-medical kit Rs 850');
 for(const secret of ['example.qa@invalid.test','9876543210','1234 5678 9012','10 Demo Lane','17/03/1981'])assert.ok(!out.includes(secret));
 assert.ok(out.includes('Rs 850'));
});

const unfold=(ics:string)=>ics.replace(/\r\n[ \t]/g,'');
const dates=(ics:string)=>[...unfold(ics).matchAll(/^DTSTART;VALUE=DATE:(\d{8})$/gm)].map(m=>m[1]);
// CRLF remains after unfolding; normalize only in date extraction, not the production artifact.
const calendarDates=(ics:string)=>dates(unfold(ics).replaceAll('\r\n','\n'));
const calendars=[
 {name:'January 31 in an ordinary year',complaint:'2026-01-31',expected:['20260214','20260302','20270228']},
 {name:'January 31 in a leap year',complaint:'2024-01-31',expected:['20240214','20240301','20250228']},
 {name:'December year boundary',complaint:'2025-12-31',expected:['20260114','20260130','20270131']},
 {name:'August 31 followed by a short month',complaint:'2026-08-31',expected:['20260914','20260930','20270930']},
 {name:'February 29 response anniversary',complaint:'2024-02-01',response:'2024-02-29',expected:['20240215','20240302','20250228']},
 {name:'actual December 31 response replaces no-reply assumption',complaint:'2025-11-30',response:'2025-12-31',expected:['20251214','20251230','20261231']},
];
for(const fixture of calendars)test(`ICS: ${fixture.name}`,()=>{
 const ics=reminders(fixture.complaint,fixture.response);
 assert.deepEqual(calendarDates(ics),fixture.expected);
 assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,3);
 const plain=unfold(ics);assert.ok(plain.includes('ONE CALENDAR MONTH'));assert.ok(plain.includes('Day30 may differ from one month'));
 assert.ok(plain.includes(fixture.response?'Based on the response date you entered.':'PROVISIONAL:'));
});

test('ICS rejects impossible calendar dates and response dates before the grievance',()=>{
 for(const value of ['2026-02-30','2025-02-29','2026-04-31','2026-13-01','not-a-date'])assert.throws(()=>reminders(value),`Impossible complaint date ${value} must not normalize silently`);
 assert.throws(()=>reminders('2026-02-01','2026-02-30'));
 assert.throws(()=>reminders('2026-03-01','2026-02-28'));
});

test('ICS output uses folded CRLF lines and preserves necessary escaped punctuation',()=>{
 const ics=reminders('2026-01-31');
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));assert.ok(!/(?<!\r)\n/.test(ics));
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75,`Unfolded physical line exceeds75 bytes: ${line}`);
 assert.ok(ics.includes('\r\n '));assert.ok(unfold(ics).includes('response\\; consider'));
 assert.ok(unfold(ics).includes('Information\\, not legal advice.'));
 assert.ok(!ics.includes('DEMO-POL'));
});
