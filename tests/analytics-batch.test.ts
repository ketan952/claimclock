import test from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {track} from '../src/lib/events.ts';

function environment(t:TestContext){
 const state={consent:'yes'};
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>state.consent}});
 t.mock.timers.enable({apis:['setTimeout']});
 const batches:{counts:Record<string,number>}[]=[];
 t.mock.method(globalThis,'fetch',async(url:unknown,options:RequestInit)=>{
  assert.equal(url,'/api/events');assert.equal(options.method,'POST');
  batches.push(JSON.parse(String(options.body)));
  return new Response(null,{status:204});
 });
 t.after(()=>{
  state.consent='no';track('session_started');
  if(previous)Object.defineProperty(globalThis,'localStorage',previous);
  else Reflect.deleteProperty(globalThis,'localStorage');
 });
 return {state,batches,flush:()=>t.mock.timers.tick(15000)};
}

test('mixed-event bursts send at most twenty total positive counts, preserving the accepted batch',t=>{
 const e=environment(t);
 for(let i=0;i<10;i++)track('clock_lock_copied');
 for(let i=0;i<9;i++)track('escalation_copied');
 for(let i=0;i<5;i++)track('delay_charge_generated');
 track('opt_in_submitted');e.flush();
 assert.deepEqual(e.batches,[{counts:{clock_lock_copied:10,escalation_copied:9,delay_charge_generated:1}}]);
 const values=Object.values(e.batches[0].counts);
 assert.equal(values.reduce((sum,n)=>sum+n,0),20);
 assert.ok(values.every(n=>Number.isInteger(n)&&n>0&&n<=20));
});

test('overflow is dropped without delayed replay or contaminating the next opted-in batch',t=>{
 const e=environment(t);
 for(let i=0;i<100;i++)track('clock_lock_copied');
 track('escalation_copied');e.flush();e.flush();
 assert.deepEqual(e.batches,[{counts:{clock_lock_copied:20}}]);
 track('delay_charge_generated');e.flush();
 assert.deepEqual(e.batches[1],{counts:{delay_charge_generated:1}});
});

test('revoking consent discards a full batch and its overflow before any network request',t=>{
 const e=environment(t);
 for(let i=0;i<30;i++)track('clock_lock_copied');
 track('escalation_copied');e.state.consent='no';e.flush();
 assert.deepEqual(e.batches,[]);
 e.state.consent='yes';track('session_started');e.flush();
 assert.deepEqual(e.batches,[{counts:{session_started:1}}]);
});
