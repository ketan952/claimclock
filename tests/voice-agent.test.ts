import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOOLS} from '../worker/voice.ts';
import {HISTORY_LIMITS,TOOL_NAMES,VoiceActivity,executeTool,groundingContext,parseSpokenTime,pickVoice,resolveInsurer,resolvePlan,rmsLevel,speechChunks,text,toolResultContent,trimHistory,type ChatMessage,type ToolCall,type VoiceDeps} from '../src/lib/voice-agent.ts';
import {emptyVault,parseVault,type Vault} from '../src/lib/vault.ts';
import type {Timeline} from '../src/lib/types.ts';
import type {DeductionInput} from '../src/lib/deductions.ts';

const NOW=new Date('2026-10-17T06:30:00Z');
const sampleVault=():Vault=>parseVault({format:'claimclock-vault',version:1,updatedAt:NOW.toISOString(),profile:{name:'Ramesh Kumar',city:'Pune',language:'en'},
 members:[{id:'m-self',name:'Ramesh Kumar',relation:'self',birthYear:1980},{id:'m-spouse',name:'Sunita Kumar',relation:'spouse',birthYear:1983,conditions:'Thyroid'}],
 policies:[{id:'p-star',kind:'health',insurerId:'star-health',planId:'star-comprehensive',policyNumber:'P/700001/01/2026/004321',sumInsured:1000000,inceptionDate:'2025-10-01',continuityFrom:'2021-05-12',renewalDate:'2026-09-30',memberIds:['m-self','m-spouse'],uhid:'UH-99887',claimNumber:'CLM-77'}],
 defaultPolicyId:'p-star',cases:[]});
const sampleTimeline=():Timeline=>({id:'case-1',insurerId:'star-health',hospital:'Ruby Hall Clinic',city:'Pune',requestType:'preauth',submittedAt:new Date(NOW.getTime()-95*60000).toISOString(),events:[]});
function deps(overrides:Partial<VoiceDeps>&{vaultValue?:Vault|null;timelineValue?:Timeline|null}={}):VoiceDeps&{saved:{vault:Vault[];timelines:Timeline[]}} {
 const saved={vault:[] as Vault[],timelines:[] as Timeline[]};
 let vault=overrides.vaultValue===undefined?sampleVault():overrides.vaultValue;let timeline=overrides.timelineValue===undefined?sampleTimeline():overrides.timelineValue;
 return {language:'en',now:()=>NOW,vault:()=>vault,saveVault:v=>{saved.vault.push(v);vault=v;return true;},timeline:()=>timeline,saveTimeline:(t)=>{saved.timelines.push(t);timeline=t;return true;},deductions:()=>[],...overrides,saved};
}
const call=(name:ToolCall['name'],args:Record<string,unknown>={}):ToolCall=>({id:'c1',name,arguments:args});
const identifiers=/Ramesh|Sunita|P\/700001|UH-99887|CLM-77|Ruby Hall/;

test('voice activity: a turn starts on energy, ends after 700 ms of silence, drops blips, caps at 25 s and needs a sustained onset to interrupt the assistant',()=>{
 const vad=new VoiceActivity();let t=0;const step=(level:number,ms:number,speaking=false)=>{const events=[];for(let i=0;i<ms;i+=20){t+=20;events.push(vad.update(level,t,speaking));}return events.filter(Boolean);};
 assert.deepEqual(step(0.004,1000),[],'ambient noise never starts a turn');
 assert.deepEqual(step(0.08,20),['speech_start'],'speech starts on the first loud frame when nobody else is talking');
 assert.deepEqual(step(0.08,980),[]);
 assert.deepEqual(step(0.004,680),[],'silence shorter than the threshold keeps the turn open');
 assert.deepEqual(step(0.004,40),['speech_end'],'700 ms of silence closes a real utterance');
 assert.deepEqual(step(0.08,100),['speech_start']);
 assert.deepEqual(step(0.004,720),['speech_discard'],'a 100 ms blip is discarded, not sent');
 assert.deepEqual(step(0.08,20),['speech_start']);
 assert.deepEqual(step(0.08,25000),['max_duration'],'a 25 s monologue is cut and sent');
 vad.reset();
 assert.deepEqual(step(0.03,500,true),[],'while the assistant speaks, moderate energy (playback echo) is ignored');
 assert.deepEqual(step(0.3,240,true),[],'even loud energy must be sustained for 250 ms');
 assert.deepEqual(step(0.3,40,true),['speech_start'],'a sustained interruption wins');
 const noisy=new VoiceActivity();t=0;
 for(let i=0;i<200;i++)noisy.update(0.015,t+=20);
 assert.equal(noisy.update(0.04,t+=20),null,'a steady 0.015 floor lifts the start threshold to 0.045, so 0.04 is still noise');
 assert.equal(noisy.update(0.12,t+=20),'speech_start');
 assert.equal(new VoiceActivity().update(Number.NaN,0),null,'garbage levels are treated as silence');
 assert.equal(rmsLevel(new Uint8Array(128).fill(128)),0);
 assert.ok(Math.abs(rmsLevel(Uint8Array.from({length:64},(_,i)=>i%2?255:1))-0.99)<0.01);
 assert.equal(rmsLevel([]),0);
});

test('spoken output: sentence chunks stay short, Hindi dandas split, long clauses fall back to commas, and the best Indian voice is picked',()=>{
 assert.deepEqual(speechChunks('Yes. Your wife can take the check-up this policy year! Book it as cashless?'),['Yes. Your wife can take the check-up this policy year! Book it as cashless?']);
 assert.deepEqual(speechChunks('पहला वाक्य। दूसरा वाक्य।'),['पहला वाक्य। दूसरा वाक्य।']);
 const long=speechChunks(`${'alpha beta gamma '.repeat(12)}, ${'delta '.repeat(30)}; end.`);
 assert.ok(long.length>=2);assert.ok(long.every(c=>c.length<=180));
 assert.deepEqual(speechChunks('x'.repeat(400),100).map(c=>c.length),[100,100,100,100],'a single endless word is still bounded');
 assert.deepEqual(speechChunks('   '),[]);
 const voices=[{lang:'en-US',name:'Samantha',localService:true,default:true},{lang:'en-IN',name:'Rishi',localService:true},{lang:'en-GB',name:'Daniel',localService:true},{lang:'hi-IN',name:'Lekha',localService:true},{lang:'hi_IN',name:'Google हिन्दी',localService:false}];
 assert.equal(pickVoice(voices,'en')?.name,'Rishi');
 assert.equal(pickVoice(voices,'hi')?.name,'Lekha');
 assert.equal(pickVoice(voices.filter(v=>v.lang!=='en-IN'),'en')?.name,'Samantha','without an Indian voice any English voice is used, the system default first');
 assert.equal(pickVoice([{lang:'fr-FR',name:'Amelie'}],'hi'),undefined);
});

test('conversation bounds: whole turns are kept from the newest backwards and tool results are shrunk, never split mid-turn',()=>{
 const turn=(i:number,chars=100):ChatMessage[]=>[{role:'user',content:`q${i} `.padEnd(chars,'x')},{role:'assistant',content:null,tool_calls:[{id:`c${i}`,name:'check_renewal',arguments:{}}]},{role:'tool',tool_call_id:`c${i}`,name:'check_renewal',content:'{"status":"upcoming"}'},{role:'assistant',content:`a${i}`}];
 const history=[...turn(1),...turn(2),...turn(3),...turn(4),...turn(5)];
 const trimmed=trimHistory(history);
 assert.equal(trimmed.length,16);assert.equal(trimmed[0].role,'user');assert.ok(trimmed[0].content!.startsWith('q2'),'the oldest whole turn is dropped to meet the 16-message cap');
 const fat=(i:number):ChatMessage[]=>[{role:'user',content:`q${i} `.padEnd(1500,'x')},{role:'assistant',content:null,tool_calls:[{id:`c${i}`,name:'check_renewal',arguments:{}}]},{role:'tool',tool_call_id:`c${i}`,name:'check_renewal',content:'{"status":"'.padEnd(1500,'y')},{role:'assistant',content:`a${i} `.padEnd(1500,'z')}];
 const big=trimHistory([...fat(1),...fat(2),...fat(3)]);
 assert.equal(big.length,4);assert.ok(big[0].content!.startsWith('q3'),'turns beyond the 9,000-character budget are dropped whole');
 assert.ok(trimHistory([...turn(1,4000),...turn(2,4000)]).every(m=>!m.content||m.content.length<=HISTORY_LIMITS.maxMessageChars),'over-long messages are truncated');
 assert.equal(trimHistory([...turn(1,8000)]).length,4,'the most recent turn always survives even when it alone is large');
 const huge={status:'classified',lines:Array.from({length:200},(_,i)=>({description:`line ${i} ${'y'.repeat(50)}`,amount:i}))};
 const content=toolResultContent(huge);
 assert.ok(content.length<=HISTORY_LIMITS.maxMessageChars);
 const parsed=JSON.parse(content);assert.equal(parsed.truncated,true);assert.equal(parsed.status,'classified');assert.equal(parsed.lines.length,3);
 assert.equal(toolResultContent({status:'ok'}),'{"status":"ok"}');
});

test('the grounding context carries structure only: relations, ages, plan facts, dates, clock stage — never names, numbers or hospitals',()=>{
 const context=groundingContext(sampleVault(),sampleTimeline(),'/',NOW);
 const json=JSON.stringify(context);
 assert.doesNotMatch(json,identifiers);
 assert.deepEqual(context.members,[{id:'m-self',relation:'self',age:46},{id:'m-spouse',relation:'spouse',age:43,conditions:true}]);
 assert.equal(context.policies.length,1);
 assert.deepEqual(context.policies[0],{id:'p-star',kind:'health',insurer:'Star Health and Allied',plan:'Star Comprehensive Insurance Policy',planId:'star-comprehensive',sumInsured:1000000,inceptionDate:'2025-10-01',continuityFrom:'2021-05-12',renewalDate:'2026-09-30',members:['self','spouse'],default:true});
 assert.deepEqual(context.clock,{insurer:'Star Health and Allied',requestType:'preauth',submittedAt:sampleTimeline().submittedAt,stage:'beyond',elapsedMinutes:95});
 assert.equal(groundingContext(null,null,'/admin/',NOW).page,'other');
 assert.deepEqual(groundingContext(null,null,'/vault/',NOW),{page:'/vault/',members:[],policies:[],clock:null});
 const unlisted=groundingContext({...emptyVault(),policies:[{id:'p2',kind:'health',insurerId:'unlisted',policyNumber:'X',memberIds:[]}],defaultPolicyId:'p2'},null,'/',NOW);
 assert.equal(unlisted.policies[0].insurer,'Unlisted insurer');assert.equal(JSON.stringify(unlisted).includes('"X"'),false);
});

test('spoken insurers and plans resolve from fragments and aliases, and ambiguity is reported instead of guessed',()=>{
 for(const [spoken,id] of [['Star Health','star-health'],['star','star-health'],['HDFC','hdfc-ergo'],['HDFC ERGO','hdfc-ergo'],['New India','new-india'],['Max Bupa','niva-bupa'],['Niva','niva-bupa'],['Bajaj Allianz','bajaj'],['Tata AIG','tata-aig'],['ICICI','icici-lombard'],['Care','care'],['Religare','care'],['Reliance General','indusind'],['United India','united-india'],['Aditya Birla Health','aditya-birla'],['unlisted','unlisted'],['hdfc-ergo','hdfc-ergo']] as const)
  assert.equal(resolveInsurer(spoken).id,id,`${spoken} → ${id}`);
 assert.deepEqual(resolveInsurer('Acme Insurance'),{id:null,candidates:[]});
 assert.deepEqual(resolveInsurer(undefined),{id:null,candidates:[]});
 assert.deepEqual(resolveInsurer('   '),{id:null,candidates:[]});
 const general=resolveInsurer('General Insurance');assert.equal(general.id,null,'generic words alone resolve nothing');
 assert.equal(resolvePlan('Optima Secure','hdfc-ergo')?.id,'hdfc-ergo-optima-secure');
 assert.equal(resolvePlan('red carpet senior citizens','star-health')?.id,'star-senior-citizens-red-carpet');
 assert.equal(resolvePlan('Comprehensive','star-health')?.id,'star-comprehensive');
 assert.equal(resolvePlan('Optima Secure','star-health'),undefined,'plans only resolve under their own insurer');
 assert.equal(resolvePlan('Gold plan','hdfc-ergo'),undefined);
 assert.equal(resolvePlan(undefined,'hdfc-ergo'),undefined);
});

test('spoken times accept "now" and recent instants and refuse the future or anything older than a year',()=>{
 assert.equal(parseSpokenTime(undefined,NOW),NOW.toISOString());assert.equal(parseSpokenTime('Now',NOW),NOW.toISOString());
 const local=parseSpokenTime('2026-10-16T11:00',NOW);
 assert.equal(Date.parse(local),new Date('2026-10-16T11:00').getTime(),'a zone-less spoken time is read in the device zone, as the user meant it');
 assert.ok(Date.parse(local)<NOW.getTime(),'the previous day is in the past everywhere from UTC-12 to UTC+14');
 assert.throws(()=>parseSpokenTime('2027-01-01T00:00:00Z',NOW),/time/);
 assert.throws(()=>parseSpokenTime('2025-01-01T00:00:00Z',NOW),/time/);
 assert.throws(()=>parseSpokenTime('yesterday-ish',NOW),/time/);
});

test('check_policy_benefit answers from the saved plan’s cited rules and the simulator, and sends no identifiers back to the model',()=>{
 const d=deps();
 const checkup=executeTool(call('check_policy_benefit',{topic:'health_checkup',member:'spouse'}),d);
 assert.equal(checkup.result.status,'needs_claim_free_year','Star Comprehensive pays after a claim-free year; year 1 needs that answer');
 assert.equal(checkup.result.member,'spouse');assert.ok(String((checkup.result.source as {url:string}).url).startsWith('https://'));
 assert.doesNotMatch(JSON.stringify(checkup.result),identifiers);
 assert.equal(checkup.card?.kind,'benefit');assert.ok(checkup.card?.lines[0].includes('claim-free year'));assert.equal(checkup.card?.link?.href,'/check-coverage/');
 const room=executeTool(call('check_policy_benefit',{topic:'room_rent',chosenRoomRent:9000,hospitalEligibleRate:6000,days:3,associatedExpenses:100000}),d);
 assert.equal(room.result.status,'impact');assert.equal(room.result.totalImpact,42333);assert.equal(room.result.roomDifference,9000);assert.equal(room.result.associatedDeduction,33333);
 assert.ok(room.card?.lines.some(l=>l.includes('₹42,333')));
 const eligible=executeTool(call('check_policy_benefit',{topic:'room_rent'}),d);
 assert.equal(eligible.result.status,'eligible_room');assert.equal(eligible.result.category,'single_private_ac');
 const waiting=executeTool(call('check_policy_benefit',{topic:'waiting_period'}),d);
 assert.equal(waiting.result.status,'ok');assert.equal((waiting.result.moratorium60Months as {done:boolean}).done,true);assert.equal((waiting.result.ped as {done:boolean}).done,true);
 assert.ok(waiting.card?.lines.some(l=>/moratorium/i.test(l)));
 const copay=executeTool(call('check_policy_benefit',{topic:'copay',admissibleAmount:200000,entryAge:62}),d);
 assert.equal(copay.result.percent,10);assert.equal(copay.result.amount,20000);assert.equal(copay.result.reason,'entry_age_61_plus');
 const copayFromAge=executeTool(call('check_policy_benefit',{topic:'copay',member:'self'}),d);
 assert.equal(copayFromAge.result.percent,0,'entry age derived from birth year 1980 and 2025 inception is 45');
 const prepost=executeTool(call('check_policy_benefit',{topic:'pre_post_hospitalisation',admissionDate:'2026-06-10',dischargeDate:'2026-06-14',expenseDate:'2026-09-13'}),d);
 assert.equal(prepost.result.status,'outside_post','Star Comprehensive: 90 post days');
 assert.equal(executeTool(call('check_policy_benefit',{topic:'pre_post_hospitalisation'}),d).result.status,'needs_dates');
 const sub=executeTool(call('check_policy_benefit',{topic:'sub_limits',treatment:'cataract'}),d);
 assert.equal(sub.result.status,'not_verified');
 const consumables=executeTool(call('check_policy_benefit',{topic:'consumables'}),d);
 assert.ok(['known','unknown_rule'].includes(String(consumables.result.status)));
 const general=executeTool(call('check_policy_benefit',{topic:'general'}),d);
 assert.equal(general.result.status,'rules');assert.ok(Object.keys(general.result.rules as object).includes('room_rent'));
 assert.equal(executeTool(call('check_policy_benefit',{topic:'health_checkup'}),deps({vaultValue:null})).result.status,'no_policy');
 assert.deepEqual(executeTool(call('check_policy_benefit',{topic:'dental'}),d).result,{status:'invalid_arguments',field:'topic'});
 assert.deepEqual(executeTool(call('check_policy_benefit',{topic:'room_rent',chosenRoomRent:-5}),d).result,{status:'invalid_arguments',field:'chosenRoomRent'});
 const hindi=executeTool(call('check_policy_benefit',{topic:'health_checkup',member:'spouse'}),deps({language:'hi'}));
 assert.ok(/\p{Script=Devanagari}/u.test(hindi.card!.lines[0]),'cards follow the interface language');
 const vaultOnly=executeTool(call('check_policy_benefit',{topic:'health_checkup'}),deps({vaultValue:{...sampleVault(),policies:[{...sampleVault().policies[0],planId:undefined,planName:'Some other plan',healthCheckupLimit:4000}]}}));
 assert.equal(vaultOnly.result.status,'available');assert.equal(vaultOnly.result.amount,4000);assert.equal(vaultOnly.result.verified,false,'a vault-only limit is reported as unverified');
});

test('recommend_or_compare_plans compares cited rules, gives structural advice with the not-a-recommendation line, and asks for input when given none',()=>{
 const d=deps();
 const out=executeTool(call('recommend_or_compare_plans',{compareIds:['hdfc-ergo-optima-secure','new-india-mediclaim','nope','hdfc-ergo-optima-secure'],familyMembers:[{age:66,preExisting:true},{age:38,preExisting:false}]}),d);
 assert.equal(out.result.status,'compared');assert.equal((out.result.plans as unknown[]).length,2);assert.equal(out.result.compareUrl,'/compare/?plans=hdfc-ergo-optima-secure,new-india-mediclaim');
 const advice=out.result.advice as string[];assert.ok(advice.some(a=>/not a recommendation|does not recommend|not recommend/i.test(a)),advice.join(' | '));
 assert.equal(out.card?.link?.href,'/compare/?plans=hdfc-ergo-optima-secure,new-india-mediclaim');
 assert.equal(executeTool(call('recommend_or_compare_plans',{}),d).result.status,'needs_input');
 assert.deepEqual(executeTool(call('recommend_or_compare_plans',{familyMembers:[{age:200,preExisting:false}]}),d).result,{status:'invalid_arguments',field:'age'});
 assert.deepEqual(executeTool(call('recommend_or_compare_plans',{compareIds:[1]}),d).result,{status:'invalid_arguments',field:'compareIds'});
});

test('manage_claim_clock starts, logs and decides on the device store with validated inputs',()=>{
 const d=deps({timelineValue:null});
 assert.equal(executeTool(call('manage_claim_clock',{action:'start'}),d).result.status,'needs_request_type');
 assert.equal(executeTool(call('manage_claim_clock',{action:'start',requestType:'preauth',insurer:'Acme'}),d).result.status,'needs_insurer');
 const started=executeTool(call('manage_claim_clock',{action:'start',requestType:'preauth',insurer:'Star Health',hospital:'Ruby Hall Clinic',submittedAt:'now'}),d);
 assert.equal(started.result.status,'started');assert.equal(started.result.insurer,'star-health');assert.equal(started.result.windowMinutes,60);
 assert.equal(d.saved.timelines.length,1);assert.equal(d.saved.timelines[0].requestType,'preauth');assert.equal(d.saved.timelines[0].submittedAt,NOW.toISOString());
 assert.equal(started.card?.kind,'clock');assert.ok(started.card?.lines.some(l=>l.includes('1 hours')||l.includes('1 घंटे')));
 const defaulted=executeTool(call('manage_claim_clock',{action:'start',requestType:'discharge'}),deps({timelineValue:null}));
 assert.equal(defaulted.result.insurer,'star-health','the vault’s default policy supplies the insurer when none is spoken');
 const logged=executeTool(call('manage_claim_clock',{action:'log_event',eventType:'call',note:'Spoke to the TPA desk'}),d);
 assert.equal(logged.result.status,'logged');assert.equal(d.saved.timelines[1].events.length,1);assert.equal(d.saved.timelines[1].events[0].type,'call');
 assert.deepEqual(executeTool(call('manage_claim_clock',{action:'log_event',eventAt:'2026-01-01T00:00:00Z'}),d).result,{status:'invalid_arguments',field:'eventAt'});
 assert.equal(executeTool(call('manage_claim_clock',{action:'record_decision'}),d).result.status,'needs_outcome');
 const decided=executeTool(call('manage_claim_clock',{action:'record_decision',outcome:'partial'}),d);
 assert.equal(decided.result.status,'decided');assert.equal(decided.result.next,'/deductions/');assert.equal(d.saved.timelines[2].outcome,'partial');
 assert.equal(executeTool(call('manage_claim_clock',{action:'record_decision',outcome:'approved'}),d).result.status,'already_decided');
 assert.deepEqual(executeTool(call('manage_claim_clock',{action:'start',requestType:'preauth',insurer:'Star',submittedAt:'2027-05-05T10:00'}),d).result,{status:'invalid_arguments',field:'time'});
 assert.equal(executeTool(call('manage_claim_clock',{action:'log_event'}),deps({timelineValue:null})).result.status,'no_clock');
 const failing=executeTool(call('manage_claim_clock',{action:'start',requestType:'preauth',insurer:'Star'}),deps({timelineValue:null,saveTimeline:()=>false}));
 assert.equal(failing.result.status,'storage_failed');assert.equal(failing.card?.kind,'notice');
});

test('audit_bill_deductions classifies spoken lines deterministically and bounds the result',()=>{
 const out=executeTool(call('audit_bill_deductions',{lines:[{description:'Gloves and syringes',amount:1800},{description:'Room rent above eligibility',amount:12000},{description:'Deduction',amount:500}]}),deps());
 assert.equal(out.result.status,'classified');assert.equal(out.result.total,14300);
 const lines=out.result.lines as {status:string}[];assert.equal(lines.length,3);assert.ok(lines.some(l=>l.status==='challengeable'||l.status==='policy term — verify'));
 assert.equal(out.card?.link?.href,'/deductions/');assert.equal(out.card?.lines.length,3);
 assert.deepEqual(executeTool(call('audit_bill_deductions',{lines:[]}),deps()).result,{status:'invalid_arguments',field:'lines'});
 assert.deepEqual(executeTool(call('audit_bill_deductions',{lines:[{description:'x',amount:-1}]}),deps()).result,{status:'invalid_arguments',field:'amount'});
 assert.deepEqual(executeTool(call('audit_bill_deductions',{lines:[{amount:5}]}),deps()).result,{status:'invalid_arguments',field:'lines[0]'});
 assert.equal(executeTool(call('audit_bill_deductions',{lines:Array.from({length:41},()=>({description:'x',amount:1}))}),deps()).result.status,'invalid_arguments');
 const many=executeTool(call('audit_bill_deductions',{lines:Array.from({length:20},(_,i)=>({description:`Item ${i}`,amount:100}))}),deps());
 assert.equal((many.result.lines as unknown[]).length,12);assert.ok(many.card?.lines.at(-1)?.includes('8'));
});

test('draft_and_queue_action builds the personalised letter for the screen while the model only learns that it was drafted',()=>{
 const d=deps();
 const gro=executeTool(call('draft_and_queue_action',{letterKind:'gro'}),d);
 assert.equal(gro.result.status,'drafted');assert.equal(gro.result.recipientKnown,true);
 assert.doesNotMatch(JSON.stringify(gro.result),identifiers,'the tool result never carries the body or identifiers');
 const letter=gro.card!.letter!;assert.match(letter.letter.body,/Ramesh Kumar/);assert.match(letter.letter.body,/P\/700001/);assert.match(letter.recipient,/@/);
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'lock'}),d).card?.letter?.recipient,'','the clock-lock note is handed to the desk, not emailed');
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'recovery'}),d).result.status,'needs_amount_and_hours');
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'recovery',amount:4500,hours:6}),d).result.status,'drafted');
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'gro'}),deps({timelineValue:null})).result.status,'no_clock');
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'rejection'}),d).result.status,'needs_ground');
 const rejection=executeTool(call('draft_and_queue_action',{letterKind:'rejection',ground:'Pre-existing disease not disclosed at proposal'}),deps({timelineValue:null}));
 assert.equal(rejection.result.status,'drafted');assert.match(rejection.card!.letter!.letter.body,/P\/700001/,'the vault’s Star policy personalises a Star rejection letter');
 const other=executeTool(call('draft_and_queue_action',{letterKind:'rejection',ground:'Not medically necessary',insurer:'HDFC'}),deps({timelineValue:null}));
 assert.doesNotMatch(other.card!.letter!.letter.body,/P\/700001/,'a different insurer never receives the Star policy number');
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'reimbursement_desk'}),deps({timelineValue:null})).result.status,'needs_hospital');
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'reimbursement_desk'}),d).result.status,'drafted','the clock’s hospital is reused');
 assert.equal(executeTool(call('draft_and_queue_action',{letterKind:'reconsideration'}),d).result.status,'no_deductions');
 const inputs:DeductionInput[]=[{id:'d1',description:'Gloves',amount:900},{id:'d2',description:'Room rent difference',amount:5000}];
 const reconsideration=executeTool(call('draft_and_queue_action',{letterKind:'reconsideration'}),deps({deductions:()=>inputs}));
 assert.equal(reconsideration.result.status,'drafted');assert.match(reconsideration.card!.letter!.letter.body,/Gloves/);
 assert.deepEqual(executeTool(call('draft_and_queue_action',{letterKind:'poem'}),d).result,{status:'invalid_arguments',field:'letterKind'});
});

test('save_user_policy adds relations and a catalogue-matched policy without ever taking a policy number',()=>{
 const d=deps({vaultValue:null});
 const saved=executeTool(call('save_user_policy',{insurer:'HDFC ERGO',plan:'Optima Secure',sumInsured:1000000,inceptionYear:2023,members:['self','spouse']}),d);
 assert.equal(saved.result.status,'saved');assert.equal(saved.result.planVerified,true);assert.deepEqual(saved.result.missing,['policy_number','start_date']);
 const vault=d.saved.vault[0];assert.equal(vault.members.length,2);assert.deepEqual(vault.members.map(m=>m.relation),['self','spouse']);
 assert.equal(vault.policies[0].planId,'hdfc-ergo-optima-secure');assert.equal(vault.policies[0].policyNumber,'');assert.equal(vault.policies[0].sumInsured,1000000);assert.match(vault.policies[0].notes||'',/2023/);
 assert.equal(vault.defaultPolicyId,vault.policies[0].id);
 assert.equal(saved.card?.link?.href,'/vault/');assert.ok(saved.card?.lines.some(l=>/policy number/i.test(l)));
 const second=executeTool(call('save_user_policy',{insurer:'Star',members:['spouse','child'],inceptionDate:'2026-01-15',renewalDate:'2027-01-14'}),d);
 assert.equal(second.result.status,'saved');assert.deepEqual(second.result.missing,['policy_number']);
 assert.equal(d.saved.vault[1].members.length,3,'an existing spouse is reused; only the child is new');
 assert.equal(d.saved.vault[1].defaultPolicyId,vault.policies[0].id,'the first policy stays the default');
 assert.equal(executeTool(call('save_user_policy',{insurer:'Acme'}),d).result.status,'needs_insurer');
 assert.deepEqual(executeTool(call('save_user_policy',{insurer:'Star',members:['cousin']}),d).result,{status:'invalid_arguments',field:'members'});
 assert.deepEqual(executeTool(call('save_user_policy',{insurer:'Star',inceptionDate:'2026-02-30'}),d).result,{status:'invalid_arguments',field:'inceptionDate'});
 assert.deepEqual(executeTool(call('save_user_policy',{insurer:'Star',inceptionDate:'2024-01-01',continuityFrom:'2025-01-01'}),d).result,{status:'invalid_arguments',field:'continuityFrom'});
 assert.equal(executeTool(call('save_user_policy',{insurer:'Star'}),deps({vaultValue:null,saveVault:()=>false})).result.status,'storage_failed');
 const unverifiedPlan=executeTool(call('save_user_policy',{insurer:'Star',plan:'Family Delite'}),d);
 assert.equal(unverifiedPlan.result.planVerified,false);assert.equal(d.saved.vault.at(-1)!.policies.at(-1)!.planName,'Family Delite');
});

test('check_renewal and track_reimbursement stay honest about what is and is not verified',()=>{
 const soon=executeTool(call('check_renewal',{}),deps({now:()=>new Date('2026-09-20T00:00:00Z')}));
 assert.equal(soon.result.status,'due_soon');assert.equal(soon.result.days,10);assert.ok(soon.card?.lines.some(l=>l.includes('10')));
 assert.equal(executeTool(call('check_renewal',{}),deps()).result.status,'overdue');
 assert.equal(executeTool(call('check_renewal',{}),deps({now:()=>new Date('2026-01-01T00:00:00Z')})).result.status,'upcoming');
 const noDate=executeTool(call('check_renewal',{}),deps({vaultValue:{...sampleVault(),policies:[{...sampleVault().policies[0],renewalDate:undefined}]}}));
 assert.equal(noDate.result.status,'no_date');
 assert.equal(executeTool(call('check_renewal',{}),deps({vaultValue:null})).result.status,'no_policy');
 assert.match(String(executeTool(call('check_renewal',{}),deps()).result.graceNote),/do not quote/);
 const tracker=executeTool(call('track_reimbursement',{documentsSubmittedOn:'2026-10-01'}),deps());
 assert.equal(tracker.result.status,'tracker_not_yet_available');assert.equal(tracker.result.daysSinceDocuments,16);
 assert.deepEqual(executeTool(call('track_reimbursement',{documentsSubmittedOn:'2026-12-01'}),deps()).result,{status:'invalid_arguments',field:'documentsSubmittedOn'});
});

test('the client tool list matches the Worker schemas and failures never escape as exceptions',()=>{
 assert.deepEqual(TOOLS.map(t=>t.function.name),[...TOOL_NAMES]);
 assert.deepEqual(executeTool({id:'x',name:'nonexistent' as never,arguments:{}},deps()).result,{status:'unknown_tool'});
 const broken=executeTool(call('check_renewal',{}),deps({vault:()=>{throw new Error('storage exploded');}}));
 assert.equal(broken.result.status,'tool_failed');assert.equal(broken.card?.kind,'notice');
 assert.equal(text('hi','voice.card.amount'),'राशि');assert.equal(text('en','voice.card.window',{hours:3}),'Written-decision window: 3 hours');assert.equal(text('en','missing.key'),'missing.key');
});
