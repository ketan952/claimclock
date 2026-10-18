// Reimbursement Tracker and Fair-Bill letters (M26): the pending-claim grievance with interest,
// the piecemeal-documents objection, the settlement-interest demand and the hospital rate-card
// request. Identity placeholders are filled by the vault at display time; every cited rule is
// quoted verbatim through ruleCitations; amounts come from the user's own entries.
import template from '../../templates/reimbursement.json' with {type:'json'};
import {ruleCitations} from './letters.ts';
import {validDate} from './coverage-simulator.ts';
import {claimTimeline,queryPattern,settlementAudit,type ClaimQuery,type ReimbursementClaim} from './reimbursement.ts';
import type {LineComparison} from './fair-bill.ts';
import type {Contact,Language,Letter,Rule} from './types.ts';

export type DelayLetterInput={kind:'reimbursement-delay';claim:ReimbursementClaim};
export type PiecemealLetterInput={kind:'piecemeal-objection';claim:ReimbursementClaim};
export type InterestLetterInput={kind:'settlement-interest';claim:ReimbursementClaim};
export type RateCardLine={description:string;amount:number;comparison:LineComparison|null;itemName:string|null};
export type RateCardLetterInput={kind:'rate-card-request';hospital:string;lines:RateCardLine[]};
export type ReimbursementLetterInput=DelayLetterInput|PiecemealLetterInput|InterestLetterInput|RateCardLetterInput;
export const MAX_RATE_CARD_LINES=12;

const rupees=(n:number,language:Language)=>`₹${Math.round(n).toLocaleString(language==='hi'?'hi-IN':'en-IN')}`;
const localDate=(value:string,language:Language)=>new Date(`${value}T00:00:00Z`).toLocaleDateString(language==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const freeText=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,max);
function insurerName(contacts:Contact[],id:string,language:Language):string {
 const insurer=contacts.find(c=>c.id===id&&c.kind==='insurer');
 if(insurer)return insurer.name;
 if(id==='unlisted')return language==='hi'?'[बीमा कंपनी का नाम]':'[Insurer name]';
 throw Error('Unknown insurer');
}
function queryLines(queries:ClaimQuery[],language:Language):string {
 const sorted=[...queries].filter(q=>validDate(q.at)).sort((a,b)=>a.at.localeCompare(b.at));
 return sorted.map((q,i)=>`${i+1}. ${localDate(q.at,language)}${q.note.trim()?` — ${freeText(q.note,200)}`:''}${q.repliedOn&&validDate(q.repliedOn)?(language==='hi'?` (जवाब ${localDate(q.repliedOn,language)} को भेजा)`:` (replied on ${localDate(q.repliedOn,language)})`):''}`).join('\n');
}
export function makeReimbursementLetter(input:ReimbursementLetterInput,contacts:Contact[],rules:Rule[],language:Language,now=new Date()):Letter {
 const en=language==='en';
 let fields:Record<string,string>={},ruleIds:string[]=[];
 if(input.kind==='rate-card-request'){
  const hospital=freeText(input.hospital,100)||(en?'[Hospital name]':'[अस्पताल का नाम]');
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>MAX_RATE_CARD_LINES)throw Error('Invalid bill lines');
  const lines=input.lines.map((line,i)=>{
   if(typeof line.amount!=='number'||!Number.isFinite(line.amount)||line.amount<0||line.amount>1e9)throw Error('Invalid bill amount');
   const description=freeText(line.description,120)||(en?'[bill line]':'[बिल पंक्ति]');
   const ref=line.comparison&&line.comparison.verdict!=='invalid'&&line.comparison.verdict!=='no_amount'?(en?` — CGHS reference ${rupees(line.comparison.reference.low*line.comparison.quantity,language)} to ${rupees(line.comparison.reference.high*line.comparison.quantity,language)}${line.itemName?` (${freeText(line.itemName,80)})`:''}`:` — CGHS संदर्भ ${rupees(line.comparison.reference.low*line.comparison.quantity,language)} से ${rupees(line.comparison.reference.high*line.comparison.quantity,language)}${line.itemName?` (${freeText(line.itemName,80)})`:''}`):'';
   return `${i+1}. ${description}: ${rupees(line.amount,language)}${ref}`;
  });
  fields={hospital,lines:lines.join('\n')};ruleIds=[...template['rate-card-request'].rules];
 }else{
  const claim=input.claim;
  const timeline=claimTimeline(claim,now);
  if(timeline.status==='invalid')throw Error('Invalid claim dates');
  const insurer=insurerName(contacts,claim.insurerId,language);
  fields={insurer,intimatedOn:localDate(claim.intimatedOn,language),submittedOn:localDate(claim.submittedOn,language),deadline:localDate(timeline.deadline,language)};
  if(input.kind==='reimbursement-delay'){
   if(claim.settledOn||timeline.status==='awaiting'||timeline.status==='due_today')throw Error('Claim is not overdue');
   fields.hospitalLine=claim.hospital.trim()?(en?` for treatment at ${freeText(claim.hospital,100)}`:` (${freeText(claim.hospital,100)} में इलाज के लिए)`):'';
   fields.overdueLine=en?`${timeline.daysOverdue} days have passed since then without a settlement or a reasoned decision.`:`तब से ${timeline.daysOverdue} दिन बीत चुके हैं और न निपटान हुआ है, न कारण सहित निर्णय।`;
   fields.interestLine=timeline.interest?(en?` On the claimed amount of ${rupees(claim.claimedAmount||claim.settledAmount||0,language)} this is ${rupees(timeline.interest.amount,language)} to date at ${timeline.interest.ratePercent}% a year (Bank Rate ${timeline.bankRate!.percent}% for ${timeline.bankRate!.fy} plus 2%).`:` ${rupees(claim.claimedAmount||claim.settledAmount||0,language)} की दावा राशि पर आज तक यह ${rupees(timeline.interest.amount,language)} बनता है, ${timeline.interest.ratePercent}% सालाना की दर से (${timeline.bankRate!.fy} के लिए बैंक दर ${timeline.bankRate!.percent}% + 2%)।`):'';
   ruleIds=[...template['reimbursement-delay'].rules];if(timeline.interest)ruleIds.splice(2,0,'bank-rate-fy');
  }else if(input.kind==='piecemeal-objection'){
   const pattern=queryPattern(claim.queries);
   if(!pattern.piecemeal)throw Error('Fewer than two query dates');
   fields.count=String(pattern.distinctDates);fields.queryList=queryLines(claim.queries,language);
   ruleIds=[...template['piecemeal-objection'].rules];
  }else if(input.kind==='settlement-interest'){
   const audit=settlementAudit(claim,now);
   if(!claim.settledOn||timeline.status!=='settled_late')throw Error('Claim was not settled late');
   if(!timeline.interest||!timeline.bankRate)throw Error('Interest cannot be computed');
   const base=claim.settledAmount&&claim.settledAmount>0?claim.settledAmount:claim.claimedAmount||0;
   fields.settledOn=localDate(claim.settledOn,language);fields.daysLate=String(timeline.daysOverdue);
   fields.paidLine=claim.settledAmount?(en?` The amount paid was ${rupees(claim.settledAmount,language)}${claim.claimedAmount?` against a claim of ${rupees(claim.claimedAmount,language)}`:''}.`:` भुगतान की गई राशि ${rupees(claim.settledAmount,language)} थी${claim.claimedAmount?`, ${rupees(claim.claimedAmount,language)} के दावे के मुकाबले`:''}।`):'';
   fields.interestPaidLine=audit.interestPaid?(en?`The settlement included interest of ${rupees(audit.interestPaid,language)}.`:`निपटान में ${rupees(audit.interestPaid,language)} का ब्याज शामिल था।`):(en?'The settlement letter shows no interest line.':'निपटान पत्र में ब्याज की कोई पंक्ति नहीं है।');
   fields.ratePercent=String(timeline.interest.ratePercent);fields.bankRatePercent=String(timeline.bankRate.percent);fields.fy=timeline.bankRate.fy;fields.interestDays=String(timeline.interest.days);fields.interestBase=rupees(base,language);fields.interestDue=rupees(timeline.interest.amount,language);
   fields.shortfallLine=audit.interestPaid&&audit.interestShortfall!==null&&audit.interestShortfall>0?(en?` After the ${rupees(audit.interestPaid,language)} already paid, ${rupees(audit.interestShortfall,language)} remains due.`:` पहले दिए गए ${rupees(audit.interestPaid,language)} के बाद ${rupees(audit.interestShortfall,language)} अब भी देय है।`):'';
   fields.partialLine=audit.shortfall&&audit.shortfall>0?(en?`, and the full reasons for the ${rupees(audit.shortfall,language)} not paid, with the specific policy terms relied on.`:`, और न दी गई ${rupees(audit.shortfall,language)} राशि के पूरे कारण, लागू पॉलिसी शर्तों सहित।`):(en?'.':'।');
   ruleIds=[...template['settlement-interest'].rules];if(audit.shortfall&&audit.shortfall>0)ruleIds.splice(3,0,'deduction-reasons');
  }else throw Error('Unknown reimbursement letter');
 }
 fields.citations=ruleCitations(ruleIds,rules,language);
 const fill=(value:string)=>value.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??`[${key}]`);
 const text=template[input.kind][language];
 return {id:crypto.randomUUID(),kind:input.kind,language,generatedAt:now.toISOString(),subject:fill(text.subject),body:fill(text.body).replace(/\n{3,}/g,'\n\n').trim(),ruleIds};
}
