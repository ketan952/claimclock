import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addDays,addMonths,checkupAmount,copayEstimate,daysBetween,healthCheckup,policyYearFor,prePostWindow,roomUpgradeImpact,validDate,waitingPeriods,eligibleRoom,type CheckupRule,type RoomRule} from '../src/lib/coverage-simulator.ts';
import {cataloguePlans,comparePlans,familyAdvice,planById,COMPARE_ROWS,MAX_COMPARE,type CompareText} from '../src/lib/plan-compare.ts';
import type {Disclosure} from '../src/lib/index-comparison.ts';

const now=new Date('2026-10-16T12:00:00Z');
const rule=(id:string)=>planById(id)!.rules;

test('calendar helpers clamp month ends, reject impossible dates and count whole days',()=>{
 assert.equal(addMonths('2024-01-31',1),'2024-02-29');assert.equal(addMonths('2023-01-31',1),'2023-02-28');assert.equal(addMonths('2024-02-29',12),'2025-02-28');assert.equal(addMonths('2026-10-16',-1),'2026-09-16');
 assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(daysBetween('2026-01-01','2026-01-31'),30);assert.equal(daysBetween('2026-01-31','2026-01-01'),-30);
 for(const bad of ['2026-02-30','2026-13-01','16/10/2026','',undefined,null,20261016])assert.equal(validDate(bad),false);
 assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2023-02-29'),false);
});
test('policy years are anniversary-based, start at index 0 and are null before inception',()=>{
 assert.deepEqual(policyYearFor('2023-05-12',now),{index:3,start:'2026-05-12',end:'2027-05-11'});
 assert.deepEqual(policyYearFor('2026-10-16',now),{index:0,start:'2026-10-16',end:'2027-10-15'});
 assert.deepEqual(policyYearFor('2025-10-17',now),{index:0,start:'2025-10-17',end:'2026-10-16'},'the day before the anniversary is still year 0');
 assert.deepEqual(policyYearFor('2025-10-16',now),{index:1,start:'2026-10-16',end:'2027-10-15'},'the anniversary itself starts the next year');
 assert.equal(policyYearFor('2026-10-17',now),null);assert.equal(policyYearFor('not-a-date',now),null);
 // A 29 February policy runs to 28 February midnight; the new year starts on 1 March.
 assert.deepEqual(policyYearFor('2024-02-29',new Date('2025-02-28T00:00:00Z')),{index:0,start:'2024-02-29',end:'2025-02-28'});
 assert.deepEqual(policyYearFor('2024-02-29',new Date('2025-03-01T00:00:00Z')),{index:1,start:'2025-03-01',end:'2026-02-28'});
});
test('health check-up amounts follow each limit shape, cap floaters separately and never invent a figure',()=>{
 const niva=rule('niva-bupa-reassure-2').health_checkup as CheckupRule;
 // "₹500 for every ₹1 lakh" is counted per completed lakh: the lower figure is the one the policy guarantees.
 assert.deepEqual(checkupAmount(niva.limit,750000),{amount:3500,basis:'per_lakh'});
 assert.deepEqual(checkupAmount(niva.limit,1000000),{amount:5000,basis:'per_lakh'});
 assert.deepEqual(checkupAmount(niva.limit,2500000),{amount:5000,basis:'per_lakh'},'individual cap');
 assert.deepEqual(checkupAmount(niva.limit,2500000,true),{amount:10000,basis:'per_lakh'},'floater cap');
 assert.deepEqual(checkupAmount(niva.limit,99999),{amount:0,basis:'per_lakh'},'below one lakh yields nothing rather than a fraction');
 const elevate=rule('icici-lombard-elevate').health_checkup as CheckupRule;
 assert.deepEqual(checkupAmount(elevate.limit,500000),{amount:2500,basis:'percent_si'});assert.deepEqual(checkupAmount(elevate.limit,5000000),{amount:5000,basis:'percent_si'});
 const star=rule('star-comprehensive').health_checkup as CheckupRule;
 assert.deepEqual(checkupAmount(star.limit,750000),{amount:2500,basis:'table'});assert.deepEqual(checkupAmount(star.limit,1200000),{amount:3000,basis:'table'},'between rows uses the lower sum insured row');
 assert.deepEqual(checkupAmount(star.limit,400000),{amount:null,basis:'table',note:'below_table'});
 assert.deepEqual(checkupAmount((rule('care-supreme').health_checkup as CheckupRule).limit,500000),{amount:null,basis:'package'});
 assert.deepEqual(checkupAmount(null,500000),{amount:null,basis:'schedule',note:'limit_in_schedule'});
 assert.deepEqual(checkupAmount(niva.limit,undefined),{amount:null,basis:'per_lakh',note:'needs_sum_insured'});
 assert.deepEqual(checkupAmount(niva.limit,-5),{amount:null,basis:'per_lakh',note:'needs_sum_insured'});
});
test('health check-up eligibility: day one, renewal benefit, claim-free year, two-year block, age, use this year and bad dates',()=>{
 const niva=rule('niva-bupa-reassure-2').health_checkup as CheckupRule;
 const available=healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2026-10-01',now});
 assert.equal(available.status,'available');assert.equal(available.amount,5000);assert.ok(available.notes.includes('cashless_only'));assert.equal(available.policyYear?.index,0);
 assert.equal(healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2026-10-01',lastClaimedOn:'2026-10-10',now}).status,'used_this_year');
 assert.equal(healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2025-10-01',lastClaimedOn:'2026-09-30',now}).status,'available','a check-up on the last day of the previous policy year does not use up this year');
 assert.equal(healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2025-10-01',lastClaimedOn:'2026-10-01',now}).status,'used_this_year','the first day of the current policy year counts');
 assert.equal(healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2025-10-01',lastClaimedOn:'2026-10-01',now}).nextEligibleOn,'2027-10-01');
 const future=healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2026-10-01',lastClaimedOn:'2026-12-01',now});
 assert.equal(future.status,'available');assert.ok(future.notes.includes('future_claim_ignored'));
 assert.equal(healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2026-11-01',now}).status,'not_started');
 assert.deepEqual(healthCheckup({rule:niva,sumInsured:1000000,now}).status,'unknown_timing');
 assert.equal(healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2026-02-30',now}).status,'invalid');
 assert.equal(healthCheckup({rule:niva,sumInsured:1000000,inceptionDate:'2026-01-01',lastClaimedOn:'yesterday',now}).status,'invalid');
 assert.equal(healthCheckup({rule:null,now}).status,'unknown_rule');
 const hdfc=rule('hdfc-ergo-optima-secure').health_checkup as CheckupRule;
 const renewal=healthCheckup({rule:hdfc,sumInsured:1000000,inceptionDate:'2026-05-01',now});
 assert.equal(renewal.status,'wait_first_year');assert.equal(renewal.nextEligibleOn,'2027-05-01');assert.equal(renewal.amountBasis,'schedule');
 assert.equal(healthCheckup({rule:hdfc,sumInsured:1000000,inceptionDate:'2025-05-01',now}).status,'available');
 const star=rule('star-comprehensive').health_checkup as CheckupRule;
 assert.equal(healthCheckup({rule:star,sumInsured:1000000,inceptionDate:'2026-05-01',now}).status,'wait_first_year');
 assert.equal(healthCheckup({rule:star,sumInsured:1000000,inceptionDate:'2025-05-01',now}).status,'needs_claim_free_year');
 assert.equal(healthCheckup({rule:star,sumInsured:1000000,inceptionDate:'2025-05-01',claimFreePreviousYear:false,now}).status,'claim_made_last_year');
 const ok=healthCheckup({rule:star,sumInsured:1000000,inceptionDate:'2025-05-01',claimFreePreviousYear:true,now});assert.equal(ok.status,'available');assert.equal(ok.amount,3000);
 const bajaj=rule('bajaj-health-guard-platinum').health_checkup as CheckupRule;
 assert.deepEqual([healthCheckup({rule:bajaj,sumInsured:1000000,inceptionDate:'2026-01-01',now}).status,healthCheckup({rule:bajaj,sumInsured:1000000,inceptionDate:'2026-01-01',now}).nextEligibleOn],['wait_block','2028-01-01']);
 assert.deepEqual([healthCheckup({rule:bajaj,sumInsured:1000000,inceptionDate:'2025-01-01',now}).status,healthCheckup({rule:bajaj,sumInsured:1000000,inceptionDate:'2025-01-01',now}).nextEligibleOn],['wait_block','2027-01-01']);
 const block=healthCheckup({rule:bajaj,sumInsured:1000000,inceptionDate:'2024-01-01',now});assert.equal(block.status,'available');assert.equal(block.amount,5000);assert.equal(block.mode,'reimbursement');
 assert.equal(healthCheckup({rule:bajaj,sumInsured:1000000,inceptionDate:'2023-01-01',now}).status,'wait_block','year three of a two-year block waits again');
 const activ=rule('aditya-birla-activ-one-max').health_checkup as CheckupRule;
 assert.equal(healthCheckup({rule:activ,inceptionDate:'2026-01-01',memberAge:12,now}).status,'too_young');
 assert.equal(healthCheckup({rule:activ,inceptionDate:'2026-01-01',memberAge:18,now}).status,'available');
 assert.ok(healthCheckup({rule:rule('care-supreme').health_checkup as CheckupRule,inceptionDate:'2026-01-01',now}).notes.includes('optional_cover'));
});
test('room upgrade impact: no cap, category caps needing the hospital rate, percent and rupee tables, within limit and invalid numbers',()=>{
 const any=roomUpgradeImpact({rule:rule('hdfc-ergo-optima-secure').room_rent as RoomRule,chosenRoomRent:9000,days:3,associatedExpenses:100000});
 assert.equal(any.status,'no_limit');assert.equal(any.totalImpact,0);
 const star=rule('star-comprehensive').room_rent as RoomRule;
 assert.equal(roomUpgradeImpact({rule:star,chosenRoomRent:9000,days:3,associatedExpenses:100000}).status,'needs_eligible_rate');
 const impact=roomUpgradeImpact({rule:star,chosenRoomRent:9000,hospitalEligibleRate:6000,days:3,associatedExpenses:100000});
 assert.equal(impact.status,'impact');assert.equal(impact.eligiblePerDay,6000);assert.equal(impact.roomDifference,9000);assert.equal(impact.associatedDeduction,33333);assert.equal(impact.totalImpact,42333);assert.ok(Math.abs(impact.proportion!-2/3)<1e-9);
 assert.deepEqual(impact.notes,['policy_decides','icu_excluded','differential_billing']);
 assert.equal(roomUpgradeImpact({rule:star,chosenRoomRent:6000,hospitalEligibleRate:6000,days:3,associatedExpenses:100000}).status,'within_limit');
 const newIndia=rule('new-india-mediclaim').room_rent as RoomRule;
 assert.equal(roomUpgradeImpact({rule:newIndia,chosenRoomRent:9000,days:2,associatedExpenses:50000}).status,'needs_sum_insured');
 const percent=roomUpgradeImpact({rule:newIndia,sumInsured:500000,chosenRoomRent:9000,days:2,associatedExpenses:50000});
 assert.equal(percent.eligiblePerDay,5000);assert.equal(percent.roomDifference,8000);assert.equal(percent.associatedDeduction,22222);
 const redCarpet=rule('star-senior-citizens-red-carpet').room_rent as RoomRule;
 assert.equal(eligibleRoom(redCarpet,300000).perDay,3000,'1% of a sum insured up to ₹5 lakh');assert.equal(eligibleRoom(redCarpet,500000).perDay,5000);assert.equal(eligibleRoom(redCarpet,750000).perDay,6000);assert.equal(eligibleRoom(redCarpet,1000000).perDay,6000);assert.equal(eligibleRoom(redCarpet,1500000).perDay,7000);assert.equal(eligibleRoom(redCarpet,2000000).perDay,8500);assert.equal(eligibleRoom(redCarpet,2500000).perDay,10000);assert.equal(eligibleRoom(redCarpet,9900000).perDay,10000,'above the table keeps the highest cap');
 const bajaj=rule('bajaj-health-guard-platinum').room_rent as RoomRule;
 assert.equal(eligibleRoom(bajaj,750000).category,'single_private_ac');assert.equal(eligibleRoom(bajaj,1000000).category,'any');assert.equal(eligibleRoom(bajaj,undefined).needsSumInsured,true);
 assert.equal(roomUpgradeImpact({rule:bajaj,sumInsured:1000000,chosenRoomRent:20000,days:5,associatedExpenses:200000}).status,'no_limit');
 for(const bad of [{chosenRoomRent:0,days:1,associatedExpenses:0},{chosenRoomRent:5000,days:0,associatedExpenses:0},{chosenRoomRent:5000,days:1.5,associatedExpenses:0},{chosenRoomRent:5000,days:1,associatedExpenses:-1},{chosenRoomRent:Number.NaN,days:1,associatedExpenses:0},{chosenRoomRent:5000,days:400,associatedExpenses:0}])
  assert.equal(roomUpgradeImpact({rule:star,hospitalEligibleRate:4000,...bad}).status,'invalid');
 assert.equal(roomUpgradeImpact({rule:star,chosenRoomRent:9000,hospitalEligibleRate:0,days:3,associatedExpenses:1000}).status,'needs_eligible_rate');
});
test('waiting periods count from the continuity date, clamp remaining months at zero and flag future or inverted dates',()=>{
 const r=waitingPeriods({inceptionDate:'2023-05-12',continuityFrom:'2021-05-12',pedMonths:36,specificMonths:24,initialDays:30,now});
 assert.equal(r.status,'ok');assert.equal(r.from,'2021-05-12');assert.equal(r.servedMonths,65);
 assert.deepEqual(r.ped,{required:36,served:65,done:true,remaining:0,endsOn:'2024-05-12'});
 assert.deepEqual(r.moratorium,{required:60,served:65,done:true,remaining:0,endsOn:'2026-05-12'});
 assert.equal(r.initial?.done,true);assert.equal(r.initial?.endsOn,'2021-06-11');
 const fresh=waitingPeriods({inceptionDate:'2026-10-01',pedMonths:36,specificMonths:24,initialDays:30,now});
 assert.equal(fresh.servedDays,15);assert.deepEqual(fresh.initial,{required:30,served:15,done:false,remaining:15,endsOn:'2026-10-31'});
 assert.equal(fresh.ped?.remaining,36);assert.equal(fresh.moratorium?.remaining,60);assert.equal(fresh.moratorium?.endsOn,'2031-10-01');
 assert.equal(waitingPeriods({inceptionDate:'2021-10-16',pedMonths:36,specificMonths:null,initialDays:null,now}).moratorium?.done,true,'exactly 60 months counts as complete');
 assert.equal(waitingPeriods({inceptionDate:'2021-10-17',pedMonths:36,specificMonths:null,initialDays:null,now}).moratorium?.done,false,'a day short is not complete');
 assert.equal(waitingPeriods({pedMonths:36,specificMonths:24,initialDays:30,now}).status,'needs_dates');
 assert.equal(waitingPeriods({inceptionDate:'2026-11-01',pedMonths:36,specificMonths:24,initialDays:30,now}).status,'future_start');
 assert.equal(waitingPeriods({inceptionDate:'2023-01-01',continuityFrom:'2024-01-01',pedMonths:36,specificMonths:24,initialDays:30,now}).status,'invalid');
 assert.equal(waitingPeriods({inceptionDate:'2023-02-30',pedMonths:36,specificMonths:24,initialDays:30,now}).status,'invalid');
 const unknown=waitingPeriods({inceptionDate:'2026-01-01',pedMonths:null,specificMonths:null,initialDays:null,now});
 assert.equal(unknown.ped,null);assert.equal(unknown.specific,null);assert.equal(unknown.initial,null);assert.ok(unknown.moratorium);
});
test('pre- and post-hospitalisation windows classify an expense date, including unknown windows and day-of boundaries',()=>{
 const pp=rule('niva-bupa-reassure-2').pre_post_hospitalisation!;
 const base={rule:pp,admissionDate:'2026-06-10',dischargeDate:'2026-06-14'};
 assert.equal(prePostWindow({...base,expenseDate:'2026-04-11'}).position,'pre');
 assert.equal(prePostWindow({...base,expenseDate:'2026-04-11'}).daysBeforeAdmission,60);
 assert.equal(prePostWindow({...base,expenseDate:'2026-04-10'}).position,'outside_pre');
 assert.equal(prePostWindow({...base,expenseDate:'2026-06-12'}).position,'during');
 assert.equal(prePostWindow({...base,expenseDate:'2026-12-11'}).position,'post');
 assert.equal(prePostWindow({...base,expenseDate:'2026-12-12'}).position,'outside_post');
 assert.equal(prePostWindow({...base,expenseDate:'2026-12-11'}).postWindowEnd,'2026-12-11');assert.equal(prePostWindow({...base,expenseDate:'2026-04-11'}).preWindowStart,'2026-04-11');
 const redCarpet=rule('star-senior-citizens-red-carpet').pre_post_hospitalisation!;
 assert.equal(prePostWindow({rule:redCarpet,admissionDate:'2026-06-10',dischargeDate:'2026-06-14',expenseDate:'2026-07-01'}).position,'unknown_post');
 assert.equal(prePostWindow({rule:null,admissionDate:'2026-06-10',dischargeDate:'2026-06-14',expenseDate:'2026-06-01'}).position,'unknown_pre');
 assert.equal(prePostWindow({rule:pp,admissionDate:'2026-06-14',dischargeDate:'2026-06-10',expenseDate:'2026-06-01'}).position,'invalid');
 assert.equal(prePostWindow({rule:pp,admissionDate:'2026-06-10',dischargeDate:'2026-06-14',expenseDate:'2026-6-1'}).position,'invalid');
});
test('co-payment estimates apply conditional and standard percentages and surface optional or zonal clauses',()=>{
 assert.deepEqual(copayEstimate(rule('star-senior-citizens-red-carpet').copay,200000),{percent:30,amount:60000,reason:'standard',notes:[]});
 const star=rule('star-comprehensive').copay;
 assert.deepEqual(copayEstimate(star,200000,62),{percent:10,amount:20000,reason:'entry_age_61_plus',notes:[]});
 assert.deepEqual(copayEstimate(star,200000,45),{percent:0,amount:0,reason:'none',notes:[]});
 assert.deepEqual(copayEstimate(star,200000,null).notes,['copay_depends_on_entry_age']);
 assert.deepEqual(copayEstimate(rule('new-india-mediclaim').copay,100000).notes,['copay_optional','copay_zonal']);
 assert.deepEqual(copayEstimate(null,100000),{percent:0,amount:null,reason:'none',notes:['copay_unknown']});
 assert.equal(copayEstimate(star,-1,62).amount,null);
});
const text:CompareText={months:n=>`${n} months`,days:n=>`${n} days`,unknown:'not verified',consumables:v=>`consumables:${v}`,noDisclosure:'no disclosure'};
const disclosures:Disclosure[]=JSON.parse(readFileSync(new URL('../data/nl48.json',import.meta.url),'utf8'));
test('plan comparison keeps catalogue order, ignores unknown or duplicate ids, caps at three plans and marks unknown rules',()=>{
 const c=comparePlans(['hdfc-ergo-optima-secure','invented','hdfc-ergo-optima-secure','new-india-mediclaim','star-senior-citizens-red-carpet','care-supreme'],{disclosures,language:'en',text});
 assert.deepEqual(c.plans.map(p=>p.id),['hdfc-ergo-optima-secure','new-india-mediclaim','star-senior-citizens-red-carpet']);
 assert.equal(c.plans.length,MAX_COMPARE);assert.equal(c.rows.length,COMPARE_ROWS.length);
 const row=(key:string)=>c.rows.find(r=>r.key===key)!;
 assert.equal(row('ped_waiting_months').cells[0].text,'36 months');assert.equal(row('ped_waiting_months').cells[2].text,'12 months');
 assert.equal(row('initial_waiting_days').cells[1].text,'30 days');
 assert.ok(row('consumables').cells[1].unknown);assert.equal(row('consumables').cells[1].text,'not verified');
 assert.equal(row('consumables').cells[0].text,'consumables:included — Protect Benefit pays listed non-medical expenses (Annexure B) as a built-in cover');
 assert.equal(row('pre_post_hospitalisation').cells[1].text,'30 days / 60 days');assert.match(row('pre_post_hospitalisation').cells[2].text,/^30 days \/ Post-hospitalisation expenses are paid up to 7%/);
 assert.ok(row('room_rent').cells.every(cell=>cell.sourceUrl?.startsWith('https://')&&cell.verifiedOn==='2026-10-16'));
 const discharge=row('discharge_lt1h');
 assert.ok(discharge.cells.every(cell=>cell.unknown||/%$/.test(cell.text)),'disclosure cells are shares or marked unknown');
 const hindi=comparePlans(['new-india-mediclaim'],{disclosures,language:'hi',text});
 assert.match(hindi.rows.find(r=>r.key==='room_rent')!.cells[0].text,/बीमा राशि/);assert.match(hindi.plans[0].insurerName,/न्यू इंडिया|New India/);
 assert.deepEqual(comparePlans([],{disclosures,language:'en',text}).plans,[]);
 assert.equal(comparePlans(['care-supreme'],{disclosures:[],language:'en',text}).rows[0].cells[0].text,'no disclosure');
});
test('family advice is structural, deduplicated and refuses invalid households',()=>{
 const keys=(members:Parameters<typeof familyAdvice>[0])=>familyAdvice(members).map(a=>a.key);
 const mixed=keys([{age:38,preExisting:false},{age:36,preExisting:false},{age:8,preExisting:false},{age:67,preExisting:true},{age:64,preExisting:false}]);
 assert.ok(mixed.includes('advice.separateSeniors'));assert.ok(mixed.includes('advice.seniorCopay'));assert.ok(mixed.includes('advice.declarePed'));assert.ok(mixed.includes('advice.topUp'));
 assert.ok(!mixed.includes('advice.floaterEldest'));assert.equal(new Set(mixed).size,mixed.length);assert.equal(mixed[mixed.length-1],'advice.notRecommendation');
 assert.deepEqual(familyAdvice([{age:38,preExisting:false},{age:36,preExisting:false},{age:8,preExisting:false},{age:67,preExisting:true},{age:64,preExisting:false}]).find(a=>a.key==='advice.separateSeniors')?.fields,{seniors:2,eldest:67});
 const young=keys([{age:30,preExisting:false},{age:29,preExisting:false}]);
 assert.ok(young.includes('advice.floaterEldest'));assert.ok(!young.includes('advice.separateSeniors'));assert.ok(!young.includes('advice.topUp'));
 assert.ok(keys([{age:62,preExisting:false}]).includes('advice.seniorPedWait'));assert.ok(!keys([{age:62,preExisting:false}]).includes('advice.separateSeniors'),'a lone senior is not told to split');
 assert.ok(keys([{age:60,preExisting:false},{age:30,preExisting:false}]).includes('advice.separateSeniors'));assert.ok(!keys([{age:60,preExisting:false},{age:30,preExisting:false}]).includes('advice.seniorCopay'),'co-pay clauses start at entry age 61');
 assert.ok(keys([{age:10,preExisting:false}]).includes('advice.childNeedsAdult'));
 for(const bad of [[],[{age:-1,preExisting:false}],[{age:130,preExisting:false}],[{age:Number.NaN,preExisting:false}],[{age:30,preExisting:'yes' as unknown as boolean}],Array.from({length:13},()=>({age:30,preExisting:false}))])assert.deepEqual(familyAdvice(bad),[]);
});
test('the catalogue exposes typed rules for every plan the simulator needs',()=>{
 assert.equal(cataloguePlans.length,10);
 for(const plan of cataloguePlans){
  assert.ok(plan.rules.room_rent,`${plan.id} room rule`);
  if(plan.rules.health_checkup){assert.ok(['cashless','reimbursement','unknown'].includes(plan.rules.health_checkup.mode));assert.ok(plan.rules.health_checkup.eligibility.from);}
  if(plan.rules.copay)assert.equal(typeof plan.rules.copay.percent,'number');
 }
});
