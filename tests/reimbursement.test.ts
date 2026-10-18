import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CLAIM_LIMITS,DOCUMENT_KEYS,SETTLEMENT_DAYS,bankRateFor,claimReadyPack,claimTimeline,documentProgress,financialYear,newClaim,parseClaim,parseClaims,penalInterest,queryPattern,reimbursementCalendar,rule,settlementAudit,type ReimbursementClaim} from '../src/lib/reimbursement.ts';
import {FAR_ABOVE_FACTOR,cghs,compareLine,itemByCode,items,itemsByGroup,referenceRate,suggestItems,tierForCity} from '../src/lib/fair-bill.ts';
import {makeReimbursementLetter} from '../src/lib/reimbursement-letters.ts';
import type {Contact,Rule} from '../src/lib/types.ts';

const contacts:Contact[]=JSON.parse(readFileSync(new URL('../data/contacts.json',import.meta.url),'utf8'));
const rules:Rule[]=JSON.parse(readFileSync(new URL('../data/rules.json',import.meta.url),'utf8'));
const sourceLinks:{slug:string;url:string}[]=JSON.parse(readFileSync(new URL('../data/source-links.json',import.meta.url),'utf8'));
const redirects=readFileSync(new URL('../public/_redirects',import.meta.url),'utf8');
const now=new Date('2026-10-18T06:30:00Z');
const M26_RULES=['reimbursement-15-days','penal-interest-bank-rate-plus-2','documents-at-one-go','claim-not-closed-for-documents','bank-rate-fy','rate-display-rule-9'];
const claim=(over:Partial<ReimbursementClaim>={}):ReimbursementClaim=>({id:'c1',insurerId:'star-health',hospital:'Example Hospital',intimatedOn:'2026-09-20',submittedOn:'2026-09-25',claimedAmount:120000,queries:[],settledOn:null,settledAmount:null,interestPaid:null,documents:{},notes:'',updatedAt:'2026-10-18T00:00:00.000Z',...over});

test('M26 rules: verbatim quotes, bilingual text, source slugs with redirects, and the Bank Rate table with RBI sources',()=>{
 for(const id of M26_RULES){
  const r=rules.find(x=>x.id===id);assert.ok(r,id);
  for(const key of ['title','title_hi','paragraph','clause','quote','source_url','verified_on','scope','plain_en','plain_hi','caveat','source_slug'] as const)assert.ok(typeof r[key]==='string'&&(r[key] as string).trim(),`${id}.${key}`);
  assert.match(r.plain_hi as string,/[\u0900-\u097F]/);assert.doesNotMatch(r.quote,/\s{2,}/);
  const link=sourceLinks.find(l=>l.slug===r.source_slug);assert.ok(link,`${id} slug`);assert.ok(redirects.includes(`/s/${link!.slug} ${link!.url} 302`));
  assert.ok(/^https:\/\/(irdai\.gov\.in|cdnbbsr\.s3waas\.gov\.in)\//.test(r.source_url),`${id} host`);
 }
 const bank=rule('bank-rate-fy').rates as Record<string,{percent:number;as_on:string;source_url:string;quote:string}>;
 assert.deepEqual(Object.keys(bank),['2025-26','2026-27']);
 assert.equal(bank['2025-26'].percent,6.5);assert.equal(bank['2026-27'].percent,5.5);
 for(const row of Object.values(bank)){assert.match(row.source_url,/^https:\/\/www\.rbi\.org\.in\/Scripts\/BS_PressReleaseDisplay\.aspx\?prid=\d+$/);assert.match(row.quote,/Bank Rate (shall be|remains at) \d\.\d0 per cent/);assert.match(row.as_on,/-04-01$/);}
 assert.equal(rule('reimbursement-15-days').deadline_days,15);
});
test('financial years and the Bank Rate lookup follow the 1 April rule',()=>{
 assert.equal(financialYear('2026-04-01'),'2026-27');assert.equal(financialYear('2026-03-31'),'2025-26');assert.equal(financialYear('2025-12-15'),'2025-26');assert.equal(financialYear('2027-01-01'),'2026-27');
 assert.equal(bankRateFor('2026-10-10')?.percent,5.5);assert.equal(bankRateFor('2026-10-10')?.fy,'2026-27');assert.equal(bankRateFor('2025-06-01')?.percent,6.5);
 assert.equal(bankRateFor('2024-06-01'),null,'an unrecorded year is null, never guessed');assert.equal(bankRateFor('bad'),null);
 assert.deepEqual(penalInterest(100000,'2026-09-20','2026-10-18',5.5),{days:28,ratePercent:7.5,amount:575,from:'2026-09-20',to:'2026-10-18'});
 assert.equal(penalInterest(100000,'2026-10-18','2026-09-20',5.5)?.days,0,'a payment before intimation yields no days');
 assert.equal(penalInterest(0,'2026-09-20','2026-10-18',5.5),null);assert.equal(penalInterest(1000,'2026-09-20','x',5.5),null);
});
test('claim timeline: awaiting, due today, overdue with accrued interest, settled on time, settled late, and bad dates',()=>{
 const waiting=claimTimeline(claim({submittedOn:'2026-10-10',intimatedOn:'2026-10-08'}),now);
 assert.equal(waiting.status,'awaiting');assert.equal(waiting.deadline,'2026-10-25');assert.equal(waiting.daysLeft,7);assert.equal(waiting.interest,null);assert.equal(waiting.bankRate?.fy,'2026-27');
 assert.equal(claimTimeline(claim({submittedOn:'2026-10-03',intimatedOn:'2026-10-01'}),now).status,'due_today');
 const over=claimTimeline(claim(),now);
 assert.equal(over.status,'overdue');assert.equal(over.deadline,'2026-10-10');assert.equal(over.daysOverdue,8);
 assert.deepEqual(over.interest,{days:28,ratePercent:7.5,amount:Math.round(120000*7.5/100*28/365),from:'2026-09-20',to:'2026-10-18'});
 assert.ok(over.ruleIds.includes('reimbursement-15-days')&&over.ruleIds.includes('penal-interest-bank-rate-plus-2'));
 const noAmount=claimTimeline(claim({claimedAmount:null}),now);assert.equal(noAmount.interest,null);assert.ok(noAmount.notes.includes('needs_amount'));
 assert.equal(claimTimeline(claim({settledOn:'2026-10-09',settledAmount:110000}),now).status,'settled_on_time');
 const late=claimTimeline(claim({settledOn:'2026-10-15',settledAmount:110000}),now);
 assert.equal(late.status,'settled_late');assert.equal(late.daysOverdue,5);assert.equal(late.interest?.days,25);assert.equal(late.interest?.amount,Math.round(110000*7.5/100*25/365),'interest runs on the amount actually paid');
 const oldYear=claimTimeline(claim({intimatedOn:'2025-05-01',submittedOn:'2025-05-10',settledOn:'2025-06-30'}),now);assert.equal(oldYear.bankRate?.percent,6.5);assert.equal(oldYear.interest?.ratePercent,8.5);
 for(const bad of [claim({intimatedOn:'2026-09-26'}),claim({submittedOn:'2026-10-19'}),claim({settledOn:'2026-09-01'}),claim({submittedOn:'2026-02-30'})])assert.equal(claimTimeline(bad,now).status,'invalid');
 assert.equal(SETTLEMENT_DAYS,15);
});
test('query pattern, settlement audit and document progress',()=>{
 const none=queryPattern([]);assert.equal(none.piecemeal,false);assert.equal(none.count,0);
 const sameDay=queryPattern([{id:'a',at:'2026-10-01',note:'bills'},{id:'b',at:'2026-10-01',note:'icp'}]);assert.equal(sameDay.piecemeal,false);assert.equal(sameDay.distinctDates,1);
 const piece=queryPattern([{id:'a',at:'2026-10-01',note:'bills',repliedOn:'2026-10-02'},{id:'b',at:'2026-10-09',note:'icp'},{id:'c',at:'bad',note:''}]);
 assert.equal(piece.piecemeal,true);assert.equal(piece.distinctDates,2);assert.equal(piece.unanswered,2);assert.equal(piece.spanDays,8);assert.equal(piece.firstOn,'2026-10-01');
 const pending=settlementAudit(claim(),now);assert.deepEqual(pending.flags,['not_settled']);
 const clean=settlementAudit(claim({settledOn:'2026-10-09',settledAmount:120000}),now);assert.deepEqual(clean.flags,[]);assert.equal(clean.shortfall,0);
 const lateNoInterest=settlementAudit(claim({settledOn:'2026-10-15',settledAmount:100000}),now);
 assert.deepEqual(lateNoInterest.flags,['partial','late','no_interest_line']);assert.equal(lateNoInterest.shortfall,20000);assert.equal(lateNoInterest.interestDue,Math.round(100000*7.5/100*25/365));assert.equal(lateNoInterest.interestShortfall,lateNoInterest.interestDue);
 const short=settlementAudit(claim({settledOn:'2026-10-15',settledAmount:120000,interestPaid:100}),now);assert.deepEqual(short.flags,['late','interest_short']);assert.equal(short.interestShortfall,short.interestDue!-100);
 const paid=settlementAudit(claim({settledOn:'2026-10-15',settledAmount:120000,interestPaid:5000}),now);assert.deepEqual(paid.flags,['late']);assert.equal(paid.interestShortfall,0);
 assert.deepEqual(settlementAudit(claim({settledOn:'2026-10-15'}),now).flags,['needs_amounts','late','no_interest_line'],'the claimed amount still lets interest be estimated');
 assert.deepEqual(documentProgress({denial:true,bill:true}),{done:2,total:7,missing:['discharge','icp','doctor','reports','implant']});assert.equal(DOCUMENT_KEYS.length,7);
});
test('claims are validated field by field before they are trusted, and the pack and calendar render from them',()=>{
 const good=parseClaim(claim({queries:[{id:'q1',at:'2026-10-01',note:'ICP please',repliedOn:'2026-10-02'}],documents:{denial:true}}));assert.equal(good.queries.length,1);
 for(const bad of [{...claim(),extra:1},claim({queries:[{id:'q',at:'2026-13-01',note:''}]}),claim({queries:[{id:'q',at:'2026-10-01',note:'x'.repeat(301)}]}),claim({claimedAmount:-1}),claim({claimedAmount:'1000' as never}),claim({documents:{xray:true} as never}),claim({intimatedOn:'2026-09-30'}),claim({settledOn:'2026-09-01'}),claim({hospital:'h'.repeat(101)}),claim({updatedAt:'yesterday'}),claim({queries:[{id:'q',at:'2026-10-01',note:''},{id:'q',at:'2026-10-02',note:''}]})])assert.throws(()=>parseClaim(bad),`${JSON.stringify(bad).slice(0,80)}`);
 assert.throws(()=>parseClaims(Array.from({length:CLAIM_LIMITS.maxClaims+1},(_,i)=>claim({id:`c${i}`}))),/Invalid claim list/);
 assert.throws(()=>parseClaims([claim(),claim()]),/Duplicate/);
 const fresh=newClaim({insurerId:'care',intimatedOn:'2026-10-01',submittedOn:'2026-10-02'});assert.equal(fresh.queries.length,0);assert.doesNotThrow(()=>parseClaim(fresh));
 const pack=claimReadyPack(claim({queries:[{id:'q1',at:'2026-10-01',note:'ICP; bills',repliedOn:'2026-10-02'},{id:'q2',at:'2026-10-09',note:'doctor note'}],documents:{denial:true,bill:true}}),claimTimeline(claim(),now),{insurer:'Star Health',hospital:'Example Hospital',language:'en',labels:{title:'Claim-Ready Pack',name:'Name',policy:'Policy number',claim:'Claim number',insurer:'Insurer',hospital:'Hospital',intimated:'Intimated',submitted:'Submitted',deadline:'Deadline',claimed:'Claimed',settled:'Settled',interest:'Interest due',days:'days',documents:'Documents',queries:'Queries',notes:'Notes',footer:'Footer.'},documentLabels:{denial:'Denial note',bill:'Final bill',discharge:'Discharge summary',icp:'ICP',doctor:'Doctor note',reports:'Reports',implant:'Implant invoice'},queryLabels:{query:'Query',replied:'replied',pending:'pending'}});
 assert.match(pack,/Name: \[Your name\]/);assert.match(pack,/\[x\] Denial note\n\[x\] Final bill\n\[ \] Discharge summary/);assert.match(pack,/Queries: 2\n- 1 October 2026 — Query: ICP; bills · replied 2 October 2026\n- 9 October 2026 — Query: doctor note · pending/);assert.match(pack,/Interest due: ₹\d/);
 const ics=reimbursementCalendar(claim({submittedOn:'2026-10-10'}),{deadline:'15-day deadline',followUp:'send the grievance if unsettled',body:'Body'}).replace(/\r\n[ \t]/g,'');
 assert.deepEqual([...ics.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map(m=>m[1]),['20261025','20261026']);assert.ok(ics.includes('TRIGGER:-PT0M'));
 assert.throws(()=>reimbursementCalendar(claim({submittedOn:'x'}),{deadline:'',followUp:'',body:''}),/Invalid submission date/);
});
test('CGHS data: provenance, tier lists, 240 verbatim items with the Non-NABH column at 85% and uniform items flagged',()=>{
 assert.equal(items.length,240);assert.match(cghs.source.source_url,/^https:\/\/www\.csir\.res\.in\//);assert.equal(cghs.source.verified_on,'2026-10-18');assert.match(String(cghs.source.sha256),/^[a-f0-9]{64}$/);
 assert.equal(new Set(items.map(i=>i.code)).size,240);
 for(const i of items){assert.ok(i.nabh>0&&i.non_nabh>0&&i.super_speciality>=i.nabh,i.code);assert.ok(i.non_nabh===i.nabh||Math.abs(i.non_nabh-Math.round(i.nabh*0.85))<=1,`${i.code} non-NABH is not 85%`);}
 assert.deepEqual(cghs.tiers.I.cities,['Hyderabad','Delhi','Ahmedabad','Bengaluru','Mumbai','Pune','Chennai','Kolkata']);assert.equal(cghs.tiers.II.multiplier,0.9);assert.equal(cghs.tiers.III.multiplier,0.8);
 assert.equal(itemByCode('CC001')?.nabh,5400);assert.equal(itemByCode('CC001')?.ward,false,'ICU is uniform across ward entitlements');
 assert.equal(itemByCode('AG094')?.nabh,36300);assert.equal(itemByCode('AG094')?.ward,true);assert.equal(itemByCode('OR089')?.super_speciality,174800);assert.equal(itemByCode('CN001')?.nabh,350);
 assert.ok(Object.values(itemsByGroup()).every(list=>list.length>0));
});
test('fair bill: city tiers with aliases, reference rates by column, tier and ward, ranges, verdicts and quantities',()=>{
 assert.equal(tierForCity('Mumbai'),'I');assert.equal(tierForCity('bangalore'),'I');assert.equal(tierForCity('New Delhi'),'I');assert.equal(tierForCity('Gurugram'),'II');assert.equal(tierForCity('Lucknow'),'II');assert.equal(tierForCity('Kochi'),'II');assert.equal(tierForCity('Nagpur'),'II');assert.equal(tierForCity('Patiala'),'III');assert.equal(tierForCity(''),null);assert.equal(tierForCity('  Pune '),'I');
 const chole=itemByCode('AG094')!;
 assert.equal(referenceRate(chole,'I','nabh','semi_private').rate,36300);
 assert.equal(referenceRate(chole,'II','nabh','semi_private').rate,32670);assert.equal(referenceRate(chole,'III','non_nabh','general').rate,Math.round(30855*0.8*0.95));assert.equal(referenceRate(chole,'I','super_speciality','private').rate,Math.round(41745*1.05));
 const icu=itemByCode('CC001')!;assert.equal(referenceRate(icu,'I','nabh','private').rate,5400,'no ward adjustment on a uniform item');assert.equal(referenceRate(icu,'III','nabh','general').rate,5400*0.8);
 const within=compareLine(chole,40000,'I','nabh','semi_private');assert.equal(within.verdict,'within');assert.equal(within.reference.low,Math.round(30855*0.95));assert.equal(within.reference.high,Math.round(41745*1.05));assert.equal(within.ratio,1.1);
 const above=compareLine(chole,60000,'I','nabh','semi_private');assert.equal(above.verdict,'above');assert.equal(above.excess,60000-above.reference.high);assert.ok(above.notes.includes('ask_rate_card'));assert.deepEqual(above.ruleIds,['rate-display-rule-9']);
 assert.equal(compareLine(chole,above.reference.high*FAR_ABOVE_FACTOR+1,'I','nabh','semi_private').verdict,'far_above');
 assert.equal(compareLine(chole,10000,'I','nabh','semi_private').verdict,'below');
 const days=compareLine(icu,30000,'I','nabh','semi_private',5);assert.equal(days.verdict,'above');assert.equal(days.reference.high*5,27000);assert.equal(days.excess,3000);
 assert.equal(compareLine(icu,null,'I','nabh','semi_private').verdict,'no_amount');assert.equal(compareLine(icu,-5,'I','nabh','semi_private').verdict,'invalid');assert.equal(compareLine(icu,100,'I','nabh','semi_private',0).verdict,'invalid');assert.equal(compareLine(icu,'5000' as never,'I','nabh','semi_private').verdict,'invalid');
});
test('fair bill suggestions are deterministic, synonym-aware and bounded',()=>{
 assert.equal(suggestItems('ICU charges 3 days')[0]?.code,'CC001');
 assert.equal(suggestItems('Lap chole package')[0]?.code,'AG094');
 assert.equal(suggestItems('MRI brain with contrast').map(i=>i.code).includes('RI090'),true);
 assert.equal(suggestItems('LSCS delivery')[0]?.code,'OG004');
 assert.equal(suggestItems('PRBC 2 units')[0]?.code,'BC002');
 assert.deepEqual(suggestItems(''),[]);assert.deepEqual(suggestItems('zzzz qqqq'),[]);assert.ok(suggestItems('ct scan abdomen',3).length<=3);
 assert.deepEqual(suggestItems('Total knee replacement').map(i=>i.code),suggestItems('Total knee replacement').map(i=>i.code));
});
test('reimbursement letters: pending claim with interest, piecemeal objection, settlement-interest demand and the hospital rate-card request',()=>{
 const delay=makeReimbursementLetter({kind:'reimbursement-delay',claim:claim()},contacts,rules,'en',now);
 assert.match(delay.subject,/pending beyond 15 days — Star Health/);assert.match(delay.body,/submitted the claim for treatment at Example Hospital on 25 September 2026/);assert.match(delay.body,/ended on 10 October 2026; 8 days have passed/);assert.match(delay.body,/On the claimed amount of ₹1,20,000 this is ₹\d+ to date at 7\.5% a year \(Bank Rate 5\.5% for 2026-27 plus 2%\)/);
 assert.deepEqual(delay.ruleIds,['reimbursement-15-days','penal-interest-bank-rate-plus-2','bank-rate-fy','claim-not-closed-for-documents','grievance-14-days']);
 for(const id of delay.ruleIds)assert.ok(delay.body.includes(`“${rules.find(r=>r.id===id)!.quote}”`),id);
 assert.match(delay.body,/Name: \[Your name\]\nPolicy number: \[Policy number\]\nClaim number: \[Claim number\]/);assert.doesNotMatch(delay.body,/\{\w+\}|ClaimClock|Ask for/);
 assert.throws(()=>makeReimbursementLetter({kind:'reimbursement-delay',claim:claim({submittedOn:'2026-10-10'})},contacts,rules,'en',now),/not overdue/);
 const noAmount=makeReimbursementLetter({kind:'reimbursement-delay',claim:claim({claimedAmount:null,hospital:''})},contacts,rules,'hi',now);assert.doesNotMatch(noAmount.body,/दावा राशि पर/);assert.match(noAmount.body,/नाम: \[आपका नाम\]/);assert.ok(!noAmount.ruleIds.includes('bank-rate-fy'));
 const piece=makeReimbursementLetter({kind:'piecemeal-objection',claim:claim({queries:[{id:'a',at:'2026-10-01',note:'Indoor case papers',repliedOn:'2026-10-02'},{id:'b',at:'2026-10-09',note:'Doctor’s note'}]})},contacts,rules,'en',now);
 assert.match(piece.body,/on 2 separate occasions:\n1\. 1 October 2026 — Indoor case papers \(replied on 2 October 2026\)\n2\. 9 October 2026 — Doctor’s note\n/);assert.match(piece.body,/Regulation 23\(4\)/);
 assert.deepEqual(piece.ruleIds,['documents-at-one-go','documents-from-hospital','claim-not-closed-for-documents','reimbursement-15-days','grievance-14-days']);for(const id of piece.ruleIds)assert.ok(piece.body.includes(`“${rules.find(r=>r.id===id)!.quote}”`),id);
 assert.throws(()=>makeReimbursementLetter({kind:'piecemeal-objection',claim:claim({queries:[{id:'a',at:'2026-10-01',note:''}]})},contacts,rules,'en',now),/Fewer than two/);
 const interest=makeReimbursementLetter({kind:'settlement-interest',claim:claim({settledOn:'2026-10-15',settledAmount:100000})},contacts,rules,'en',now);
 assert.match(interest.body,/settled on 15 October 2026, 5 days after the fifteen-day period ended on 10 October 2026\. The amount paid was ₹1,00,000 against a claim of ₹1,20,000\. The settlement letter shows no interest line\./);
 assert.match(interest.body,/7\.5% a year, the Bank Rate being 5\.5% as on 1 April of 2026-27 — from the intimation date 20 September 2026 to 15 October 2026: 25 days on ₹1,00,000, which is ₹514\./);
 assert.match(interest.body,/and the full reasons for the ₹20,000 not paid, with the specific policy terms relied on\./);
 assert.deepEqual(interest.ruleIds,['penal-interest-bank-rate-plus-2','bank-rate-fy','reimbursement-15-days','deduction-reasons','grievance-14-days']);for(const id of interest.ruleIds)assert.ok(interest.body.includes(`“${rules.find(r=>r.id===id)!.quote}”`),id);
 const partInterest=makeReimbursementLetter({kind:'settlement-interest',claim:claim({settledOn:'2026-10-15',settledAmount:120000,interestPaid:200})},contacts,rules,'en',now);assert.match(partInterest.body,/included interest of ₹200\./);assert.match(partInterest.body,/After the ₹200 already paid, ₹\d+ remains due\./);assert.doesNotMatch(partInterest.body,/not paid, with the specific/);
 assert.throws(()=>makeReimbursementLetter({kind:'settlement-interest',claim:claim({settledOn:'2026-10-09',settledAmount:1000})},contacts,rules,'en',now),/not settled late/);
 const line=compareLine(itemByCode('CC001')!,30000,'I','nabh','semi_private',3);
 const card=makeReimbursementLetter({kind:'rate-card-request',hospital:'Example Hospital',lines:[{description:'ICU charges (3 days)',amount:30000,comparison:line,itemName:'ICU/CCU/PICU/MICU/HDU'},{description:'Nursing',amount:4000,comparison:null,itemName:null}]},contacts,rules,'en',now);
 assert.match(card.subject,/rate card and package break-up — Example Hospital/);assert.match(card.body,/1\. ICU charges \(3 days\): ₹30,000 — CGHS reference ₹16,200 to ₹16,200 \(ICU\/CCU\/PICU\/MICU\/HDU\)\n2\. Nursing: ₹4,000\n/);assert.match(card.body,/Name: \[Your name\]\nPatient name: \[Patient name\]/);
 assert.deepEqual(card.ruleIds,['rate-display-rule-9']);assert.ok(card.body.includes(`“${rules.find(r=>r.id==='rate-display-rule-9')!.quote}”`));assert.match(card.body,/\/s\/ce-rules-2012/);
 assert.throws(()=>makeReimbursementLetter({kind:'rate-card-request',hospital:'H',lines:[]},contacts,rules,'en',now),/Invalid bill lines/);
 assert.throws(()=>makeReimbursementLetter({kind:'rate-card-request',hospital:'H',lines:[{description:'x',amount:-1,comparison:null,itemName:null}]},contacts,rules,'en',now),/Invalid bill amount/);
 assert.throws(()=>makeReimbursementLetter({kind:'reimbursement-delay',claim:claim({insurerId:'nobody'})},contacts,rules,'en',now),/Unknown insurer/);
});
