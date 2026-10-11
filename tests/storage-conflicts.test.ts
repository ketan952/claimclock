import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBackup} from '../src/lib/backup.ts';
import {CASES_KEY,getSelectedBackup,saveTimeline,saveDeductions,deleteCase,restoreCase,storageIssue} from '../src/lib/storage.ts';
import type {Timeline} from '../src/lib/types.ts';

const timeline:Timeline={id:'synthetic-conflict',insurerId:'care',hospital:'Synthetic hospital',city:'Pune',requestType:'discharge',submittedAt:'2019-11-10T06:00:00.000Z',events:[]};
function seed(){const values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}},configurable:true});assert.equal(saveTimeline(timeline,null),true);return values;}

test('stale detail and decision candidates cannot replace a saved timeline or resurrect deletion',()=>{
 const values=seed(),baseline=getSelectedBackup()!;
 const updated={...timeline,events:[{id:'e1',type:'ack',at:'2019-11-10T07:00:00.000Z',note:'Newer evidence'}]};assert.equal(saveTimeline(updated,baseline.timeline),true);const saved=values.get(CASES_KEY);
 for(const candidate of [{...timeline,city:'Stale edit'},{...timeline,submittedAt:'2019-11-10T06:30:00.000Z'},{...timeline,decidedAt:'2019-11-10T08:00:00.000Z',outcome:'approved'}]){assert.equal(saveTimeline(candidate,baseline.timeline),false);assert.equal(storageIssue(),'conflict');assert.equal(values.get(CASES_KEY),saved);}
 assert.equal(deleteCase(timeline.id,baseline),false);assert.equal(storageIssue(),'conflict');
 const latest=getSelectedBackup()!;assert.equal(deleteCase(timeline.id,latest),true);const deleted=values.get(CASES_KEY);assert.equal(saveTimeline(updated,latest.timeline),false);assert.equal(storageIssue(),'conflict');assert.equal(values.get(CASES_KEY),deleted);
});

test('attachment checks reject stale lines but preserve concurrent timeline changes and protect deletion',()=>{
 seed();const baseline=getSelectedBackup()!,first=[{id:'d1',description:'Co-pay',amount:1000}];assert.equal(saveDeductions(timeline.id,first,baseline),true);
 assert.equal(deleteCase(timeline.id,baseline),false);assert.equal(storageIssue(),'conflict');assert.equal(saveDeductions(timeline.id,[{...first[0],amount:2000}],baseline),false);assert.equal(storageIssue(),'conflict');
 const loaded=getSelectedBackup()!;const updated={...timeline,events:[{id:'e1',type:'call',at:'2019-11-10T07:00:00.000Z',note:'Keep this newer event'}]};assert.equal(saveTimeline(updated,loaded.timeline),true);assert.equal(saveDeductions(timeline.id,[{...first[0],amount:3000}],loaded),true);assert.deepEqual(getSelectedBackup()!.timeline.events,updated.events);assert.equal(getSelectedBackup()!.deductions[0].amount,3000);
});

test('restore replacement checks its reviewed case snapshot and unrelated cases survive conflicts',()=>{
 const values=seed(),baseline=getSelectedBackup()!;assert.equal(saveTimeline({...timeline,id:'other',hospital:'Keep this other case'},null),true);assert.equal(saveTimeline({...timeline,city:'Latest'},baseline.timeline),true);const before=values.get(CASES_KEY);
 assert.equal(restoreCase(makeBackup({...timeline,hospital:'Stale restore'}),timeline.id,baseline),false);assert.equal(storageIssue(),'conflict');assert.equal(values.get(CASES_KEY),before);assert.equal(JSON.parse(before!).cases.find((c:{timeline:Timeline})=>c.timeline.id==='other').timeline.hospital,'Keep this other case');
});

test('blocked storage access is distinguished from malformed saved content',()=>{
 const values=seed(),before=values.get(CASES_KEY);Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>{throw new DOMException('Blocked','SecurityError');},setItem:()=>{throw Error('No write permitted');}},configurable:true});assert.equal(getSelectedBackup(),null);assert.equal(storageIssue(),'unavailable');assert.equal(saveTimeline(timeline,null),false);assert.equal(storageIssue(),'unavailable');assert.equal(values.get(CASES_KEY),before);
});

test('stale lines cannot attach to a replaced claim even when insurer and empty deductions match',()=>{
 const values=seed(),baseline=getSelectedBackup()!;assert.equal(restoreCase(makeBackup({...timeline,hospital:'Another claim hospital',submittedAt:'2020-01-10T06:00:00.000Z'}),timeline.id,baseline),true);const before=values.get(CASES_KEY);
 assert.equal(saveDeductions(timeline.id,[{id:'d1',description:'Old claim deduction',amount:1000}],baseline),false);assert.equal(storageIssue(),'conflict');assert.equal(values.get(CASES_KEY),before);
});
