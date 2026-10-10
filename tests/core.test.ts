import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clockState,windowMinutes,validSubmission,duration} from '../src/lib/clock.ts';
import {makeLetter} from '../src/lib/letters.ts';
import type {Contact,Rule,Timeline} from '../src/lib/types.ts';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const contacts:Contact[]=read('contacts'),rules:Rule[]=read('rules');
const base:Timeline={id:'test',insurerId:'hdfc-ergo',hospital:'Example Hospital',city:'Pune',requestType:'discharge',submittedAt:'2026-10-10T04:30:00.000Z',events:[]};
test('discharge boundaries and query events do not reset the clock',()=>{
 const start=Date.parse(base.submittedAt);assert.equal(clockState(base,start+89*60000).stage,'running');assert.equal(clockState(base,start+90*60000).stage,'halfway');assert.equal(clockState(base,start+180*60000).remaining,0);assert.equal(clockState(base,start+180*60000+1).stage,'beyond');
 const q={...base,events:[{id:'q',at:'2026-10-10T05:30:00.000Z',type:'query',note:''}]};assert.equal(clockState(q,start+181*60000).remaining,-60000);
});
test('enhancement does not invent a legal deadline; decision freezes elapsed',()=>{assert.equal(windowMinutes('enhancement'),null);assert.equal(clockState({...base,requestType:'enhancement'}).stage,'tracking');assert.equal(clockState({...base,decidedAt:'2026-10-10T05:30:00.000Z'}).elapsed,3600000);assert.equal(duration(-3661000),'01:01:01');});
test('reject future or invalid submission dates',()=>{const now=Date.parse('2026-10-10T04:30:00Z');assert.equal(validSubmission('wrong',now),false);assert.equal(validSubmission('2026-10-11T04:30:00Z',now),false);assert.equal(validSubmission(base.submittedAt,now),true);});
test('all ten insurer letters use the correct legal paragraph and exact verified contact',()=>{
 const ids=['national','new-india','united-india','hdfc-ergo','icici-lombard','bajaj','star-health','care','niva-bupa','manipalcigna'];
 for(const id of ids){assert.ok(contacts.find(c=>c.id===id)?.gro_email);for(const language of ['en','hi'] as const){const letter=makeLetter('gro',{...base,insurerId:id},contacts,rules,language,{},new Date('2026-10-10T08:00:00Z'));assert.ok(letter.body.includes('16(a)'));assert.ok(letter.body.includes('https://claimclock.ketan952.workers.dev/s/health-mc-2024'));assert.ok(!letter.body.includes('{'));}}
 const pre=makeLetter('gro',{...base,requestType:'preauth'},contacts,rules,'en');assert.ok(pre.body.includes('15(b)'));assert.ok(!pre.body.includes('16(a)'));
 const enh=makeLetter('gro',{...base,requestType:'enhancement'},contacts,rules,'en');assert.ok(!enh.body.includes('15(b)'));assert.ok(!enh.body.includes('16(a)'));
});
test('recovery demands documented attribution rather than guaranteed refund',()=>{const letter=makeLetter('recovery',base,contacts,rules,'en',{amount:'2,000',hours:'4'});assert.ok(letter.body.includes('16(b)'));assert.ok(letter.body.includes('caused by delay beyond three hours from your receipt'));assert.ok(letter.body.includes('Timeline:'));});
test('Hindi translation keys have parity',()=>{const en=JSON.parse(readFileSync(new URL('../src/i18n/en.json',import.meta.url),'utf8'));const hi=JSON.parse(readFileSync(new URL('../src/i18n/hi.json',import.meta.url),'utf8'));assert.deepEqual(Object.keys(hi).sort(),Object.keys(en).sort());});
