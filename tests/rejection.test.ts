import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectRejectionCategory,makeDoctorJustificationNote,makeRejectionLetter} from '../src/lib/rejection.ts';
import {evaluateOmbudsmanEligibility,makeOmbudsmanDraft,makeReimbursementDeskLetter,makeTwoPoliciesLetter} from '../src/lib/toolkits.ts';
const contacts=JSON.parse(readFileSync(new URL('../data/contacts.json',import.meta.url),'utf8'));
const rules=JSON.parse(readFileSync(new URL('../data/rules.json',import.meta.url),'utf8'));
const input={insurerId:'hdfc-ergo',rejectedOn:'2026-10-01',ground:'Waiting period exclusion'};
const now=new Date('2026-10-10T10:00:00Z');
test('rejection representation preserves stated ground and distinguishes repudiation approval from reasons in both languages',()=>{
 for(const language of ['en','hi'] as const){const letter=makeRejectionLetter(input,contacts,rules,language,now);assert.equal(letter.kind,'rejection');assert.ok(letter.body.includes(input.ground));assert.ok(letter.body.includes(language==='hi'?'1 अक्टूबर 2026':'1 October 2026'));assert.ok(letter.body.includes('17(a)'));assert.ok(letter.body.includes('17(b)'));assert.ok(letter.body.includes('14'));assert.ok(letter.body.includes('https://claimclock.ketan952.workers.dev/s/health-mc-2024'));assert.deepEqual(letter.ruleIds,['repudiation-review','deduction-reasons','grievance-14-days']);}
 assert.match(makeRejectionLetter(input,contacts,rules,'en',now).body,/If this decision is a repudiation/);
});
test('rejection letters reject invalid or future dates, unknown insurers, empty and oversized reasons',()=>{
 for(const patch of [{rejectedOn:'2026-02-30'},{rejectedOn:'2026-10-11'},{insurerId:'missing'},{ground:'  '},{ground:'a'.repeat(2001)}])assert.throws(()=>makeRejectionLetter({...input,...patch},contacts,rules,'en',now));
});
test('detectRejectionCategory classifies medical necessity, non-disclosure, waiting period and missing documents, and makeRejectionLetter cites 60-month moratorium',()=>{
 assert.equal(detectRejectionCategory('Admission was primarily for observation and evaluation; OPD treatment was possible.'),'medical-necessity');
 assert.equal(detectRejectionCategory('Repudiated for non-disclosure of hypertension prior to policy inception.'),'non-disclosure');
 assert.equal(detectRejectionCategory('Rejected under two-year specific ailment waiting period.'),'waiting-period');
 assert.equal(detectRejectionCategory('Closed for non-submission of indoor case papers.'),'missing-documents');
 for(const language of ['en','hi'] as const){
  const mor=makeRejectionLetter({...input,category:'non-disclosure',moratorium60Months:true},contacts,rules,language,now);
  assert.ok(mor.ruleIds.includes('moratorium-60-months'));
  assert.ok(mor.body.includes('60 months of continuous coverage'));
  const doc=makeRejectionLetter({...input,category:'missing-documents'},contacts,rules,language,now);
  assert.ok(doc.ruleIds.includes('documents-from-hospital'));
  const note=makeDoctorJustificationNote('Star Health and Allied',language,now);
  assert.equal(note.kind,'doctor-note');assert.ok(note.body.includes('Star Health and Allied'));
 }
});
test('reimbursement desk letter, two-policies coordination letter and Ombudsman eligibility/draft work in both languages',()=>{
 for(const language of ['en','hi'] as const){
  const desk=makeReimbursementDeskLetter('Star Health and Allied','Ruby Hall Clinic',language,now);
  assert.equal(desk.kind,'reimbursement-desk');assert.ok(desk.body.includes('Ruby Hall Clinic'));assert.ok(desk.body.includes('7.'));
  const multi=makeTwoPoliciesLetter('ICICI Lombard General','Star Health and Allied','42,000',language,rules,now);
  assert.equal(multi.kind,'two-policies');assert.ok(multi.ruleIds.includes('multiple-policies'));assert.ok(multi.body.includes('42,000'));assert.ok(multi.body.includes('18(a)'));
 }
 const waitRes=evaluateOmbudsmanEligibility({insurerId:'star-health',groDate:'2026-09-25',replyStatus:'no-reply',amount:120000,notInCourt:true,summary:'Disputed rejection'},now);
 assert.equal(waitRes.eligible,false);assert.equal(waitRes.reasonKey,'ombudsman.waitOneMonth');assert.equal(waitRes.triggerDate,'2026-10-25');
 const readyNoReply=evaluateOmbudsmanEligibility({insurerId:'star-health',groDate:'2026-09-01',replyStatus:'no-reply',amount:120000,notInCourt:true,summary:'Disputed rejection'},now);
 assert.equal(readyNoReply.eligible,true);assert.equal(readyNoReply.reasonKey,'ombudsman.readyNoReply');assert.equal(readyNoReply.oneYearLimitDate,'2027-10-01');
 const readyReplied=evaluateOmbudsmanEligibility({insurerId:'star-health',groDate:'2026-09-20',replyStatus:'replied',replyDate:'2026-10-02',amount:120000,notInCourt:true,summary:'Disputed rejection'},now);
 assert.equal(readyReplied.eligible,true);assert.equal(readyReplied.reasonKey,'ombudsman.readyReplied');assert.equal(readyReplied.oneYearLimitDate,'2027-10-02');
 const over=evaluateOmbudsmanEligibility({insurerId:'star-health',groDate:'2026-09-01',replyStatus:'replied',replyDate:'2026-09-15',amount:5500000,notInCourt:true,summary:'High claim'},now);
 assert.equal(over.eligible,false);assert.equal(over.reasonKey,'ombudsman.overLimit');
 for(const language of ['en','hi'] as const){
  const draft=makeOmbudsmanDraft({insurerId:'star-health',groDate:'2026-09-20',replyStatus:'replied',replyDate:'2026-10-02',amount:120000,notInCourt:true,summary:'Typhoid admission rejected'},contacts,rules,language,now);
  assert.equal(draft.kind,'ombudsman');assert.ok(draft.body.includes('1,20,000'));assert.ok(draft.body.includes('5000'));
 }
});
