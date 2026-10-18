import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHECKPOINT_OFFSETS,FREE_LOOK_DAYS,GRACE_DAYS,GST_REMOVAL_PERCENT,MIGRATION_STEPS,PORTING_STEPS,freeLookDiff,freeLookWindow,isSeniorCitizen,premiumHike,renewalCalendar,renewalSchedule,rule} from '../src/lib/renewal.ts';
import {describeMismatch,makeRenewalLetter} from '../src/lib/renewal-letters.ts';
import {ruleCitations} from '../src/lib/letters.ts';
import {buildCalendar} from '../src/lib/reminders.ts';
import type {Contact,Rule} from '../src/lib/types.ts';

const contacts:Contact[]=JSON.parse(readFileSync(new URL('../data/contacts.json',import.meta.url),'utf8'));
const rules:Rule[]=JSON.parse(readFileSync(new URL('../data/rules.json',import.meta.url),'utf8'));
const sourceLinks:{slug:string;title_en:string;title_hi:string;url:string}[]=JSON.parse(readFileSync(new URL('../data/source-links.json',import.meta.url),'utf8'));
const redirects=readFileSync(new URL('../public/_redirects',import.meta.url),'utf8');
const now=new Date('2026-10-18T06:30:00Z');
const M25_RULES=['free-look-30-days','free-look-refund-7-days','grace-period-15-30-days','renewal-not-denied-for-claims','renewal-loading-portfolio-only','senior-premium-cap-10pct','porting-window-30-60-days','porting-records-72h','porting-decision-5-days','porting-credits-no-charges','migration-30-days','migration-credits-36-months','group-to-individual-migration','proposal-decision-7-days','gst-exempt-individual-health-2025-09-22'];
const unfold=(ics:string)=>ics.replace(/\r\n[ \t]/g,'');

test('every renewal rule carries a verbatim quote, bilingual plain text, a source document slug with a short link, and a caveat',()=>{
 for(const id of M25_RULES){
  const r=rules.find(x=>x.id===id);assert.ok(r,id);
  for(const key of ['title','title_hi','paragraph','clause','quote','source_url','verified_on','scope','plain_en','plain_hi','caveat','source_slug'] as const)assert.ok(typeof r[key]==='string'&&(r[key] as string).trim(),`${id}.${key}`);
  assert.match(r.verified_on as string,/^2026-10-18$/);
  assert.match(r.plain_hi as string,/[\u0900-\u097F]/,`${id} Hindi text`);assert.match(r.title_hi as string,/[\u0900-\u097F]/,`${id} Hindi title`);
  assert.doesNotMatch(r.quote,/\s{2,}/,`${id} quote has stray whitespace`);
  const link=sourceLinks.find(l=>l.slug===r.source_slug);assert.ok(link,`${id} source slug ${r.source_slug}`);
  assert.ok(redirects.includes(`/s/${link!.slug} ${link!.url} 302`),`redirect for ${link!.slug}`);
  assert.ok(/^https:\/\/(irdai\.gov\.in|financialservices\.gov\.in)\//.test(r.source_url),`${id} primary source host`);
 }
 assert.equal(new Set(rules.map(r=>r.id)).size,rules.length,'rule ids are unique');
 assert.equal(rule('porting-window-30-60-days').deadline_days,30);assert.equal(rule('grace-period-15-30-days').source_slug,'health-mc-2024');
 assert.throws(()=>rule('porting-45-days'),/Unknown rule/,'the repealed 45-day window is not a rule');
});
test('citations group the new rules by document with one short link each and keep the legacy formats unchanged',()=>{
 const en=ruleCitations(['porting-records-72h','porting-window-30-60-days','grievance-14-days','senior-premium-cap-10pct','renewal-loading-portfolio-only','gst-exempt-individual-health-2025-09-22'],rules,'en');
 const blocks=en.split('\n\n');
 assert.equal(blocks.length,5);
 assert.match(blocks[0],/^Health Insurance Master Circular, 29 May 2024\nChapter I 12\(b\): “The existing insurer shall provide/);assert.ok(blocks[0].endsWith('/s/health-mc-2024'));
 assert.match(blocks[1],/^PPHI Master Circular, 5 September 2024\nSection 1 Part B VI\.2\(i\): “Insurers should provide resolution to the complaint within 14 days”\nSection 2 Chapter VI 24\.2: “A policyholder desirous of porting/);assert.ok(blocks[1].endsWith('/s/pphi-mc-2024'));
 assert.match(blocks[2],/^IRDAI circular on premium revision for senior citizens, 30 January 2025\nparagraph 7\(a\)–\(b\): “The insurers shall not revise the premium for senior citizens by more than 10% per annum\.”\nhttps:\/\/claimclock\.ketan952\.workers\.dev\/s\/senior-premium-2025$/);
 assert.match(blocks[3],/^IRDAI \(Insurance Products\) Regulations, 2024\nSchedule III 9\.4: “For individual products/);
 assert.match(blocks[4],/^Ministry of Finance explainer: GST exemption on individual health insurance, 22 September 2025\n/);
 // A grievance-only citation keeps the exact legacy format every existing snapshot depends on.
 assert.equal(ruleCitations(['grievance-14-days'],rules,'en'),'PPHI Master Circular, 5 September 2024 — Part B VI.2(i)\n“Insurers should provide resolution to the complaint within 14 days”\nhttps://claimclock.ketan952.workers.dev/s/pphi-mc-2024');
 const hi=ruleCitations(['migration-30-days','group-to-individual-migration'],rules,'hi');
 assert.match(hi,/^माइग्रेशन और पोर्टेबिलिटी पर आईआरडीएआई दिशानिर्देश, 1 जनवरी 2020\nparagraph 7: “A policyholder desirous of migrating/);assert.equal(hi.split('\n\n').length,1,'two rules from one guideline share one block');
});
test('renewal schedule: statuses by distance, porting window 60→30 with discretion to 15, migration by 30, grace by payment mode',()=>{
 const far=renewalSchedule('2027-03-01','annual',now);
 assert.equal(far.status,'upcoming');assert.equal(far.daysLeft,134);assert.equal(far.portingOpensOn,'2026-12-31');assert.equal(far.portingClosesOn,'2027-01-30');assert.equal(far.portingDiscretionUntil,'2027-02-14');assert.equal(far.migrationBy,'2027-01-30');
 assert.equal(far.graceDays,30);assert.equal(far.graceEndsOn,'2027-03-31');assert.deepEqual(far.checkpoints.map(c=>c.offsetDays),[...CHECKPOINT_OFFSETS]);assert.ok(far.checkpoints.every(c=>!c.passed));
 assert.equal(renewalSchedule('2026-12-10','annual',now).status,'porting_window','53 days out: the window is open');
 assert.equal(renewalSchedule('2026-12-17','annual',now).status,'porting_window','exactly 60 days out is the first day of the window');
 assert.equal(renewalSchedule('2026-12-18','annual',now).status,'upcoming','61 days out');
 assert.equal(renewalSchedule('2026-11-17','annual',now).status,'porting_window','30 days out is the last day to apply');
 assert.equal(renewalSchedule('2026-11-16','annual',now).status,'window_closing','29 days out: insurer discretion only');
 assert.equal(renewalSchedule('2026-11-02','annual',now).status,'window_closing','15 days out: last day of discretion');
 assert.equal(renewalSchedule('2026-11-01','annual',now).status,'last_days');
 assert.equal(renewalSchedule('2026-10-18','annual',now).status,'due_today');
 const grace=renewalSchedule('2026-10-01','annual',now);assert.equal(grace.status,'in_grace');assert.equal(grace.graceDaysLeft,13);assert.ok(grace.notes.includes('renew_in_grace'));assert.ok(grace.checkpoints.every(c=>c.passed));
 const monthly=renewalSchedule('2026-10-01','monthly',now);assert.equal(monthly.status,'lapsed','15-day grace for monthly premiums ended on 16 October');assert.equal(monthly.graceDays,GRACE_DAYS.monthly);assert.ok(monthly.notes.includes('lapsed_credits'));assert.ok(!monthly.notes.includes('no_cover_in_grace'));
 assert.equal(renewalSchedule('2026-09-18','annual',now).status,'in_grace','day 30 of grace is still inside');assert.equal(renewalSchedule('2026-09-17','annual',now).status,'lapsed');
 for(const bad of ['2026-02-30','18/10/2026','','2040-01-01','2020-01-01'])assert.equal(renewalSchedule(bad,'annual',now).status,'invalid',bad);
 assert.equal(renewalSchedule('2027-03-01','weekly' as never,now).status,'invalid');
 assert.ok(far.ruleIds.includes('porting-window-30-60-days')&&far.ruleIds.includes('grace-period-15-30-days'));
});
test('renewal calendar: five all-day events with same-day alarms, bilingual, escaped and folded; invalid schedules refuse',()=>{
 const schedule=renewalSchedule('2027-03-01','annual',now);
 const ics=renewalCalendar(schedule,'Star Health · Comprehensive, #P/123; family',"en");
 const plain=unfold(ics);
 assert.equal((plain.match(/BEGIN:VEVENT/g)||[]).length,5);
 assert.deepEqual([...plain.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map(m=>m[1]),['20261231','20270115','20270130','20270222','20270301']);
 assert.ok(plain.includes('TRIGGER:-PT0M'));assert.ok(!plain.includes('TRIGGER:-P7D'));
 assert.ok(plain.includes('Star Health · Comprehensive\\, #P/123\\; family'),'commas and semicolons are escaped');
 assert.ok(plain.includes('SUMMARY:ClaimClock: '));assert.ok(/PRODID:-\/\/ClaimClock\/\/Renewal reminders\/\/EN/.test(plain));
 for(const line of ics.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75,`line too long: ${line.length}`);
 const hindi=unfold(renewalCalendar(schedule,'',"hi"));assert.match(hindi,/[\u0900-\u097F]/);assert.ok(!hindi.includes('[label]'));
 assert.throws(()=>renewalCalendar(renewalSchedule('bad','annual',now),'x','en'),/Invalid renewal schedule/);
 assert.throws(()=>buildCalendar([],'x'),/No calendar events/);
 const control=unfold(buildCalendar([{when:new Date('2027-01-01T00:00:00Z'),title:'a\u0007b\nc',body:'d\\e',alarmDays:3}],'T'));
 assert.ok(control.includes('SUMMARY:ab\\nc'));assert.ok(control.includes('DESCRIPTION:d\\\\e'));assert.ok(control.includes('TRIGGER:-P3D'));
});
test('premium hike: GST separation (15.25%, not 18%), senior cap, age-band and sum-insured caveats, decreases and invalid numbers',()=>{
 assert.equal(GST_REMOVAL_PERCENT,15.3);
 // ₹11,800 incl. GST last year → ₹10,000 base; ₹10,000 this year with no GST: the bill fell 15.3% but the premium did not change.
 const flat=premiumHike({oldPremium:11800,newPremium:10000,oldIncludesGst:true,newIncludesGst:false,seniorCitizen:false,ageBandChanged:false});
 assert.equal(flat.verdict,'within_gst_effect');assert.equal(flat.baseChangePercent,0);assert.equal(flat.totalChangePercent,-15.3);assert.equal(flat.gstEffectPercent,-15.3);assert.ok(flat.notes.includes('gst_removed'));assert.ok(flat.ruleIds.includes('gst-exempt-individual-health-2025-09-22'));
 // Same bill ₹11,800 → ₹11,800 after GST removal is really an 18% rise in the premium.
 const hidden=premiumHike({oldPremium:11800,newPremium:11800,oldIncludesGst:true,newIncludesGst:false,seniorCitizen:false,ageBandChanged:false});
 assert.equal(hidden.verdict,'rate_rise');assert.equal(hidden.baseChangePercent,18);assert.equal(hidden.totalChangePercent,0);
 const senior=premiumHike({oldPremium:40000,newPremium:46000,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:true,ageBandChanged:false,claimedLastYear:true});
 assert.equal(senior.seniorCap,'exceeds');assert.equal(senior.verdict,'exceeds_senior_cap');assert.equal(senior.baseChangePercent,15);assert.ok(senior.ruleIds.includes('senior-premium-cap-10pct'));assert.ok(senior.notes.includes('claim_not_a_loading'));
 const within=premiumHike({oldPremium:40000,newPremium:44000,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:true,ageBandChanged:null});
 assert.equal(within.seniorCap,'within');assert.equal(within.verdict,'rate_rise');assert.ok(within.notes.includes('age_band_unknown'));
 const band=premiumHike({oldPremium:40000,newPremium:44000,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:true,ageBandChanged:true,sumInsuredChanged:true});
 assert.ok(band.notes.includes('age_band_changed')&&band.notes.includes('sum_insured_changed'));
 const group=premiumHike({oldPremium:11800,newPremium:12980,oldIncludesGst:true,newIncludesGst:true,seniorCitizen:false});
 assert.equal(group.baseChangePercent,10);assert.ok(group.notes.includes('gst_still_charged'));assert.ok(!group.ruleIds.includes('gst-exempt-individual-health-2025-09-22'));
 assert.equal(premiumHike({oldPremium:10000,newPremium:9000,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:false}).verdict,'decrease');
 assert.equal(premiumHike({oldPremium:10000,newPremium:10000,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:false}).verdict,'unchanged');
 for(const [o,n] of [[0,100],[-1,100],[100,-1],[Number.NaN,100],[100,Number.POSITIVE_INFINITY],[1e9,100]])assert.equal(premiumHike({oldPremium:o,newPremium:n,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:false}).status,'invalid',`${o}/${n}`);
 assert.equal(isSeniorCitizen(1966,now),true);assert.equal(isSeniorCitizen(1967,now),false);assert.equal(isSeniorCitizen(null,now),false);
});
test('free look: 30-day window from receipt, last day, closed, future receipt, refund due 7 days after the request, bad dates',()=>{
 const open=freeLookWindow('2026-10-01',null,now);assert.equal(open.status,'open');assert.equal(open.endsOn,'2026-10-31');assert.equal(open.daysLeft,13);assert.equal(open.refundDueOn,null);assert.deepEqual(open.ruleIds,['free-look-30-days','free-look-refund-7-days']);
 assert.equal(freeLookWindow('2026-09-18',null,now).status,'last_day');assert.equal(freeLookWindow('2026-09-19',null,now).status,'last_day','one day left still counts as last day');
 assert.equal(freeLookWindow('2026-09-17',null,now).status,'closed','the window ended yesterday');assert.equal(freeLookWindow('2026-09-16',null,now).daysLeft,-2);
 assert.equal(freeLookWindow('2026-10-20',null,now).status,'not_received');
 const requested=freeLookWindow('2026-10-01','2026-10-15',now);assert.equal(requested.refundDueOn,'2026-10-22');
 assert.equal(freeLookWindow('2026-10-01','2026-09-30',now).status,'invalid','request before receipt');
 assert.equal(freeLookWindow('2026-13-01',null,now).status,'invalid');assert.equal(freeLookWindow('2026-10-01','soon',now).status,'invalid');
 assert.equal(FREE_LOOK_DAYS,30);
});
test('free-look diff compares only fields present on both sides, numerically or after normalising text, and grades severity',()=>{
 const diff=freeLookDiff({sumInsured:1000000,roomRent:'Single private AC room',copayPercent:0,pedMonths:36,members:4,planName:'Optima Secure',consumables:'included'},{sumInsured:500000,roomRent:'single  private ac room',copayPercent:10,pedMonths:36,members:4,planName:'my:Optima Secure',consumables:null});
 assert.deepEqual(diff.matched,['roomRent','pedMonths','members']);
 assert.deepEqual(diff.mismatches.map(m=>[m.field,m.severity]),[['planName','medium'],['sumInsured','high'],['copayPercent','high']]);
 assert.deepEqual(diff.skipped,['insurerId','consumables']);assert.equal(diff.compared.length,6);
 assert.deepEqual(freeLookDiff({},{sumInsured:1}).mismatches,[]);
 assert.equal(freeLookDiff({sumInsured:'10,00,000' as never},{sumInsured:1000000}).mismatches.length,1,'a formatted string is not coerced into a number silently');
 assert.equal(describeMismatch({field:'sumInsured',promised:'1000000',actual:'500000',severity:'high'},'en'),'- Sum insured: promised ₹10,00,000; the schedule shows ₹5,00,000');
 assert.match(describeMismatch({field:'copayPercent',promised:'0',actual:'10',severity:'high'},'hi'),/सह-भुगतान: बताया गया 0%; अनुसूची में 10%/);
});
test('renewal letters: premium hike cites the portfolio rule, adds the senior cap and the GST note when they apply, and the Bima draft stays short',()=>{
 const hike=premiumHike({oldPremium:47200,newPremium:48000,oldIncludesGst:true,newIncludesGst:false,seniorCitizen:true,ageBandChanged:false});
 const letter=makeRenewalLetter({kind:'premium-hike',insurerId:'star-health',renewalDate:'2026-12-01',oldPremium:47200,newPremium:48000,hike},contacts,rules,'en',now);
 assert.equal(letter.kind,'premium-hike');assert.match(letter.subject,/renewal premium increase — Star Health/);
 assert.match(letter.body,/₹48,000 against ₹47,200 last year: \+1\.7% overall \(the earlier figure included 18% GST/);assert.match(letter.body,/an increase of \+20% in the premium before tax/);
 assert.match(letter.body,/3\. The insured is a senior citizen/);assert.match(letter.body,/\n4\. Confirm that renewal is available/);
 assert.deepEqual(letter.ruleIds,['renewal-loading-portfolio-only','renewal-not-denied-for-claims','senior-premium-cap-10pct','gst-exempt-individual-health-2025-09-22','grievance-14-days']);
 for(const id of letter.ruleIds)assert.ok(letter.body.includes(`“${rules.find(r=>r.id===id)!.quote}”`),id);
 assert.match(letter.body,/Name: \[Your name\]\nPolicy number: \[Policy number\]/);assert.doesNotMatch(letter.body,/\{\w+\}|ClaimClock|Ask for/);
 const plain=makeRenewalLetter({kind:'premium-hike',insurerId:'hdfc-ergo',renewalDate:'2026-12-01',oldPremium:20000,newPremium:22000,hike:premiumHike({oldPremium:20000,newPremium:22000,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:false})},contacts,rules,'hi',now);
 assert.doesNotMatch(plain.body,/वरिष्ठ नागरिक|GST/);assert.match(plain.body,/\n3\. पुष्टि करें/);assert.deepEqual(plain.ruleIds,['renewal-loading-portfolio-only','renewal-not-denied-for-claims','grievance-14-days']);assert.match(plain.body,/नाम: \[आपका नाम\]/);
 const bima=makeRenewalLetter({kind:'premium-hike-bima',insurerId:'star-health',renewalDate:'2026-12-01',oldPremium:47200,newPremium:48000,hike},contacts,rules,'en',now);
 assert.equal(bima.kind,'bima');assert.ok(bima.body.length<2000);assert.doesNotMatch(bima.body,/https?:\/\//);assert.match(bima.body,/senior citizen/);assert.deepEqual(bima.ruleIds,[]);
 assert.throws(()=>makeRenewalLetter({kind:'premium-hike',insurerId:'star-health',renewalDate:'2026-02-30',oldPremium:1,newPremium:2,hike},contacts,rules,'en',now),/Invalid premium details/);
 assert.throws(()=>makeRenewalLetter({kind:'premium-hike',insurerId:'nobody',renewalDate:'2026-12-01',oldPremium:1,newPremium:2,hike},contacts,rules,'en',now),/Unknown insurer/);
 assert.match(makeRenewalLetter({kind:'premium-hike',insurerId:'unlisted',renewalDate:'2026-12-01',oldPremium:20000,newPremium:22000,hike:premiumHike({oldPremium:20000,newPremium:22000,oldIncludesGst:false,newIncludesGst:false,seniorCitizen:false})},contacts,rules,'en',now).body,/^To the Grievance Redressal Officer, \[Insurer name\]/);
});
test('renewal letters: free-look cancellation lists mismatches and the 7-day refund; porting delay addresses the right insurer; migration adapts to continuity and group exit',()=>{
 const diff=freeLookDiff({sumInsured:1000000,copayPercent:0},{sumInsured:500000,copayPercent:20});
 const free=makeRenewalLetter({kind:'free-look-cancel',insurerId:'niva-bupa',receivedOn:'2026-10-05',mismatches:diff.mismatches},contacts,rules,'en',now);
 assert.match(free.body,/received the policy document on 5 October 2026/);assert.match(free.body,/- Sum insured: promised ₹10,00,000; the schedule shows ₹5,00,000\n- Co-payment: promised 0%; the schedule shows 20%/);assert.match(free.body,/within 7 days of receiving this request/);
 for(const id of free.ruleIds)assert.ok(free.body.includes(`“${rules.find(r=>r.id===id)!.quote}”`),id);
 assert.match(makeRenewalLetter({kind:'free-look-cancel',insurerId:'niva-bupa',receivedOn:'2026-10-05',mismatches:[]},contacts,rules,'en',now).body,/- \[describe the difference/);
 assert.throws(()=>makeRenewalLetter({kind:'free-look-cancel',insurerId:'niva-bupa',receivedOn:'2026-10-19',mismatches:[]},contacts,rules,'en',now),/Invalid receipt date/,'receipt in the future');
 assert.throws(()=>makeRenewalLetter({kind:'free-look-cancel',insurerId:'niva-bupa',receivedOn:'2026-10-05',mismatches:Array.from({length:13},()=>diff.mismatches[0])},contacts,rules,'en',now),/Invalid mismatch list/);
 const control=makeRenewalLetter({kind:'free-look-cancel',insurerId:'niva-bupa',receivedOn:'2026-10-05',mismatches:[{field:'roomRent',promised:'any\u0007 room'.padEnd(200,'x'),actual:'1% of SI',severity:'medium'}]},contacts,rules,'en',now);
 assert.doesNotMatch(control.body,/\u0007/);assert.ok(control.body.length<3500);
 const existing=makeRenewalLetter({kind:'porting-delay',insurerId:'star-health',role:'existing',otherInsurer:'Niva Bupa',requestDate:'2026-10-10',renewalDate:'2026-11-20'},contacts,rules,'en',now);
 assert.match(existing.body,/raised the request for my policy and claim information through the IIB portal on 10 October 2026; 8 days have passed/);assert.match(existing.body,/at most 72 hours/);assert.deepEqual(existing.ruleIds,['porting-records-72h','porting-credits-no-charges','grievance-14-days']);
 const acquiring=makeRenewalLetter({kind:'porting-delay',insurerId:'niva-bupa',role:'acquiring',otherInsurer:'Star Health',requestDate:'2026-10-10'},contacts,rules,'hi',now);
 assert.match(acquiring.body,/अधिकतम 5 दिन/);assert.match(acquiring.body,/\[नवीनीकरण की तारीख\]/);assert.deepEqual(acquiring.ruleIds,['porting-decision-5-days','porting-credits-no-charges','grievance-14-days']);
 assert.throws(()=>makeRenewalLetter({kind:'porting-delay',insurerId:'niva-bupa',role:'acquiring',otherInsurer:'x',requestDate:'2026-10-19'},contacts,rules,'en',now),/Invalid porting dates/);
 const same=makeRenewalLetter({kind:'migration-request',insurerId:'hdfc-ergo',target:'my:Optima Secure',effectiveDate:'2026-12-01',groupExit:false,continuousMonths:48},contacts,rules,'en',now);
 assert.match(same.body,/continuously in force for 48 months, so the proposal is not subject to fresh underwriting/);assert.deepEqual(same.ruleIds,['migration-30-days','migration-credits-36-months','proposal-decision-7-days']);assert.doesNotMatch(same.body,/Employer/);
 const young=makeRenewalLetter({kind:'migration-request',insurerId:'hdfc-ergo',target:'',effectiveDate:'2026-12-01',groupExit:false,continuousMonths:12},contacts,rules,'en',now);
 assert.match(young.body,/to \[name of the new product\]/);assert.match(young.body,/2\. If the proposal is underwritten, communicate the decision with reasons\./);
 const group=makeRenewalLetter({kind:'migration-request',insurerId:'hdfc-ergo',target:'Optima Secure',effectiveDate:'2026-12-01',groupExit:true,continuousMonths:null},contacts,rules,'en',now);
 assert.match(group.body,/on my exit from the group policy of \[Employer name\]/);assert.deepEqual(group.ruleIds,['group-to-individual-migration','migration-credits-36-months','proposal-decision-7-days']);
 for(const id of group.ruleIds)assert.ok(group.body.includes(`“${rules.find(r=>r.id===id)!.quote}”`),id);
 assert.throws(()=>makeRenewalLetter({kind:'migration-request',insurerId:'hdfc-ergo',target:'x',effectiveDate:'2026-12-01',groupExit:false,continuousMonths:-1},contacts,rules,'en',now),/Invalid continuity/);
 assert.throws(()=>makeRenewalLetter({kind:'nonsense'} as never,contacts,rules,'en',now),/Unknown/);
});
test('checklists reference only real rules',()=>{
 for(const step of [...PORTING_STEPS,...MIGRATION_STEPS])if(step.ruleId)assert.ok(rules.some(r=>r.id===step.ruleId),step.ruleId);
 assert.equal(PORTING_STEPS.length,7);assert.equal(MIGRATION_STEPS.length,5);
});
