import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {TOOL_NAMES,executeTool,groundingContext,type ToolCall,type ToolName,type VoiceDeps} from '../src/lib/voice-agent.ts';
import {TOOLS,validateContext} from '../worker/voice.ts';
import {parseVault,type Vault} from '../src/lib/vault.ts';
import type {Timeline} from '../src/lib/types.ts';

// The scenario file drives the live-model harness (scripts/eval-saathi.mjs). This test keeps it honest
// without a provider: every scenario is well-formed, every expected tool exists in the Worker's schema,
// and every expected tool call actually runs on the fixture and produces one of the expected statuses.
type Scenario={id:string;language:'en'|'hi';utterance:string;vault?:null;timeline?:null;expect:{tool:ToolName|null;args?:Record<string,unknown>;toolStatus?:string[];reply?:{language:'en'|'hi';mustMatch?:string;mustNotMatch?:string}}};
const suite=JSON.parse(readFileSync(new NodeURL('./fixtures/saathi-evals.json',import.meta.url),'utf8')) as {fixture:{vault:unknown;timeline:Record<string,unknown>;identifiers:string};replyRules:{maxSentences:number;forbidden:string[]};scenarios:Scenario[]};
const NOW=new Date('2026-10-17T06:30:00Z');
const regexArg=(value:unknown)=>typeof value==='string'&&/^\/.*\/[a-z]*$/.test(value);
/** Expected arguments written as /regex/ or arrays are matching rules for the model's output; for the deterministic run they are replaced by a concrete value the rule accepts. */
const concrete=(scenario:Scenario):Record<string,unknown>=>{
 const args:Record<string,unknown>={...(scenario.expect.args||{})};
 if(regexArg(args.insurer))args.insurer='Star Health';
 if(scenario.id==='save-policy'){args.insurer='HDFC ERGO';args.plan='Optima Secure';}
 if(regexArg(args.lines))args.lines=[{description:'Gloves and syringes',amount:1800},{description:'Room rent difference',amount:12000}];
 return args;
};

test('every Saathi eval scenario is well-formed and names only tools the Worker exposes',()=>{
 assert.ok(suite.scenarios.length>=15);
 assert.equal(new Set(suite.scenarios.map(s=>s.id)).size,suite.scenarios.length,'ids are unique');
 const schemaTools=new Set(TOOLS.map(t=>t.function.name));
 for(const scenario of suite.scenarios){
  assert.ok(scenario.utterance.trim().length>5,scenario.id);
  assert.ok(['en','hi'].includes(scenario.language),scenario.id);
  if(scenario.expect.tool!==null){assert.ok(schemaTools.has(scenario.expect.tool),`${scenario.id}: ${scenario.expect.tool}`);assert.ok((TOOL_NAMES as readonly string[]).includes(scenario.expect.tool));}
  if(scenario.expect.reply?.mustMatch)new RegExp(scenario.expect.reply.mustMatch,'i');
  if(scenario.expect.reply?.mustNotMatch)new RegExp(scenario.expect.reply.mustNotMatch,'i');
  assert.ok(scenario.expect.reply?.language,`${scenario.id} declares the reply language`);
 }
 assert.ok(suite.replyRules.maxSentences>=2&&suite.replyRules.maxSentences<=4);
 const vault=parseVault(suite.fixture.vault);
 assert.doesNotThrow(()=>validateContext(groundingContext(vault,null,'/',NOW)),'the fixture context passes the Worker’s own validation');
 assert.doesNotMatch(JSON.stringify(groundingContext(vault,null,'/',NOW)),new RegExp(suite.fixture.identifiers));
});

test('every expected tool call in the harness runs on the fixture and yields one of the expected statuses',()=>{
 const vaultFixture=parseVault(suite.fixture.vault);
 const timelineFixture={...suite.fixture.timeline,submittedAt:new Date(NOW.getTime()-95*60000).toISOString()} as unknown as Timeline;
 for(const scenario of suite.scenarios){
  if(!scenario.expect.tool||!scenario.expect.toolStatus)continue;
  const saved:{vault:Vault|null;timeline:Timeline|null}={vault:scenario.vault===null?null:structuredClone(vaultFixture),timeline:scenario.timeline===null?null:structuredClone(timelineFixture)};
  const deps:VoiceDeps={language:scenario.language,now:()=>NOW,vault:()=>saved.vault,saveVault:v=>{saved.vault=v;return true;},timeline:()=>saved.timeline,saveTimeline:t=>{saved.timeline=t;return true;},deductions:()=>[]};
  const call:ToolCall={id:'eval',name:scenario.expect.tool,arguments:concrete(scenario)};
  const outcome=executeTool(call,deps);
  assert.ok(scenario.expect.toolStatus.includes(String(outcome.result.status)),`${scenario.id}: expected ${scenario.expect.toolStatus.join('|')}, got ${String(outcome.result.status)} ${JSON.stringify(outcome.result).slice(0,160)}`);
  assert.doesNotMatch(JSON.stringify(outcome.result),new RegExp(suite.fixture.identifiers),`${scenario.id}: the tool result carries no identifiers`);
 }
});
