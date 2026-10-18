// Reimbursement Tracker arithmetic (M26). Pure, deterministic functions over a reimbursement
// claim's dates, amounts and query log. The 15-day settlement deadline, the Bank Rate + 2%
// interest and the one-go documents rule each come from data/rules.json; the Bank Rate for a
// financial year is the RBI figure recorded there with its source. Nothing here decides a claim.
import rulesRaw from '../../data/rules.json' with {type:'json'};
import {addDays,daysBetween,validDate} from './coverage-simulator.ts';
import {buildCalendar,type CalendarEvent} from './reminders.ts';
import type {Language,Rule} from './types.ts';

const rules=rulesRaw as Rule[];
export const rule=(id:string):Rule=>{const found=rules.find(r=>r.id===id);if(!found)throw Error(`Unknown rule ${id}`);return found;};
export const SETTLEMENT_DAYS=15,INTEREST_MARGIN_PERCENT=2;
export const DOCUMENT_KEYS=['denial','bill','discharge','icp','doctor','reports','implant'] as const;
export type DocumentKey=typeof DOCUMENT_KEYS[number];
export type ClaimQuery={id:string;at:string;note:string;repliedOn?:string};
export type ReimbursementClaim={id:string;insurerId:string;hospital:string;intimatedOn:string;submittedOn:string;claimedAmount:number|null;queries:ClaimQuery[];settledOn:string|null;settledAmount:number|null;interestPaid:number|null;documents:Partial<Record<DocumentKey,boolean>>;notes:string;updatedAt:string};
export const CLAIM_LIMITS={maxClaims:20,maxQueries:30,maxNote:300,maxHospital:100,maxNotes:500,maxAmount:1e9};
export const REIMBURSEMENT_KEY='claimclock:reimbursement:v1';
const iso=(now:Date)=>new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);

// --- Bank Rate and interest -----------------------------------------------------------------------------
/** Indian financial year label for a date: 1 April 2026 → "2026-27". */
export function financialYear(date:string):string {
 const y=Number(date.slice(0,4)),m=Number(date.slice(5,7));
 const start=m>=4?y:y-1;return `${start}-${String((start+1)%100).padStart(2,'0')}`;
}
export type BankRate={fy:string;percent:number;asOn:string;source_url:string;quote:string};
type RateRow={percent:number;as_on:string;source_url:string;quote:string};
/** The RBI Bank Rate prevalent on 1 April of the financial year in which the claim fell due (PPHI Regulations 2024, Reg. 2(3)); null when that year is not recorded. */
export function bankRateFor(dueDate:string):BankRate|null {
 if(!validDate(dueDate))return null;
 const fy=financialYear(dueDate);const rates=rule('bank-rate-fy').rates as Record<string,RateRow>|undefined;
 const row=rates?.[fy];return row?{fy,percent:row.percent,asOn:row.as_on,source_url:row.source_url,quote:row.quote}:null;
}
export type Interest={days:number;ratePercent:number;amount:number;from:string;to:string};
/** Simple interest at Bank Rate + 2% a year from intimation to payment, on the amount paid or payable. */
export function penalInterest(amount:number,from:string,to:string,bankRatePercent:number):Interest|null {
 if(!finite(amount)||amount<=0||!validDate(from)||!validDate(to)||!finite(bankRatePercent))return null;
 const days=Math.max(0,daysBetween(from,to)),ratePercent=bankRatePercent+INTEREST_MARGIN_PERCENT;
 return {days,ratePercent,amount:Math.round(amount*ratePercent/100*days/365),from,to};
}

// --- Timeline ----------------------------------------------------------------------------------------------
export type ClaimStatus='awaiting'|'due_today'|'overdue'|'settled_on_time'|'settled_late'|'invalid';
export type ClaimTimeline={status:ClaimStatus;today:string;deadline:string;daysLeft:number;daysOverdue:number;bankRate:BankRate|null;interest:Interest|null;ruleIds:string[];notes:string[]};
export function claimTimeline(claim:Pick<ReimbursementClaim,'intimatedOn'|'submittedOn'|'claimedAmount'|'settledOn'|'settledAmount'>,now=new Date()):ClaimTimeline {
 const today=iso(now);
 const invalid:ClaimTimeline={status:'invalid',today,deadline:'',daysLeft:0,daysOverdue:0,bankRate:null,interest:null,ruleIds:[],notes:[]};
 if(!validDate(claim.submittedOn)||!validDate(claim.intimatedOn)||claim.intimatedOn>claim.submittedOn||claim.submittedOn>today)return invalid;
 if(claim.settledOn!==null&&(!validDate(claim.settledOn)||claim.settledOn<claim.submittedOn||claim.settledOn>today))return invalid;
 const deadline=addDays(claim.submittedOn,SETTLEMENT_DAYS);
 const bankRate=bankRateFor(deadline);
 const ruleIds=['reimbursement-15-days','penal-interest-bank-rate-plus-2','documents-at-one-go','claim-not-closed-for-documents'];
 const notes:string[]=['count_from_submission','interest_from_intimation'];
 if(!bankRate)notes.push('bank_rate_unknown');
 const base=finite(claim.settledAmount)&&claim.settledAmount>0?claim.settledAmount:finite(claim.claimedAmount)&&claim.claimedAmount>0?claim.claimedAmount:null;
 if(claim.settledOn){
  const late=claim.settledOn>deadline;
  const interest=late&&base!==null&&bankRate?penalInterest(base,claim.intimatedOn,claim.settledOn,bankRate.percent):null;
  if(late&&base===null)notes.push('needs_amount');
  return {status:late?'settled_late':'settled_on_time',today,deadline,daysLeft:0,daysOverdue:late?daysBetween(deadline,claim.settledOn):0,bankRate,interest,ruleIds,notes};
 }
 const daysLeft=daysBetween(today,deadline);
 const status:ClaimStatus=daysLeft>0?'awaiting':daysLeft===0?'due_today':'overdue';
 const interest=status==='overdue'&&base!==null&&bankRate?penalInterest(base,claim.intimatedOn,today,bankRate.percent):null;
 if(status==='overdue'&&base===null)notes.push('needs_amount');
 return {status,today,deadline,daysLeft:Math.max(0,daysLeft),daysOverdue:Math.max(0,-daysLeft),bankRate,interest,ruleIds,notes};
}

// --- Queries ------------------------------------------------------------------------------------------------
export type QueryPattern={count:number;distinctDates:number;piecemeal:boolean;firstOn:string|null;lastOn:string|null;unanswered:number;spanDays:number};
/** Two or more document queries on different dates is the piecemeal pattern Regulation 23(4) forbids. */
export function queryPattern(queries:ClaimQuery[]):QueryPattern {
 const dated=queries.filter(q=>validDate(q.at)).map(q=>q.at).sort();
 const distinct=[...new Set(dated)];
 return {count:queries.length,distinctDates:distinct.length,piecemeal:distinct.length>=2,firstOn:dated[0]||null,lastOn:dated[dated.length-1]||null,unanswered:queries.filter(q=>!q.repliedOn).length,spanDays:dated.length?daysBetween(dated[0],dated[dated.length-1]):0};
}

// --- Settlement audit ----------------------------------------------------------------------------------------
export type SettlementFlag='partial'|'late'|'no_interest_line'|'interest_short'|'not_settled'|'needs_amounts';
export type SettlementAudit={flags:SettlementFlag[];shortfall:number|null;interestDue:number|null;interestPaid:number|null;interestShortfall:number|null;timeline:ClaimTimeline};
export function settlementAudit(claim:ReimbursementClaim,now=new Date()):SettlementAudit {
 const timeline=claimTimeline(claim,now);const flags:SettlementFlag[]=[];
 if(!claim.settledOn||timeline.status==='invalid')return {flags:['not_settled'],shortfall:null,interestDue:null,interestPaid:claim.interestPaid,interestShortfall:null,timeline};
 const shortfall=finite(claim.claimedAmount)&&finite(claim.settledAmount)?Math.max(0,Math.round(claim.claimedAmount-claim.settledAmount)):null;
 if(shortfall===null)flags.push('needs_amounts');else if(shortfall>0)flags.push('partial');
 const interestDue=timeline.interest?.amount??null;
 const interestPaid=finite(claim.interestPaid)?Math.round(claim.interestPaid):null;
 let interestShortfall:number|null=null;
 if(timeline.status==='settled_late'){
  flags.push('late');
  if(interestDue!==null){if(interestPaid===null||interestPaid===0)flags.push('no_interest_line');else if(interestPaid<interestDue)flags.push('interest_short');interestShortfall=Math.max(0,interestDue-(interestPaid||0));}
 }
 return {flags,shortfall,interestDue,interestPaid,interestShortfall,timeline};
}

// --- Documents and the Claim-Ready Pack ---------------------------------------------------------------------------
export function documentProgress(documents:Partial<Record<DocumentKey,boolean>>):{done:number;total:number;missing:DocumentKey[]} {
 const missing=DOCUMENT_KEYS.filter(k=>!documents[k]);return {done:DOCUMENT_KEYS.length-missing.length,total:DOCUMENT_KEYS.length,missing};
}
export type PackText={insurer:string;hospital:string;language:Language;labels:Record<string,string>;documentLabels:Record<DocumentKey,string>;queryLabels:{query:string;replied:string;pending:string}};
/** A plain-text Claim-Ready Pack: what was submitted when, every query and reply, the document checklist and the running deadline. Identity lines stay as placeholders for the vault to fill. */
export function claimReadyPack(claim:ReimbursementClaim,timeline:ClaimTimeline,text:PackText):string {
 const date=(v:string)=>new Date(`${v}T00:00:00Z`).toLocaleDateString(text.language==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 const rupees=(n:number)=>`₹${Math.round(n).toLocaleString(text.language==='hi'?'hi-IN':'en-IN')}`;
 const l=text.labels;
 const lines=[`${l.title}`,'',`${l.name}: ${text.language==='hi'?'[आपका नाम]':'[Your name]'}`,`${l.policy}: ${text.language==='hi'?'[पॉलिसी संख्या]':'[Policy number]'}`,`${l.claim}: ${text.language==='hi'?'[दावा संख्या]':'[Claim number]'}`,`${l.insurer}: ${text.insurer}`,...(claim.hospital?[`${l.hospital}: ${claim.hospital}`]:[]),'',`${l.intimated}: ${date(claim.intimatedOn)}`,`${l.submitted}: ${date(claim.submittedOn)}`,`${l.deadline}: ${timeline.deadline?date(timeline.deadline):'—'}`,...(claim.claimedAmount?[`${l.claimed}: ${rupees(claim.claimedAmount)}`]:[]),...(claim.settledOn?[`${l.settled}: ${date(claim.settledOn)}${claim.settledAmount?` · ${rupees(claim.settledAmount)}`:''}`]:[]),...(timeline.interest?[`${l.interest}: ${rupees(timeline.interest.amount)} (${timeline.interest.ratePercent}% × ${timeline.interest.days} ${l.days})`]:[]),'',`${l.documents}:`];
 for(const key of DOCUMENT_KEYS)lines.push(`${claim.documents[key]?'[x]':'[ ]'} ${text.documentLabels[key]}`);
 lines.push('',`${l.queries}: ${claim.queries.length}`);
 for(const q of [...claim.queries].sort((a,b)=>a.at.localeCompare(b.at)))lines.push(`- ${date(q.at)} — ${text.queryLabels.query}: ${q.note||'—'}${q.repliedOn?` · ${text.queryLabels.replied} ${date(q.repliedOn)}`:` · ${text.queryLabels.pending}`}`);
 if(claim.notes.trim())lines.push('',`${l.notes}: ${claim.notes.trim()}`);
 lines.push('',l.footer);
 return lines.join('\n');
}
/** Two calendar entries: the 15-day deadline and the day after it, when a grievance becomes due. */
export function reimbursementCalendar(claim:Pick<ReimbursementClaim,'submittedOn'>,titles:{deadline:string;followUp:string;body:string}):string {
 if(!validDate(claim.submittedOn))throw Error('Invalid submission date');
 const deadline=addDays(claim.submittedOn,SETTLEMENT_DAYS);
 const events:CalendarEvent[]=[{when:new Date(`${deadline}T00:00:00Z`),title:`ClaimClock: ${titles.deadline}`,body:titles.body,alarmDays:0},{when:new Date(`${addDays(deadline,1)}T00:00:00Z`),title:`ClaimClock: ${titles.followUp}`,body:titles.body,alarmDays:0}];
 return buildCalendar(events,'Reimbursement deadline');
}

// --- Storage (on this device only) -----------------------------------------------------------------------------------
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function text(value:unknown,max:number,required=false):string{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))throw Error('Invalid claim text');return value;}
function date(value:unknown):string{const v=text(value,10,true);if(!DATE.test(v)||!validDate(v))throw Error('Invalid claim date');return v;}
function nullableNumber(value:unknown,max:number):number|null{if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw Error('Invalid claim amount');return value;}
export function parseClaim(value:unknown):ReimbursementClaim {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid claim');
 const row=value as Record<string,unknown>;
 const allowed=['id','insurerId','hospital','intimatedOn','submittedOn','claimedAmount','queries','settledOn','settledAmount','interestPaid','documents','notes','updatedAt'];
 if(Object.keys(row).some(k=>!allowed.includes(k)))throw Error('Unknown claim field');
 if(!Array.isArray(row.queries)||row.queries.length>CLAIM_LIMITS.maxQueries)throw Error('Invalid queries');
 const queries:ClaimQuery[]=row.queries.map(q=>{if(!q||typeof q!=='object')throw Error('Invalid query');const r=q as Record<string,unknown>;if(Object.keys(r).some(k=>!['id','at','note','repliedOn'].includes(k)))throw Error('Unknown query field');const query:ClaimQuery={id:text(r.id,128,true),at:date(r.at),note:text(r.note,CLAIM_LIMITS.maxNote)};if(r.repliedOn!==undefined){query.repliedOn=date(r.repliedOn);}return query;});
 if(new Set(queries.map(q=>q.id)).size!==queries.length)throw Error('Duplicate query id');
 const documents:Partial<Record<DocumentKey,boolean>>={};
 if(row.documents!==undefined){if(!row.documents||typeof row.documents!=='object')throw Error('Invalid documents');for(const [k,v] of Object.entries(row.documents as Record<string,unknown>)){if(!(DOCUMENT_KEYS as readonly string[]).includes(k)||typeof v!=='boolean')throw Error('Invalid document flag');documents[k as DocumentKey]=v;}}
 const claim:ReimbursementClaim={id:text(row.id,128,true),insurerId:text(row.insurerId,100,true),hospital:text(row.hospital??'',CLAIM_LIMITS.maxHospital),intimatedOn:date(row.intimatedOn),submittedOn:date(row.submittedOn),claimedAmount:nullableNumber(row.claimedAmount,CLAIM_LIMITS.maxAmount),queries,settledOn:row.settledOn===null||row.settledOn===undefined?null:date(row.settledOn),settledAmount:nullableNumber(row.settledAmount,CLAIM_LIMITS.maxAmount),interestPaid:nullableNumber(row.interestPaid,CLAIM_LIMITS.maxAmount),documents,notes:text(row.notes??'',CLAIM_LIMITS.maxNotes),updatedAt:text(row.updatedAt,40,true)};
 if(claim.intimatedOn>claim.submittedOn)throw Error('Intimation after submission');
 if(claim.settledOn&&claim.settledOn<claim.submittedOn)throw Error('Settled before submission');
 if(!Number.isFinite(Date.parse(claim.updatedAt)))throw Error('Invalid timestamp');
 return claim;
}
export function parseClaims(value:unknown):ReimbursementClaim[] {
 if(!Array.isArray(value)||value.length>CLAIM_LIMITS.maxClaims)throw Error('Invalid claim list');
 const claims=value.map(parseClaim);if(new Set(claims.map(c=>c.id)).size!==claims.length)throw Error('Duplicate claim id');return claims;
}
let issue:''|'corrupt'|'unavailable'|'save'='';
export function claimStorageIssue(){return issue;}
export function loadClaims():ReimbursementClaim[] {
 issue='';let raw:string|null;try{raw=localStorage.getItem(REIMBURSEMENT_KEY);}catch{issue='unavailable';return [];}
 if(raw===null)return [];
 try{return parseClaims(JSON.parse(raw));}catch{issue='corrupt';return [];}
}
export function saveClaims(claims:ReimbursementClaim[]):boolean {
 try{const checked=parseClaims(claims);localStorage.setItem(REIMBURSEMENT_KEY,JSON.stringify(checked));issue='';return true;}catch{issue='save';return false;}
}
export function newClaim(partial:Partial<ReimbursementClaim>&Pick<ReimbursementClaim,'insurerId'|'intimatedOn'|'submittedOn'>):ReimbursementClaim {
 return {id:crypto.randomUUID(),hospital:'',claimedAmount:null,queries:[],settledOn:null,settledAmount:null,interestPaid:null,documents:{},notes:'',updatedAt:new Date().toISOString(),...partial};
}
