// "Is this covered?" arithmetic (M21). Pure, deterministic functions over a policy's published
// rules. Every result carries machine-readable statuses and note keys; the page translates them.
// The simulator never decides a claim: it shows what the policy's own rules imply and where a
// value is unknown, so the user asks the right question of the insurer.
import {monthsBetween} from './vault.ts';

export type RoomRule=
 |{category:'any'}
 |{category:'single_private_ac'|'single_private'|'twin_sharing'}
 |{category:'percent_si';percent:number;icu_percent?:number}
 |{category:'rupee_cap';cap_by_si:[number,{amount?:number;percent?:number}][]}
 |{category:'by_si';category_by_si:[number|null,'any'|'single_private_ac'|'single_private'|'twin_sharing'][]};
export type CopayRule={percent:number;optional?:boolean;zonal?:boolean;conditional?:{percent:number;when:'entry_age_61_plus'}};
export type CheckupLimit=
 |{type:'per_lakh';per_lakh:number;max_individual:number|null;max_floater:number|null}
 |{type:'percent_si';percent:number;max:number|null}
 |{type:'table';by_si:[number,number][]}
 |{type:'fixed';amount:number}
 |{type:'package'};
export type CheckupEligibility={from:'day1'|'policy_year'|'after_first_year'|'claim_free_year'|'every_n_years';every_years?:number;min_age?:number;optional?:boolean};
export type CheckupRule={mode:'cashless'|'reimbursement'|'unknown';eligibility:CheckupEligibility;limit:CheckupLimit|null};
export type PrePostRule={pre_days:number|null;post_days:number|null;note?:string};

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const day=(value:string)=>Date.UTC(Number(value.slice(0,4)),Number(value.slice(5,7))-1,Number(value.slice(8,10)));
const iso=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export function validDate(value:unknown):value is string{
 if(typeof value!=='string'||!DATE.test(value))return false;
 const ms=day(value);return Number.isFinite(ms)&&iso(ms)===value;
}
const today=(now:Date)=>Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
const money=(n:number)=>Math.round(n);
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
/** Adds calendar months and clamps to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date:string,months:number):string {
 const y=Number(date.slice(0,4)),m=Number(date.slice(5,7))-1,d=Number(date.slice(8,10));
 const lastDay=new Date(Date.UTC(y,m+months+1,0)).getUTCDate();
 return iso(Date.UTC(y,m+months,Math.min(d,lastDay)));
}
export function addDays(date:string,days:number):string{return iso(day(date)+days*86400000);}
export function daysBetween(from:string,to:string):number{return Math.floor((day(to)-day(from))/86400000);}

// --- Policy years ---------------------------------------------------------------------------
export type PolicyYear={index:number;start:string;end:string};
/** A policy issued on 29 February runs "to 28 February midnight", so its anniversary rolls forward to 1 March. */
export function anniversary(inceptionDate:string,years:number):string {
 const y=Number(inceptionDate.slice(0,4)),m=Number(inceptionDate.slice(5,7))-1,d=Number(inceptionDate.slice(8,10));
 return iso(Date.UTC(y+years,m,d));
}
/** The policy year containing `now` (index 0 is the first year). Null before inception. */
export function policyYearFor(inceptionDate:string,now=new Date()):PolicyYear|null {
 if(!validDate(inceptionDate))return null;
 const current=today(now);if(current<day(inceptionDate))return null;
 let index=Math.max(0,new Date(current).getUTCFullYear()-Number(inceptionDate.slice(0,4))-1);
 while(day(anniversary(inceptionDate,index+1))<=current)index++;
 while(index>0&&day(anniversary(inceptionDate,index))>current)index--;
 return {index,start:anniversary(inceptionDate,index),end:addDays(anniversary(inceptionDate,index+1),-1)};
}

// --- Annual health check-up --------------------------------------------------------------------
export type CheckupInput={rule:CheckupRule|null;sumInsured?:number|null;floater?:boolean;inceptionDate?:string|null;lastClaimedOn?:string|null;claimFreePreviousYear?:boolean|null;memberAge?:number|null;now?:Date};
export type CheckupStatus='available'|'used_this_year'|'wait_first_year'|'needs_claim_free_year'|'claim_made_last_year'|'wait_block'|'too_young'|'unknown_rule'|'not_started'|'unknown_timing'|'invalid';
export type CheckupResult={status:CheckupStatus;amount:number|null;amountBasis:CheckupLimit['type']|'schedule'|null;mode:CheckupRule['mode']|null;optional:boolean;nextEligibleOn:string|null;policyYear:PolicyYear|null;notes:string[]};
export function checkupAmount(limit:CheckupLimit|null,sumInsured:number|null|undefined,floater=false):{amount:number|null;basis:CheckupResult['amountBasis'];note?:string} {
 if(!limit)return {amount:null,basis:'schedule',note:'limit_in_schedule'};
 if(limit.type==='package')return {amount:null,basis:'package'};
 if(limit.type==='fixed')return finite(limit.amount)&&limit.amount>=0?{amount:money(limit.amount),basis:'fixed'}:{amount:null,basis:'fixed',note:'limit_in_schedule'};
 if(!finite(sumInsured)||sumInsured<=0)return {amount:null,basis:limit.type,note:'needs_sum_insured'};
 if(limit.type==='per_lakh'){const raw=Math.floor(sumInsured/100000)*limit.per_lakh;const cap=floater?limit.max_floater:limit.max_individual;return {amount:money(cap===null?raw:Math.min(raw,cap)),basis:'per_lakh'};}
 if(limit.type==='percent_si'){const raw=sumInsured*limit.percent/100;return {amount:money(limit.max===null?raw:Math.min(raw,limit.max)),basis:'percent_si'};}
 const row=[...limit.by_si].reverse().find(([si])=>sumInsured>=si);
 return row?{amount:row[1],basis:'table'}:{amount:null,basis:'table',note:'below_table'};
}
export function healthCheckup(input:CheckupInput):CheckupResult {
 const now=input.now||new Date(),notes:string[]=[];
 const base:CheckupResult={status:'available',amount:null,amountBasis:null,mode:input.rule?.mode??null,optional:Boolean(input.rule?.eligibility.optional),nextEligibleOn:null,policyYear:null,notes};
 if(!input.rule)return {...base,status:'unknown_rule'};
 if(input.lastClaimedOn!=null&&input.lastClaimedOn!==''&&!validDate(input.lastClaimedOn))return {...base,status:'invalid'};
 if(input.inceptionDate!=null&&input.inceptionDate!==''&&!validDate(input.inceptionDate))return {...base,status:'invalid'};
 const {amount,basis,note}=checkupAmount(input.rule.limit,input.sumInsured,input.floater);
 if(note)notes.push(note);
 const result:CheckupResult={...base,amount,amountBasis:basis};
 if(input.rule.eligibility.optional)notes.push('optional_cover');
 if(input.rule.mode==='cashless')notes.push('cashless_only');
 const e=input.rule.eligibility;
 if(finite(input.memberAge)&&e.min_age!==undefined&&input.memberAge<e.min_age)return {...result,status:'too_young'};
 if(!input.inceptionDate)return {...result,status:'unknown_timing',notes:[...notes,'needs_dates']};
 const year=policyYearFor(input.inceptionDate,now);
 if(!year)return {...result,status:'not_started',nextEligibleOn:input.inceptionDate};
 result.policyYear=year;
 if(e.from==='after_first_year'&&year.index===0)return {...result,status:'wait_first_year',nextEligibleOn:addDays(year.end,1)};
 if(e.from==='claim_free_year'){
  if(year.index===0)return {...result,status:'wait_first_year',nextEligibleOn:addDays(year.end,1)};
  if(input.claimFreePreviousYear===false)return {...result,status:'claim_made_last_year',nextEligibleOn:addDays(year.end,1)};
  if(input.claimFreePreviousYear!==true)return {...result,status:'needs_claim_free_year'};
 }
 if(e.from==='every_n_years'){
  // A block benefit is available in the policy year that follows each completed block (years n, 2n, …).
  const n=e.every_years||2;
  if(year.index===0||year.index%n!==0){const nextIndex=(Math.floor(year.index/n)+1)*n;return {...result,status:'wait_block',nextEligibleOn:anniversary(input.inceptionDate,nextIndex)};}
 }
 if(input.lastClaimedOn){
  if(day(input.lastClaimedOn)>today(now))notes.push('future_claim_ignored');
  else if(input.lastClaimedOn>=year.start&&input.lastClaimedOn<=year.end)return {...result,status:'used_this_year',nextEligibleOn:addDays(year.end,1)};
 }
 return result;
}

// --- Room upgrade --------------------------------------------------------------------------------
export type RoomImpactStatus='no_limit'|'within_limit'|'impact'|'needs_sum_insured'|'needs_eligible_rate'|'invalid';
export type RoomImpact={status:RoomImpactStatus;eligiblePerDay:number|null;eligibleBasis:'any'|'category'|'percent_si'|'rupee_cap'|null;category:string|null;roomDifference:number;proportion:number|null;associatedDeduction:number|null;totalImpact:number|null;notes:string[]};
export function eligibleRoom(rule:RoomRule,sumInsured?:number|null):{category:string;perDay:number|null;basis:RoomImpact['eligibleBasis'];needsSumInsured:boolean} {
 if(rule.category==='by_si'){
  if(!finite(sumInsured)||sumInsured<=0)return {category:'by_si',perDay:null,basis:null,needsSumInsured:true};
  const match=rule.category_by_si.find(([si])=>si===null||sumInsured<=si);
  return eligibleRoom({category:match?match[1]:'any'} as RoomRule,sumInsured);
 }
 if(rule.category==='any')return {category:'any',perDay:null,basis:'any',needsSumInsured:false};
 if(rule.category==='percent_si'){if(!finite(sumInsured)||sumInsured<=0)return {category:rule.category,perDay:null,basis:'percent_si',needsSumInsured:true};return {category:rule.category,perDay:money(sumInsured*rule.percent/100),basis:'percent_si',needsSumInsured:false};}
 if(rule.category==='rupee_cap'){
  if(!finite(sumInsured)||sumInsured<=0)return {category:rule.category,perDay:null,basis:'rupee_cap',needsSumInsured:true};
  const row=rule.cap_by_si.find(([si])=>sumInsured<=si)||rule.cap_by_si[rule.cap_by_si.length-1];
  const cap=row[1];return {category:rule.category,perDay:money(cap.amount??sumInsured*(cap.percent||0)/100),basis:'rupee_cap',needsSumInsured:false};
 }
 return {category:rule.category,perDay:null,basis:'category',needsSumInsured:false};
}
export type RoomInput={rule:RoomRule;sumInsured?:number|null;chosenRoomRent:number;hospitalEligibleRate?:number|null;days:number;associatedExpenses:number};
export function roomUpgradeImpact(input:RoomInput):RoomImpact {
 const notes=['policy_decides','icu_excluded','differential_billing'];
 const empty=(status:RoomImpactStatus,extra:Partial<RoomImpact>={}):RoomImpact=>({status,eligiblePerDay:null,eligibleBasis:null,category:null,roomDifference:0,proportion:null,associatedDeduction:null,totalImpact:null,notes,...extra});
 if(!finite(input.chosenRoomRent)||input.chosenRoomRent<=0||!Number.isInteger(input.days)||input.days<1||input.days>365||!finite(input.associatedExpenses)||input.associatedExpenses<0||input.associatedExpenses>1e9||input.chosenRoomRent>1e7)return empty('invalid');
 const eligible=eligibleRoom(input.rule,input.sumInsured);
 if(eligible.needsSumInsured)return empty('needs_sum_insured',{category:eligible.category});
 if(eligible.basis==='any')return empty('no_limit',{eligibleBasis:'any',category:'any',roomDifference:0,proportion:1,associatedDeduction:0,totalImpact:0});
 let perDay=eligible.perDay;
 if(eligible.basis==='category'){
  if(!finite(input.hospitalEligibleRate)||input.hospitalEligibleRate<=0)return empty('needs_eligible_rate',{eligibleBasis:'category',category:eligible.category});
  perDay=money(input.hospitalEligibleRate);
 }
 if(perDay===null)return empty('invalid');
 if(input.chosenRoomRent<=perDay)return empty('within_limit',{eligiblePerDay:perDay,eligibleBasis:eligible.basis,category:eligible.category,roomDifference:0,proportion:1,associatedDeduction:0,totalImpact:0});
 const proportion=perDay/input.chosenRoomRent;
 const roomDifference=money((input.chosenRoomRent-perDay)*input.days);
 const associatedDeduction=money(input.associatedExpenses*(1-proportion));
 return {status:'impact',eligiblePerDay:perDay,eligibleBasis:eligible.basis,category:eligible.category,roomDifference,proportion,associatedDeduction,totalImpact:roomDifference+associatedDeduction,notes};
}

// --- Waiting periods and the moratorium ---------------------------------------------------------
export type WaitingPeriod={required:number;served:number;done:boolean;remaining:number;endsOn:string};
export type WaitingInput={inceptionDate?:string|null;continuityFrom?:string|null;pedMonths:number|null;specificMonths:number|null;initialDays:number|null;now?:Date};
export type WaitingResult={status:'ok'|'needs_dates'|'future_start'|'invalid';from:string|null;servedMonths:number|null;servedDays:number|null;initial:WaitingPeriod|null;specific:WaitingPeriod|null;ped:WaitingPeriod|null;moratorium:WaitingPeriod|null;notes:string[]};
export const MORATORIUM_MONTHS=60;
export function waitingPeriods(input:WaitingInput):WaitingResult {
 const now=input.now||new Date(),notes:string[]=['ported_credit_counts','enhancement_resets','accident_exempt','declared_ped_only'];
 const none:WaitingResult={status:'needs_dates',from:null,servedMonths:null,servedDays:null,initial:null,specific:null,ped:null,moratorium:null,notes};
 const inception=input.inceptionDate||null,continuity=input.continuityFrom||null;
 if((inception&&!validDate(inception))||(continuity&&!validDate(continuity)))return {...none,status:'invalid'};
 if(inception&&continuity&&continuity>inception)return {...none,status:'invalid'};
 const from=continuity||inception;
 if(!from)return none;
 if(day(from)>today(now))return {...none,status:'future_start',from};
 const servedMonths=monthsBetween(from,now),servedDays=daysBetween(from,iso(today(now)));
 const months=(required:number|null):WaitingPeriod|null=>required===null?null:{required,served:servedMonths,done:servedMonths>=required,remaining:Math.max(0,required-servedMonths),endsOn:addMonths(from,required)};
 const initial=input.initialDays===null?null:{required:input.initialDays,served:servedDays,done:servedDays>=input.initialDays,remaining:Math.max(0,input.initialDays-servedDays),endsOn:addDays(from,input.initialDays)};
 return {status:'ok',from,servedMonths,servedDays,initial,specific:months(input.specificMonths),ped:months(input.pedMonths),moratorium:months(MORATORIUM_MONTHS),notes};
}

// --- Pre- and post-hospitalisation windows ------------------------------------------------------
export type PrePostInput={rule:PrePostRule|null;admissionDate:string;dischargeDate:string;expenseDate:string};
export type PrePostResult={position:'pre'|'post'|'during'|'outside_pre'|'outside_post'|'unknown_pre'|'unknown_post'|'invalid';daysBeforeAdmission:number|null;daysAfterDischarge:number|null;preWindowStart:string|null;postWindowEnd:string|null;notes:string[]};
export function prePostWindow(input:PrePostInput):PrePostResult {
 const notes=['same_condition','inpatient_claim_required','opd_not_covered'];
 const invalid:PrePostResult={position:'invalid',daysBeforeAdmission:null,daysAfterDischarge:null,preWindowStart:null,postWindowEnd:null,notes};
 if(!validDate(input.admissionDate)||!validDate(input.dischargeDate)||!validDate(input.expenseDate)||input.dischargeDate<input.admissionDate)return invalid;
 const pre=input.rule?.pre_days??null,post=input.rule?.post_days??null;
 const preWindowStart=pre===null?null:addDays(input.admissionDate,-pre),postWindowEnd=post===null?null:addDays(input.dischargeDate,post);
 const base={daysBeforeAdmission:null as number|null,daysAfterDischarge:null as number|null,preWindowStart,postWindowEnd,notes};
 if(input.expenseDate>=input.admissionDate&&input.expenseDate<=input.dischargeDate)return {...base,position:'during'};
 if(input.expenseDate<input.admissionDate){
  const days=daysBetween(input.expenseDate,input.admissionDate);
  if(pre===null)return {...base,position:'unknown_pre',daysBeforeAdmission:days};
  return {...base,position:days<=pre?'pre':'outside_pre',daysBeforeAdmission:days};
 }
 const days=daysBetween(input.dischargeDate,input.expenseDate);
 if(post===null)return {...base,position:'unknown_post',daysAfterDischarge:days};
 return {...base,position:days<=post?'post':'outside_post',daysAfterDischarge:days};
}

// --- Co-payment ----------------------------------------------------------------------------------
export type CopayResult={percent:number;amount:number|null;reason:'none'|'standard'|'entry_age_61_plus';notes:string[]};
export function copayEstimate(rule:CopayRule|null,admissibleAmount?:number|null,entryAge?:number|null):CopayResult {
 if(!rule)return {percent:0,amount:null,reason:'none',notes:['copay_unknown']};
 const notes:string[]=[];if(rule.optional)notes.push('copay_optional');if(rule.zonal)notes.push('copay_zonal');
 let percent=rule.percent,reason:CopayResult['reason']=rule.percent>0?'standard':'none';
 if(rule.conditional&&finite(entryAge)&&entryAge>=61){percent=Math.max(percent,rule.conditional.percent);reason='entry_age_61_plus';}
 else if(rule.conditional&&!finite(entryAge))notes.push('copay_depends_on_entry_age');
 const amount=finite(admissibleAmount)&&admissibleAmount>=0?money(admissibleAmount*percent/100):null;
 return {percent,amount,reason,notes};
}
