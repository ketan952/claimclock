import test from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {track} from '../src/lib/events.ts';

function environment(t:TestContext){
 const state:{consent:string|null;failure:'access'|'read'|null;networkFailure:boolean}={consent:null,failure:null,networkFailure:false};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){
  if(state.failure==='access')throw new Error('Storage access denied');
  return {getItem(key:string){assert.equal(key,'claimclock:analytics');if(state.failure==='read')throw new Error('Storage read denied');return state.consent;}};
 }});
 t.mock.timers.enable({apis:['setTimeout']});
 const sent:{url:unknown;options:RequestInit}[]=[];
 t.mock.method(globalThis,'fetch',async (url:unknown,options:RequestInit)=>{
  sent.push({url,options});
  if(state.networkFailure)throw new Error('Offline');
  return new Response(null,{status:204});
 });
 t.after(()=>{
  state.failure=null;state.consent=null;track('session_started');
  if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);
  else Reflect.deleteProperty(globalThis,'localStorage');
 });
 return {state,sent,advance:()=>t.mock.timers.tick(15000),body:(n:number)=>JSON.parse(String(sent[n].options.body))};
}

test('analytics batches only opted-in actions after the waiting period',t=>{
 const e=environment(t);
 track('session_started');e.advance();assert.equal(e.sent.length,0);
 e.state.consent='yes';track('clock_lock_copied');track('clock_lock_copied');track('escalation_copied');
 t.mock.timers.tick(14999);assert.equal(e.sent.length,0);t.mock.timers.tick(1);
 assert.equal(e.sent.length,1);assert.equal(e.sent[0].url,'/api/events');
 assert.equal(e.sent[0].options.method,'POST');assert.equal(e.sent[0].options.keepalive,true);
 assert.deepEqual(e.body(0),{counts:{clock_lock_copied:2,escalation_copied:1}});
});

test('revoking consent before flush drops the old batch and reconsent does not replay it',t=>{
 const e=environment(t);e.state.consent='yes';track('session_started');track('clock_lock_copied');
 e.state.consent='no';e.advance();assert.equal(e.sent.length,0);
 e.state.consent='yes';track('delay_charge_generated');e.advance();
 assert.equal(e.sent.length,1);assert.deepEqual(e.body(0),{counts:{delay_charge_generated:1}});
});

test('denied localStorage access or reads never throw into the local workflow and discard pending counts',t=>{
 const e=environment(t);e.state.consent='yes';
 for(const failure of ['access','read'] as const){
  track('session_started');e.state.failure=failure;
  assert.doesNotThrow(()=>track('escalation_copied'));
  e.state.failure=null;e.advance();assert.equal(e.sent.length,0,'A storage failure must discard the previously queued event too');
 }
 track('opt_in_submitted');e.advance();
 assert.equal(e.sent.length,1);assert.deepEqual(e.body(0),{counts:{opt_in_submitted:1}});
});

test('storage becoming unavailable while a batch waits prevents transmission and stale replay',t=>{
 const e=environment(t);e.state.consent='yes';track('clock_lock_copied');
 e.state.failure='read';assert.doesNotThrow(e.advance);assert.equal(e.sent.length,0);
 e.state.failure=null;track('escalation_copied');e.advance();
 assert.equal(e.sent.length,1);assert.deepEqual(e.body(0),{counts:{escalation_copied:1}});
});

test('network failure drops optional counts without retrying or contaminating the next batch',async t=>{
 const e=environment(t);e.state.consent='yes';e.state.networkFailure=true;track('session_started');
 e.advance();await Promise.resolve();assert.equal(e.sent.length,1);
 e.advance();assert.equal(e.sent.length,1,'There must be no background retry');
 e.state.networkFailure=false;track('delay_charge_generated');e.advance();
 assert.equal(e.sent.length,2);assert.deepEqual(e.body(1),{counts:{delay_charge_generated:1}});
});
