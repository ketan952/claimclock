import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportPayload,reportFailure} from '../src/lib/report.ts';
import type {Timeline} from '../src/lib/types.ts';

test('report payload sends null for blank city and omits local hospital and event notes',()=>{
 const timeline:Timeline={id:'local-id',insurerId:'star-health',hospital:'Private local hospital',city:'  ',requestType:'discharge',submittedAt:'2026-10-10T01:00:00Z',decidedAt:'2026-10-10T05:00:00Z',outcome:'approved',events:[{id:'local-event',at:'2026-10-10T02:00:00Z',type:'other',note:'Private local note'}]};
 const payload=reportPayload(timeline);assert.equal(payload.city,null);assert.equal(payload.tpa,null);
 assert.deepEqual(Object.keys(payload).sort(),['city','consent_version','decided_at','insurer','outcome','request_type','submitted_at','tpa']);
 assert.doesNotMatch(JSON.stringify(payload),/Private|local-id|local-event/);
 assert.equal(reportPayload({...timeline,city:'  Pune  '}).city,'Pune');
});
test('report failures separate rejected fields, service quota and network/server errors',()=>{
 assert.deepEqual(reportFailure(400,{field:'city'}),{key:'optin.invalid',field:'city'});
 assert.deepEqual(reportFailure(400,{field:'<script>private</script>'}),{key:'optin.invalid',field:'report'});
 assert.deepEqual(reportFailure(400,null),{key:'optin.invalid',field:'report'});
 assert.deepEqual(reportFailure(429,{error:'Private provider detail'}),{key:'optin.busy'});
 for(const status of [500,503,null])assert.deepEqual(reportFailure(status,{error:'Sensitive backend detail'}),{key:'optin.failed'});
});
