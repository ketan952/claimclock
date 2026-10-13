export type Category='room-rent'|'room-rent-cap'|'implant'|'consumable'|'sub-limit'|'co-pay'|'reasonable-customary'|'package'|'unrelated'|'unexplained';
export type DeductionStatus='likely valid'|'challengeable'|'policy term — verify'|'no reason given';
export type DeductionInput={id:string;description:string;amount:number;policyClause?:string;policyCalculationConfirmed?:boolean;noApplicablePolicyClause?:boolean};
export type Deduction=DeductionInput&{category:Category;status:DeductionStatus;ruleIds:string[];explanation:string;explanation_hi:string;listNote?:string};
export function verdictTotals(deductions:Deduction[]):Record<DeductionStatus,number>{
 const cents:Record<DeductionStatus,number>={'likely valid':0,'challengeable':0,'policy term — verify':0,'no reason given':0};
 for(const d of deductions)cents[d.status]+=Math.round(d.amount*100);
 return Object.fromEntries(Object.entries(cents).map(([key,value])=>[key,value/100])) as Record<DeductionStatus,number>;
}
export function classify(input:DeductionInput):Deduction {
 // Discard explicitly approved context before identifying the reason for the actual deduction.
 const text=input.description.toLowerCase().split(/(?<=[.!?])\s+/).filter(s=>!/\b(?:approved in full|no deduction|not deducted)\b/.test(s)).join(' ');
 const confirmed=Boolean(!input.noApplicablePolicyClause&&input.policyCalculationConfirmed&&input.policyClause?.trim());
 const policyStatus:DeductionStatus=input.noApplicablePolicyClause?'challengeable':confirmed?'likely valid':'policy term — verify';
 let category:Category='unexplained',status:DeductionStatus='no reason given';
 let explanation='Request the reason for every deducted item, the exact policy clause and the calculation. A generic adjustment does not establish whether the deduction is correct.';
 let explanation_hi='हर काटी गई मद का कारण, पॉलिसी की सही शर्त और हिसाब माँगें। केवल सामान्य समायोजन लिखने से कटौती सही साबित नहीं होती।';
 const ruleIds=['deduction-reasons'];
 if(/proportion|pro.?rata|associated.{0,60}room|room.{0,60}associated/.test(text)){
  category='room-rent';status='challengeable';ruleIds.push('financial-limits-2024','room-rent-review');
  explanation='This reduces associated expenses using room eligibility. Request the ratio, affected items, exact policy wording and hospital tariff showing which charges vary by room category. The 2024 customer-information format discloses policy room limits; it does not create a universal ban on these reductions.';
  explanation_hi='यह कमरे की पात्रता के आधार पर संबंधित खर्चों की कटौती है। अनुपात, प्रभावित मदें, पॉलिसी की सही शर्त और कमरे की श्रेणी से बदलने वाली दरों का अस्पताल विवरण माँगें। 2024 का ग्राहक सूचना प्रारूप पॉलिसी की कमरे संबंधी सीमाएँ दिखाता है; यह ऐसी हर कटौती पर रोक नहीं लगाता।';
 }else if(/co[ -]?pay|coinsurance|deductible|excess\s+(?:of|amount|per claim)/.test(text)){
  category='co-pay';status=policyStatus;ruleIds.push('financial-limits-2024');
  explanation=status==='likely valid'?'You confirmed the applicable co-pay or deductible clause and arithmetic. This deduction is likely valid on those details; check the eligible base, percentage or fixed amount, policy-year/per-claim basis and any waiver.':'A co-pay or deductible applies only under the relevant policy terms. Request the clause, percentage or fixed amount, eligible calculation base, policy-year/per-claim basis, prior deductible already met, and arithmetic.';
  explanation_hi=status==='likely valid'?'आपने लागू सह-भुगतान या डिडक्टिबल की शर्त और हिसाब की पुष्टि की है। इन जानकारियों के अनुसार कटौती संभवतः सही है; आधार राशि, प्रतिशत या तय राशि, साल/दावे का आधार और छूट जाँचें।':'सह-भुगतान या डिडक्टिबल संबंधित पॉलिसी की शर्त से ही लागू होता है। सही शर्त, प्रतिशत या तय राशि, आधार राशि, साल/दावे का आधार, पहले पूरा किया डिडक्टिबल और हिसाब माँगें।';
 }else if(/sub[ -]?limit|disease.{0,8}limit|(?:cataract|maternity).{0,25}(cap|limit|ceiling|allowance)/.test(text)){
  category='sub-limit';status=policyStatus;ruleIds.push('financial-limits-2024');
  explanation=status==='likely valid'?'You confirmed the applicable treatment cap and calculation. This deduction is likely valid on those details; check the treatment, policy version, benefit period, prior use and any applicable rider.':'Request the treatment-specific cap, policy schedule, benefit period, prior utilization and remaining benefit calculation. Cataract and maternity limits depend on the policy.';
  explanation_hi=status==='likely valid'?'आपने इलाज की लागू सीमा और हिसाब की पुष्टि की है। इन जानकारियों के अनुसार कटौती संभवतः सही है; इलाज, पॉलिसी संस्करण, लाभ अवधि, पहले उपयोग और संबंधित ऐड-ऑन जाँचें।':'इलाज की सही सीमा, पॉलिसी अनुसूची, लाभ अवधि, पहले उपयोग और बची राशि का हिसाब माँगें। मोतियाबिंद और मातृत्व की सीमाएँ पॉलिसी पर निर्भर हैं।';
 }else if(/package|double.?count|duplicate/.test(text)){
  category='package';status='challengeable';explanation='Compare the package agreement, inclusion list and itemised bill. Request each matching entry and calculation, including whether the same charge has been deducted twice. A package inclusion label alone does not prove duplicate billing.';explanation_hi='पैकेज समझौता, शामिल मदों की सूची और मदवार बिल मिलाएँ। हर संबंधित प्रविष्टि और हिसाब माँगें; जाँचें कि वही राशि दो बार तो नहीं काटी गई। केवल पैकेज में शामिल लिखने से दोहरा बिल साबित नहीं होता।';
 }else if(/not related|unrelated|not connected|not pertaining/.test(text)){
  category='unrelated';status='challengeable';explanation='Request the item considered unrelated to admission, the clinical record and exact policy clause supporting that view. Obtain the treating hospital’s explanation; admission timing alone does not decide coverage.';explanation_hi='भर्ती से असंबंधित मानी गई मद, उस निष्कर्ष का चिकित्सा रिकॉर्ड और पॉलिसी की सही शर्त माँगें। इलाज करने वाले अस्पताल का स्पष्टीकरण लें; भर्ती का समय अकेले कवर तय नहीं करता।';
 }else if(/room.{0,20}(rent|eligib|categor|cap|limit|difference)|icu.{0,20}(rent|charge|limit|cap)/.test(text)){
  category='room-rent-cap';status=policyStatus;ruleIds.push('financial-limits-2024');
  explanation=status==='likely valid'?'You confirmed the policy room cap and the direct room-charge calculation. This difference is likely valid on those details; check the daily rates, eligible days and any room-category waiver. Associated-expense reductions require a separate review.':'This appears to be a direct room-charge difference. Request the applicable policy room cap, allowed and actual daily rates, number of days and calculation. A higher room rate alone does not establish a policy cap or justify reducing other expenses.';
  explanation_hi=status==='likely valid'?'आपने पॉलिसी की कमरे संबंधी सीमा और केवल कमरे के शुल्क का हिसाब पुष्ट किया है। इन जानकारियों के अनुसार अंतर की कटौती संभवतः सही है; दैनिक दरें, पात्र दिन और छूट जाँचें। संबंधित अन्य खर्चों की कटौती अलग जाँचें।':'यह सीधे कमरे के शुल्क का अंतर लगता है। लागू पॉलिसी सीमा, अनुमत और वास्तविक दैनिक दर, दिनों की संख्या और हिसाब माँगें। महँगा कमरा अकेले पॉलिसी की सीमा या दूसरे खर्चों की कटौती सही साबित नहीं करता।';
 }else if(/reasonable|customary|r\s*&\s*c|r&c|tariff/.test(text)){
  category='reasonable-customary';status='challengeable';explanation='Request the exact policy clause, reference tariff or comparable charges, the basis for comparison, and the line-item calculation. The reasonable-and-customary label alone does not explain the amount.';explanation_hi='पॉलिसी की सही शर्त, संदर्भ दर या तुलनीय शुल्क, तुलना का आधार और मदवार हिसाब माँगें। केवल उचित और प्रचलित लिखने से राशि का कारण साफ़ नहीं होता।';
 }else if(/implant|prosthe|stent|pacemaker|intraocular lens|orthop[ae]edic plate/.test(text)){
  category='implant';status='challengeable';explanation='An implant or prosthesis is not automatically an excluded consumable. Check the policy’s device coverage, exclusions and any sub-limit; request the device invoice, applicable clause and calculation. Review a blanket non-medical label against the actual coverage.';explanation_hi='इम्प्लांट या कृत्रिम अंग अपने-आप बाहर की गई उपभोग्य सामग्री नहीं है। पॉलिसी में उपकरण का कवर, अपवर्जन और सीमा जाँचें; उपकरण का बिल, लागू शर्त और हिसाब माँगें। सामान्य गैर-चिकित्सकीय लेबल को वास्तविक कवर से मिलाएँ।';
 }else if(/non[ -]?medical|consumable|disposable|gloves|syringe|mask|toiletr|attendant|administrat|registration|admission kit|food|water bottle|sanitizer|sterillium|betadine|gargle|thermometer|gauze|cotton|bandage|drape|gown|blade|diaper|nebuli[sz]er|\bdiet\b/.test(text)){
  category='consumable';status='challengeable';explanation='Request the exact items, quantities, rates, policy exclusion or consumables rider, and any room/procedure/package inclusion. The historical IRDAI lists are references to check against the policy; they do not establish current coverage or non-payment by themselves.';explanation_hi='सही मदें, मात्रा, दर, पॉलिसी का अपवर्जन या उपभोग्य सामग्री ऐड-ऑन और कमरे/प्रक्रिया/पैकेज में शामिल होने का विवरण माँगें। पुरानी IRDAI सूचियाँ पॉलिसी से मिलाने का संदर्भ हैं; वे अकेले वर्तमान कवर या गैर-भुगतान तय नहीं करतीं।';
 }
 if(['co-pay','sub-limit','room-rent-cap'].includes(category)&&status!=='likely valid'){
  explanation=(status==='challengeable'?'You report that you checked your policy and found no applicable clause for this deduction. Request review of its policy basis. ':'The policy term and calculation are not yet verified. A missing or unenclosed clause does not establish that no applicable term exists. ')+explanation;
  explanation_hi=(status==='challengeable'?'आपने बताया है कि पॉलिसी जाँचने पर इस कटौती के लिए कोई लागू शर्त नहीं मिली। इसके पॉलिसी आधार की समीक्षा माँगें। ':'पॉलिसी की शर्त और हिसाब अभी पुष्ट नहीं हैं। शर्त न मिलना या संलग्न न होना अपने-आप यह साबित नहीं करता कि कोई लागू शर्त नहीं है। ')+explanation_hi;
 }
 return {...input,category,status,ruleIds,explanation,explanation_hi};
}
export type SuggestedLine={description:string;amount:number};
// Lines that carry a figure but are not individual deductions: bill/claim totals, approved/paid/patient-share amounts, policy limit lines, identifiers and dates.
const SUGGEST_SKIP=/total bill|bill amount|gross bill|hospital bill|inpatient bill|amount payable|net payable|payable amount|net amount|approved amount|amount approved|claimed amount|claim amount|amount claimed|sum insured|amount paid|paid amount|settled amount|settlement amount|balance|grand total|^\s*(?:[-•*]\s*)?total\b|total deduction|totaldisallow|total disallow|disallowed amount\s*:|sub-?total|payable in full|approved in full|no deduction|nil deduction|patient share|member share|to be collected at|out of pocket|summary\s*:|billed\b.*\bapproved\b.*\b(?:disallowed|deducted)|^\s*(?:room rent limit|consumables rider)\b|policy (?:no|number)|claim (?:no|number|id|reference)|uhid|member (?:id|no)|mobile|phone|helpline|e-?mail|date of|admission date|date of admission|admission no|time of admission|admitted on|discharge date|dob\b|invoice no|bill no|receipt no|gstin|\bpan\b|ifsc|account (?:no|number)|cheque|utr\b|neft|rtgs|pin ?code|reference (?:no|id)/i;
const SUGGEST_HINT=/deduct|disallow|not payable|non[- ]?payable|non[- ]?medical|non[- ]?admissible|inadmissible|consumable|disposable|proportion|co-?pay|sub-?limit|capping|\bcap\b|reasonable|customary|\bR&C\b|exclu|not covered|implant|room rent|room eligib|package|less\b|short|reduc|adjust/i;
const CURRENCY_AMOUNT=/(?:₹|rs\.?|inr)\s*:?\s*([\d,]+(?:\.\d{1,2})?)(?:\/-)?/gi;
const BARE_AMOUNT=/(?<![\d,.\/%-])(\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,8}(?:\.\d{1,2})?)(?:\/-)?(?![\d,.%\/-])/g;
const RATE_SUFFIX=/^\s*(?:\/|per\b)\s*(?:day|diem|hr|hour|month|year|visit|eye|claim|person|bed|unit)/i;
const BASE_PREFIX=/(?:admissible amount|bill amount|gross amount|eligible (?:amount|room rent)|chosen room rent(?: was)?|capped at|limit(?:ed to)?|up to|@)\s*$/i;
const TABULAR_ROW=/^([A-Za-z\u0900-\u097F].*?)\s+(?:(?:₹|rs\.?|inr)\s*)?([\d,]+(?:\.\d{1,2})?)\s+(?:(?:₹|rs\.?|inr)\s*)?([\d,]+(?:\.\d{1,2})?)\s+(?:(?:₹|rs\.?|inr)\s*)?([\d,]+(?:\.\d{1,2})?)(?:\s+(.+))?$/i;
const toAmount=(text:string)=>{const grouping=/^\d+(?:\.\d{1,2})?$/.test(text)||/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text)||/^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?$/.test(text);const amount=Number(text.replace(/,/g,''));return grouping&&Number.isFinite(amount)&&amount>=1&&amount<=1e8?amount:null;};
const toAmountOrZero=(text:string)=>text==='0'||text==='0.00'?0:toAmount(text);
const cleanDesc=(s:string)=>{const trimmed=s.replace(/^(?:\d{1,2}[.)]|[-•*])\s+/,'').replace(/\b(?:₹|rs\.?|inr)\s*$/i,'').replace(/^[\s:–—|,-]+|[\s:–—|,=-]+$/g,'').replace(/\s+/g,' ').trim().slice(0,140);return trimmed?trimmed[0].toUpperCase()+trimmed.slice(1):'';};
// Deterministic, on-device: pull "reason + rupee amount" candidates out of extracted or pasted settlement text.
// Supports both narrative lines and 3-column TPA tables (Billed / Approved / Deducted), while skipping hospital-bill
// and policy-schedule blocks, zero-deduction rows, per-day rates, totals and identifiers.
export function suggestLinesFromText(text:string):SuggestedLine[] {
 const out:SuggestedLine[]=[],seen=new Set<string>();let inSection=false,skipDoc=false;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.replace(/\s+/g,' ').trim();if(!line)continue;
  if(/^---\s*\[?(bill|policy)\b/i.test(line)){skipDoc=true;inSection=false;continue;}
  if(/^---\s*/.test(line)){skipDoc=false;continue;}
  if(/^(?:final inpatient bill|inpatient bill|itemised hospital bill|policy schedule)\b/i.test(line)){skipDoc=true;inSection=false;continue;}
  if(/^(?:claim settlement|cashless claim settlement|disallowance breakup|deduction details)\b/i.test(line)){skipDoc=false;inSection=true;continue;}
  if(skipDoc)continue;
  const tab=line.match(TABULAR_ROW);
  if(tab){
   const billed=toAmountOrZero(tab[2]),approved=toAmountOrZero(tab[3]),deducted=toAmountOrZero(tab[4]);
   if(billed!==null&&approved!==null&&deducted!==null&&billed>0&&billed>=approved&&Math.abs((billed-approved)-deducted)<=1){
    if(deducted===0)continue;
    const head=cleanDesc(tab[1]),remark=cleanDesc(tab[5]||'');
    const description=cleanDesc(remark&&remark.toLowerCase()!==head.toLowerCase()?`${head} — ${remark}`:head);
    if(/[A-Za-z\u0900-\u097F]{3}/.test(description)){const key=`${description.toLowerCase()}|${deducted}`;if(!seen.has(key)){seen.add(key);out.push({description,amount:deducted});if(out.length===30)break;}}
    continue;
   }
  }
  const hasFigure=/\d/.test(line);
  if(!hasFigure){if(/deduct|disallow|not payable|non[- ]?payable/i.test(line))inSection=true;else if(/^(?:amount payable|net payable|total|summary|note|remarks|terms)/i.test(line))inSection=false;continue;}
  if(SUGGEST_SKIP.test(line)){if(/^\s*(?:[-•*]\s*)?total|amount payable|net payable/i.test(line))inSection=false;continue;}
  const stripped=line.replace(/^(?:\d{1,2}[.)]|[-•*])\s+/,'');
  let amountText:string|null=null,matchIndex=-1,matchLen=0;
  for(const match of stripped.matchAll(CURRENCY_AMOUNT)){
   const after=stripped.slice((match.index??0)+match[0].length),before=stripped.slice(0,match.index??0);
   if(RATE_SUFFIX.test(after)||BASE_PREFIX.test(before))continue;
   amountText=match[1];matchIndex=match.index??0;matchLen=match[0].length;
  }
  if(!amountText&&(inSection||SUGGEST_HINT.test(stripped)))for(const match of stripped.matchAll(BARE_AMOUNT)){
   const after=stripped.slice((match.index??0)+match[0].length),before=stripped.slice(0,match.index??0);
   if(RATE_SUFFIX.test(after)||BASE_PREFIX.test(before))continue;
   amountText=match[1];matchIndex=match.index??0;matchLen=match[0].length;
  }
  if(!amountText)continue;const amount=toAmount(amountText);if(amount===null)continue;
  const description=cleanDesc(stripped.slice(0,matchIndex)+' '+stripped.slice(matchIndex+matchLen));
  if(!/[A-Za-z\u0900-\u097F]{3}/.test(description))continue;
  const key=`${description.toLowerCase()}|${amount}`;if(seen.has(key))continue;seen.add(key);out.push({description,amount});if(out.length===30)break;
 }
 return out;
}
export const formatSuggestedLines=(lines:SuggestedLine[])=>lines.map(l=>`${l.description} | ${l.amount}`).join('\n');
// Match an insurer mentioned in an uploaded settlement, bill or rejection document so the user does not have to hunt through 32 options.
export function detectInsurerFromText(text:string,insurers:{id:string;name:string;name_hi?:string;kind?:string}[]):string {
 const hay=text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g,' ');
 for(const c of insurers){
  if(c.kind&&c.kind!=='insurer')continue;
  const stem=c.name.toLowerCase().replace(/\(.*?\)/g,'').replace(/\b(general|health|insurance|company|limited|co|ltd|the|and|allied|india)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
  if(stem.length>=3&&new RegExp(`\\b${stem.replace(/\s+/g,'\\s+')}\\b`).test(hay))return c.id;
  if(c.name_hi&&text.includes(c.name_hi))return c.id;
 }
 return '';
}
export type ConsumableEntry={list:string;serial_number:number;item:string;list_label_en:string;list_label_hi:string;paragraph:string;source_url:string;caveat_en:string;caveat_hi:string};
// Match historical IRDAI List I–IV items whether the user typed a single item ("Gloves") or a real multi-item line ("gloves, gauze, surgical blades, gown").
export function matchConsumables(description:string,entries:ConsumableEntry[]):ConsumableEntry[] {
 const norm=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
 const cleaned=norm(description.replace(/^non[ -]?medical\s*:\s*/i,''));if(!cleaned)return[];
 const exact=entries.filter(c=>norm(c.item)===cleaned);if(exact.length)return exact;
 const hay=` ${cleaned} `;const found:ConsumableEntry[]=[];
 for(const c of entries){
  const parts=c.item.replace(/\(.*?\)/g,' ').split(/[,/\\-]+/).map(norm).filter(p=>p.length>=4&&!/^(CHARGES|ITEMS|OTHER|WHERE|ANY|TYPE|ETC|COST)$/.test(p));
  const hit=parts.some(p=>{const singular=p.replace(/S$/,'');return hay.includes(` ${p} `)||hay.includes(` ${singular} `)||hay.includes(` ${singular}S `);});
  if(hit){found.push(c);if(found.length===5)break;}
 }
 return found;
}
// Pull a matching policy-schedule or clause line out of the uploaded document text so the user can fill "Exact policy clause" in one tap.
export function findPolicyClauseHint(category:Category,text:string):string {
 if(!text.trim()||!['room-rent-cap','co-pay','sub-limit'].includes(category))return'';
 const matches=(l:string)=>category==='room-rent-cap'?/room\s*(?:rent|category|eligib|limit|cap).*(?:clause|schedule|rs\.?|₹|\d)/i.test(l):category==='co-pay'?/(?:co-?pay(?:ment)?|deductible).*(?:clause|schedule|\d+\s*%|rs\.?|₹)/i.test(l):/(?:sub-?limit|cataract|maternity|implant|stent|prosthe|procedure\s*(?:limit|cap|ceiling)).*(?:clause|schedule|rs\.?|₹|\d)/i.test(l)&&!/^room\s*rent/i.test(l);
 const policyIdx=text.search(/^---\s*\[policy\]/im);
 const policyLines=(policyIdx>=0?text.slice(policyIdx):text).split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(l=>l&&!/^---/.test(l));
 const allLines=text.split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(l=>l&&!/^---/.test(l));
 const numbered=/(?:clause|section|condition|para(?:graph)?)\s*[0-9a-z.()]+/i;
 const match=policyLines.find(l=>matches(l)&&numbered.test(l))||policyLines.find(l=>matches(l))||allLines.find(l=>matches(l)&&numbered.test(l));
 return match?match.slice(0,150):'';
}
// Extract a date (YYYY-MM-DD) and the stated rejection reason from an uploaded rejection/repudiation letter.
export function extractRejectionInfo(text:string,now=new Date()):{rejectedOn:string;ground:string} {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 let rejectedOn='';
 const iso=text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
 const dmy=text.match(/\b(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-](20\d{2})\b/);
 if(iso){const d=`${iso[1]}-${iso[2]}-${iso[3]}`;if(d<=today)rejectedOn=d;}
 else if(dmy){const d=`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;if(d<=today)rejectedOn=d;}
 const isHeading=(l:string)=>l===l.toUpperCase()&&l.replace(/[^A-Z]/g,'').length>=6&&!/\d/.test(l);
 const isMeta=(l:string)=>/^(?:claim|policy|patient|member|uhid|hospital|date|to\b|dear\b|subject\b)\s*(?:no|number|id|name|of|:)/i.test(l);
 const isFooter=(l:string)=>/^(?:for grievance|yours |sincerely|regards|thank you|authorized signatory|disclaimer)/i.test(l);
 const trigger=/reject|repudiat|deni(?:ed|al)|unable to (?:approve|process|settle)|not (?:admissible|payable|covered)|regret to inform|ground|reason\s*:|clause|exclusion|waiting period|non[- ]?disclosure|pre[- ]?existing|not medically necessary/i;
 const lines=text.split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(l=>l&&!/^---/.test(l)&&!isHeading(l)&&!isMeta(l));
 const picked:string[]=[];
 for(let i=0;i<lines.length;i++){
  if(isFooter(lines[i]))break;
  if(trigger.test(lines[i])){
   picked.push(lines[i]);
   while(i+1<lines.length&&picked.length<5&&!isFooter(lines[i+1])&&!isMeta(lines[i+1])){i++;picked.push(lines[i]);if(/[.!]$/.test(lines[i]))break;}
   if(picked.length>=4)break;
  }
 }
 const ground=(picked.length?picked.join(' '):lines.slice(0,3).join(' ')).replace(/\s+/g,' ').trim().slice(0,1200);
 return {rejectedOn,ground};
}
export function parseManualLines(value:string):{inputs:DeductionInput[];errors:number[]} {
 const inputs:DeductionInput[]=[],errors:number[]=[];
 value.split(/\r?\n/).forEach((line,i)=>{if(!line.trim())return;const match=line.match(/^(.+?)\s*(?:\||\t|\s{2,})\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/i);if(!match){errors.push(i+1);return;}
 const amountText=match[2];const grouping=/^\d+(?:\.\d{1,2})?$/.test(amountText)||/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(amountText)||/^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?$/.test(amountText);
 const amount=Number(amountText.replace(/,/g,''));if(!grouping||!Number.isFinite(amount)||amount<=0||amount>1e8){errors.push(i+1);return;}inputs.push({id:`line-${i+1}`,description:match[1].trim().slice(0,300),amount});});
 return {inputs,errors};
}
