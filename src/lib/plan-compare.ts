// Side-by-side plan comparison and neutral family-structure advice (M21). Only published,
// cited rules and the NL-48 discharge disclosures are compared — never premiums, never a
// recommendation to buy. Unknown rules are shown as unknown, not guessed.
import plansRaw from '../../data/plans.json' with {type:'json'};
import contactsRaw from '../../data/contacts.json' with {type:'json'};
import {compareInsurer,shareText,type Disclosure,type SourceReview} from './index-comparison.ts';
import type {Language} from './types.ts';
import type {CheckupRule,CopayRule,PrePostRule,RoomRule} from './coverage-simulator.ts';

export type SourcedRule={source_url:string;verified_on:string;evidence:string;value?:unknown;value_hi?:string;detail?:string;detail_hi?:string;note?:string;note_hi?:string};
export type PlanRules={
 room_rent:(SourcedRule&RoomRule)|null;copay:(SourcedRule&CopayRule)|null;
 ped_waiting_months:(SourcedRule&{value:number})|null;specific_waiting_months:(SourcedRule&{value:number})|null;initial_waiting_days:(SourcedRule&{value:number})|null;
 consumables:(SourcedRule&{value:'included'|'rider'|'optional'|'excluded'})|null;health_checkup:(SourcedRule&CheckupRule)|null;
 pre_post_hospitalisation:(SourcedRule&PrePostRule)|null;sub_limits:(SourcedRule&{items:{treatment:string;limit:string}[]})|null;
};
export type CataloguePlan={id:string;insurer_id:string;name:string;kind:'health'|'life'|'motor';segment:string;rules:PlanRules};
export const cataloguePlans=plansRaw as unknown as CataloguePlan[];
const contacts=contactsRaw as {id:string;name:string;name_hi?:string;kind?:string}[];
export const MAX_COMPARE=3;
export const COMPARE_ROWS=['discharge_lt1h','discharge_gt6h','room_rent','copay','ped_waiting_months','specific_waiting_months','initial_waiting_days','consumables','health_checkup','pre_post_hospitalisation','sub_limits'] as const;
export type CompareRowKey=typeof COMPARE_ROWS[number];
export type CompareCell={text:string;unknown:boolean;sourceUrl?:string;verifiedOn?:string;period?:string|null;mode?:string};
export type CompareRow={key:CompareRowKey;cells:CompareCell[]};
export type Comparison={plans:{id:string;name:string;insurerId:string;insurerName:string}[];rows:CompareRow[]};
export type CompareText={months:(n:number)=>string;days:(n:number)=>string;unknown:string;consumables:(v:string)=>string;noDisclosure:string};

export function insurerName(id:string,language:Language):string {
 const contact=contacts.find(c=>c.id===id);return (language==='hi'?contact?.name_hi:undefined)||contact?.name||id;
}
export function planById(id:string):CataloguePlan|undefined{return cataloguePlans.find(p=>p.id===id);}
function text(rule:SourcedRule|null,language:Language,fallback:string):string {
 if(!rule)return fallback;
 const value=language==='hi'?rule.value_hi||rule.value:rule.value;
 const detail=language==='hi'?rule.detail_hi||rule.detail:rule.detail;
 return [String(value??''),detail?`— ${detail}`:''].filter(Boolean).join(' ');
}
function cell(rule:SourcedRule|null,body:string,unknown=!rule):CompareCell{return {text:body,unknown,...(rule?{sourceUrl:rule.source_url,verifiedOn:rule.verified_on}:{})};}
/** Builds the comparison table for up to MAX_COMPARE distinct catalogue plans. Unknown ids are ignored. */
export function comparePlans(ids:string[],options:{disclosures:Disclosure[];reviews?:SourceReview[];language:Language;text:CompareText}):Comparison {
 const unique=[...new Set(ids)].map(planById).filter((p):p is CataloguePlan=>Boolean(p)).slice(0,MAX_COMPARE);
 const {language,text:t}=options;
 const plans=unique.map(p=>({id:p.id,name:p.name,insurerId:p.insurer_id,insurerName:insurerName(p.insurer_id,language)}));
 const discharge=unique.map(p=>compareInsurer(options.disclosures,p.insurer_id,options.reviews||[]));
 const rows:CompareRow[]=COMPARE_ROWS.map(key=>({key,cells:unique.map((p,i)=>{
  const r=p.rules;
  switch(key){
   case 'discharge_lt1h':case 'discharge_gt6h':{
    const c=discharge[i],share=c.shares[key==='discharge_lt1h'?0:3];
    return {text:c.mode==='missing'||!share?t.noDisclosure:shareText(share),unknown:c.mode==='missing'||!share,period:c.period,mode:c.mode};
   }
   case 'room_rent':return cell(r.room_rent,text(r.room_rent,language,t.unknown));
   case 'copay':return cell(r.copay,text(r.copay,language,t.unknown));
   case 'ped_waiting_months':return cell(r.ped_waiting_months,r.ped_waiting_months?t.months(r.ped_waiting_months.value):t.unknown);
   case 'specific_waiting_months':return cell(r.specific_waiting_months,r.specific_waiting_months?`${t.months(r.specific_waiting_months.value)}${r.specific_waiting_months.detail?` — ${language==='hi'?r.specific_waiting_months.detail_hi||r.specific_waiting_months.detail:r.specific_waiting_months.detail}`:''}`:t.unknown);
   case 'initial_waiting_days':return cell(r.initial_waiting_days,r.initial_waiting_days?t.days(r.initial_waiting_days.value):t.unknown);
   case 'consumables':return cell(r.consumables,r.consumables?`${t.consumables(r.consumables.value)}${r.consumables.detail?` — ${language==='hi'?r.consumables.detail_hi||r.consumables.detail:r.consumables.detail}`:''}`:t.unknown);
   case 'health_checkup':return cell(r.health_checkup,text(r.health_checkup,language,t.unknown));
   case 'pre_post_hospitalisation':{
    const pp=r.pre_post_hospitalisation;if(!pp)return cell(null,t.unknown);
    const pre=pp.pre_days===null?t.unknown:t.days(pp.pre_days),post=pp.post_days===null?(language==='hi'?pp.note_hi||pp.note:pp.note)||t.unknown:t.days(pp.post_days);
    return cell(pp,`${pre} / ${post}`);
   }
   case 'sub_limits':return cell(r.sub_limits,text(r.sub_limits,language,t.unknown));
  }
 })}));
 return {plans,rows};
}

// --- Family structure advice ----------------------------------------------------------------------
export type FamilyMember={age:number;preExisting:boolean};
export type Advice={key:string;fields?:Record<string,string|number>};
export const MAX_FAMILY=12;
/** Structural, plan-neutral guidance derived from the catalogue's published traps. Invalid input yields no advice. */
export function familyAdvice(members:FamilyMember[]):Advice[] {
 if(!Array.isArray(members)||members.length===0||members.length>MAX_FAMILY)return [];
 if(members.some(m=>!Number.isFinite(m.age)||m.age<0||m.age>120||typeof m.preExisting!=='boolean'))return [];
 const advice:Advice[]=[];
 const seniors=members.filter(m=>m.age>=60),adults=members.filter(m=>m.age>=18&&m.age<60),children=members.filter(m=>m.age<18);
 const eldest=Math.max(...members.map(m=>m.age));
 if(seniors.length&&members.length>seniors.length)advice.push({key:'advice.separateSeniors',fields:{seniors:seniors.length,eldest}});
 if(seniors.some(m=>m.age>=61))advice.push({key:'advice.seniorCopay'});
 if(seniors.length)advice.push({key:'advice.seniorPedWait'});
 if(members.some(m=>m.preExisting))advice.push({key:'advice.declarePed',fields:{count:members.filter(m=>m.preExisting).length}});
 if(members.length>=4)advice.push({key:'advice.topUp'});
 if(adults.length&&!seniors.length&&members.length>1)advice.push({key:'advice.floaterEldest',fields:{eldest}});
 if(children.length&&!adults.length&&!seniors.length)advice.push({key:'advice.childNeedsAdult'});
 advice.push({key:'advice.roomRent'},{key:'advice.consumables'},{key:'advice.moratorium'},{key:'advice.notRecommendation'});
 return advice;
}
