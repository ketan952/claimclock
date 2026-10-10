export type Category='room-rent'|'consumable'|'sub-limit'|'co-pay'|'reasonable-customary'|'package'|'unrelated'|'unexplained';
export type DeductionStatus='likely valid'|'challengeable'|'no reason given';
export type DeductionInput={id:string;description:string;amount:number;policyClause?:string;policyCalculationConfirmed?:boolean};
export type Deduction=DeductionInput&{category:Category;status:DeductionStatus;ruleIds:string[];explanation:string;explanation_hi:string;listNote?:string};
export function classify(input:DeductionInput):Deduction {
 // Discard explicitly non-deducted context before choosing the deduction category.
 const text=input.description.toLowerCase().split(/(?<=[.!?])\s+/).filter(s=>!/\b(?:approved in full|no deduction|not deducted)\b/.test(s)).join(' ');
 let category:Category='unexplained',status:DeductionStatus='no reason given';
 let explanation='Ask for a line-by-line reason, the exact policy term and the calculation. A label alone does not establish whether the deduction is correct.';
 let explanation_hi='हर मद का कारण, पॉलिसी की सही शर्त और हिसाब माँगें। केवल नाम से कटौती सही साबित नहीं होती।';
 const ruleIds=['deduction-reasons'];
 if(/proportion|pro.?rata|room.{0,15}(rent|eligib|categor)|icu.{0,15}(rent|limit)/.test(text)){
  category='room-rent';status='challengeable';ruleIds.push('room-rent-review');
  explanation='Ask for room eligibility, the chosen-room ratio, the affected items and the policy clause. Check whether each billed item varies by room category. This is a request for review, not a blanket rule that all such deductions are prohibited.';
  explanation_hi='कमरे की पात्रता, चुने कमरे का अनुपात, प्रभावित मदें और पॉलिसी की शर्त माँगें। जाँचें कि हर मद का शुल्क कमरे की श्रेणी से बदलता है या नहीं। हर ऐसी कटौती पर पूर्ण रोक का दावा नहीं है।';
 }else if(/co[ -]?pay|coinsurance/.test(text)){
  category='co-pay';status=input.policyCalculationConfirmed&&input.policyClause?.trim()?'likely valid':'challengeable';
  explanation=status==='likely valid'?'You confirmed both the policy clause and calculation. The co-pay may apply; check the calculation base and any waiver.':'A co-pay can apply only as provided in the policy. Ask for the percentage, eligible base amount, exact clause and arithmetic.';
  explanation_hi=status==='likely valid'?'आपने पॉलिसी की शर्त और हिसाब दोनों की पुष्टि की है। सह-भुगतान लागू हो सकता है; आधार राशि और छूट जाँचें।':'सह-भुगतान पॉलिसी के अनुसार ही लागू हो सकता है। प्रतिशत, आधार राशि, सही शर्त और हिसाब माँगें।';
 }else if(/sub[ -]?limit|disease.{0,8}limit|(?:cataract|maternity).{0,25}(cap|limit|ceiling|allowance)/.test(text)){
  category='sub-limit';status=input.policyCalculationConfirmed&&input.policyClause?.trim()?'likely valid':'challengeable';
  explanation=status==='likely valid'?'You confirmed the relevant policy cap and calculation. Check whether the cap applies to this treatment, benefit period and policy version.':'Ask for the exact sub-limit, policy schedule, amount already used and remaining benefit. A sub-limit is policy-specific.';
  explanation_hi=status==='likely valid'?'आपने संबंधित सीमा और हिसाब की पुष्टि की है। जाँचें कि सीमा इसी इलाज, अवधि और पॉलिसी संस्करण पर लागू है।':'सही उप-सीमा, पॉलिसी अनुसूची, पहले उपयोग की राशि और बचा लाभ माँगें। उप-सीमा पॉलिसी पर निर्भर है।';
 }else if(/reasonable|customary|r\s*&\s*c|r&c|tariff/.test(text)){
  category='reasonable-customary';status='challengeable';explanation='Ask for the policy clause, the reference tariff or comparison used, and a line-item calculation. The phrase “reasonable and customary” alone does not explain the amount.';explanation_hi='पॉलिसी की शर्त, उपयोग की गई दर या तुलना और मदवार हिसाब माँगें। केवल “उचित और प्रचलित” कहना राशि का कारण नहीं बताता।';
 }else if(/package|double.?count|duplicate/.test(text)){
  category='package';status='challengeable';explanation='Compare the package agreement and itemised bill. Ask which item was already included and whether the same amount was deducted twice. A package label alone does not establish double-counting.';explanation_hi='पैकेज और मदवार बिल मिलाएँ। पूछें कौन सी मद पहले से शामिल थी और क्या वही राशि दो बार कटी। केवल पैकेज का नाम दोहरी कटौती साबित नहीं करता।';
 }else if(/not related|unrelated|not connected|not pertaining/.test(text)){
  category='unrelated';status='challengeable';explanation='Ask which item is said to be unrelated, the clinical basis for that view, and the exact policy clause. Obtain the treating hospital’s explanation if needed.';explanation_hi='पूछें कौन सी मद इलाज से असंबंधित मानी गई, उसका चिकित्सा आधार और पॉलिसी की सही शर्त क्या है। ज़रूरत पर अस्पताल का स्पष्टीकरण लें।';
 }else if(/non[ -]?medical|consumable|gloves|syringe|mask|toiletr|attendant|administrat|registration|admission kit|food|water bottle/.test(text)){
  category='consumable';status='challengeable';explanation='Ask for the exact item, policy exclusion or consumables cover, and whether it was already included in room/procedure/treatment charges. Historical IRDAI list labels do not by themselves decide current coverage.';explanation_hi='सही मद, पॉलिसी का अपवर्जन या उपभोग्य सामग्री कवर और कमरे/प्रक्रिया/इलाज के शुल्क में उसके शामिल होने का हिसाब माँगें। पुरानी IRDAI सूची अकेले मौजूदा कवर तय नहीं करती।';
 }
 return {...input,category,status,ruleIds,explanation,explanation_hi};
}
export function parseManualLines(value:string):{inputs:DeductionInput[];errors:number[]} {
 const inputs:DeductionInput[]=[],errors:number[]=[];
 value.split(/\r?\n/).forEach((line,i)=>{if(!line.trim())return;const match=line.match(/^(.+?)\s*(?:\||\t|\s{2,})\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/i);if(!match){errors.push(i+1);return;}
 const amountText=match[2];const grouping=/^\d+(?:\.\d{1,2})?$/.test(amountText)||/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(amountText)||/^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?$/.test(amountText);
 const amount=Number(amountText.replace(/,/g,''));if(!grouping||!Number.isFinite(amount)||amount<=0||amount>1e8){errors.push(i+1);return;}inputs.push({id:`line-${i+1}`,description:match[1].trim().slice(0,300),amount});});
 return {inputs,errors};
}
