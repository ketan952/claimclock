import test from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {RECEIPTS_KEY,LEGACY_RECEIPT_KEY,saveReceipt,listReceipts,removeReceipt,parseReceipt,receiptIssue} from '../src/lib/receipts.ts';
import {saveTimeline,deleteCase,CASES_KEY} from '../src/lib/storage.ts';
import {makeBackup} from '../src/lib/backup.ts';
const a={id:'00000000-0000-4000-8000-000000000001',erase_token:'a'.repeat(64)};
const b={id:'00000000-0000-4000-8000-000000000002',erase_token:'b'.repeat(64)};
function environment(t:TestContext){
 const values=new Map<string,string>(),state={read:false,write:false,remove:false};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(key:string){if(state.read)throw Error();return values.get(key)??null;},setItem(key:string,value:string){if(state.write)throw Error();values.set(key,value);},removeItem(key:string){if(state.remove)throw Error();values.delete(key);}}});
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');});
 return {values,state};
}
test('separate report receipts append, survive case deletion and never enter a backup',t=>{
 const {values}=environment(t);
 const timeline={id:'local-a',insurerId:'care',hospital:'Synthetic hospital',city:'',requestType:'preauth' as const,submittedAt:'2025-11-01T10:00:00.000Z',events:[]};
 assert.equal(saveTimeline(timeline),true);assert.equal(saveReceipt(a,timeline.id),true);assert.equal(saveReceipt(b,'local-b'),true);
 assert.deepEqual(listReceipts().map(r=>r.id),[a.id,b.id]);assert.equal(listReceipts()[0].caseId,timeline.id);
 assert.equal(deleteCase(timeline.id),true);assert.equal(listReceipts().length,2);
 const backup=JSON.stringify(makeBackup(timeline));assert.doesNotMatch(backup,new RegExp(`${a.erase_token}|${b.erase_token}|erase_token|receipts`));
 assert.doesNotMatch(values.get(CASES_KEY)!,/erase_token/);
});
test('legacy receipt appends safely and original is removed only after complete persistence',t=>{
 const {values,state}=environment(t);saveReceipt(b);const raw=JSON.stringify(a);values.set(LEGACY_RECEIPT_KEY,raw);
 state.write=true;assert.deepEqual(listReceipts().map(r=>r.id),[b.id,a.id]);assert.equal(receiptIssue(),'save');assert.equal(values.get(LEGACY_RECEIPT_KEY),raw);assert.equal(JSON.parse(values.get(RECEIPTS_KEY)!).receipts[a.id],undefined);
 state.write=false;assert.equal(listReceipts().length,2);assert.equal(values.has(LEGACY_RECEIPT_KEY),false);assert.ok(JSON.parse(values.get(RECEIPTS_KEY)!).receipts[a.id]);
});
test('saving a new receipt preserves a legacy receipt and failed writes preserve prior bytes',t=>{
 const {values,state}=environment(t);values.set(LEGACY_RECEIPT_KEY,JSON.stringify(a));state.write=true;
 assert.equal(saveReceipt(b),false);assert.equal(values.has(RECEIPTS_KEY),false);assert.equal(values.get(LEGACY_RECEIPT_KEY),JSON.stringify(a));
 state.write=false;assert.equal(saveReceipt(b),true);assert.equal(listReceipts().length,2);
 const before=values.get(RECEIPTS_KEY);state.write=true;
 assert.equal(saveReceipt({...b,id:'00000000-0000-4000-8000-000000000003'}),false);assert.equal(values.get(RECEIPTS_KEY),before);
});
test('corrupt registry and invalid legacy bytes are preserved without being silently replaced',t=>{
 const {values}=environment(t),corrupt=' {"version": 1, "receipts": ';values.set(RECEIPTS_KEY,corrupt);
 assert.equal(saveReceipt(a),false);assert.equal(values.get(RECEIPTS_KEY),corrupt);assert.deepEqual(listReceipts(),[]);assert.equal(receiptIssue(),'corrupt');
 values.delete(RECEIPTS_KEY);values.set(LEGACY_RECEIPT_KEY,'{broken-old-code');
 assert.equal(saveReceipt(b),true);assert.equal(values.get(LEGACY_RECEIPT_KEY),'{broken-old-code');assert.equal(listReceipts()[0].id,b.id);assert.equal(receiptIssue(),'legacy');
});
test('UUID/token validation and token conflicts cannot replace an existing valid credential',t=>{
 const {values}=environment(t);saveReceipt(a);const before=values.get(RECEIPTS_KEY);
 for(const value of [{...a,id:'synthetic'}, {...a,id:a.id.replace('-4000-','-1000-')}, {...a,erase_token:'short'}, {...a,extra:'private'}])assert.equal(parseReceipt(value),null);
 assert.equal(saveReceipt({...a,erase_token:b.erase_token}),false);assert.equal(receiptIssue(),'conflict');assert.equal(values.get(RECEIPTS_KEY),before);
 values.set(LEGACY_RECEIPT_KEY,JSON.stringify({...a,erase_token:b.erase_token}));assert.equal(saveReceipt(b),false);assert.equal(values.get(RECEIPTS_KEY),before);assert.ok(values.has(LEGACY_RECEIPT_KEY));
});
test('manual erasure of old A removes only its exact pair while newer B remains',t=>{
 const {values}=environment(t);saveReceipt(a);saveReceipt(b);
 assert.equal(removeReceipt({...a,erase_token:b.erase_token}),true);assert.equal(listReceipts().length,2);
 assert.equal(removeReceipt(a),true);assert.deepEqual(listReceipts().map(r=>r.id),[b.id]);
 values.set(LEGACY_RECEIPT_KEY,JSON.stringify(b));assert.equal(removeReceipt(a),true);assert.deepEqual(listReceipts().map(r=>r.id),[b.id]);assert.equal(values.has(LEGACY_RECEIPT_KEY),false);
});
test('failed local removal retains all receipts and storage access failure never throws',t=>{
 const {values,state}=environment(t);saveReceipt(a);saveReceipt(b);const before=values.get(RECEIPTS_KEY);state.write=true;
 assert.equal(removeReceipt(a),false);assert.equal(values.get(RECEIPTS_KEY),before);state.read=true;
 assert.doesNotThrow(()=>{assert.equal(saveReceipt(a),false);assert.equal(removeReceipt(a),false);assert.deepEqual(listReceipts(),[]);});assert.equal(receiptIssue(),'unavailable');
});
test('failure to remove migrated legacy data keeps a harmless duplicate instead of losing it',t=>{
 const {values,state}=environment(t);values.set(LEGACY_RECEIPT_KEY,JSON.stringify(a));state.remove=true;
 assert.equal(saveReceipt(b),true);assert.equal(listReceipts().length,2);assert.ok(values.has(LEGACY_RECEIPT_KEY));
});
