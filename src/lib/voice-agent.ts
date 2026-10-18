// ClaimClock Voice (M22) — everything about the assistant that needs no browser API, so it can
// be tested exhaustively: turn-taking decisions, conversation bounds, the identifier-free
// grounding context, and the eight tools the model may call. Tools run here, on the user's own
// data; the model never receives names, policy numbers, UHIDs or letter bodies, and every figure
// a tool returns comes from a cited catalogue rule, a statutory rule or a number the user gave.
import contactsRaw from '../../data/contacts.json' with {type:'json'};
import rulesRaw from '../../data/rules.json' with {type:'json'};
import en from '../i18n/en.json' with {type:'json'};
import hi from '../i18n/hi.json' with {type:'json'};
import {cataloguePlans,familyAdvice,insurerName,planById,MAX_COMPARE,MAX_FAMILY,type CataloguePlan,type SourcedRule} from './plan-compare.ts';
import {copayEstimate,eligibleRoom,healthCheckup,prePostWindow,roomUpgradeImpact,validDate,waitingPeriods,type CheckupRule} from './coverage-simulator.ts';
import {classify,detectInsurerFromText,type DeductionInput} from './deductions.ts';
import {makeLetter} from './letters.ts';
import {detectRejectionCategory,makeRejectionLetter} from './rejection.ts';
import {makeReimbursementDeskLetter} from './toolkits.ts';
import {makeDeductionLetter} from './deduction-letter.ts';
import {identityFor,personalize} from './identity.ts';
import {clockState,windowMinutes} from './clock.ts';
import {makeBackup} from './backup.ts';
import {renewalSchedule,rule} from './renewal.ts';
import {claimTimeline,type ReimbursementClaim} from './reimbursement.ts';
import {RELATIONS,daysUntilRenewal,emptyVault,selectPolicy,type Member,type Policy,type Relation,type Vault} from './vault.ts';
import type {Contact,Language,Letter,LetterKind,Rule,Timeline,RequestType} from './types.ts';

const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const dictionaries:Record<Language,Record<string,string>>={en:en as Record<string,string>,hi:hi as Record<string,string>};
/** Explicit-language lookup so cards can be built (and tested) without the page's language state. */
export function text(language:Language,key:string,fields:Record<string,string|number>={}):string {
 const value=dictionaries[language][key]||dictionaries.en[key]||key;
 return value.replace(/\{(\w+)\}/g,(_,name)=>String(fields[name]??`[${name}]`));
}
const rupees=(n:number,language:Language)=>`₹${Math.round(n).toLocaleString(language==='hi'?'hi-IN':'en-IN')}`;
const localDate=(value:string,language:Language)=>new Date(`${value}T00:00:00Z`).toLocaleDateString(language==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});

// --- Voice activity: who is talking, and when a turn ends --------------------------------------------
export type VadOptions={startLevel:number;endLevel:number;silenceMs:number;minSpeechMs:number;maxUtteranceMs:number;bargeInMs:number;bargeInFactor:number;floorAlpha:number};
export const VAD_DEFAULTS:VadOptions={startLevel:0.02,endLevel:0.012,silenceMs:700,minSpeechMs:300,maxUtteranceMs:25000,bargeInMs:250,bargeInFactor:2.5,floorAlpha:0.05};
export type VadEvent='speech_start'|'speech_end'|'speech_discard'|'max_duration'|null;
/** Energy-based turn detection with an adaptive noise floor. While the assistant speaks, thresholds rise and an onset must be sustained so playback echo cannot interrupt the assistant. */
export class VoiceActivity {
 options:VadOptions;floor=0;inSpeech=false;speechStart=0;lastVoice=0;candidate:number|null=null;
 constructor(options:Partial<VadOptions>={}){this.options={...VAD_DEFAULTS,...options};}
 reset(){this.inSpeech=false;this.candidate=null;this.speechStart=0;this.lastVoice=0;}
 update(level:number,now:number,assistantSpeaking=false):VadEvent {
  const o=this.options;if(!Number.isFinite(level)||level<0)level=0;
  const factor=assistantSpeaking?o.bargeInFactor:1;
  const start=Math.max(o.startLevel,this.floor*3)*factor,end=Math.max(o.endLevel,this.floor*2)*factor;
  if(!this.inSpeech){
   if(level<=start){this.floor=this.floor===0?level:this.floor+(level-this.floor)*o.floorAlpha;this.candidate=null;return null;}
   if(this.candidate===null)this.candidate=now;
   if(now-this.candidate<(assistantSpeaking?o.bargeInMs:0))return null;
   this.inSpeech=true;this.speechStart=this.candidate;this.lastVoice=now;this.candidate=null;return 'speech_start';
  }
  if(level>=end)this.lastVoice=now;
  if(now-this.speechStart>=o.maxUtteranceMs){this.inSpeech=false;return 'max_duration';}
  if(now-this.lastVoice>=o.silenceMs){this.inSpeech=false;return this.lastVoice-this.speechStart>=o.minSpeechMs?'speech_end':'speech_discard';}
  return null;
 }
}
/** RMS of 8-bit time-domain analyser data, 0 (silence) to 1 (full scale). */
export function rmsLevel(samples:ArrayLike<number>):number {
 if(!samples.length)return 0;let sum=0;
 for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v;}
 return Math.sqrt(sum/samples.length);
}

// --- Spoken output -----------------------------------------------------------------------------------
export const voiceLang=(language:Language)=>language==='hi'?'hi-IN':'en-IN';
/** Sentence-sized chunks keep browser speech synthesis reliable and let barge-in cut in quickly. */
export function speechChunks(input:string,max=180):string[] {
 const sentences=input.replace(/\s+/g,' ').trim().split(/(?<=[.!?।])\s+/).filter(Boolean);
 const chunks:string[]=[];let current='';
 for(const sentence of sentences){
  const parts=sentence.length>max?sentence.split(/(?<=[,;:])\s+/):[sentence];
  for(const part of parts){
   if(part.length>max){if(current)chunks.push(current);current='';for(let i=0;i<part.length;i+=max)chunks.push(part.slice(i,i+max));continue;}
   if((current+' '+part).trim().length>max){chunks.push(current);current=part;}else current=(current+' '+part).trim();
  }
 }
 if(current)chunks.push(current);return chunks;
}
export type VoiceLike={lang:string;name:string;localService?:boolean;default?:boolean};
const NATURAL=/natural|neural|premium|enhanced|wavenet|siri|^google|^microsoft .* online/i;
const COMPACT=/^(rishi|veena|lekha|tessa|moira|fiona)$|compact/i;
/** Voice quality decides more than locale: a natural en-GB voice beats the robotic compact "Rishi" that ships with Apple devices. Scores: same language first, then quality tier, then an exact Indian locale. */
export function voiceScore(voice:VoiceLike,language:Language):number {
 const wanted=voiceLang(language).toLowerCase(),prefix=language==='hi'?'hi':'en';
 const lang=voice.lang.toLowerCase().replace('_','-'),name=voice.name.trim();
 if(!(lang===wanted||lang.startsWith(prefix+'-')||lang===prefix))return -1;
 let score=lang===wanted?60:30;
 if(NATURAL.test(name))score+=50;else if(COMPACT.test(name))score-=30;else score+=20;
 if(voice.localService)score+=5;if(voice.default)score+=1;
 return score;
}
export function pickVoice<T extends VoiceLike>(voices:T[],language:Language):T|undefined {
 return voices.map(v=>({v,s:voiceScore(v,language)})).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s)[0]?.v;
}

// --- Conversation bounds ------------------------------------------------------------------------------
export const TOOL_NAMES=['check_policy_benefit','recommend_or_compare_plans','manage_claim_clock','audit_bill_deductions','draft_and_queue_action','save_user_policy','check_renewal','track_reimbursement'] as const;
export type ToolName=typeof TOOL_NAMES[number];
export type ToolCall={id:string;name:ToolName;arguments:Record<string,unknown>};
export type ChatMessage={role:'user';content:string}|{role:'assistant';content:string|null;tool_calls?:ToolCall[]}|{role:'tool';tool_call_id:string;name:ToolName;content:string};
export const HISTORY_LIMITS={maxMessages:16,maxChars:9000,maxMessageChars:1500} as const;
const messageChars=(m:ChatMessage)=>(m.content?.length??0)+(m.role==='assistant'?(m.tool_calls||[]).reduce((n,c)=>n+JSON.stringify(c.arguments).length,0):0);
/** Keeps whole turns (a user message with everything that answered it) from the most recent backwards, within the Worker's envelope limits. */
export function trimHistory(messages:ChatMessage[],limits=HISTORY_LIMITS):ChatMessage[] {
 const bounded=messages.map(m=>m.content&&m.content.length>limits.maxMessageChars?{...m,content:m.content.slice(0,limits.maxMessageChars)}:m) as ChatMessage[];
 const groups:ChatMessage[][]=[];
 for(const m of bounded){if(m.role==='user'||!groups.length)groups.push([m]);else groups[groups.length-1].push(m);}
 const kept:ChatMessage[][]=[];let count=0,chars=0;
 for(let i=groups.length-1;i>=0;i--){
  const size=groups[i].length,length=groups[i].reduce((n,m)=>n+messageChars(m),0);
  if(kept.length&&(count+size>limits.maxMessages||chars+length>limits.maxChars))break;
  kept.unshift(groups[i]);count+=size;chars+=length;
 }
 return kept.flat();
}
/** Tool results are compact by design; this is the last line of defence for the Worker's per-message cap. */
export function toolResultContent(result:Record<string,unknown>,max=HISTORY_LIMITS.maxMessageChars):string {
 const full=JSON.stringify(result);if(full.length<=max)return full;
 const reduced:Record<string,unknown>={};
 for(const [key,value] of Object.entries(result))reduced[key]=Array.isArray(value)?value.slice(0,3):typeof value==='string'?value.slice(0,200):value;
 const shorter=JSON.stringify({...reduced,truncated:true});
 return shorter.length<=max?shorter:JSON.stringify({status:result.status??'ok',truncated:true});
}

// --- Grounding context: structure only ---------------------------------------------------------------
export const CONTEXT_PAGES=['/','/deductions/','/rejected/','/death/','/index/','/vault/','/check-coverage/','/compare/','/privacy/','/about/','/methodology/'] as const;
export type CopilotContext={page:string;members:{id:string;relation:Relation;age?:number;conditions?:boolean}[];policies:Record<string,unknown>[];clock:Record<string,unknown>|null};
export function groundingContext(vault:Vault|null,timeline:Timeline|null,pathname:string,now=new Date()):CopilotContext {
 const page=(CONTEXT_PAGES as readonly string[]).includes(pathname)?pathname:'other';
 const members=(vault?.members||[]).slice(0,20).map(m=>({id:m.id,relation:m.relation,age:m.birthYear?Math.max(0,Math.min(120,now.getUTCFullYear()-m.birthYear)):undefined,conditions:m.conditions?.trim()?true:undefined}));
 const relation=(id:string)=>vault?.members.find(m=>m.id===id)?.relation;
 const policies=(vault?.policies||[]).slice().sort((a,b)=>Number(b.id===vault?.defaultPolicyId)-Number(a.id===vault?.defaultPolicyId)).slice(0,6).map(p=>({
  id:p.id,kind:p.kind,insurer:p.insurerId==='unlisted'?'Unlisted insurer':insurerName(p.insurerId,'en'),plan:p.planName||planById(p.planId||'')?.name,planId:p.planId,
  sumInsured:p.sumInsured,inceptionDate:p.inceptionDate,continuityFrom:p.continuityFrom,renewalDate:p.renewalDate,members:p.memberIds.map(relation).filter((r):r is Relation=>Boolean(r)),
  corporate:p.corporate,roomRent:p.roomRent?.slice(0,120),copayPercent:p.copayPercent,consumables:p.consumables,healthCheckupLimit:p.healthCheckupLimit,default:p.id===vault?.defaultPolicyId||undefined,
 }));
 let clock:Record<string,unknown>|null=null;
 if(timeline){const state=clockState(timeline,now.getTime());clock={insurer:timeline.insurerId==='unlisted'?'Unlisted insurer':insurerName(timeline.insurerId,'en'),requestType:timeline.requestType,submittedAt:timeline.submittedAt,stage:state.stage,elapsedMinutes:Math.floor(state.elapsed/60000),outcome:timeline.outcome};}
 return JSON.parse(JSON.stringify({page,members,policies,clock})) as CopilotContext;
}

// --- Tools -------------------------------------------------------------------------------------------
export type CardKind='benefit'|'compare'|'clock'|'deductions'|'letter'|'policy'|'renewal'|'notice';
export type Card={kind:CardKind;title:string;lines:string[];link?:{href:string;label:string};source?:{url:string;verifiedOn:string};letter?:{letter:Letter;recipient:string}};
export type ToolOutcome={result:Record<string,unknown>;card:Card|null};
export type VoiceDeps={language:Language;now?:()=>Date;vault:()=>Vault|null;saveVault:(vault:Vault)=>boolean;timeline:()=>Timeline|null;saveTimeline:(timeline:Timeline,expected:Timeline|null)=>boolean;deductions:()=>DeductionInput[];/** Reimbursement claims saved on this device (M26); optional so older callers keep working. */claims?:()=>ReimbursementClaim[]};
class ArgumentError extends Error{field:string;constructor(field:string){super(`Invalid argument: ${field}`);this.field=field;}}
type Args=Record<string,unknown>;
const argString=(args:Args,key:string,max:number):string|undefined=>{const v=args[key];if(v===undefined||v===null||v==='')return undefined;if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new ArgumentError(key);return v.trim();};
const argNumber=(args:Args,key:string,min:number,max:number,integer=false):number|undefined=>{const v=args[key];if(v===undefined||v===null)return undefined;const n=typeof v==='string'&&v.trim()!==''?Number(v):v;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new ArgumentError(key);return n;};
const argEnum=<T extends string>(args:Args,key:string,options:readonly T[]):T|undefined=>{const v=args[key];if(v===undefined||v===null||v==='')return undefined;if(typeof v!=='string'||!options.includes(v as T))throw new ArgumentError(key);return v as T;};
const argDate=(args:Args,key:string):string|undefined=>{const v=argString(args,key,10);if(v!==undefined&&!validDate(v))throw new ArgumentError(key);return v;};
const argBool=(args:Args,key:string):boolean|undefined=>{const v=args[key];if(v===undefined||v===null)return undefined;if(typeof v!=='boolean')throw new ArgumentError(key);return v;};
const argList=(args:Args,key:string,max:number):unknown[]|undefined=>{const v=args[key];if(v===undefined||v===null)return undefined;if(!Array.isArray(v)||v.length>max)throw new ArgumentError(key);return v;};
/** Spoken time: "now", a local YYYY-MM-DDTHH:mm, or any parseable instant, within the last year and not in the future. */
export function parseSpokenTime(value:string|undefined,now:Date):string {
 if(value===undefined||/^now$/i.test(value))return now.toISOString();
 const ms=Date.parse(value);if(!Number.isFinite(ms)||ms>now.getTime()+30_000||ms<now.getTime()-365*86400000)throw new ArgumentError('time');
 return new Date(ms).toISOString();
}
const insurers=contacts.filter(c=>c.kind==='insurer');
const GENERIC=new Set(['general','health','insurance','company','limited','co','ltd','the','and','allied','india','assurance','insurer','policy','plan','mera','meri','my','ka','ki','से','का','की','बीमा','इंश्योरेंस','हेल्थ','जनरल']);
const haystack=(c:Contact)=>[c.name,...(c.aliases||[]),c.name_hi||''].join(' | ').toLowerCase();
/** Resolves a spoken insurer: an id, the catalogue detector, or every distinctive spoken word appearing in one insurer's name or alias ("Star", "New India", "Max Bupa"). Ambiguity is reported, never guessed. */
export function resolveInsurer(spoken:string|undefined):{id:string|null;candidates:string[]} {
 if(!spoken)return {id:null,candidates:[]};
 const value=spoken.trim();if(!value)return {id:null,candidates:[]};
 if(/^(unlisted|other|not listed)$/i.test(value))return {id:'unlisted',candidates:[]};
 if(insurers.some(c=>c.id===value))return {id:value,candidates:[]};
 const detected=detectInsurerFromText(value,insurers);if(detected)return {id:detected,candidates:[]};
 const tokens=value.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g,' ').split(' ').filter(t=>t.length>=3&&!GENERIC.has(t));
 if(!tokens.length)return {id:null,candidates:[]};
 const all=insurers.filter(c=>{const hay=haystack(c);return tokens.every(t=>hay.includes(t));});
 if(all.length===1)return {id:all[0].id,candidates:[]};
 const first=insurers.filter(c=>haystack(c).includes(tokens[0]));
 if(!all.length&&first.length===1)return {id:first[0].id,candidates:[]};
 return {id:null,candidates:[...new Set([...all,...first].map(c=>c.name))].slice(0,5)};
}
export function resolvePlan(spoken:string|undefined,insurerId:string):CataloguePlan|undefined {
 if(!spoken)return undefined;const lower=spoken.toLowerCase();
 const candidates=cataloguePlans.filter(p=>p.insurer_id===insurerId);
 const exact=candidates.find(p=>lower.includes(p.name.toLowerCase())||p.name.toLowerCase().includes(lower));if(exact)return exact;
 const words=lower.replace(/[^a-z0-9:]+/g,' ').split(' ').filter(w=>w.length>=4&&!['plan','policy','insurance','health','the'].includes(w));
 const scored=candidates.map(p=>({p,hits:words.filter(w=>p.name.toLowerCase().includes(w)).length})).filter(x=>x.hits>0).sort((a,b)=>b.hits-a.hits);
 return scored.length&&(scored.length===1||scored[0].hits>scored[1].hits)?scored[0].p:undefined;
}
const sourceOf=(rule:SourcedRule|null|undefined)=>rule?{url:rule.source_url,verifiedOn:rule.verified_on}:undefined;
const ruleSource=(id:string)=>{const r=rules.find(x=>x.id===id);return r?{url:r.source_url,verifiedOn:String(r.verified_on||'')}:undefined;};
function policyFor(deps:VoiceDeps,relation?:Relation):{vault:Vault|null;policy:Policy|null;member:Member|null} {
 const vault=deps.vault();if(!vault)return {vault:null,policy:null,member:null};
 let member:Member|null=null;
 if(relation){member=vault.members.find(m=>m.relation===relation)||null;
  if(member){const covering=vault.policies.filter(p=>p.kind==='health'&&p.memberIds.includes(member!.id));const policy=covering.find(p=>p.id===vault.defaultPolicyId)||covering[0]||null;if(policy)return {vault,policy,member};}}
 return {vault,policy:selectPolicy(vault)||vault.policies.find(p=>p.kind==='health')||null,member};
}
const notice=(language:Language,title:string,lines:string[],link?:Card['link']):Card=>({kind:'notice',title,lines,link});
const QUESTIONS:Record<string,string>={needs_entry_age:'How old was this member when they joined the policy? The co-payment depends on the age at entry.',needs_claim_free_year:'Was any claim made in the previous policy year?',needs_sum_insured:'What is the sum insured?',needs_eligible_rate:'What does the hospital charge per day for the eligible room category?',needs_dates:'When did the policy start (and the continuous-cover date, if ported)?',unknown_timing:'When did the policy start?',needs_rule:'What does the policy say about room rent?'};
/** English status text and, where the status needs more from the user, the one question to ask — so the model relays the status rather than interpreting a code. */
const explain=(status:string,key:string)=>({statusText:text('en',`${key}.${status}`),...(QUESTIONS[status]?{question:QUESTIONS[status]}:{})});
const noPolicyOutcome=(language:Language):ToolOutcome=>({result:{status:'no_policy',next:'Add a policy in My Vault (/vault/) or state the plan and sum insured.'},card:notice(language,text(language,'voice.card.noPolicy'),[text(language,'voice.card.noPolicyBody')],{href:'/vault/',label:text(language,'nav.vault')})});

function checkPolicyBenefit(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language,now=deps.now?.()||new Date();
 const topic=argEnum(args,'topic',['health_checkup','room_rent','waiting_period','copay','pre_post_hospitalisation','sub_limits','consumables','general'] as const);
 if(!topic)throw new ArgumentError('topic');
 const relation=argEnum(args,'member',RELATIONS);
 const {vault,policy,member}=policyFor(deps,relation);
 if(!vault||!policy)return noPolicyOutcome(language);
 const plan=policy.planId?planById(policy.planId):undefined;
 const sumInsured=argNumber(args,'sumInsured',1,1e9)??policy.sumInsured??null;
 const base={insurer:policy.insurerId==='unlisted'?'Unlisted insurer':insurerName(policy.insurerId,'en'),plan:plan?.name||policy.planName,member:relation,verified:Boolean(plan)};
 const link={href:'/check-coverage/',label:text(language,'voice.card.openCoverage')};
 const lines:string[]=[];
 switch(topic){
  case 'health_checkup':{
   const rule:CheckupRule|null=plan?.rules.health_checkup??(policy.healthCheckupLimit?{mode:'unknown',eligibility:{from:'policy_year'},limit:{type:'fixed',amount:policy.healthCheckupLimit}}:null);
   const r=healthCheckup({rule,sumInsured,floater:policy.memberIds.length>1,inceptionDate:policy.inceptionDate,lastClaimedOn:policy.healthCheckupLastClaimedOn,claimFreePreviousYear:argBool(args,'claimFreePreviousYear'),memberAge:member?.birthYear?now.getUTCFullYear()-member.birthYear:null,now});
   lines.push(text(language,`coverage.checkup.${r.status}`));if(r.amount!==null)lines.push(`${text(language,'voice.card.amount')}: ${rupees(r.amount,language)}`);
   if(r.amountBasis)lines.push(text(language,`coverage.checkupBasis.${r.amountBasis}`));if(r.mode&&r.mode!=='unknown')lines.push(text(language,`coverage.checkupMode.${r.mode}`));
   if(r.nextEligibleOn)lines.push(`${text(language,'voice.card.nextEligible')}: ${localDate(r.nextEligibleOn,language)}`);for(const n of r.notes)lines.push(text(language,`coverage.note.${n}`));
   return {result:{...base,topic,status:r.status,...explain(r.status,'coverage.checkup'),amount:r.amount,amountBasis:r.amountBasis,mode:r.mode,nextEligibleOn:r.nextEligibleOn,policyYear:r.policyYear?.index??null,notes:r.notes,source:sourceOf(plan?.rules.health_checkup)},card:{kind:'benefit',title:text(language,'coverage.checkupTitle'),lines,link,source:sourceOf(plan?.rules.health_checkup)}};
  }
  case 'room_rent':{
   const rule=plan?.rules.room_rent??null;
   if(!rule){if(policy.roomRent){lines.push(`${text(language,'vault.roomRent')}: ${policy.roomRent}`);return {result:{...base,topic,status:'from_your_vault',roomRent:policy.roomRent},card:{kind:'benefit',title:text(language,'coverage.roomTitle'),lines,link}};}
    return {result:{...base,topic,status:'unknown_rule'},card:{kind:'benefit',title:text(language,'coverage.roomTitle'),lines:[text(language,'coverage.room.needs_rule')],link}};}
   const chosen=argNumber(args,'chosenRoomRent',1,1e7);
   if(chosen===undefined){const e=eligibleRoom(rule,sumInsured);lines.push(e.perDay!==null?text(language,'coverage.roomEligible',{amount:rupees(e.perDay,language)}):e.needsSumInsured?text(language,'coverage.room.needs_sum_insured'):`${text(language,'compare.row.room_rent')}: ${String((rule as SourcedRule).value??e.category)}`);
    return {result:{...base,topic,status:'eligible_room',category:e.category,eligiblePerDay:e.perDay,ruleText:String((rule as SourcedRule).value??''),source:sourceOf(rule)},card:{kind:'benefit',title:text(language,'coverage.roomTitle'),lines,link,source:sourceOf(rule)}};}
   const r=roomUpgradeImpact({rule,sumInsured,chosenRoomRent:chosen,hospitalEligibleRate:argNumber(args,'hospitalEligibleRate',1,1e7),days:argNumber(args,'days',1,365,true)??1,associatedExpenses:argNumber(args,'associatedExpenses',0,1e9)??0});
   lines.push(text(language,`coverage.room.${r.status}`));if(r.eligiblePerDay!==null)lines.push(text(language,'coverage.roomEligible',{amount:rupees(r.eligiblePerDay,language)}));
   if(r.status==='impact'){lines.push(text(language,'coverage.roomDifference',{amount:rupees(r.roomDifference,language)}));if(r.associatedDeduction)lines.push(text(language,'coverage.roomAssociated',{amount:rupees(r.associatedDeduction,language),percent:Math.round((1-(r.proportion||0))*100)}));lines.push(`${text(language,'voice.card.total')}: ${rupees(r.totalImpact||0,language)}`);for(const n of r.notes)lines.push(text(language,`coverage.note.${n}`));}
   return {result:{...base,topic,status:r.status,...explain(r.status,'coverage.room'),eligiblePerDay:r.eligiblePerDay,roomDifference:r.roomDifference,associatedDeduction:r.associatedDeduction,totalImpact:r.totalImpact,notes:r.status==='impact'?r.notes:[],source:sourceOf(rule)},card:{kind:'benefit',title:text(language,'coverage.roomTitle'),lines,link,source:sourceOf(rule)}};
  }
  case 'waiting_period':{
   const r=waitingPeriods({inceptionDate:policy.inceptionDate,continuityFrom:policy.continuityFrom,pedMonths:plan?.rules.ped_waiting_months?.value??null,specificMonths:plan?.rules.specific_waiting_months?.value??null,initialDays:plan?.rules.initial_waiting_days?.value??null,now});
   const period=(label:string,p:{required:number;done:boolean;remaining:number;endsOn:string}|null,unit:'months'|'days')=>{if(p)lines.push(`${label}: ${p.done?text(language,'voice.card.completed',{date:localDate(p.endsOn,language)}):text(language,`voice.card.remaining_${unit}`,{n:p.remaining,date:localDate(p.endsOn,language)})}`);};
   if(r.status!=='ok')lines.push(text(language,`coverage.waiting.${r.status}`));
   else{lines.push(text(language,'coverage.waitingServed',{months:r.servedMonths??0,date:localDate(r.from!,language)}));period(text(language,'compare.row.initial_waiting_days'),r.initial,'days');period(text(language,'compare.row.specific_waiting_months'),r.specific,'months');period(text(language,'compare.row.ped_waiting_months'),r.ped,'months');period(text(language,'voice.card.moratorium'),r.moratorium,'months');}
   const compact=(p:{required:number;done:boolean;remaining:number;endsOn:string}|null)=>p?{required:p.required,done:p.done,remaining:p.remaining,endsOn:p.endsOn}:null;
   return {result:{...base,topic,status:r.status,...(r.status==='ok'?{}:explain(r.status,'coverage.waiting')),from:r.from,servedMonths:r.servedMonths,initial:compact(r.initial),specific:compact(r.specific),ped:compact(r.ped),moratorium60Months:compact(r.moratorium),moratoriumSource:ruleSource('moratorium-60-months'),notes:r.status==='ok'?r.notes:[],source:sourceOf(plan?.rules.ped_waiting_months)},card:{kind:'benefit',title:text(language,'coverage.waitingTitle'),lines,link,source:sourceOf(plan?.rules.ped_waiting_months)||ruleSource('moratorium-60-months')}};
  }
  case 'copay':{
   const rule=plan?.rules.copay??(policy.copayPercent!==undefined?{percent:policy.copayPercent}:null);
   const r=copayEstimate(rule,argNumber(args,'admissibleAmount',0,1e9),argNumber(args,'entryAge',0,120,true)??(member?.birthYear&&policy.inceptionDate?Number(policy.inceptionDate.slice(0,4))-member.birthYear:undefined));
   lines.push(text(language,'coverage.copayPercent',{percent:r.percent}),text(language,`coverage.copayReason.${r.reason}`));if(r.amount!==null)lines.push(`${text(language,'voice.card.amount')}: ${rupees(r.amount,language)}`);for(const n of r.notes)lines.push(text(language,`coverage.note.${n}`));
   const needsAge=r.notes.includes('copay_depends_on_entry_age');
   const status=needsAge?'needs_entry_age':rule?'known':'unknown_rule';
   return {result:{...base,topic,status,...(needsAge?{statusText:text('en','coverage.note.copay_depends_on_entry_age'),question:QUESTIONS.needs_entry_age,percent:null,amount:null}:{percent:r.percent,amount:r.amount}),reason:r.reason,notes:r.notes,source:sourceOf(plan?.rules.copay)},card:{kind:'benefit',title:text(language,'coverage.copayTitle'),lines,link,source:sourceOf(plan?.rules.copay)}};
  }
  case 'pre_post_hospitalisation':{
   const rule=plan?.rules.pre_post_hospitalisation??null;
   const admission=argDate(args,'admissionDate'),discharge=argDate(args,'dischargeDate'),expense=argDate(args,'expenseDate');
   if(!admission||!discharge||!expense){lines.push(rule?`${text(language,'compare.row.pre_post_hospitalisation')}: ${rule.pre_days??'?'} / ${rule.post_days??((language==='hi'?rule.note_hi||rule.note:rule.note)||'?')}`:text(language,'coverage.prepost.unknown_pre'));
    return {result:{...base,topic,status:'needs_dates',preDays:rule?.pre_days??null,postDays:rule?.post_days??null,note:rule?.note,source:sourceOf(rule)},card:{kind:'benefit',title:text(language,'compare.row.pre_post_hospitalisation'),lines,link,source:sourceOf(rule)}};}
   const r=prePostWindow({rule,admissionDate:admission,dischargeDate:discharge,expenseDate:expense});
   lines.push(text(language,`coverage.prepost.${r.position}`));if(r.position!=='invalid')for(const n of r.notes)lines.push(text(language,`coverage.note.${n}`));
   return {result:{...base,topic,status:r.position,...explain(r.position,'coverage.prepost'),daysBeforeAdmission:r.daysBeforeAdmission,daysAfterDischarge:r.daysAfterDischarge,preWindowStart:r.preWindowStart,postWindowEnd:r.postWindowEnd,source:sourceOf(rule)},card:{kind:'benefit',title:text(language,'compare.row.pre_post_hospitalisation'),lines,link,source:sourceOf(rule)}};
  }
  case 'sub_limits':{
   const rule=plan?.rules.sub_limits??null,treatment=argString(args,'treatment',120)?.toLowerCase();
   const items=(rule?.items||[]).filter(i=>!treatment||i.treatment.toLowerCase().includes(treatment)||treatment.split(/\s+/).some(w=>w.length>=4&&i.treatment.toLowerCase().includes(w)));
   const status=!plan?'no_catalogue_plan':!rule?'not_verified':rule.items.length===0?'none_stated':items.length?'listed':'not_listed';
   lines.push(status==='listed'?`${text(language,'compare.row.sub_limits')}:`:text(language,`voice.card.subLimits_${status}`));for(const i of items.slice(0,8))lines.push(`${i.treatment}: ${i.limit}`);
   return {result:{...base,topic,status,items:items.slice(0,8),source:sourceOf(rule)},card:{kind:'benefit',title:text(language,'coverage.sublimitsTitle'),lines,link,source:sourceOf(rule)}};
  }
  case 'consumables':{
   const rule=plan?.rules.consumables??null;
   const value=rule?.value??policy.consumables;
   lines.push(value?`${text(language,'compare.row.consumables')}: ${text(language,`vault.consumables.${value}`)}${rule?.detail?` — ${language==='hi'?rule.detail_hi||rule.detail:rule.detail}`:''}`:text(language,'vault.ruleUnknown'));
   return {result:{...base,topic,status:rule?'known':value?'from_your_vault':'unknown_rule',consumables:value??null,detail:rule?.detail,source:sourceOf(rule)},card:{kind:'benefit',title:text(language,'compare.row.consumables'),lines,link,source:sourceOf(rule)}};
  }
  default:{
   const summary:Record<string,unknown>={};
   if(plan)for(const [key,rule] of Object.entries(plan.rules))summary[key]=rule?String((rule as SourcedRule).value??(('items' in rule)?`${(rule as {items:unknown[]}).items.length} items`:'see rule')).slice(0,120):'not verified';
   else Object.assign(summary,{roomRent:policy.roomRent,copayPercent:policy.copayPercent,consumables:policy.consumables,healthCheckupLimit:policy.healthCheckupLimit});
   for(const [key,value] of Object.entries(summary))if(value!==undefined)lines.push(`${text(language,plan?`compare.row.${key}`:`vault.${key}`)}: ${String(value)}`);
   return {result:{...base,topic,status:plan?'rules':'from_your_vault',rules:summary,sumInsured,inceptionDate:policy.inceptionDate,continuityFrom:policy.continuityFrom},card:{kind:'benefit',title:text(language,'voice.card.planRules'),lines,link}};
  }
 }
}
function recommendOrCompare(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language;
 const ids=[...new Set((argList(args,'compareIds',MAX_COMPARE+5)||[]).map(v=>{if(typeof v!=='string')throw new ArgumentError('compareIds');return v;}))].filter(id=>planById(id)).slice(0,MAX_COMPARE);
 const family=(argList(args,'familyMembers',MAX_FAMILY)||[]).map(v=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new ArgumentError('familyMembers');const row=v as Args;const age=argNumber(row,'age',0,120,true);const preExisting=argBool(row,'preExisting')??false;if(age===undefined)throw new ArgumentError('familyMembers');return {age,preExisting};});
 if(!ids.length&&!family.length)return {result:{status:'needs_input',catalogue:cataloguePlans.map(p=>({id:p.id,name:p.name,insurer:insurerName(p.insurer_id,'en')}))},card:notice(language,text(language,'compare.title'),[text(language,'voice.card.compareNeedsInput')],{href:'/compare/',label:text(language,'footer.compare')})};
 const value=(rule:SourcedRule|null|undefined)=>rule?String(rule.value??'').slice(0,120):'not verified';
 const plans=ids.map(planById).filter((p):p is CataloguePlan=>Boolean(p)).map(p=>({id:p.id,name:p.name,insurer:insurerName(p.insurer_id,'en'),roomRent:value(p.rules.room_rent),copay:value(p.rules.copay),pedWaitMonths:p.rules.ped_waiting_months?.value??null,specificWaitMonths:p.rules.specific_waiting_months?.value??null,initialWaitDays:p.rules.initial_waiting_days?.value??null,consumables:p.rules.consumables?.value??null,healthCheckup:value(p.rules.health_checkup),prePostDays:p.rules.pre_post_hospitalisation?[p.rules.pre_post_hospitalisation.pre_days,p.rules.pre_post_hospitalisation.post_days]:null}));
 const advice=familyAdvice(family);
 const lines=[...plans.map(p=>`${p.insurer} — ${p.name}: ${text(language,'compare.row.ped_waiting_months')} ${p.pedWaitMonths??'?'}, ${text(language,'compare.row.copay')} ${p.copay}`),...advice.map(a=>text(language,a.key,a.fields||{}))];
 const href=`/compare/?plans=${ids.join(',')}`;
 return {result:{status:'compared',plans,advice:advice.map(a=>text('en',a.key,a.fields||{})),compareUrl:ids.length?href:'/compare/',note:'No premiums or recommendation; structural advice only.'},card:{kind:'compare',title:text(language,'compare.title'),lines,link:{href:ids.length?href:'/compare/',label:text(language,'voice.card.openCompare')}}};
}
function manageClaimClock(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language,now=deps.now?.()||new Date();
 const action=argEnum(args,'action',['start','log_event','record_decision'] as const);if(!action)throw new ArgumentError('action');
 const link={href:'/',label:text(language,'voice.card.openClock')};
 const current=deps.timeline();
 if(action==='start'){
  const requestType=argEnum(args,'requestType',['preauth','enhancement','discharge'] as const);
  if(!requestType)return {result:{status:'needs_request_type',options:['preauth','enhancement','discharge']},card:null};
  const spoken=argString(args,'insurer',120);const resolved=resolveInsurer(spoken);
  const insurerId=resolved.id||(spoken?null:selectPolicy(deps.vault())?.insurerId||null);
  if(!insurerId)return {result:{status:'needs_insurer',candidates:resolved.candidates},card:null};
  const submittedAt=parseSpokenTime(argString(args,'submittedAt',40),now);
  const candidate:Timeline={id:crypto.randomUUID(),insurerId,hospital:argString(args,'hospital',120)||'',city:argString(args,'city',70)||'',requestType:requestType as RequestType,submittedAt,events:[]};
  makeBackup(candidate);
  if(!deps.saveTimeline(candidate,null))return {result:{status:'storage_failed'},card:notice(language,text(language,'voice.card.clockTitle'),[text(language,'error.storage')],link)};
  const minutes=windowMinutes(candidate.requestType);
  const lines=[`${text(language,'label.insurer')}: ${insurerId==='unlisted'?text(language,'label.unlisted'):insurerName(insurerId,language)}`,`${text(language,'label.type')}: ${text(language,`type.${requestType}`)}`,`${text(language,'optin.submittedAt')}: ${new Date(submittedAt).toLocaleString(language==='hi'?'hi-IN':'en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}`];
  if(minutes)lines.push(text(language,'voice.card.window',{hours:minutes/60}));
  return {result:{status:'started',insurer:insurerId,requestType,submittedAt,windowMinutes:minutes,hospitalRecorded:Boolean(candidate.hospital),ruleSource:ruleSource(requestType==='preauth'?'cashless-preauth':'cashless-discharge')},card:{kind:'clock',title:text(language,'voice.card.clockStarted'),lines,link,source:ruleSource(requestType==='preauth'?'cashless-preauth':requestType==='discharge'?'cashless-discharge':'')}};
 }
 if(!current)return {result:{status:'no_clock',next:'Start the clock first (action start) with insurer and request type.'},card:notice(language,text(language,'voice.card.clockTitle'),[text(language,'voice.card.noClock')],link)};
 if(action==='log_event'){
  const type=argEnum(args,'eventType',['query','documents','call','ack','other'] as const)||'other';
  const at=parseSpokenTime(argString(args,'eventAt',40),now);
  if(Date.parse(at)<Date.parse(current.submittedAt))throw new ArgumentError('eventAt');
  if(current.events.length>=500)return {result:{status:'too_many_events'},card:null};
  const candidate:Timeline={...current,events:[...current.events,{id:crypto.randomUUID(),at,type,note:argString(args,'note',300)||''}]};
  if(!deps.saveTimeline(candidate,current))return {result:{status:'storage_failed'},card:notice(language,text(language,'voice.card.clockTitle'),[text(language,'error.storage')],link)};
  return {result:{status:'logged',eventType:type,at,events:candidate.events.length},card:{kind:'clock',title:text(language,'voice.card.eventLogged'),lines:[`${text(language,`timeline.${type}`)} · ${new Date(at).toLocaleTimeString(language==='hi'?'hi-IN':'en-IN',{timeZone:'Asia/Kolkata',timeStyle:'short'})}`],link}};
 }
 const outcome=argEnum(args,'outcome',['approved','partial','rejected'] as const);
 if(!outcome)return {result:{status:'needs_outcome',options:['approved','partial','rejected']},card:null};
 if(current.decidedAt)return {result:{status:'already_decided',outcome:current.outcome,decidedAt:current.decidedAt},card:null};
 const decidedAt=parseSpokenTime(argString(args,'decidedAt',40),now);
 if(Date.parse(decidedAt)<Date.parse(current.submittedAt))throw new ArgumentError('decidedAt');
 const candidate:Timeline={...current,decidedAt,outcome};
 if(!deps.saveTimeline(candidate,current))return {result:{status:'storage_failed'},card:notice(language,text(language,'voice.card.clockTitle'),[text(language,'error.storage')],link)};
 const state=clockState(candidate,now.getTime());
 const nextHref=outcome==='rejected'?'/rejected/':outcome==='partial'?'/deductions/':'/';
 return {result:{status:'decided',outcome,decidedAt,elapsedMinutes:Math.floor(state.elapsed/60000),beyondWindow:state.stage==='decided'&&state.minutes!==null&&state.elapsed>state.minutes*60000,next:nextHref},card:{kind:'clock',title:text(language,'finished.title'),lines:[text(language,`finished.${outcome}`)],link:{href:nextHref,label:text(language,outcome==='rejected'?'finished.nextRejected':outcome==='partial'?'finished.nextPartial':'voice.card.openClock')}}};
}
function auditBillDeductions(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language;
 const rows=argList(args,'lines',40);if(!rows||!rows.length)throw new ArgumentError('lines');
 const inputs:DeductionInput[]=rows.map((v,i)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new ArgumentError('lines');const row=v as Args;const description=argString(row,'description',200);const amount=argNumber(row,'amount',0,1e8);if(!description||amount===undefined)throw new ArgumentError(`lines[${i}]`);return {id:`voice-${i}`,description,amount};});
 const results=inputs.map(classify);
 const count=(status:string)=>results.filter(r=>r.status===status).length;
 const lines=results.slice(0,12).map(r=>`${r.description.slice(0,60)} — ${rupees(r.amount,language)} — ${text(language,`deductions.verdict.${r.status}`)}`);
 if(results.length>12)lines.push(text(language,'voice.card.moreLines',{n:results.length-12}));
 return {result:{status:'classified',total:results.reduce((s,r)=>s+r.amount,0),challengeable:count('challengeable'),verifyPolicyTerm:count('policy term — verify'),noReasonGiven:count('no reason given'),likelyValid:count('likely valid'),lines:results.slice(0,12).map(r=>({description:r.description.slice(0,60),amount:r.amount,status:r.status,category:r.category})),note:'Deterministic rules-based classification; the deductions page attaches lines to a case and drafts the letters.'},card:{kind:'deductions',title:text(language,'voice.card.deductionsTitle'),lines,link:{href:'/deductions/',label:text(language,'nav.deductions')}}};
}
function draftAndQueue(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language,now=deps.now?.()||new Date(),vault=deps.vault(),timeline=deps.timeline();
 const kind=argEnum(args,'letterKind',['lock','followup','gro','recovery','rejection','reimbursement_desk','reconsideration'] as const);if(!kind)throw new ArgumentError('letterKind');
 const spoken=argString(args,'insurer',120);const resolved=resolveInsurer(spoken);
 const insurerId=resolved.id||(spoken?null:timeline?.insurerId||selectPolicy(vault)?.insurerId||null);
 const contact=contacts.find(c=>c.id===insurerId);
 const name=insurerId==='unlisted'?text(language,'label.unlisted'):(language==='hi'?contact?.name_hi:undefined)||contact?.name||'';
 let letter:Letter;let recipient='';
 if(kind==='lock'||kind==='followup'||kind==='gro'||kind==='recovery'){
  if(!timeline)return {result:{status:'no_clock',next:'Start the hospital clock first; these letters are built from its recorded times.'},card:notice(language,text(language,'voice.card.letterTitle'),[text(language,'voice.card.noClock')],{href:'/',label:text(language,'voice.card.openClock')})};
  const extra:Record<string,string>={};
  if(kind==='recovery'){const amount=argNumber(args,'amount',1,1e9),hours=argNumber(args,'hours',0.5,720);if(amount===undefined||hours===undefined)return {result:{status:'needs_amount_and_hours'},card:null};extra.amount=amount.toLocaleString('en-IN');extra.hours=String(hours);}
  letter=personalize(makeLetter(kind as LetterKind,timeline,contacts,rules,language,extra,now),identityFor(vault,timeline.insurerId));
  const insurer=contacts.find(c=>c.id===timeline.insurerId);
  recipient=kind==='followup'?insurer?.claims_email||insurer?.escalation_levels?.find(l=>l.email)?.email||'':kind==='lock'?'':insurer?.gro_email||'';
 } else if(kind==='rejection'){
  const ground=argString(args,'ground',500);if(!ground)return {result:{status:'needs_ground'},card:null};
  if(!insurerId)return {result:{status:'needs_insurer',candidates:resolved.candidates},card:null};
  letter=personalize(makeRejectionLetter({insurerId,rejectedOn:now.toISOString().slice(0,10),ground,category:detectRejectionCategory(ground)},contacts,rules,language,now),identityFor(vault,insurerId));
  recipient=contact?.gro_email||'';
 } else if(kind==='reimbursement_desk'){
  const hospital=argString(args,'hospital',120)||timeline?.hospital;
  if(!insurerId)return {result:{status:'needs_insurer',candidates:resolved.candidates},card:null};
  if(!hospital)return {result:{status:'needs_hospital'},card:null};
  letter=makeReimbursementDeskLetter(name,hospital,language,now);
 } else {
  const inputs=deps.deductions();
  if(!inputs.length)return {result:{status:'no_deductions',next:'Attach deduction lines to the case on /deductions/ first.'},card:notice(language,text(language,'voice.card.letterTitle'),[text(language,'voice.card.noDeductions')],{href:'/deductions/',label:text(language,'nav.deductions')})};
  const target=insurerId||timeline?.insurerId;if(!target)return {result:{status:'needs_insurer',candidates:resolved.candidates},card:null};
  letter=personalize(makeDeductionLetter('reconsideration',inputs.map(classify),target,contacts,rules,language,now),identityFor(vault,target));
  recipient=contacts.find(c=>c.id===target)?.gro_email||'';
 }
 return {result:{status:'drafted',letterKind:kind,subject:letter.subject.slice(0,200),recipientKnown:Boolean(recipient),ruleIds:letter.ruleIds,note:'Shown on screen with copy, email and WhatsApp buttons; the user reviews and sends it.'},card:{kind:'letter',title:text(language,'voice.card.letterTitle'),lines:[letter.subject],letter:{letter,recipient}}};
}
function saveUserPolicy(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language;
 const spoken=argString(args,'insurer',120);const resolved=resolveInsurer(spoken);
 if(!resolved.id)return {result:{status:'needs_insurer',candidates:resolved.candidates},card:null};
 const insurerId=resolved.id;
 const plan=resolvePlan(argString(args,'plan',120),insurerId);
 const sumInsured=argNumber(args,'sumInsured',1,1e9),inceptionDate=argDate(args,'inceptionDate'),continuityFrom=argDate(args,'continuityFrom'),renewalDate=argDate(args,'renewalDate'),corporate=argBool(args,'corporate');
 const year=argNumber(args,'inceptionYear',1990,new Date().getUTCFullYear(),true);
 const relations=[...new Set((argList(args,'members',RELATIONS.length)||['self']).map(v=>{if(typeof v!=='string'||!(RELATIONS as readonly string[]).includes(v))throw new ArgumentError('members');return v as Relation;}))];
 const vault=deps.vault()||emptyVault(language);
 const members=[...vault.members];
 const memberIds=relations.map(relation=>{const existing=members.find(m=>m.relation===relation);if(existing)return existing.id;const member:Member={id:crypto.randomUUID(),name:text(language,`vault.relation.${relation}`),relation};members.push(member);return member.id;});
 const policy:Policy={id:crypto.randomUUID(),kind:'health',insurerId,policyNumber:'',memberIds};
 if(plan)policy.planId=plan.id;else{const planName=argString(args,'plan',120);if(planName)policy.planName=planName;}
 if(sumInsured!==undefined)policy.sumInsured=sumInsured;if(inceptionDate)policy.inceptionDate=inceptionDate;if(continuityFrom)policy.continuityFrom=continuityFrom;if(renewalDate)policy.renewalDate=renewalDate;if(corporate!==undefined)policy.corporate=corporate;
 if(!inceptionDate&&year!==undefined)policy.notes=text('en','voice.card.startedYearNote',{year});
 if(policy.continuityFrom&&policy.inceptionDate&&policy.continuityFrom>policy.inceptionDate)throw new ArgumentError('continuityFrom');
 const next:Vault={...vault,members,policies:[...vault.policies,policy],defaultPolicyId:vault.defaultPolicyId||policy.id};
 if(!deps.saveVault(next))return {result:{status:'storage_failed'},card:notice(language,text(language,'voice.card.policyTitle'),[text(language,'error.storage')],{href:'/vault/',label:text(language,'nav.vault')})};
 const missing=['policy_number',...(inceptionDate?[]:['start_date'])];
 const lines=[`${text(language,'label.insurer')}: ${insurerName(insurerId,language)}`,...(plan?[`${text(language,'vault.plan')}: ${plan.name}`]:policy.planName?[`${text(language,'vault.plan')}: ${policy.planName}`]:[]),...(sumInsured?[`${text(language,'vault.sumInsured')}: ${rupees(sumInsured,language)}`]:[]),`${text(language,'vault.coveredMembers')}: ${relations.map(r=>text(language,`vault.relation.${r}`)).join(', ')}`,text(language,'voice.card.policyMissing')];
 return {result:{status:'saved',insurer:insurerName(insurerId,'en'),plan:plan?.name||policy.planName||null,planVerified:Boolean(plan),sumInsured:sumInsured??null,inceptionDate:inceptionDate??null,members:relations,missing,note:'Policy number and exact dates are typed in My Vault, never spoken.'},card:{kind:'policy',title:text(language,'voice.card.policySaved'),lines,link:{href:'/vault/',label:text(language,'nav.vault')}}};
}
function checkRenewal(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language,now=deps.now?.()||new Date(),vault=deps.vault();
 const id=argString(args,'policyId',128);
 const policy=(id?vault?.policies.find(p=>p.id===id):undefined)||selectPolicy(vault)||vault?.policies[0]||null;
 if(!policy)return noPolicyOutcome(language);
 const title=text(language,'voice.card.renewalTitle');
 if(!policy.renewalDate)return {result:{status:'no_date',insurer:insurerName(policy.insurerId,'en')},card:{kind:'renewal',title,lines:[text(language,'voice.card.renewalNoDate')],link:{href:'/vault/',label:text(language,'nav.vault')}}};
 const link={href:`/renewal/?policy=${encodeURIComponent(policy.id)}`,label:text(language,'footer.renewal')};
 const days=daysUntilRenewal(policy,now)!;
 const status=days<0?'overdue':days<=30?'due_soon':'upcoming';
 const schedule=renewalSchedule(policy.renewalDate,'annual',now);
 const grace=rule('grace-period-15-30-days'),porting=rule('porting-window-30-60-days');
 const lines=[`${text(language,'vault.renewalDate')}: ${localDate(policy.renewalDate,language)}`,text(language,`voice.card.renewal_${status}`,{days:Math.abs(days)}),...(schedule.status!=='invalid'?[text(language,'voice.card.renewalPorting',{open:localDate(schedule.portingOpensOn,language),close:localDate(schedule.portingClosesOn,language)})]:[]),text(language,'voice.card.renewalGrace')];
 const result:Record<string,unknown>={status,renewalDate:policy.renewalDate,days,insurer:insurerName(policy.insurerId,'en'),gracePeriod:{monthlyDays:15,otherModesDays:30,creditsProtectedIfRenewedInGrace:true,source_url:grace.source_url,verified_on:grace.verified_on},note:'Quote only these sourced figures. The grace period is 15 days for monthly premiums and 30 days otherwise; porting must be applied for 60 to 30 days before renewal.'};
 if(schedule.status!=='invalid')result.porting={applyFrom:schedule.portingOpensOn,applyBy:schedule.portingClosesOn,insurerDiscretionUntil:schedule.portingDiscretionUntil,migrationBy:schedule.migrationBy,graceEndsOn:schedule.graceEndsOn,source_url:porting.source_url,verified_on:porting.verified_on};
 return {result,card:{kind:'renewal',title,lines,link}};
}
function trackReimbursement(args:Args,deps:VoiceDeps):ToolOutcome {
 const language=deps.language,now=deps.now?.()||new Date();
 const submitted=argDate(args,'documentsSubmittedOn');
 const todayIso=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
 if(submitted&&submitted>todayIso)throw new ArgumentError('documentsSubmittedOn');
 const link={href:'/reimbursement/',label:text(language,'footer.reimbursement')};
 const title=text(language,'voice.card.reimbursementTitle');
 const saved=(deps.claims?.()||[]).slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 // A saved claim is the record; a spoken submission date gives a provisional clock with interest counted from that date, since the intimation date is unknown.
 const claim=saved[0]||(submitted?{intimatedOn:submitted,submittedOn:submitted,claimedAmount:null,settledOn:null,settledAmount:null}:null);
 const settlement=rule('reimbursement-15-days'),interest=rule('penal-interest-bank-rate-plus-2');
 const sources={settlement:{source_url:settlement.source_url,verified_on:settlement.verified_on},interest:{source_url:interest.source_url,verified_on:interest.verified_on}};
 if(!claim)return {result:{status:'no_claim',rule:'Reimbursement claims are settled within 15 days of submission; late settlement earns Bank Rate + 2% from intimation, paid suo-moto.',sources,next:'Ask for the date the documents were submitted, or point to the Reimbursement Tracker.'},card:{kind:'notice',title,lines:[text(language,'voice.card.reimbursementNoClaim'),text(language,'voice.card.reimbursementRule')],link}};
 const timeline=claimTimeline(claim,now);
 if(timeline.status==='invalid')throw new ArgumentError('documentsSubmittedOn');
 const days=timeline.status==='awaiting'?timeline.daysLeft:timeline.daysOverdue;
 const lines=[text(language,`voice.card.reimbursementStatus_${timeline.status}`,{days,deadline:localDate(timeline.deadline,language)}),...(timeline.interest?[`${text(language,'tracker.pack.interest')}: ${rupees(timeline.interest.amount,language)}`]:[]),text(language,'voice.card.reimbursementRule')];
 const result:Record<string,unknown>={status:timeline.status,deadline:timeline.deadline,daysLeft:timeline.daysLeft,daysOverdue:timeline.daysOverdue,provisional:!saved[0],sources,note:'Fifteen days from submission; interest at Bank Rate + 2% from intimation. Quote only these figures.'};
 if(timeline.interest&&timeline.bankRate)result.interest={amount:timeline.interest.amount,ratePercent:timeline.interest.ratePercent,days:timeline.interest.days,bankRatePercent:timeline.bankRate.percent,financialYear:timeline.bankRate.fy};
 return {result,card:{kind:'notice',title,lines,link}};
}
const ARGUMENT_HINTS:Record<string,string>={time:'Omit the time or pass "now" when it just happened; a stated time must be within the last year and not in the future.',decidedAt:'Omit decidedAt or pass "now" when the decision just came; a stated time must be after the clock started.',eventAt:'Omit eventAt or pass "now"; a stated time must be after the clock started.',submittedAt:'Pass "now" or the local time the desk sent the request, within the last year.',members:'Members are relations: self, spouse, child, parent, parent-in-law, other.',inceptionDate:'Dates are YYYY-MM-DD; if only a year is known pass inceptionYear instead.',continuityFrom:'Continuous cover cannot start after the current policy; pass YYYY-MM-DD.'};
const executors:Record<ToolName,(args:Args,deps:VoiceDeps)=>ToolOutcome>={check_policy_benefit:checkPolicyBenefit,recommend_or_compare_plans:recommendOrCompare,manage_claim_clock:manageClaimClock,audit_bill_deductions:auditBillDeductions,draft_and_queue_action:draftAndQueue,save_user_policy:saveUserPolicy,check_renewal:checkRenewal,track_reimbursement:trackReimbursement};
/** Runs one tool call on local data. Bad arguments and unexpected failures become results the model can relay, never exceptions. */
export function executeTool(call:ToolCall,deps:VoiceDeps):ToolOutcome {
 const executor=executors[call.name];
 if(!executor)return {result:{status:'unknown_tool'},card:null};
 try{return executor(call.arguments||{},deps);}
 catch(error){
  if(error instanceof ArgumentError)return {result:{status:'invalid_arguments',field:error.field,hint:ARGUMENT_HINTS[error.field]||`Check the value given for ${error.field} and try again.`},card:null};
  return {result:{status:'tool_failed'},card:notice(deps.language,text(deps.language,'voice.card.toolFailed'),[text(deps.language,'voice.card.toolFailedBody')])};
 }
}

// --- Saved chats: on this device only, never synced, deletable from the sheet -------------------------
export type SavedCard={turn:number;card:Card};
export type SavedChat={id:string;startedAt:string;updatedAt:string;language:Language;title:string;messages:ChatMessage[];cards:SavedCard[]};
export const CHATS_KEY='claimclock:saathi-chats:v1';
export const CHAT_LIMITS={maxChats:30,maxMessages:60,maxCards:40,maxTitle:60,maxBytes:300*1024} as const;
const isoDate=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const plainObject=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function chatTitle(messages:ChatMessage[]):string {
 const first=messages.find(m=>m.role==='user')?.content?.replace(/\s+/g,' ').trim()||'';
 return first.length>CHAT_LIMITS.maxTitle?`${first.slice(0,CHAT_LIMITS.maxTitle-1)}…`:first;
}
function parseMessage(value:unknown):ChatMessage|null {
 if(!plainObject(value))return null;
 if(value.role==='user')return typeof value.content==='string'&&value.content.trim()?{role:'user',content:value.content.slice(0,HISTORY_LIMITS.maxMessageChars)}:null;
 if(value.role==='assistant'){
  const content=typeof value.content==='string'?value.content.slice(0,HISTORY_LIMITS.maxMessageChars):null;
  const calls=Array.isArray(value.tool_calls)?value.tool_calls.filter((c):c is ToolCall=>plainObject(c)&&typeof c.id==='string'&&(TOOL_NAMES as readonly string[]).includes(String(c.name))&&plainObject(c.arguments)).slice(0,4):[];
  return content||calls.length?{role:'assistant',content,...(calls.length?{tool_calls:calls}:{})}:null;
 }
 if(value.role==='tool')return typeof value.tool_call_id==='string'&&(TOOL_NAMES as readonly string[]).includes(String(value.name))&&typeof value.content==='string'?{role:'tool',tool_call_id:value.tool_call_id,name:value.name as ToolName,content:value.content.slice(0,HISTORY_LIMITS.maxMessageChars)}:null;
 return null;
}
function parseCard(value:unknown):Card|null {
 if(!plainObject(value)||typeof value.title!=='string'||!Array.isArray(value.lines))return null;
 const kinds:CardKind[]=['benefit','compare','clock','deductions','letter','policy','renewal','notice'];
 if(!kinds.includes(value.kind as CardKind))return null;
 const card:Card={kind:value.kind as CardKind,title:value.title.slice(0,200),lines:value.lines.filter((l):l is string=>typeof l==='string').slice(0,30).map(l=>l.slice(0,400))};
 if(plainObject(value.link)&&typeof value.link.href==='string'&&typeof value.link.label==='string'&&value.link.href.startsWith('/'))card.link={href:value.link.href,label:value.link.label};
 if(plainObject(value.source)&&typeof value.source.url==='string'&&value.source.url.startsWith('https://')&&typeof value.source.verifiedOn==='string')card.source={url:value.source.url,verifiedOn:value.source.verifiedOn};
 if(plainObject(value.letter)&&plainObject(value.letter.letter)&&typeof value.letter.recipient==='string'){const l=value.letter.letter;if(typeof l.subject==='string'&&typeof l.body==='string'&&typeof l.kind==='string')card.letter={recipient:value.letter.recipient,letter:{id:typeof l.id==='string'?l.id:'',kind:l.kind,language:l.language==='hi'?'hi':'en',generatedAt:typeof l.generatedAt==='string'?l.generatedAt:'',subject:l.subject,body:l.body,ruleIds:Array.isArray(l.ruleIds)?l.ruleIds.filter((r):r is string=>typeof r==='string'):[]}};}
 return card;
}
/** Validates a stored chat list field by field; anything malformed is dropped rather than trusted. */
export function parseChats(value:unknown):SavedChat[] {
 if(!plainObject(value)||value.version!==1||!Array.isArray(value.chats))return [];
 const chats:SavedChat[]=[];
 for(const row of value.chats){
  if(!plainObject(row)||typeof row.id!=='string'||!row.id||!isoDate(row.startedAt)||!isoDate(row.updatedAt)||!Array.isArray(row.messages))continue;
  const messages=row.messages.map(parseMessage).filter((m):m is ChatMessage=>m!==null).slice(-CHAT_LIMITS.maxMessages);
  if(!messages.length||messages[0].role!=='user')continue;
  const cards=(Array.isArray(row.cards)?row.cards:[]).map(c=>plainObject(c)&&Number.isInteger(c.turn)&&Number(c.turn)>=0?{turn:Number(c.turn),card:parseCard(c.card)}:null).filter((c):c is SavedCard=>Boolean(c&&c.card)).slice(-CHAT_LIMITS.maxCards);
  if(chats.some(c=>c.id===row.id))continue;
  chats.push({id:row.id,startedAt:row.startedAt,updatedAt:row.updatedAt,language:row.language==='hi'?'hi':'en',title:typeof row.title==='string'&&row.title.trim()?row.title.slice(0,CHAT_LIMITS.maxTitle):chatTitle(messages),messages,cards});
 }
 return trimChats(chats.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)));
}
function trimChats(chats:SavedChat[]):SavedChat[] {
 let kept=chats.slice(0,CHAT_LIMITS.maxChats);
 while(kept.length>1&&JSON.stringify({version:1,chats:kept}).length>CHAT_LIMITS.maxBytes)kept=kept.slice(0,-1);
 return kept;
}
/** Replaces a chat by id or adds it, newest first, within the count and size limits (the oldest chats give way). */
export function upsertChat(chats:SavedChat[],chat:SavedChat):SavedChat[] {
 const next={...chat,messages:chat.messages.slice(-CHAT_LIMITS.maxMessages),cards:chat.cards.slice(-CHAT_LIMITS.maxCards),title:chat.title||chatTitle(chat.messages)};
 return trimChats([next,...chats.filter(c=>c.id!==chat.id)].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)));
}
export function serializeChats(chats:SavedChat[]):string{return JSON.stringify({version:1,chats});}
