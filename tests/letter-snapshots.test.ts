import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import templates from '../templates/messages.json' with {type:'json'};
import {proseDuration,duration} from '../src/lib/clock.ts';
import {makeLetter,timingDemand} from '../src/lib/letters.ts';
import {BIMA_DRAFT_LIMIT} from '../src/lib/letter-limits.ts';
import {makeDeductionLetter} from '../src/lib/deduction-letter.ts';
import {makeRejectionLetter} from '../src/lib/rejection.ts';
import {makeRenewalLetter} from '../src/lib/renewal-letters.ts';
import {freeLookDiff,premiumHike} from '../src/lib/renewal.ts';
import {makeReimbursementLetter} from '../src/lib/reimbursement-letters.ts';
import {compareLine,itemByCode} from '../src/lib/fair-bill.ts';
import type {ReimbursementClaim} from '../src/lib/reimbursement.ts';
import {classify} from '../src/lib/deductions.ts';
import type {Contact,Rule,Timeline,Letter,LetterKind} from '../src/lib/types.ts';
const contacts:Contact[]=JSON.parse(readFileSync(new URL('../data/contacts.json',import.meta.url),'utf8'));
const rules:Rule[]=JSON.parse(readFileSync(new URL('../data/rules.json',import.meta.url),'utf8'));
const now=new Date('2026-10-10T08:30:00.000Z');
const timeline:Timeline={id:'snapshot',insurerId:'hdfc-ergo',hospital:'Example Hospital',city:'Pune',requestType:'discharge',submittedAt:'2026-10-10T04:30:00.000Z',events:[{id:'ack',at:'2026-10-10T04:35:00.000Z',type:'ack',note:'Desk confirmed receipt.'}]};
const deductions=[classify({id:'room',description:'Proportionate surgeon fee',amount:4200}),classify({id:'copay',description:'Co-payment',amount:2500,policyClause:'Section 4.2: 10% co-pay',policyCalculationConfirmed:true}),classify({id:'unknown',description:'Unexplained adjustment',amount:1500})];
const letters:Record<string,Letter>={};
for(const language of ['en','hi'] as const){
 for(const kind of Object.keys(templates) as LetterKind[])letters[`${kind}-${language}`]=makeLetter(kind,timeline,contacts,rules,language,{amount:'2,000',hours:'4'},now);
 for(const kind of ['reconsideration','bima'] as const)letters[`deductions-${kind}-${language}`]=makeDeductionLetter(kind,deductions,timeline.insurerId,contacts,rules,language,now);
 letters[`rejection-${language}`]=makeRejectionLetter({insurerId:timeline.insurerId,rejectedOn:'2026-10-01',ground:language==='hi'?'प्रतीक्षा अवधि का अपवर्जन':'Waiting-period exclusion'},contacts,rules,language,now);
 for(const requestType of ['preauth','enhancement'] as const)letters[`gro-${requestType}-${language}`]=makeLetter('gro',{...timeline,requestType},contacts,rules,language,{},now);
 letters[`gro-before-window-${language}`]=makeLetter('gro',{...timeline,submittedAt:'2026-10-10T08:00:00.000Z',events:[]},contacts,rules,language,{},now);
 // Renewal Guardian (M25): the senior-citizen hike with GST removed, its Bima draft, a free-look cancellation, both porting-delay recipients and a group-exit migration.
 const seniorHike=premiumHike({oldPremium:47200,newPremium:48000,oldIncludesGst:true,newIncludesGst:false,seniorCitizen:true,ageBandChanged:false});
 letters[`renewal-hike-${language}`]=makeRenewalLetter({kind:'premium-hike',insurerId:timeline.insurerId,renewalDate:'2026-12-01',oldPremium:47200,newPremium:48000,hike:seniorHike},contacts,rules,language,now);
 letters[`renewal-hike-bima-${language}`]=makeRenewalLetter({kind:'premium-hike-bima',insurerId:timeline.insurerId,renewalDate:'2026-12-01',oldPremium:47200,newPremium:48000,hike:seniorHike},contacts,rules,language,now);
 letters[`renewal-free-look-${language}`]=makeRenewalLetter({kind:'free-look-cancel',insurerId:timeline.insurerId,receivedOn:'2026-10-01',mismatches:freeLookDiff({sumInsured:1000000,copayPercent:0},{sumInsured:500000,copayPercent:20}).mismatches},contacts,rules,language,now);
 letters[`renewal-porting-existing-${language}`]=makeRenewalLetter({kind:'porting-delay',insurerId:timeline.insurerId,role:'existing',otherInsurer:'Niva Bupa',requestDate:'2026-10-05',renewalDate:'2026-11-20'},contacts,rules,language,now);
 letters[`renewal-porting-acquiring-${language}`]=makeRenewalLetter({kind:'porting-delay',insurerId:timeline.insurerId,role:'acquiring',otherInsurer:'Star Health',requestDate:'2026-10-05'},contacts,rules,language,now);
 letters[`renewal-migration-${language}`]=makeRenewalLetter({kind:'migration-request',insurerId:timeline.insurerId,target:'my:Optima Secure',effectiveDate:'2026-12-01',groupExit:true,continuousMonths:null},contacts,rules,language,now);
 // Reimbursement Tracker (M26): an overdue claim with accrued interest, two piecemeal queries, a late partial settlement without interest, and the hospital rate-card request.
 const claim:ReimbursementClaim={id:'snap',insurerId:timeline.insurerId,hospital:'Example Hospital',intimatedOn:'2026-09-01',submittedOn:'2026-09-05',claimedAmount:120000,queries:[{id:'q1',at:'2026-09-10',note:'Indoor case papers',repliedOn:'2026-09-11'},{id:'q2',at:'2026-09-20',note:'Treating doctor’s note'}],settledOn:null,settledAmount:null,interestPaid:null,documents:{},notes:'',updatedAt:'2026-10-10T00:00:00.000Z'};
 letters[`reimbursement-delay-${language}`]=makeReimbursementLetter({kind:'reimbursement-delay',claim},contacts,rules,language,now);
 letters[`reimbursement-piecemeal-${language}`]=makeReimbursementLetter({kind:'piecemeal-objection',claim},contacts,rules,language,now);
 letters[`reimbursement-interest-${language}`]=makeReimbursementLetter({kind:'settlement-interest',claim:{...claim,settledOn:'2026-10-01',settledAmount:100000}},contacts,rules,language,now);
 letters[`reimbursement-rate-card-${language}`]=makeReimbursementLetter({kind:'rate-card-request',hospital:'Example Hospital',lines:[{description:'ICU charges (3 days)',amount:30000,comparison:compareLine(itemByCode('CC001')!,30000,'I','nabh','semi_private',3),itemName:'ICU/CCU/PICU/MICU/HDU'},{description:'Nursing charges',amount:4000,comparison:null,itemName:null}]},contacts,rules,language,now);
}
const snapshotUrl=new URL('./snapshots/letters.json',import.meta.url);
const actual=Object.fromEntries(Object.entries(letters).map(([key,{subject,body,ruleIds}])=>[key,{subject,body,ruleIds}]));
if(process.env.UPDATE_LETTER_SNAPSHOTS==='1')writeFileSync(snapshotUrl,JSON.stringify(actual,null,2)+'\n');
const expected=JSON.parse(readFileSync(snapshotUrl,'utf8'));
for(const [key,letter] of Object.entries(letters))test(`letter snapshot: ${key}`,()=>{
 assert.deepEqual(actual[key],expected[key]);
 // Same-site source URLs use the lowercase hostname; this forbids app branding in the message prose.
 assert.ok(!letter.body.includes('ClaimClock'));
 assert.doesNotMatch(letter.body,/information, not legal advice|Ask for|challengeable|no reason given|गारंटी|कानूनी सलाह|हर आंशिक कटौती के लिए CRC/i);
 assert.doesNotMatch(letter.body,/https:\/\/irdai\.gov\.in|\{(?:citations|identity|timeline|timing)\}/);
 if(letter.kind!=='bima')for(const id of letter.ruleIds){const rule=rules.find(r=>r.id===id)!;assert.ok(letter.body.includes(`“${rule.quote}”`),`${key} lacks the exact operative quote for ${id}`);}
 assert.match(letter.body,letter.language==='hi'?/नाम: \[आपका नाम\]/:/Name: \[Your name\]/);
});
test('reconsideration requests evidence per amount without copying coaching, verdicts or unrelated repudiation requirements',()=>{
 const body=letters['deductions-reconsideration-en'].body;
 for(const [number,amount] of [[1,'4,200'],[2,'2,500'],[3,'1,500']])assert.match(body,new RegExp(`${number}\\. [^\\n]+₹${amount}`));
 assert.match(body,/room eligibility clause/);assert.match(body,/eligible calculation base/);assert.match(body,/complete reason for each/);assert.match(body,/within 14 days under the PPHI Master Circular/);assert.match(body,/Attachments:/);assert.doesNotMatch(body,/17\(a\)|Committee|likely valid|Ask for/);
});
test('before-window and excess-wait messages preserve receipt trigger and no invented enhancement deadline',()=>{
 assert.match(timingDemand(timeline,'en',now),/exceeds the 3-hour window by 1 hour/);
 assert.match(timingDemand({...timeline,submittedAt:'2026-10-10T08:00:00Z'},'en',now),/within the 3-hour window from receipt/);
 assert.doesNotMatch(timingDemand({...timeline,requestType:'enhancement'},'en',now),/window|deadline|exceeds/);
});
test('Bima complaint bodies omit long citations and include supporting documents',()=>{
 for(const key of ['bima-en','bima-hi','deductions-bima-en','deductions-bima-hi']){assert.doesNotMatch(letters[key].body,/https?:\/\//);assert.ok(letters[key].body.length<2000);assert.match(letters[key].body,letters[key].language==='hi'?/दस्तावेज़ संलग्न/:/Documents I will attach/);}
});
test('Bima app budget holds for all insurer names, both languages and maximum allowed hospital/city inputs',()=>{
 const insurers=contacts.filter(c=>c.kind==='insurer');assert.equal(insurers.length,32);
 const longestTpa=contacts.filter(c=>c.kind==='tpa').sort((a,b)=>b.name.length-a.name.length)[0];
 const verboseDeductions=Array.from({length:100},(_,i)=>classify({id:String(i),description:'X'.repeat(500),amount:999999999}));
 for(const insurer of insurers)for(const language of ['en','hi'] as const){
  for(const requestType of ['discharge','preauth','enhancement'] as const){
   const input={...timeline,insurerId:insurer.id,tpaId:longestTpa?.id,hospital:'H'.repeat(100),city:'C'.repeat(70),requestType,submittedAt:'2000-01-01T00:00:00.000Z',events:Array.from({length:100},(_,i)=>({id:String(i),at:timeline.submittedAt,type:'note',note:'Long timeline note '.repeat(50)}))};
   const letter=makeLetter('bima',input,contacts,rules,language,{},now);
   assert.ok(letter.body.length<=BIMA_DRAFT_LIMIT,`${insurer.id}/${language}/${requestType}: ${letter.body.length}`);assert.ok(letter.body.includes(input.hospital));assert.ok(letter.body.includes(input.city));assert.ok(letter.body.includes(insurer.name));assert.doesNotMatch(letter.body,/Long timeline note/);
  }
  for(const scenario of [verboseDeductions,[...verboseDeductions,classify({id:'confirmed',description:'Co-payment',amount:999999999,policyClause:'Applicable term',policyCalculationConfirmed:true})],[classify({id:'confirmed',description:'Co-payment',amount:999999999,policyClause:'Applicable term',policyCalculationConfirmed:true})]]){const letter=makeDeductionLetter('bima',scenario,insurer.id,contacts,rules,language,now);assert.ok(letter.body.length<=BIMA_DRAFT_LIMIT,`${insurer.id}/${language}/deductions: ${letter.body.length}`);assert.doesNotMatch(letter.body,/X{500}/);}
 }
});

test('prose durations round partial minutes up and reserve HH:mm:ss for the clock',()=>{
 assert.equal(duration(3654000),'01:00:54');
 for(const [ms,en,hi] of [[0,'0 minutes','0 मिनट'],[1000,'1 minute','1 मिनट'],[3600000,'1 hour','1 घंटा'],[3654000,'1 hour 1 minute','1 घंटा 1 मिनट'],[7260000,'2 hours 1 minute','2 घंटे 1 मिनट']] as const){assert.equal(proseDuration(ms,'en'),en);assert.equal(proseDuration(ms,'hi'),hi);}
 for(const language of ['en','hi'] as const){
  const partialMinute={...timeline,submittedAt:new Date(now.getTime()-3654000).toISOString(),events:[]};
  for(const kind of Object.keys(templates) as LetterKind[]){const letter=makeLetter(kind,partialMinute,contacts,rules,language,{amount:'2,000',hours:'4'},now);assert.doesNotMatch(letter.body,/\b\d{2}:\d{2}:\d{2}\b/);}
  const excess={...timeline,submittedAt:new Date(now.getTime()-3*3600000-3654000).toISOString()};assert.match(timingDemand(excess,language,now),language==='hi'?/1 घंटा 1 मिनट/:/1 hour 1 minute/);
 }
});
test('confirmed policy deductions receive clarification requests in both letter formats and languages',()=>{
 const confirmed=[classify({id:'c',description:'Co-payment',amount:2500,policyClause:'Section 4.2: 10% co-pay',policyCalculationConfirmed:true})];
 for(const language of ['en','hi'] as const)for(const kind of ['reconsideration','bima'] as const){
  const letter=makeDeductionLetter(kind,confirmed,timeline.insurerId,contacts,rules,language,now);
  assert.match(letter.body,language==='hi'?/जाँच लिए हैं/:/have checked/);assert.match(letter.body,language==='hi'?/पुष्टि/:/confirm/);assert.match(letter.body,/14/);
  assert.doesNotMatch(letter.body,/reconsideration|I dispute|Provide the applicable|17\(b\)|पुनः समीक्षा|मुझे आपत्ति/);assert.deepEqual(letter.ruleIds,['grievance-14-days']);
 }
 const mixed=makeDeductionLetter('bima',deductions,timeline.insurerId,contacts,rules,'en',now);assert.match(mixed.body,/review of deductions totalling ₹5,700/);assert.match(mixed.body,/checked the policy terms and arithmetic for deductions totalling ₹2,500/);
});
