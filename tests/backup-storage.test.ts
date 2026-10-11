import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBackup,makeBackup} from '../src/lib/backup.ts';
import {CASES_KEY,LEGACY_KEY,listCases,getSelectedBackup,saveTimeline,saveDeductions,selectCase,deleteCase,restoreCase,storageIssue} from '../src/lib/storage.ts';
import type {Timeline} from '../src/lib/types.ts';
const timeline:Timeline={id:'legacy-case',insurerId:'care',hospital:'Example Hospital',city:'Pune',requestType:'discharge',submittedAt:'2019-11-10T06:00:00.000Z',events:[{id:'ack',at:'2019-11-10T06:05:00.000Z',type:'ack',note:'Synthetic acknowledgement'}],decidedAt:'2019-11-10T08:00:00.000Z',outcome:'approved'};
class MemoryStorage {values=new Map<string,string>();fail=false;getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){if(this.fail)throw new DOMException('Full','QuotaExceededError');this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}}
function storage(){const local=new MemoryStorage();Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true});return local;}
test('legacy and versioned backups preserve historical dates and reviewed deduction inputs',()=>{
 const legacy=parseBackup(timeline);assert.equal(legacy.version,1);assert.deepEqual(legacy.timeline,timeline);assert.deepEqual(legacy.deductions,[]);
 const value=makeBackup(timeline,[{id:'d',description:'Co-payment',amount:1500,policyClause:'Section 4',policyCalculationConfirmed:true}]);assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(value))),value);
});
test('backup parser rejects unknown fields, prototypes, invalid calendars, enums and excessive bounds',()=>{
 for(const patch of [{hospital:'H'.repeat(101)},{city:'C'.repeat(71)},{insurerId:'unknown'},{tpaId:'unknown'},{submittedAt:'2025-02-29T00:00:00.000Z'},{submittedAt:'2026-04-31T00:00:00.000Z'},{requestType:['discharge']},{outcome:['approved']},{claimNumber:'private'},JSON.parse('{"__proto__":{"polluted":true}}')])assert.throws(()=>parseBackup({...timeline,...patch}));
 assert.throws(()=>parseBackup(Object.assign(Object.create({evil:true}),timeline)));
 assert.throws(()=>parseBackup({...timeline,events:Array(501).fill(timeline.events[0])}));assert.throws(()=>parseBackup({...timeline,events:[...timeline.events,...timeline.events]}));
 assert.throws(()=>parseBackup({...timeline,events:[{...timeline.events[0],type:['ack']}]}));assert.throws(()=>parseBackup({...timeline,decidedAt:'2019-11-09T00:00:00.000Z'}));
 const base=makeBackup(timeline);for(const deduction of [{id:'d',description:'X',amount:0},{id:'d',description:'X',amount:1.001},{id:'d',description:'X',amount:1,status:'likely valid'},{id:'d',description:'X',amount:1,noApplicablePolicyClause:true,policyCalculationConfirmed:true}])assert.throws(()=>parseBackup({...base,deductions:[deduction]}));
 assert.throws(()=>parseBackup({...base,version:2}));assert.throws(()=>parseBackup({...base,erase_token:'never imported'}));
});
test('legacy migration writes the complete case before removing the old key',()=>{
 const local=storage();local.setItem(LEGACY_KEY,JSON.stringify(timeline));assert.equal(getSelectedBackup()!.timeline.id,'legacy-case');assert.equal(local.getItem(LEGACY_KEY),null);assert.equal(JSON.parse(local.getItem(CASES_KEY)!).cases.length,1);
});
test('quota during migration preserves the only saved original and keeps it readable',()=>{
 const local=storage();const raw=JSON.stringify(timeline);local.setItem(LEGACY_KEY,raw);local.fail=true;assert.equal(getSelectedBackup()!.timeline.id,'legacy-case');assert.equal(local.getItem(LEGACY_KEY),raw);assert.equal(local.getItem(CASES_KEY),null);assert.equal(storageIssue(),'save');
});
test('corrupt storage is never overwritten by creating or restoring a case',()=>{
 const local=storage();local.setItem(CASES_KEY,'{corrupt');assert.deepEqual(listCases(),[]);assert.equal(storageIssue(),'corrupt');assert.equal(saveTimeline(timeline),false);assert.equal(restoreCase(makeBackup(timeline)),false);assert.equal(local.getItem(CASES_KEY),'{corrupt');
});
test('multiple cases switch and delete individually; quota leaves existing cases unchanged',()=>{
 const local=storage();assert.equal(saveTimeline(timeline),true);assert.equal(saveTimeline({...timeline,id:'second',hospital:'Second Hospital'}),true);assert.equal(listCases().length,2);assert.equal(selectCase(timeline.id),true);assert.equal(getSelectedBackup()!.timeline.hospital,'Example Hospital');
 const before=local.getItem(CASES_KEY);local.fail=true;assert.equal(saveTimeline({...timeline,hospital:'Unsaved'}),false);assert.equal(local.getItem(CASES_KEY),before);assert.equal(deleteCase(timeline.id),false);assert.equal(local.getItem(CASES_KEY),before);local.fail=false;
 assert.equal(deleteCase(timeline.id),true);assert.equal(getSelectedBackup()!.timeline.id,'second');assert.equal(selectCase(null),true);assert.equal(getSelectedBackup(),null);assert.equal(listCases().length,1);
});
test('restore defaults to a new case and replacement changes only its explicit target',()=>{
 storage();saveTimeline(timeline);saveTimeline({...timeline,id:'second',hospital:'Keep me'});const incoming=makeBackup({...timeline,hospital:'Imported'},[{id:'d',description:'Co-payment',amount:1500}]);
 assert.equal(restoreCase(incoming),true);assert.equal(listCases().length,3);assert.notEqual(getSelectedBackup()!.timeline.id,timeline.id);assert.equal(listCases().find(c=>c.timeline.id===timeline.id)!.timeline.hospital,'Example Hospital');
 assert.equal(restoreCase(incoming,timeline.id),true);assert.equal(listCases().length,3);assert.equal(getSelectedBackup()!.timeline.id,timeline.id);assert.equal(getSelectedBackup()!.deductions.length,1);assert.equal(listCases().find(c=>c.timeline.id==='second')!.timeline.hospital,'Keep me');
 assert.equal(saveDeductions(timeline.id,[{id:'d',description:'Co-payment',amount:2000,noApplicablePolicyClause:true}]),true);assert.equal(getSelectedBackup()!.deductions[0].noApplicablePolicyClause,true);
});

test('legacy migration preserves earlier evidence after a forward correction of the submission time',()=>{
 const local=storage();const corrected={...timeline,submittedAt:'2019-11-10T07:00:00.000Z',events:[...timeline.events,{id:'correction',at:'2019-11-10T07:30:00.000Z',type:'other',note:'@time-correction|2019-11-10T06:00:00.000Z|2019-11-10T07:00:00.000Z'}]};
 local.setItem(LEGACY_KEY,JSON.stringify(corrected));const migrated=getSelectedBackup()!;assert.deepEqual(migrated.timeline.events,corrected.events);assert.equal(migrated.timeline.submittedAt,corrected.submittedAt);assert.equal(storageIssue(),'');assert.equal(local.getItem(LEGACY_KEY),null);assert.ok(local.getItem(CASES_KEY));
});
