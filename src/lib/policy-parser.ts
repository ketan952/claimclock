// On-device policy schedule / Customer Information Sheet parser (M20). Deterministic text
// rules only: the document never leaves the page, and every value is shown for the user to
// correct before anything is saved. Indian schedules write dates day-first.
import contactsRaw from '../../data/contacts.json' with {type:'json'};
import plansRaw from '../../data/plans.json' with {type:'json'};
import {detectInsurerFromText} from './deductions.ts';
import type {Relation} from './vault.ts';

type PlanRow={id:string;insurer_id:string;name:string};
const contacts=contactsRaw as {id:string;name:string;name_hi?:string;kind?:string}[];
const plans=plansRaw as PlanRow[];
export type ParsedMember={name:string;relation?:Relation;birthYear?:number};
export type ParsedPolicy={
 insurerId?:string;planId?:string;planName?:string;policyNumber?:string;uhid?:string;sumInsured?:number;
 inceptionDate?:string;renewalDate?:string;continuityFrom?:string;roomRent?:string;copayPercent?:number;members:ParsedMember[];
 warnings:string[];
};
const MONTHS:Record<string,number>={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const RELATIONS:[RegExp,Relation][]=[[/\bself\b|\bproposer\b|\bpolicy\s*holder\b/i,'self'],[/\bspouse\b|\bwife\b|\bhusband\b/i,'spouse'],[/\bson\b|\bdaughter\b|\bchild\b/i,'child'],[/\bfather[- ]in[- ]law\b|\bmother[- ]in[- ]law\b/i,'parent-in-law'],[/\bfather\b|\bmother\b|\bparent\b/i,'parent']];
const clean=(value:string)=>value.replace(/\s+/g,' ').replace(/[|,;:]+$/,'').trim();
/** Returns YYYY-MM-DD for d/m/y, d-Mon-y, "12 May 2023" or ISO forms; null when the calendar date is invalid. */
export function parseIndianDate(value:string):string|null {
 const text=value.trim();let day:number,month:number,year:number;
 let match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}
 else if((match=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))){day=Number(match[1]);month=Number(match[2]);year=Number(match[3]);if(match[3].length===2)year+=2000;}
 else if((match=text.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\/-]+([A-Za-z]{3,9})[\s,\/-]+(\d{4})$/))){day=Number(match[1]);month=MONTHS[match[2].slice(0,4).toLowerCase()]??MONTHS[match[2].slice(0,3).toLowerCase()]??0;year=Number(match[3]);}
 else return null;
 if(!month||month>12||!day||day>31||year<1990||year>2100)return null;
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return date.toISOString().slice(0,10);
}
const DATE_TOKEN=String.raw`(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?[\s\/-]+[A-Za-z]{3,9}[\s,\/-]+\d{4}|\d{4}-\d{2}-\d{2})`;
function firstDate(text:string,labels:RegExp):string|undefined {
 for(const line of text.split(/\r?\n/)){
  if(!labels.test(line))continue;
  const match=line.match(new RegExp(DATE_TOKEN));
  if(match){const parsed=parseIndianDate(match[1]);if(parsed)return parsed;}
 }
 return undefined;
}
/** "Rs. 10,00,000", "₹ 5 Lakh", "10 L", "1 Cr" → rupees. */
export function parseRupees(value:string):number|undefined {
 const text=value.replace(/₹|rs\.?|inr/gi,'').trim();
 const words=text.match(/^([\d.,]+)\s*(lakhs?|lacs?|l|crores?|cr)\b/i);
 if(words){const n=Number(words[1].replace(/,/g,''));if(!Number.isFinite(n))return undefined;return Math.round(n*(/^c/i.test(words[2])?1e7:1e5));}
 const digits=text.match(/^([\d,]+)(?:\.\d+)?/);
 if(!digits)return undefined;
 const n=Number(digits[1].replace(/,/g,''));return Number.isFinite(n)&&n>=1000?n:undefined;
}
function matchAfter(text:string,label:RegExp,value:RegExp):string|undefined {
 for(const line of text.split(/\r?\n/)){
  const at=line.search(label);if(at<0)continue;
  const rest=line.slice(at).replace(label,'');const match=rest.match(value);
  if(match)return clean(match[1]);
 }
 return undefined;
}
function policyNumber(text:string):string|undefined {
 // Numbers may be written in spaced groups ("2825 2034 5678 9000 000"); a double space, pipe or label ends the value.
 const value=matchAfter(text,/\b(?:policy|certificate|cover\s*note)\s*(?:no\.?|number|#|id)\s*[:.\-]?\s*/i,/^\s*([A-Z0-9][A-Z0-9\/-]*(?: [A-Z0-9][A-Z0-9\/-]*)*)/i);
 const trimmed=value?.replace(/\s+(?:dated?|valid|period|from|issued)\b.*$/i,'').trim();
 return trimmed&&trimmed.length>=6&&trimmed.length<=40&&/\d/.test(trimmed)?trimmed:undefined;
}
function sumInsured(text:string):number|undefined {
 const value=matchAfter(text,/\b(?:base\s+)?sum\s+(?:insured|assured)\b[^0-9₹]{0,40}/i,/((?:₹|rs\.?|inr)?\s*[\d.,]+\s*(?:lakhs?|lacs?|l|crores?|cr)?\b)/i);
 return value?parseRupees(value):undefined;
}
function planName(text:string,insurerId?:string):{planId?:string;planName?:string} {
 const lower=text.toLowerCase();
 const candidates=plans.filter(p=>!insurerId||p.insurer_id===insurerId);
 const hit=candidates.find(p=>lower.includes(p.name.toLowerCase()))||candidates.find(p=>{const stem=p.name.toLowerCase().replace(/^my:/,'').split(/\s*\(/)[0];return stem.length>=6&&lower.includes(stem);});
 if(hit)return {planId:hit.id,planName:hit.name};
 const named=matchAfter(text,/\b(?:product|plan)\s*(?:name)?\s*[:\-]\s*/i,/^([A-Za-z][A-Za-z0-9 :.&'()\/-]{2,80})/);
 return named?{planName:named}:{};
}
function copay(text:string):number|undefined {
 for(const line of text.split(/\r?\n/)){
  if(!/co-?\s?pay(?:ment)?/i.test(line))continue;
  const percent=line.match(/(\d{1,2})\s*%/);if(percent)return Number(percent[1]);
  if(/\b(?:nil|not applicable|n\/a|none|no co-?pay)\b/i.test(line))return 0;
 }
 return undefined;
}
function roomRent(text:string):string|undefined {
 const value=matchAfter(text,/\broom\s*(?:rent|category|eligibility|type)(?:\s*(?:limit|cap))?\s*[:\-]?\s*/i,/^\s*([^\n]{3,120})/);
 return value&&!/^(?:means|shall)\b/i.test(value)?value:undefined;
}
function members(text:string):ParsedMember[] {
 const out:ParsedMember[]=[];const seen=new Set<string>();
 const push=(raw:string,context:string)=>{
  const name=clean(raw).replace(/\b(?:mr|mrs|ms|dr|shri|smt)\.?\s+/i,'').replace(/\s*\(.*$/,'');
  if(name.length<3||name.length>60||/\d/.test(name)||seen.has(name.toLowerCase()))return;
  seen.add(name.toLowerCase());
  const member:ParsedMember={name};
  const relation=RELATIONS.find(([pattern])=>pattern.test(context));if(relation)member.relation=relation[1];
  const year=context.match(/\b(19\d{2}|20[0-2]\d)\b/);if(year&&/\b(?:dob|birth|age|born)\b/i.test(context))member.birthYear=Number(year[1]);
  out.push(member);
 };
 for(const line of text.split(/\r?\n/)){
  const labelled=line.match(/\b(?:insured(?:\s*person)?(?:'s)?\s*name|name\s+of\s+(?:the\s+)?insured|proposer(?:'s)?\s*name|member\s*name)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,60})/i);
  if(labelled)push(labelled[1],line);
  // Table rows: "1 | Ramesh Kumar | Self | 12/03/1980" or "Sunita Kumar  Spouse  44 yrs".
  const row=line.match(/^\s*(?:\d{1,2}[.)]?\s*\|?\s*)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})\s*[|\t]?\s+(self|spouse|wife|husband|son|daughter|father|mother|father[- ]in[- ]law|mother[- ]in[- ]law)\b/i);
  if(row)push(row[1],line);
 }
 return out.slice(0,20);
}
export function parsePolicyText(text:string):ParsedPolicy {
 const warnings:string[]=[];
 const insurerId=detectInsurerFromText(text,contacts)||undefined;
 const result:ParsedPolicy={members:members(text),warnings};
 if(insurerId)result.insurerId=insurerId;else warnings.push('insurer');
 Object.assign(result,planName(text,insurerId));
 const number=policyNumber(text);if(number)result.policyNumber=number;else warnings.push('policyNumber');
 const uhid=matchAfter(text,/\buhid\s*(?:no\.?|number)?\s*[:.\-]?\s*/i,/^\s*([A-Z0-9][A-Z0-9\/-]{3,30})/i);if(uhid)result.uhid=uhid;
 const si=sumInsured(text);if(si)result.sumInsured=si;else warnings.push('sumInsured');
 const start=firstDate(text,/\b(?:policy\s*(?:period|start|commencement|inception)|period\s+of\s+(?:insurance|cover)|risk\s+(?:inception|start)|from|commencement\s+date|start\s+date|date\s+of\s+commencement)\b/i);
 if(start)result.inceptionDate=start;else warnings.push('inceptionDate');
 for(const line of text.split(/\r?\n/)){
  if(!/\b(?:policy\s*period|period\s+of\s+insurance|from\b.*\bto\b|expiry|end\s+date|valid\s+(?:till|up\s*to))/i.test(line))continue;
  const dates=[...line.matchAll(new RegExp(DATE_TOKEN,'g'))].map(m=>parseIndianDate(m[1])).filter((d):d is string=>Boolean(d));
  const end=dates.length>=2?dates[dates.length-1]:/\b(?:expiry|end\s+date|valid\s+(?:till|up\s*to))\b/i.test(line)?dates[0]:undefined;
  if(end&&(!result.inceptionDate||end>result.inceptionDate)){result.renewalDate=end;break;}
 }
 const continuity=firstDate(text,/\b(?:first\s+policy|continuous(?:ly)?\s+(?:covered|coverage)\s+since|inception\s+of\s+(?:the\s+)?first|original\s+inception|previous\s+policy\s+(?:start|inception|from)|portability)\b/i);
 if(continuity&&(!result.inceptionDate||continuity<=result.inceptionDate))result.continuityFrom=continuity;
 const room=roomRent(text);if(room)result.roomRent=room;
 const percent=copay(text);if(percent!==undefined)result.copayPercent=percent;
 if(!result.members.length)warnings.push('members');
 return result;
}
