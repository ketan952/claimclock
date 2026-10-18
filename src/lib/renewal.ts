// Renewal Guardian arithmetic (M25). Pure, deterministic functions over a policy's renewal date,
// two premium figures and a policy schedule. Every date here comes from a rule in data/rules.json
// (porting window, grace period, free look, refund) or from a number the user typed; the page
// translates statuses and note keys. Nothing is a recommendation to buy, port or stay.
import rulesRaw from '../../data/rules.json' with {type:'json'};
import en from '../i18n/en.json' with {type:'json'};
import hi from '../i18n/hi.json' with {type:'json'};
import {addDays,daysBetween,validDate} from './coverage-simulator.ts';
import {buildCalendar,type CalendarEvent} from './reminders.ts';
import type {Language,Rule} from './types.ts';

const rules=rulesRaw as Rule[];
const dictionaries:Record<Language,Record<string,string>>={en:en as Record<string,string>,hi:hi as Record<string,string>};
const text=(language:Language,key:string,fields:Record<string,string|number>={})=>(dictionaries[language][key]||dictionaries.en[key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(fields[name]??`[${name}]`));
const iso=(now:Date)=>new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const round1=(n:number)=>Math.round(n*10)/10;
export const rule=(id:string):Rule=>{const found=rules.find(r=>r.id===id);if(!found)throw Error(`Unknown rule ${id}`);return found;};

// --- Renewal timeline -------------------------------------------------------------------------------
export const PAYMENT_MODES=['annual','half_yearly','quarterly','monthly'] as const;
export type PaymentMode=typeof PAYMENT_MODES[number];
/** Health Master Circular Ch. I 8(a): fifteen days for monthly instalments, thirty for every other mode. */
export const GRACE_DAYS:Record<PaymentMode,number>={monthly:15,quarterly:30,half_yearly:30,annual:30};
/** Porting applications are accepted 60 to 30 days before renewal; inside that an insurer may still consider one up to 15 days before (PPHI MC Sec. 2 Ch. VI 24.2). Migration asks for 30 days (2020 Guidelines para 7). */
export const PORTING_OPENS_DAYS=60,PORTING_CLOSES_DAYS=30,PORTING_DISCRETION_DAYS=15,MIGRATION_DAYS=30;
export const CHECKPOINT_OFFSETS=[60,45,30,15,7,0] as const;
export type CheckpointKey='compare'|'decide'|'apply'|'discretion'|'pay'|'renewal';
export type Checkpoint={key:CheckpointKey;offsetDays:number;date:string;passed:boolean;ruleId:string|null};
export type RenewalStatus='upcoming'|'porting_window'|'window_closing'|'last_days'|'due_today'|'in_grace'|'lapsed'|'invalid';
export type RenewalSchedule={status:RenewalStatus;renewalDate:string;today:string;daysLeft:number;mode:PaymentMode;graceDays:number;graceEndsOn:string;graceDaysLeft:number;portingOpensOn:string;portingClosesOn:string;portingDiscretionUntil:string;migrationBy:string;checkpoints:Checkpoint[];ruleIds:string[];notes:string[]};
const CHECKPOINTS:[CheckpointKey,number,string|null][]=[['compare',60,'porting-window-30-60-days'],['decide',45,null],['apply',30,'porting-window-30-60-days'],['discretion',15,'porting-window-30-60-days'],['pay',7,'grace-period-15-30-days'],['renewal',0,'grace-period-15-30-days']];
export function renewalSchedule(renewalDate:string,mode:PaymentMode='annual',now=new Date()):RenewalSchedule {
 const today=iso(now);
 const invalid:RenewalSchedule={status:'invalid',renewalDate,today,daysLeft:0,mode,graceDays:GRACE_DAYS[mode]??30,graceEndsOn:'',graceDaysLeft:0,portingOpensOn:'',portingClosesOn:'',portingDiscretionUntil:'',migrationBy:'',checkpoints:[],ruleIds:[],notes:[]};
 if(!validDate(renewalDate)||!(mode in GRACE_DAYS))return invalid;
 const daysLeft=daysBetween(today,renewalDate);
 // A renewal date more than ten years away or more than two years past is almost certainly a typo.
 if(daysLeft>3660||daysLeft<-730)return invalid;
 const graceDays=GRACE_DAYS[mode],graceEndsOn=addDays(renewalDate,graceDays),graceDaysLeft=daysBetween(today,graceEndsOn);
 // "at least 30 days before, but not earlier than 60 days": both boundary days are inside the window; "within 15 days" keeps day 15 inside the discretion period.
 const status:RenewalStatus=daysLeft>PORTING_OPENS_DAYS?'upcoming':daysLeft>=PORTING_CLOSES_DAYS?'porting_window':daysLeft>=PORTING_DISCRETION_DAYS?'window_closing':daysLeft>0?'last_days':daysLeft===0?'due_today':graceDaysLeft>=0?'in_grace':'lapsed';
 const checkpoints:Checkpoint[]=CHECKPOINTS.map(([key,offsetDays,ruleId])=>({key,offsetDays,date:addDays(renewalDate,-offsetDays),passed:daysLeft<offsetDays,ruleId}));
 const notes=['planning_aid','wording_45_days'];
 if(mode!=='monthly')notes.push('no_cover_in_grace');
 if(status==='in_grace')notes.push('renew_in_grace');
 if(status==='lapsed')notes.push('lapsed_credits');
 return {status,renewalDate,today,daysLeft,mode,graceDays,graceEndsOn,graceDaysLeft,portingOpensOn:addDays(renewalDate,-PORTING_OPENS_DAYS),portingClosesOn:addDays(renewalDate,-PORTING_CLOSES_DAYS),portingDiscretionUntil:addDays(renewalDate,-PORTING_DISCRETION_DAYS),migrationBy:addDays(renewalDate,-MIGRATION_DAYS),checkpoints,ruleIds:['porting-window-30-60-days','migration-30-days','grace-period-15-30-days','renewal-not-denied-for-claims'],notes};
}
/** Calendar reminders at T-60 / T-45 / T-30 / T-7 and on the renewal day, each with a same-day alarm, in the interface language. */
export function renewalCalendar(schedule:RenewalSchedule,policyLabel:string,language:Language):string {
 if(schedule.status==='invalid')throw Error('Invalid renewal schedule');
 const label=policyLabel.trim().slice(0,80)||text(language,'renewal.calendarGenericPolicy');
 const events:CalendarEvent[]=schedule.checkpoints.filter(c=>c.key!=='discretion').map(c=>({when:new Date(`${c.date}T00:00:00Z`),title:`ClaimClock: ${text(language,`renewal.calendar.${c.key}Title`,{label})}`,body:`${text(language,`renewal.calendar.${c.key}Body`,{label,date:schedule.renewalDate,grace:schedule.graceDays})} ${text(language,'renewal.calendarFooter')}`,alarmDays:0}));
 return buildCalendar(events,'Renewal reminders');
}

// --- Premium hike ----------------------------------------------------------------------------------
export const GST_RATE=0.18;
/** Removing 18% GST from an unchanged bill lowers it by 1 − 1/1.18 ≈ 15.25%, not by 18%. */
export const GST_REMOVAL_PERCENT=round1((1-1/(1+GST_RATE))*100);
export const SENIOR_CAP_PERCENT=10,SENIOR_AGE=60;
export type HikeInput={oldPremium:number;newPremium:number;oldIncludesGst:boolean;newIncludesGst:boolean;seniorCitizen:boolean;ageBandChanged?:boolean|null;sumInsuredChanged?:boolean|null;claimedLastYear?:boolean|null};
export type HikeResult={status:'ok'|'invalid';oldBase:number;newBase:number;baseChangePercent:number;totalChangePercent:number;gstEffectPercent:number;seniorCap:'exceeds'|'within'|'not_applicable';verdict:'exceeds_senior_cap'|'rate_rise'|'within_gst_effect'|'decrease'|'unchanged'|'invalid';ruleIds:string[];notes:string[]};
export function premiumHike(input:HikeInput):HikeResult {
 const invalid:HikeResult={status:'invalid',oldBase:0,newBase:0,baseChangePercent:0,totalChangePercent:0,gstEffectPercent:0,seniorCap:'not_applicable',verdict:'invalid',ruleIds:[],notes:[]};
 if(!finite(input.oldPremium)||!finite(input.newPremium)||input.oldPremium<=0||input.newPremium<0||input.oldPremium>1e8||input.newPremium>1e8)return invalid;
 const oldBase=input.oldIncludesGst?input.oldPremium/(1+GST_RATE):input.oldPremium;
 const newBase=input.newIncludesGst?input.newPremium/(1+GST_RATE):input.newPremium;
 const baseChangePercent=round1((newBase-oldBase)/oldBase*100),totalChangePercent=round1((input.newPremium-input.oldPremium)/input.oldPremium*100);
 const gstRemoved=input.oldIncludesGst&&!input.newIncludesGst;
 const gstEffectPercent=gstRemoved?-GST_REMOVAL_PERCENT:0;
 const ruleIds=['renewal-loading-portfolio-only','renewal-not-denied-for-claims'];
 const notes:string[]=[];
 if(gstRemoved){notes.push('gst_removed');ruleIds.push('gst-exempt-individual-health-2025-09-22');}
 else if(input.newIncludesGst)notes.push('gst_still_charged');
 if(input.ageBandChanged===true)notes.push('age_band_changed');else if(input.ageBandChanged==null)notes.push('age_band_unknown');
 if(input.sumInsuredChanged===true)notes.push('sum_insured_changed');
 if(input.claimedLastYear===true)notes.push('claim_not_a_loading');
 let seniorCap:HikeResult['seniorCap']='not_applicable';
 if(input.seniorCitizen){ruleIds.push('senior-premium-cap-10pct');seniorCap=baseChangePercent>SENIOR_CAP_PERCENT?'exceeds':'within';}
 const verdict:HikeResult['verdict']=seniorCap==='exceeds'?'exceeds_senior_cap':baseChangePercent>0.05?'rate_rise':baseChangePercent<-0.05?'decrease':gstRemoved?'within_gst_effect':'unchanged';
 return {status:'ok',oldBase:Math.round(oldBase),newBase:Math.round(newBase),baseChangePercent,totalChangePercent,gstEffectPercent,seniorCap,verdict,ruleIds,notes};
}
export const isSeniorCitizen=(birthYear:number|null|undefined,now=new Date())=>finite(birthYear)&&now.getUTCFullYear()-birthYear>=SENIOR_AGE;

// --- Free look ----------------------------------------------------------------------------------------
export const FREE_LOOK_DAYS=30,FREE_LOOK_REFUND_DAYS=7;
export type FreeLookStatus='open'|'last_day'|'closed'|'not_received'|'invalid';
export type FreeLookWindow={status:FreeLookStatus;receivedOn:string;endsOn:string;daysLeft:number;refundDueOn:string|null;ruleIds:string[];notes:string[]};
/** Thirty days from receipt of the policy document (Health MC Ch. I 5); the refund follows within seven days of the request (PPHI MC Citizens' Charter). */
export function freeLookWindow(receivedOn:string,requestedOn?:string|null,now=new Date()):FreeLookWindow {
 const base:FreeLookWindow={status:'invalid',receivedOn,endsOn:'',daysLeft:0,refundDueOn:null,ruleIds:['free-look-30-days','free-look-refund-7-days'],notes:['count_conservatively','keep_delivery_proof','one_year_term']};
 if(!validDate(receivedOn)||(requestedOn&&!validDate(requestedOn)))return base;
 const today=iso(now);
 if(receivedOn>today)return {...base,status:'not_received',endsOn:addDays(receivedOn,FREE_LOOK_DAYS),daysLeft:daysBetween(today,addDays(receivedOn,FREE_LOOK_DAYS))};
 if(requestedOn&&requestedOn<receivedOn)return base;
 const endsOn=addDays(receivedOn,FREE_LOOK_DAYS),daysLeft=daysBetween(today,endsOn);
 const refundDueOn=requestedOn?addDays(requestedOn,FREE_LOOK_REFUND_DAYS):null;
 const status:FreeLookStatus=daysLeft<0?'closed':daysLeft<=1?'last_day':'open';
 return {...base,status,endsOn,daysLeft,refundDueOn};
}
export const PROMISE_FIELDS=['insurerId','planName','sumInsured','roomRent','copayPercent','pedMonths','consumables','members'] as const;
export type PromiseField=typeof PROMISE_FIELDS[number];
export type PromiseFields=Partial<Record<PromiseField,string|number|null|undefined>>;
export type Mismatch={field:PromiseField;promised:string;actual:string;severity:'high'|'medium'};
export type FreeLookDiff={compared:PromiseField[];matched:PromiseField[];mismatches:Mismatch[];skipped:PromiseField[]};
const HIGH:PromiseField[]=['insurerId','sumInsured','copayPercent','pedMonths','members'];
const normalise=(value:string|number)=>String(value).toLowerCase().replace(/[\s,₹.]+/g,' ').replace(/\brs\b|\binr\b/g,'').trim();
/** Compares what the seller promised with what the schedule says, field by field, only where both sides have a value. Numbers compare as numbers; text compares after normalising case, spacing and currency marks. */
export function freeLookDiff(promised:PromiseFields,actual:PromiseFields):FreeLookDiff {
 const compared:PromiseField[]=[],matched:PromiseField[]=[],skipped:PromiseField[]=[],mismatches:Mismatch[]=[];
 const present=(v:unknown):v is string|number=>v!==null&&v!==undefined&&v!==''&&!(typeof v==='number'&&!Number.isFinite(v));
 for(const field of PROMISE_FIELDS){
  const p=promised[field],a=actual[field];
  if(!present(p)||!present(a)){skipped.push(field);continue;}
  compared.push(field);
  const equal=typeof p==='number'||typeof a==='number'?Number(p)===Number(a):normalise(p)===normalise(a);
  if(equal)matched.push(field);else mismatches.push({field,promised:String(p),actual:String(a),severity:HIGH.includes(field)?'high':'medium'});
 }
 return {compared,matched,mismatches,skipped};
}

// --- Checklists ----------------------------------------------------------------------------------------
export type ChecklistStep={key:string;ruleId:string|null};
/** Porting, in the order it happens; each step's rule carries the citation the page shows. */
export const PORTING_STEPS:ChecklistStep[]=[{key:'compare',ruleId:'porting-window-30-60-days'},{key:'apply',ruleId:'porting-window-30-60-days'},{key:'disclose',ruleId:'porting-credits-no-charges'},{key:'records',ruleId:'porting-records-72h'},{key:'decision',ruleId:'porting-decision-5-days'},{key:'credits',ruleId:'porting-credits-no-charges'},{key:'keepOld',ruleId:'grace-period-15-30-days'}];
export const MIGRATION_STEPS:ChecklistStep[]=[{key:'when',ruleId:'migration-30-days'},{key:'credits',ruleId:'migration-credits-36-months'},{key:'decision',ruleId:'proposal-decision-7-days'},{key:'groupExit',ruleId:'group-to-individual-migration'},{key:'renewalRight',ruleId:'renewal-not-denied-for-claims'}];
export function ruleCitationText(id:string,language:Language):string{const r=rule(id);return String(language==='hi'?r.plain_hi||r.plain_en:r.plain_en||'');}
