// Renewal Guardian letters (M25): a premium-increase grievance (and its short Bima Bharosa draft),
// a free-look cancellation request, a porting-delay grievance and a migration request. Like every
// other generator, these produce identity placeholders that the vault fills at display time, quote
// each cited rule verbatim through ruleCitations, and never promise an outcome.
import template from '../../templates/renewal.json' with {type:'json'};
import {ruleCitations} from './letters.ts';
import {validDate} from './coverage-simulator.ts';
import {SENIOR_CAP_PERCENT,type HikeResult,type Mismatch,type PromiseField} from './renewal.ts';
import type {Contact,Language,Letter,Rule} from './types.ts';

export type HikeLetterInput={kind:'premium-hike'|'premium-hike-bima';insurerId:string;renewalDate:string;oldPremium:number;newPremium:number;hike:HikeResult};
export type FreeLookLetterInput={kind:'free-look-cancel';insurerId:string;receivedOn:string;mismatches:Mismatch[]};
export type PortingLetterInput={kind:'porting-delay';insurerId:string;role:'existing'|'acquiring';otherInsurer:string;requestDate:string;renewalDate?:string|null};
export type MigrationLetterInput={kind:'migration-request';insurerId:string;target:string;effectiveDate:string;groupExit:boolean;continuousMonths:number|null};
export type RenewalLetterInput=HikeLetterInput|FreeLookLetterInput|PortingLetterInput|MigrationLetterInput;
export const MAX_MISMATCHES=12;

const MISMATCH_LABELS:Record<PromiseField,{en:string;hi:string}>={
 insurerId:{en:'Insurer',hi:'बीमा कंपनी'},planName:{en:'Plan',hi:'योजना'},sumInsured:{en:'Sum insured',hi:'बीमित राशि'},roomRent:{en:'Room rent rule',hi:'कमरे के किराये का नियम'},
 copayPercent:{en:'Co-payment',hi:'सह-भुगतान'},pedMonths:{en:'Pre-existing disease waiting period (months)',hi:'पूर्व-मौजूदा बीमारी की प्रतीक्षा अवधि (महीने)'},consumables:{en:'Consumables cover',hi:'उपभोग्य सामग्री कवर'},members:{en:'Insured members',hi:'बीमित सदस्य'},
};
const rupees=(n:number,language:Language)=>`₹${Math.round(n).toLocaleString(language==='hi'?'hi-IN':'en-IN')}`;
const percent=(n:number)=>`${n>0?'+':''}${n.toLocaleString('en-IN',{maximumFractionDigits:1})}%`;
const localDate=(value:string,language:Language)=>new Date(`${value}T00:00:00Z`).toLocaleDateString(language==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const freeText=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,max);
const dayCount=(from:string,to:string)=>Math.floor((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000);
const today=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

export function describeMismatch(m:Mismatch,language:Language):string {
 const label=MISMATCH_LABELS[m.field][language];
 const money=m.field==='sumInsured',pct=m.field==='copayPercent';
 const show=(v:string)=>money&&Number.isFinite(Number(v))?rupees(Number(v),language):pct&&Number.isFinite(Number(v))?`${v}%`:v;
 return language==='hi'?`- ${label}: बताया गया ${show(m.promised)}; अनुसूची में ${show(m.actual)}`:`- ${label}: promised ${show(m.promised)}; the schedule shows ${show(m.actual)}`;
}
function insurerName(contacts:Contact[],id:string,language:Language):string {
 const insurer=contacts.find(c=>c.id===id&&c.kind==='insurer');
 if(insurer)return insurer.name;
 if(id==='unlisted')return language==='hi'?'[बीमा कंपनी का नाम]':'[Insurer name]';
 throw Error('Unknown insurer');
}
function hikeFields(input:HikeLetterInput,language:Language):{fields:Record<string,string>;ruleIds:string[]} {
 if(input.hike.status!=='ok'||!validDate(input.renewalDate))throw Error('Invalid premium details');
 const senior=input.hike.seniorCap!=='not_applicable',gstRemoved=input.hike.notes.includes('gst_removed');
 const ruleIds=[...template['premium-hike'].rules];
 if(senior)ruleIds.splice(2,0,'senior-premium-cap-10pct');
 if(gstRemoved)ruleIds.splice(ruleIds.length-1,0,'gst-exempt-individual-health-2025-09-22');
 const en=language==='en';
 const seniorDemand=senior?(en?`3. The insured is a senior citizen (aged 60 or above). Under IRDAI’s direction of 30 January 2025, insurers shall not revise the premium for senior citizens by more than ${SENIOR_CAP_PERCENT}% per annum, and a larger revision requires prior consultation with IRDAI. State whether this revision was placed before IRDAI, with the reference; if it was not, limit the revision to ${SENIOR_CAP_PERCENT}% and refund the excess.\n`:`3. बीमित व्यक्ति वरिष्ठ नागरिक (60 वर्ष या अधिक) है। IRDAI के 30 जनवरी 2025 के निर्देश के अनुसार बीमा कंपनियाँ वरिष्ठ नागरिकों का प्रीमियम साल में ${SENIOR_CAP_PERCENT}% से अधिक नहीं बढ़ा सकतीं, और इससे अधिक संशोधन के लिए IRDAI से पूर्व परामर्श ज़रूरी है। बताएँ कि यह संशोधन IRDAI के समक्ष रखा गया था या नहीं, संदर्भ सहित; यदि नहीं, तो संशोधन ${SENIOR_CAP_PERCENT}% तक सीमित करें और अतिरिक्त राशि वापस करें।\n`):'';
 const seniorLine=senior?(en?`The insured is a senior citizen; IRDAI’s circular of 30 January 2025 limits revision of senior citizens’ premium to ${SENIOR_CAP_PERCENT}% per annum without prior consultation with IRDAI.`:`बीमित व्यक्ति वरिष्ठ नागरिक है; IRDAI के 30 जनवरी 2025 के परिपत्र के अनुसार IRDAI से पूर्व परामर्श के बिना वरिष्ठ नागरिकों का प्रीमियम साल में ${SENIOR_CAP_PERCENT}% से अधिक नहीं बढ़ाया जा सकता।`):'';
 const gstLine=gstRemoved?(en?' (the earlier figure included 18% GST, which no longer applies to individual health policies since 22 September 2025)':' (पिछली राशि में 18% GST शामिल था, जो 22 सितंबर 2025 से व्यक्तिगत स्वास्थ्य पॉलिसियों पर लागू नहीं है)'):'';
 return {ruleIds,fields:{renewalDate:localDate(input.renewalDate,language),oldPremium:rupees(input.oldPremium,language),newPremium:rupees(input.newPremium,language),totalChange:percent(input.hike.totalChangePercent),baseChange:percent(input.hike.baseChangePercent),gstLine,seniorDemand,seniorLine,nextNumber:senior?'4':'3'}};
}
export function makeRenewalLetter(input:RenewalLetterInput,contacts:Contact[],rules:Rule[],language:Language,now=new Date()):Letter {
 const insurer=insurerName(contacts,input.insurerId,language);
 const current=today(now);
 let fields:Record<string,string>={insurer},ruleIds:string[]=[],kind:string=input.kind,templateKey:keyof typeof template=input.kind==='premium-hike-bima'?'premium-hike-bima':input.kind;
 if(input.kind==='premium-hike'||input.kind==='premium-hike-bima'){
  const hike=hikeFields(input,language);fields={...fields,...hike.fields};
  if(input.kind==='premium-hike')ruleIds=hike.ruleIds;else kind='bima';
 }else if(input.kind==='free-look-cancel'){
  if(!validDate(input.receivedOn)||input.receivedOn>current)throw Error('Invalid receipt date');
  if(!Array.isArray(input.mismatches)||input.mismatches.length>MAX_MISMATCHES)throw Error('Invalid mismatch list');
  const lines=input.mismatches.map(m=>describeMismatch({...m,promised:freeText(m.promised,120),actual:freeText(m.actual,120)},language));
  fields.receivedOn=localDate(input.receivedOn,language);
  fields.mismatches=lines.length?lines.join('\n'):(language==='hi'?'- [बताई गई शर्त और अनुसूची में लिखी शर्त का अंतर यहाँ लिखें]':'- [describe the difference between what was promised and what the schedule states]');
  ruleIds=[...template['free-look-cancel'].rules];
 }else if(input.kind==='porting-delay'){
  if(!validDate(input.requestDate)||input.requestDate>current||(input.renewalDate&&!validDate(input.renewalDate)))throw Error('Invalid porting dates');
  const other=freeText(input.otherInsurer,120)||(language==='hi'?'[दूसरी बीमा कंपनी]':'[other insurer]');
  const days=dayCount(input.requestDate,current),date=localDate(input.requestDate,language);
  const renewal=input.renewalDate?localDate(input.renewalDate,language):(language==='hi'?'[नवीनीकरण की तारीख]':'[renewal date]');
  const en=language==='en';
  if(input.role==='existing'){
   fields.situation=en?`I have applied to port this policy to ${other}, which raised the request for my policy and claim information through the IIB portal on ${date}; ${days} days have passed without the information being supplied. The renewal due date is ${renewal}.`:`मैंने यह पॉलिसी ${other} में पोर्ट करने के लिए आवेदन किया है, जिसने ${date} को IIB पोर्टल के ज़रिए मेरी पॉलिसी और दावों की जानकारी माँगी; ${days} दिन बीत चुके हैं और जानकारी नहीं दी गई है। नवीनीकरण की देय तारीख ${renewal} है।`;
   fields.demand=en?'Provide the complete information to the acquiring insurer immediately — the circular allows at most 72 hours from receipt of the request — and confirm to me in writing the date and time it was supplied. Do not treat my policy as lapsed while the porting proposal is pending.':'अधिग्रहण करने वाली बीमा कंपनी को पूरी जानकारी तुरंत दें — परिपत्र अनुरोध मिलने से अधिकतम 72 घंटे देता है — और मुझे लिखित में बताएँ कि यह किस तारीख और समय पर दी गई। पोर्टिंग प्रस्ताव लंबित रहते मेरी पॉलिसी को समाप्त न मानें।';
   ruleIds=['porting-records-72h',...template['porting-delay'].rules];
  }else{
   fields.situation=en?`I applied on ${date} to port my policy from ${other} to you, with the portability and proposal forms; ${days} days have passed without a decision. The renewal due date of the existing policy is ${renewal}.`:`मैंने ${date} को पोर्टेबिलिटी और प्रस्ताव फॉर्म के साथ अपनी पॉलिसी ${other} से आपके पास पोर्ट करने का आवेदन किया; ${days} दिन बीत चुके हैं और कोई निर्णय नहीं मिला। मौजूदा पॉलिसी के नवीनीकरण की देय तारीख ${renewal} है।`;
   fields.demand=en?'State the date on which you received my records from the existing insurer and communicate your decision on the proposal, with reasons, immediately; the circular allows at most 5 days from that receipt.':'बताएँ कि मौजूदा बीमा कंपनी से मेरे रिकॉर्ड आपको किस तारीख को मिले और प्रस्ताव पर अपना निर्णय, कारणों सहित, तुरंत बताएँ; परिपत्र उस प्राप्ति से अधिकतम 5 दिन देता है।';
   ruleIds=['porting-decision-5-days',...template['porting-delay'].rules];
  }
 }else if(input.kind==='migration-request'){
  if(!validDate(input.effectiveDate))throw Error('Invalid migration date');
  if(input.continuousMonths!==null&&(!Number.isFinite(input.continuousMonths)||input.continuousMonths<0||input.continuousMonths>1200))throw Error('Invalid continuity');
  const en=language==='en';
  fields.target=freeText(input.target,120)||(en?'[name of the new product]':'[नए उत्पाद का नाम]');
  fields.effectiveDate=localDate(input.effectiveDate,language);
  fields.groupLine=input.groupExit?(en?', on my exit from the group policy of [Employer name]':', [नियोक्ता का नाम] की समूह पॉलिसी से मेरे बाहर होने पर'):'';
  const months=input.continuousMonths;
  fields.underwritingLine=input.groupExit?(en?'If the proposal is underwritten, communicate the decision with reasons; migration from a group policy carries the credits accrued under it.':'यदि प्रस्ताव की अंडरराइटिंग की जाती है, तो निर्णय कारणों सहित बताएँ; समूह पॉलिसी से माइग्रेशन में उसके तहत बने क्रेडिट साथ जाते हैं।')
   :months!==null&&months>=36?(en?`The policy has been continuously in force for ${months} months, so the proposal is not subject to fresh underwriting.`:`पॉलिसी ${months} महीनों से लगातार लागू है, इसलिए प्रस्ताव पर नई अंडरराइटिंग लागू नहीं होती।`)
   :(en?'If the proposal is underwritten, communicate the decision with reasons.':'यदि प्रस्ताव की अंडरराइटिंग की जाती है, तो निर्णय कारणों सहित बताएँ।');
  ruleIds=input.groupExit?['group-to-individual-migration',...template['migration-request'].rules]:['migration-30-days',...template['migration-request'].rules];
 }else throw Error('Unknown renewal letter');
 fields.citations=ruleCitations(ruleIds,rules,language);
 const fill=(value:string)=>value.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??`[${key}]`);
 const text=template[templateKey][language];
 return {id:crypto.randomUUID(),kind,language,generatedAt:now.toISOString(),subject:fill(text.subject),body:fill(text.body).replace(/\n{3,}/g,'\n\n').trim(),ruleIds};
}
