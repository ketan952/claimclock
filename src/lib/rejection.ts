import template from '../../templates/rejection.json' with {type:'json'};
import {ruleCitations} from './letters.ts';
import type {Contact,Language,Letter,Rule} from './types.ts';
export type RejectionCategory='general'|'medical-necessity'|'non-disclosure'|'waiting-period'|'missing-documents';
export type RejectionInput={insurerId:string;rejectedOn:string;ground:string;category?:RejectionCategory;moratorium60Months?:boolean};

export function detectRejectionCategory(text:string):RejectionCategory {
 const s=text.toLowerCase();
 if(/not medically necessary|medically unnecessary|opd\b|out[- ]?patient|observation and evaluation|diagnostic purpose|no active line of treatment|could have been managed/i.test(s))return'medical-necessity';
 if(/non[- ]?disclosure|not disclosed|suppression|misrepresentation|pre[- ]?existing.{0,30}(?:not disclosed|prior to inception|known case)|material fact/i.test(s))return'non-disclosure';
 if(/waiting period|two[- ]?year|24[- ]?month|36[- ]?month|48[- ]?month|specific ailment waiting|initial waiting/i.test(s))return'waiting-period';
 if(/want of documents|missing document|non[- ]?submission|deficiency of document|query not replied|indoor case paper|icp not submitted/i.test(s))return'missing-documents';
 return'general';
}

const extraDemandEn:Record<Exclude<RejectionCategory,'general'>,string>={
 'medical-necessity':'4. Because the rejection questions whether inpatient hospitalisation was necessary, provide the specific clinical criteria, vital-sign thresholds and specialist medical opinion relied on to override the treating doctor’s admission decision, and review the attached treating doctor’s justification note and indoor case papers.',
 'non-disclosure':'4. Because the rejection alleges non-disclosure or a pre-existing condition, provide the proposal form, underwriting records and the specific clinical record establishing the date of first diagnosis and its material nexus to the admitted illness.',
 'waiting-period':'4. Because the rejection invokes a waiting period, provide the policy inception date, the continuity credits carried forward from any prior ported or migrated policy under Chapter I paragraphs 11–12, and the exact clause and clinical onset record relied upon.',
 'missing-documents':'4. Because the rejection refers to pending or missing hospital documents, collect the required hospital records directly from the hospital under Chapter I paragraph 17(c) and list any specific remaining query in writing.',
};
const extraDemandHi:Record<Exclude<RejectionCategory,'general'>,string>={
 'medical-necessity':'4. चूँकि अस्वीकृति में अस्पताल में भर्ती की आवश्यकता पर सवाल उठाया गया है, इसलिए इलाज करने वाले डॉक्टर के निर्णय को अस्वीकार करने के लिए उपयोग किए गए नैदानिक आधार और विशेषज्ञ चिकित्सा राय दें, तथा संलग्न डॉक्टर के स्पष्टीकरण पत्र और अंतरंग केस पेपर की समीक्षा करें।',
 'non-disclosure':'4. चूँकि अस्वीकृति में गैर-प्रकटीकरण या पूर्व-मौजूदा बीमारी का उल्लेख है, इसलिए प्रस्ताव प्रपत्र, अंडरराइटिंग रिकॉर्ड और पहली बार बीमारी का पता चलने की तारीख तथा वर्तमान भर्ती से उसके संबंध का चिकित्सा प्रमाण दें।',
 'waiting-period':'4. चूँकि अस्वीकृति में प्रतीक्षा अवधि का उल्लेख है, इसलिए पॉलिसी शुरू होने की तारीख, अध्याय I अनुच्छेद 11–12 के तहत पोर्ट या माइग्रेट की गई पिछली पॉलिसियों से जुड़ी निरंतरता अवधि और लागू शर्त का विवरण दें।',
 'missing-documents':'4. चूँकि अस्वीकृति में अस्पताल के दस्तावेज़ों की कमी बताई गई है, इसलिए अध्याय I अनुच्छेद 17(c) के अनुसार आवश्यक दस्तावेज़ सीधे अस्पताल से प्राप्त करें और यदि कोई बिंदु शेष हो तो लिखित में बताएँ।',
};
const moratoriumDemandEn='Confirm my continuous coverage period including all ported and migrated policy credits. Where 60 months of continuous coverage (the Moratorium Period under Chapter I paragraph 13) is completed, a policy or claim cannot be contested on grounds of non-disclosure or misrepresentation except for established fraud.';
const moratoriumDemandHi='पोर्ट और माइग्रेट की गई पॉलिसियों सहित मेरे निरंतर कवरेज की अवधि की पुष्टि करें। अध्याय I अनुच्छेद 13 के अनुसार 60 महीने का निरंतर कवरेज (मोरेटोरियम अवधि) पूरा होने के बाद, स्थापित धोखाधड़ी को छोड़कर गैर-प्रकटीकरण या गलत विवरण के आधार पर दावे पर आपत्ति नहीं की जा सकती।';

export function makeRejectionLetter(input:RejectionInput,contacts:Contact[],rules:Rule[],language:Language,now=new Date()):Letter {
 const insurer=contacts.find(c=>c.id===input.insurerId&&c.kind==='insurer');
 const date=new Date(`${input.rejectedOn}T00:00:00Z`);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(!insurer||!/^\d{4}-\d{2}-\d{2}$/.test(input.rejectedOn)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.rejectedOn||input.rejectedOn>today||!input.ground.trim()||input.ground.length>2000)throw Error('Invalid rejection details');
 const ruleIds=[...template.rules];
 const cat=input.category&&input.category!=='general'?input.category:undefined;
 if(cat==='missing-documents'&&!ruleIds.includes('documents-from-hospital'))ruleIds.push('documents-from-hospital');
 if(input.moratorium60Months&&!ruleIds.includes('moratorium-60-months'))ruleIds.push('moratorium-60-months');
 const fields:Record<string,string>={insurer:insurer.name,date:date.toLocaleDateString(language==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}),ground:input.ground.trim(),citations:ruleCitations(ruleIds,rules,language)};
 const fill=(value:string)=>value.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??`[${key}]`);
 let body=fill(template[language].body);
 const additions:string[]=[];
 if(cat)additions.push(language==='hi'?extraDemandHi[cat]:extraDemandEn[cat]);
 if(input.moratorium60Months)additions.push(`${cat?5:4}. ${language==='hi'?moratoriumDemandHi:moratoriumDemandEn}`);
 if(additions.length){
  const anchor=language==='hi'?'3. मेरी संलग्न पॉलिसी और दावा रिकॉर्ड की समीक्षा करके कारण सहित निर्णय दें।':'3. Review my attached policy and claim records and issue a reasoned decision.';
  body=body.replace(anchor,`${anchor}\n${additions.join('\n')}`);
 }
 return {id:crypto.randomUUID(),kind:'rejection',language,generatedAt:now.toISOString(),subject:fill(template[language].subject),body,ruleIds};
}

export function makeDoctorJustificationNote(insurerName:string,language:Language,now=new Date()):Letter {
 const insurer=insurerName.trim()||(language==='hi'?'[बीमा कंपनी का नाम]':'[Insurer name]');
 if(language==='hi'){
  return {
   id:crypto.randomUUID(),kind:'doctor-note',language,generatedAt:now.toISOString(),
   subject:`चिकित्सकीय आवश्यकता प्रमाण-पत्र (इलाज करने वाले डॉक्टर के लेटरहेड के लिए) — ${insurer}`,
   body:`[अस्पताल के लेटरहेड पर — इलाज करने वाले डॉक्टर के हस्ताक्षर और मुहर सहित]\n\nदिनांक: [तारीख]\nप्रति: चिकित्सा दल / शिकायत निवारण अधिकारी, ${insurer}\n\nविषय: रोगी [रोगी का नाम], UHID [UHID], पॉलिसी/दावा संख्या [दावा संख्या] के अस्पताल में भर्ती की चिकित्सकीय आवश्यकता का प्रमाण-पत्र\n\nयह प्रमाणित किया जाता है कि रोगी [रोगी का नाम] को दिनांक [भर्ती की तारीख] से [डिस्चार्ज की तारीख] तक [बीमारी / निदान] के इलाज के लिए इस अस्पताल में भर्ती किया गया था।\n\n1. भर्ती के समय स्थिति और लक्षण: [बुखार/दर्द/जाँच के निष्कर्ष/गंभीर लक्षण लिखें]।\n2. अंतरंग (इन-पेशेंट) भर्ती क्यों आवश्यक थी और बाह्य रोगी (ओपीडी) इलाज क्यों पर्याप्त नहीं था: रोगी को निरंतर निगरानी, नसों द्वारा दवाइयों (IV दवाइयों/तरल) और तत्काल चिकित्सकीय देखभाल की आवश्यकता थी, जो घर या बाह्य रोगी स्तर पर सुरक्षित रूप से संभव नहीं थी।\n3. बीमारी की अवधि / पहली बार पता चलने का विवरण (यदि लागू हो): रोगी के उपलब्ध रिकॉर्ड और इतिहास के अनुसार वर्तमान समस्या [अवधि] से है।\n\nअतः यह भर्ती पूरी तरह चिकित्सकीय निर्णय और रोगी की सुरक्षा के लिए आवश्यक थी।\n\nहस्ताक्षर: ______________________\nडॉक्टर का नाम: [डॉक्टर का नाम]\nपंजीकरण संख्या: [पंजीकरण संख्या]\nअस्पताल की मुहर:`,
   ruleIds:[],
  };
 }
 return {
  id:crypto.randomUUID(),kind:'doctor-note',language,generatedAt:now.toISOString(),
  subject:`Treating doctor's medical-necessity certificate template — ${insurer}`,
  body:`[On Hospital Letterhead — to be signed and stamped by the Treating Doctor]\n\nDate: [Date]\nTo: The Medical Team / Grievance Redressal Officer, ${insurer}\n\nSubject: Clinical justification for inpatient hospitalisation — Patient [Patient name], UHID [UHID], Policy/Claim No. [Claim number]\n\nThis is to certify that [Patient name] was admitted under my care from [Admission date] to [Discharge date] with a diagnosis of [Diagnosis].\n\n1. Clinical presentation at admission: [vital signs, acute symptoms and examination findings at admission].\n2. Why inpatient admission was medically necessary and outpatient (OPD) care was not sufficient: The patient required continuous inpatient monitoring, parenteral (IV) medication/fluids and clinical supervision [add specific intervention/procedure], which could not be safely managed on an outpatient basis.\n3. Duration / onset history (where relevant to waiting-period or pre-existing queries): As per clinical history and examination, the presenting condition has a duration of [duration / first onset date].\n\nInpatient admission and treatment were advised solely on clinical judgment for patient safety.\n\nSignature: ______________________\nTreating Doctor's Name: [Doctor's name]\nRegistration No.: [Medical registration number]\nHospital Stamp:`,
  ruleIds:[],
 };
}
