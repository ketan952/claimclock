import templates from '../../templates/deductions.json' with {type:'json'};
import {verdictTotals,type Deduction} from './deductions.ts';
import type {Contact,Language,Letter,Rule} from './types.ts';
import {ruleCitations} from './letters.ts';
const demands:Record<string,{en:string;hi:string}>={
 'room-rent':{en:'Provide the room eligibility clause, permitted and actual daily rates, the room-day calculation, and each associated charge reduced. For associated expenses, provide the policy wording permitting the reduction and the hospital tariff showing whether that item varies by room category.',hi:'कमरे की पात्रता की शर्त, अनुमत और वास्तविक दैनिक दर, दिनों का हिसाब और घटाई गई हर संबंधित मद दें। अन्य खर्चों की कटौती के लिए उसे अनुमत करने वाली पॉलिसी शर्त और कमरे की श्रेणी से उस मद की दर बदलने वाला अस्पताल शुल्क विवरण दें।'},
 'room-rent-cap':{en:'Provide the room-rent cap in my policy, eligible and actual daily room rates, number of days, and the calculation of this difference.',hi:'मेरी पॉलिसी में कमरे की सीमा, अनुमत और वास्तविक दैनिक दर, दिनों की संख्या और अंतर का हिसाब दें।'},
 'co-pay':{en:'Provide the applicable co-pay or deductible clause and schedule, the percentage or fixed amount, the eligible calculation base, any waiver, and the arithmetic used.',hi:'लागू सह-भुगतान या डिडक्टिबल की शर्त और अनुसूची, प्रतिशत या तय राशि, हिसाब की आधार राशि, छूट और गणना दें।'},
 'sub-limit':{en:'Provide the treatment-specific limit and policy schedule, the benefit period, amounts already used, remaining benefit, and the calculation of this deduction.',hi:'इलाज की लागू सीमा और पॉलिसी अनुसूची, लाभ अवधि, पहले उपयोग की राशि, बचा लाभ और इस कटौती का हिसाब दें।'},
 'implant':{en:'Provide the implant or prosthesis coverage clause and any applicable exclusion or limit, the device invoice, admissible amount, and itemised deduction calculation.',hi:'इम्प्लांट या कृत्रिम अंग के कवर की शर्त, लागू अपवर्जन या सीमा, उपकरण का बिल, देय राशि और मदवार कटौती का हिसाब दें।'},
 'implants':{en:'Provide the implant or prosthesis coverage clause and any applicable exclusion or limit, the device invoice, admissible amount, and itemised deduction calculation.',hi:'इम्प्लांट या कृत्रिम अंग के कवर की शर्त, लागू अपवर्जन या सीमा, उपकरण का बिल, देय राशि और मदवार कटौती का हिसाब दें।'},
 'consumable':{en:'Identify each item, quantity and rate, the exact policy exclusion or consumables cover, and the calculation. Identify any IRDAI list entry relied on and its applicable version; provide the room/procedure/package breakup where you say the item is already included.',hi:'हर मद, मात्रा, दर, पॉलिसी का सटीक अपवर्जन या उपभोग्य सामग्री कवर और हिसाब दें। उपयोग की गई IRDAI सूची की प्रविष्टि और लागू संस्करण बताएँ; मद पहले से शामिल बताने पर कमरे, प्रक्रिया या पैकेज का विवरण दें।'},
 'reasonable-customary':{en:'Provide the specific policy clause, reference tariff or comparable charges relied upon, the basis for that comparison, and the line-item calculation.',hi:'पॉलिसी की सटीक शर्त, उपयोग की गई संदर्भ दर या तुलनीय शुल्क, तुलना का आधार और मदवार हिसाब दें।'},
 'package':{en:'Provide the package agreement and inclusion list, the matching bill entries and amounts, and the calculation establishing that the same expense has not been deducted twice.',hi:'पैकेज समझौता और शामिल मदों की सूची, संबंधित बिल प्रविष्टियाँ और राशियाँ तथा वही खर्च दो बार न काटे जाने का हिसाब दें।'},
 'unrelated':{en:'Identify the item considered unrelated to admission, the clinical record and policy clause supporting that conclusion, and the amount calculation; review the treating hospital’s explanation.',hi:'भर्ती से असंबंधित मानी गई मद, उस निष्कर्ष का चिकित्सा रिकॉर्ड और पॉलिसी शर्त तथा राशि का हिसाब दें; इलाज करने वाले अस्पताल का स्पष्टीकरण देखें।'},
 'unexplained':{en:'Identify the deducted bill items and amounts, the complete reason for each, the specific policy clause, and the itemised calculation.',hi:'काटी गई बिल मदें और राशियाँ, हर मद का पूरा कारण, पॉलिसी की सटीक शर्त और मदवार हिसाब दें।'}
};
const clarifications:Record<string,{en:string;hi:string}>={
 'co-pay':{en:'I have checked this policy term and arithmetic. Please confirm the percentage or fixed amount, eligible calculation base, any waiver, and calculation for my records.',hi:'मैंने पॉलिसी की यह शर्त और हिसाब जाँच लिए हैं। कृपया मेरे रिकॉर्ड के लिए प्रतिशत या तय राशि, हिसाब की आधार राशि, छूट और गणना की पुष्टि करें।'},
 'sub-limit':{en:'I have checked this policy term and arithmetic. Please confirm the treatment limit, benefit period, prior use and remaining benefit for my records.',hi:'मैंने पॉलिसी की यह शर्त और हिसाब जाँच लिए हैं। कृपया मेरे रिकॉर्ड के लिए इलाज की सीमा, लाभ अवधि, पहले उपयोग और बचे लाभ की पुष्टि करें।'},
 'room-rent-cap':{en:'I have checked this policy term and arithmetic. Please confirm the eligible and actual daily room rates, number of days, any waiver and room-charge difference for my records.',hi:'मैंने पॉलिसी की यह शर्त और हिसाब जाँच लिए हैं। कृपया मेरे रिकॉर्ड के लिए अनुमत और वास्तविक दैनिक दर, दिनों की संख्या, छूट और कमरे के शुल्क के अंतर की पुष्टि करें।'}
};
export function makeDeductionLetter(kind:'reconsideration'|'bima',deductions:Deduction[],insurerId:string,contacts:Contact[],rules:Rule[],language:Language,now=new Date()):Letter {
 const template=templates[language],totals=verdictTotals(deductions),validTotal=totals['likely valid'],reviewTotal=Object.values(totals).reduce((sum,value)=>sum+value,0)-validTotal;
 const total=(validTotal+reviewTotal).toLocaleString('en-IN'),name=contacts.find(c=>c.id===insurerId)?.name||insurerId,allValid=deductions.length>0&&deductions.every(d=>d.status==='likely valid');
 const fields:Record<string,string>={total,insurer:name,validTotal:validTotal.toLocaleString('en-IN'),reviewTotal:reviewTotal.toLocaleString('en-IN')};
 const fill=(s:string)=>s.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??`[${key}]`);
 fields.request=[reviewTotal>0?fill(template.bimaReview):'',validTotal>0?fill(template.bimaClarification):''].filter(Boolean).join('\n\n');
 const ids=allValid?['grievance-14-days']:['deduction-reasons','grievance-14-days'];
 const list=deductions.map((d,i)=>{
  const request=(d.status==='likely valid'?clarifications[d.category]:demands[d.category])||demands.unexplained;
  const absent=d.noApplicablePolicyClause?(language==='hi'?'मैंने अपनी पॉलिसी जाँची और इस कटौती के लिए कोई लागू शर्त नहीं मिली। ':'I checked my policy and found no applicable clause for this deduction. '):'';
  return `${i+1}. ${d.description} — ₹${d.amount.toLocaleString('en-IN')}. ${absent}${request[language]}${d.policyClause?` ${language==='hi'?'मेरे द्वारा दर्ज पॉलिसी की शर्त':'Policy term recorded by me'}: ${d.policyClause}.`:''}`;
 }).join('\n\n');
 const body=kind==='bima'?fill(template.bima):`${fill(allValid?template.clarificationIntro:template.intro)}\n\n${list}\n\n${allValid?template.clarificationDemand:template.demand}\n\n${ruleCitations(ids,rules,language)}`;
 return {id:crypto.randomUUID(),kind,language,generatedAt:now.toISOString(),subject:fill(kind==='bima'?template.bimaSubject:allValid?template.clarificationSubject:template.subject),body,ruleIds:ids};
}
