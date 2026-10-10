import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRejectionLetter} from '../src/lib/rejection.ts';
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
