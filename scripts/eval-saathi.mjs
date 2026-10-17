// Saathi evaluation harness. Runs every scenario in tests/fixtures/saathi-evals.json against the
// configured provider through the Worker's own prompt, tool schemas and shaping (complete()), then
// executes the chosen tool exactly as the browser would and scores the final spoken reply.
//
//   npm run eval:saathi            # needs LLM_BASE_URL / LLM_API_KEY / LLM_MODEL in .dev.vars or the environment
//   SAATHI_EVAL_ONLY=renewal,gro-letter npm run eval:saathi
//
// Scores: tool choice, arguments, tool status, reply language, length, forbidden content and latency.
// Writes qa/saathi-eval.json (no utterance text from real users is involved; the fixture is synthetic).
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env={...process.env,LLM_FREE_TIER_CONFIRMED:'true'};
try{for(const line of readFileSync(resolve(root,'.dev.vars'),'utf8').split('\n')){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!env[m[1]])env[m[1]]=m[2].trim().replace(/^"|"$/g,'');}}catch{/* environment only */}
const {provider}=await import(pathToFileURL(resolve(root,'worker/security.ts')).href);
const {complete,validateCopilot}=await import(pathToFileURL(resolve(root,'worker/voice.ts')).href);
const {executeTool,groundingContext,toolResultContent}=await import(pathToFileURL(resolve(root,'src/lib/voice-agent.ts')).href);
const config=provider(env);
if(!config){console.error('No provider configured: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL (in .dev.vars or the environment).');process.exit(2);}

const suite=JSON.parse(readFileSync(resolve(root,'tests/fixtures/saathi-evals.json'),'utf8'));
const only=process.env.SAATHI_EVAL_ONLY?new Set(process.env.SAATHI_EVAL_ONLY.split(',')):null;
const scenarios=suite.scenarios.filter(s=>!only||only.has(s.id));
const now=new Date();
const relative=value=>{const m=/^RELATIVE:(-?\d+)m$/.exec(value);return m?new Date(now.getTime()+Number(m[1])*60000).toISOString():value;};
const fixtureTimeline=suite.fixture.timeline?{...suite.fixture.timeline,submittedAt:relative(suite.fixture.timeline.submittedAt)}:null;
const sentences=text=>text.split(/(?<=[.!?।])\s+/).filter(Boolean).length;
const devanagari=/\p{Script=Devanagari}/u;
const matchesArg=(expected,actual)=>{
 if(typeof expected==='string'&&/^\/.*\/[a-z]*$/.test(expected)){const m=expected.match(/^\/(.*)\/([a-z]*)$/);return new RegExp(m[1],m[2]).test(typeof actual==='string'?actual:JSON.stringify(actual??''));}
 if(Array.isArray(expected))return Array.isArray(actual)&&expected.every(v=>actual.includes(v));
 if(typeof expected==='number')return Number(actual)===expected;
 return actual===expected;
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
for(const scenario of scenarios){
 const vault=scenario.vault===null?null:structuredClone(suite.fixture.vault);
 let timeline=scenario.timeline===null?null:fixtureTimeline?structuredClone(fixtureTimeline):null;
 const saved={vault,timeline};
 const deps={language:scenario.language,now:()=>now,vault:()=>saved.vault,saveVault:v=>{saved.vault=v;return true;},timeline:()=>saved.timeline,saveTimeline:t=>{saved.timeline=t;return true;},deductions:()=>[]};
 const context=groundingContext(saved.vault,saved.timeline,'/',now);
 const messages=[{role:'user',content:scenario.utterance}];
 const record={id:scenario.id,utterance:scenario.utterance,checks:{},toolCalls:[],toolStatus:null,reply:null,latencyMs:{}};
 try{
  // The free chat tier is bounded by tokens per minute; a refused call is retried after a pause rather than scored.
  const attempt=async run=>{for(let i=0;;i++){try{return await run();}catch(error){if(i>=3)throw error;await sleep(25000);}}};
  let t0=Date.now();
  const first=await attempt(()=>complete(config,validateCopilot({messages,context,language:scenario.language,consent:true}),now));
  record.latencyMs.first=Date.now()-t0;
  record.toolCalls=first.tool_calls.map(c=>({name:c.name,arguments:c.arguments}));
  const expected=scenario.expect;
  const chosen=first.tool_calls.find(c=>c.name===expected.tool)||first.tool_calls[0]||null;
  record.checks.tool=expected.tool===null?first.tool_calls.length===0:Boolean(chosen&&chosen.name===expected.tool);
  if(expected.tool&&chosen&&chosen.name===expected.tool){
   record.checks.args=Object.entries(expected.args||{}).every(([k,v])=>matchesArg(v,chosen.arguments[k]));
   record.argDiff=Object.entries(expected.args||{}).filter(([k,v])=>!matchesArg(v,chosen.arguments[k])).map(([k,v])=>({key:k,expected:v,actual:chosen.arguments[k]}));
  }
  let reply=first.reply;let round=first;const transcript=[...messages];
  for(let i=0;i<2&&round.tool_calls.length;i++){
   const toolMessages=round.tool_calls.map(call=>{const outcome=executeTool(call,deps);if(call===chosen||i>0)record.toolStatus=outcome.result.status??null;return {role:'tool',tool_call_id:call.id,name:call.name,content:toolResultContent(outcome.result)};});
   if(i===0&&expected.toolStatus)record.checks.toolStatus=expected.toolStatus.includes(record.toolStatus);
   transcript.push({role:'assistant',content:round.reply,tool_calls:round.tool_calls},...toolMessages);
   t0=Date.now();
   round=await attempt(()=>complete(config,validateCopilot({messages:transcript,context:groundingContext(saved.vault,saved.timeline,'/',now),language:scenario.language,consent:true}),now));
   record.latencyMs[i===0?'second':'third']=Date.now()-t0;
   reply=round.reply;
   if(round.tool_calls.length){record.retriedToolCalls=[...(record.retriedToolCalls||[]),...round.tool_calls.map(c=>({name:c.name,arguments:c.arguments}))];if(record.checks.toolStatus===false&&expected.toolStatus){/* a corrected call is scored by its final status below */}}
  }
  if(record.retriedToolCalls&&expected.toolStatus&&expected.toolStatus.includes(record.toolStatus))record.checks.toolStatus=true;
  record.reply=reply;
  const rules=expected.reply||{};
  if(reply){
   record.checks.language=rules.language==='hi'?devanagari.test(reply):!devanagari.test(reply);
   record.checks.length=sentences(reply)<=suite.replyRules.maxSentences;
   record.checks.clean=!suite.replyRules.forbidden.some(f=>reply.includes(f))&&!new RegExp(suite.fixture.identifiers).test(reply);
   if(rules.mustMatch)record.checks.mustMatch=new RegExp(rules.mustMatch,'i').test(reply);
   if(rules.mustNotMatch)record.checks.mustNotMatch=!new RegExp(rules.mustNotMatch,'i').test(reply);
  } else record.checks.replied=false;
 }catch(error){record.error=error instanceof Error?error.message:String(error);record.checks.completed=false;}
 record.pass=Object.values(record.checks).every(Boolean);
 results.push(record);
 const flags=Object.entries(record.checks).filter(([,v])=>!v).map(([k])=>k);
 console.log(`${record.pass?'PASS':'FAIL'}  ${scenario.id.padEnd(28)} ${record.toolCalls.map(c=>c.name).join('+')||'(no tool)'}${record.toolStatus?` → ${record.toolStatus}`:''}${flags.length?`  ✗ ${flags.join(', ')}`:''}${record.error?`  ! ${record.error}`:''}`);
 if(!record.pass&&record.reply)console.log(`      reply: ${record.reply}`);
 if(record.argDiff?.length)console.log(`      args: ${JSON.stringify(record.argDiff)}`);
 await sleep(Number(process.env.SAATHI_EVAL_PACE_MS||40000)); // two calls of ≈2,500 tokens per scenario against an 8,000 tokens-per-minute free tier
}
const passed=results.filter(r=>r.pass).length;
const avg=key=>{const v=results.map(r=>r.latencyMs[key]).filter(Number.isFinite);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null;};
const summary={ranAt:now.toISOString(),model:config.model,provider:new URL(config.endpoint).hostname,scenarios:results.length,passed,score:Number((passed/results.length).toFixed(3)),avgLatencyMs:{first:avg('first'),second:avg('second')},results};
writeFileSync(resolve(root,'qa/saathi-eval.json'),JSON.stringify(summary,null,1)+'\n');
console.log(`\n${passed}/${results.length} scenarios passed (${Math.round(summary.score*100)}%). Avg latency: tool round ${summary.avgLatencyMs.first} ms, answer round ${summary.avgLatencyMs.second} ms. Written to qa/saathi-eval.json`);
process.exitCode=passed===results.length?0:1;
