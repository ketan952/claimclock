import {ruleCitations} from './letters.ts';
import type {Contact,Language,Letter,Rule} from './types.ts';

export function makeReimbursementDeskLetter(insurerName:string,hospitalName:string,language:Language,now=new Date()):Letter {
 const insurer=insurerName.trim()||(language==='hi'?'[बीमा कंपनी का नाम]':'[add insurer]');
 const hospital=hospitalName.trim()||(language==='hi'?'[अस्पताल का नाम]':'[add hospital]');
 if(language==='hi'){
  return {
   id:crypto.randomUUID(),kind:'reimbursement-desk',language,generatedAt:now.toISOString(),
   subject:`प्रतिपूर्ति (रीइम्बर्समेंट) दावे के लिए आवश्यक मूल दस्तावेज़ — ${hospital}`,
   body:`प्रति: अस्पताल बिलिंग और बीमा / TPA डेस्क, ${hospital}\n\nनाम: [आपका नाम]\nपॉलिसी / दावा संख्या: [पॉलिसी / दावा संख्या]\nबीमा कंपनी: ${insurer}\n\nचूँकि कैशलेस अनुरोध स्वीकृत नहीं हुआ है (या आंशिक रहा है), हम प्रतिपूर्ति (रीइम्बर्समेंट) दावा दर्ज करेंगे। कृपया डिस्चार्ज से पहले हमें ये सभी दस्तावेज़ उपलब्ध कराएँ:\n\n1. कैशलेस अस्वीकृति / प्रश्न का लिखित पत्र और अनुरोध संदर्भ संख्या।\n2. अंतिम विस्तृत (आइटमवार) अस्पताल बिल और जमा राशि (डिपॉज़िट) का समायोजन दिखाने वाली अंतिम भुगतान रसीदें।\n3. अंतिम डिस्चार्ज सारांश (डिस्चार्ज समरी)।\n4. अस्पताल की मुहर सहित प्रमाणित अंतरंग केस पेपर (इनडोर केस पेपर), डॉक्टर के दैनिक नोट्स, तापमान/दवा चार्ट और ऑपरेशन नोट्स।\n5. इलाज करने वाले डॉक्टर का हस्ताक्षरित प्रमाण-पत्र जिसमें बताया गया हो कि अस्पताल में भर्ती क्यों आवश्यक थी।\n6. सभी मूल जाँच रिपोर्ट, पर्चियाँ और फार्मेसी बिल।\n7. उपयोग किए गए किसी भी इम्प्लांट / स्टेंट / लेंस का मूल बीजक (इनवॉइस) और बारकोड स्टिकर (यदि लागू हो)।`,
   ruleIds:[],
  };
 }
 return {
  id:crypto.randomUUID(),kind:'reimbursement-desk',language,generatedAt:now.toISOString(),
  subject:`Request for complete reimbursement claim documents before discharge — ${hospital}`,
  body:`To the hospital billing and insurance / TPA desk, ${hospital}\n\nName: [Your name]\nPolicy / Claim number: [Policy / Claim number]\nInsurer: ${insurer}\n\nBecause cashless authorisation was declined or did not cover the full bill, I will be filing a reimbursement claim. Before discharge, please provide the complete set of documents required for reimbursement:\n\n1. Written cashless denial / query note and the cashless request reference ID.\n2. Final itemised hospital bill and paid receipts clearly reconciling any admission deposit.\n3. Final discharge summary.\n4. Certified copy of the complete Indoor Case Papers (ICP), daily progress notes, medication/vital charts and OT notes with hospital stamp.\n5. Signed note from the treating doctor stating why inpatient admission was clinically necessary.\n6. All original diagnostic/investigation reports, prescriptions and itemised pharmacy invoices.\n7. Original invoice and barcode/batch sticker for any implant, stent or prosthesis used (if applicable).`,
  ruleIds:[],
 };
}

export function makeTwoPoliciesLetter(primaryInsurerName:string,secondaryInsurerName:string,balanceAmount:string,language:Language,rules:Rule[],now=new Date()):Letter {
 const primary=primaryInsurerName.trim()||(language==='hi'?'[प्राथमिक बीमा कंपनी]':'[Primary insurer]');
 const secondary=secondaryInsurerName.trim()||(language==='hi'?'[दूसरी बीमा कंपनी]':'[Second insurer]');
 const amount=balanceAmount.trim()||(language==='hi'?'[शेष राशि]':'[balance amount]');
 const ruleIds=['multiple-policies','deduction-reasons'];
 const citations=ruleCitations(ruleIds,rules,language);
 if(language==='hi'){
  return {
   id:crypto.randomUUID(),kind:'two-policies',language,generatedAt:now.toISOString(),
   subject:`दो पॉलिसियों के अंतर्गत शेष दावे (₹${amount}) का समन्वय और निपटान — ${secondary}`,
   body:`प्रति: दावा विभाग / शिकायत निवारण अधिकारी, ${secondary}\n\nनाम: [आपका नाम]\nदूसरी पॉलिसी संख्या (${secondary}): [पॉलिसी संख्या]\nप्राथमिक पॉलिसी और दावा संख्या (${primary}): [प्राथमिक दावा संख्या]\n\nमैंने पहले अपनी ${primary} पॉलिसी के अंतर्गत दावा किया था। कुल बिल में से ₹${amount} की शेष राशि अभी बची है।\n\nअध्याय I अनुच्छेद 18(a) के अनुसार:\n1. कृपया ${primary} के निपटान पत्र (सेटलमेंट लेटर) और अस्पताल द्वारा प्रमाणित बिल/दस्तावेज़ों के आधार पर ₹${amount} की शेष अनुमन्य राशि का निपटान करें।\n2. यदि दोनों बीमा कंपनियों के बीच किसी सत्यापन या समन्वय की आवश्यकता है, तो अनुच्छेद 18(a) के अंतर्गत पॉलिसीधारक को परेशानी दिए बिना आपस में समन्वय करें।\n\nसंलग्नक: [${primary} का दावा निपटान पत्र]; [अस्पताल से प्रमाणित अंतिम आइटमवार बिल और भुगतान रसीदें]; [डिस्चार्ज सारांश और जाँच रिपोर्ट की प्रमाणित प्रतियाँ]।\n\n${citations}`,
   ruleIds,
  };
 }
 return {
  id:crypto.randomUUID(),kind:'two-policies',language,generatedAt:now.toISOString(),
  subject:`Settlement and coordination of balance claim (₹${amount}) under second policy — ${secondary}`,
  body:`To the Claims Team / Grievance Redressal Officer, ${secondary}\n\nName: [Your name]\nSecond policy number (${secondary}): [Policy number]\nPrimary policy and claim reference (${primary}): [Primary claim reference]\n\nI first claimed under my ${primary} policy. After that settlement, a balance of ₹${amount} remains unpaid.\n\nUnder Chapter I paragraph 18(a) of the Health Insurance Master Circular:\n1. Please process and settle the admissible balance of ₹${amount} under my ${secondary} policy based on the primary insurer’s Claim Settlement Letter and the hospital-attested copies of the bills and clinical records.\n2. Where inter-insurer verification is needed, please coordinate with ${primary} under paragraph 18(a) to settle the balance without causing hassle to the policyholder.\n\nAttachments: [Claim Settlement Letter from ${primary}]; [Hospital-attested itemised bill and paid receipts]; [Attested discharge summary and investigation reports].\n\n${citations}`,
  ruleIds,
 };
}

export type OmbudsmanReplyStatus='replied'|'no-reply';
export type OmbudsmanCheckInput={insurerId:string;groDate:string;replyStatus:OmbudsmanReplyStatus;replyDate?:string;amount:number;notInCourt:boolean;summary:string};
export type OmbudsmanCheckResult={eligible:boolean;reasonKey:string;triggerDate:string;oneYearLimitDate:string};

function addMonthsUTC(ymd:string,months:number):string {
 const [y,m,d]=ymd.split('-').map(Number);
 const targetMonth=m-1+months;
 const year=y+Math.floor(targetMonth/12);
 const month=((targetMonth%12)+12)%12;
 const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 const clamped=Math.min(d,lastDay);
 return `${year}-${String(month+1).padStart(2,'0')}-${String(clamped).padStart(2,'0')}`;
}

export function evaluateOmbudsmanEligibility(input:OmbudsmanCheckInput,now=new Date()):OmbudsmanCheckResult {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(`${s}T00:00:00Z`))&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s;
 if(!validDate(input.groDate)||input.groDate>today)return{eligible:false,reasonKey:'ombudsman.invalidGroDate',triggerDate:'',oneYearLimitDate:''};
 if(!Number.isFinite(input.amount)||input.amount<=0)return{eligible:false,reasonKey:'ombudsman.invalidAmount',triggerDate:'',oneYearLimitDate:''};
 if(input.amount>5000000)return{eligible:false,reasonKey:'ombudsman.overLimit',triggerDate:'',oneYearLimitDate:''};
 if(!input.notInCourt)return{eligible:false,reasonKey:'ombudsman.inCourt',triggerDate:'',oneYearLimitDate:''};
 const oneMonthAfterGro=addMonthsUTC(input.groDate,1);
 if(input.replyStatus==='replied'){
  const rDate=input.replyDate&&validDate(input.replyDate)?input.replyDate:input.groDate;
  if(rDate<input.groDate||rDate>today)return{eligible:false,reasonKey:'ombudsman.invalidReplyDate',triggerDate:'',oneYearLimitDate:''};
  const limit=addMonthsUTC(rDate,12);
  if(today>limit)return{eligible:false,reasonKey:'ombudsman.pastOneYear',triggerDate:rDate,oneYearLimitDate:limit};
  return{eligible:true,reasonKey:'ombudsman.readyReplied',triggerDate:rDate,oneYearLimitDate:limit};
 }
 if(today<oneMonthAfterGro)return{eligible:false,reasonKey:'ombudsman.waitOneMonth',triggerDate:oneMonthAfterGro,oneYearLimitDate:addMonthsUTC(oneMonthAfterGro,12)};
 const limit=addMonthsUTC(oneMonthAfterGro,12);
 if(today>limit)return{eligible:false,reasonKey:'ombudsman.pastOneYear',triggerDate:oneMonthAfterGro,oneYearLimitDate:limit};
 return{eligible:true,reasonKey:'ombudsman.readyNoReply',triggerDate:oneMonthAfterGro,oneYearLimitDate:limit};
}

export function makeOmbudsmanDraft(input:OmbudsmanCheckInput,contacts:Contact[],rules:Rule[],language:Language,now=new Date()):Letter {
 const insurer=contacts.find(c=>c.id===input.insurerId)?.name|| (language==='hi'?'[बीमा कंपनी का नाम]':'[Insurer name]');
 const fmt=(ymd:string)=>new Date(`${ymd}T00:00:00Z`).toLocaleDateString(language==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 const amountStr=Number(input.amount).toLocaleString('en-IN');
 const ruleIds=['ombudsman-eligibility','ombudsman-award'];
 const citations=ruleCitations(ruleIds,rules,language);
 const summary=input.summary.trim()||(language==='hi'?'[दावे के अस्वीकार / कटौती का संक्षिप्त विवरण लिखें]':'[Summarize the rejection or deduction and why you dispute it]');
 if(language==='hi'){
  const groLine=input.replyStatus==='replied'
   ?`मैंने ${fmt(input.groDate)} को बीमा कंपनी के शिकायत निवारण अधिकारी (GRO) को लिखित शिकायत भेजी थी और ${fmt(input.replyDate||input.groDate)} को प्राप्त उत्तर से मैं संतुष्ट नहीं हूँ।`
   :`मैंने ${fmt(input.groDate)} को बीमा कंपनी के शिकायत निवारण अधिकारी (GRO) को लिखित शिकायत भेजी थी और एक कैलेंडर माह बीत जाने के बाद भी समाधान नहीं मिला है।`;
  return {
   id:crypto.randomUUID(),kind:'ombudsman',language,generatedAt:now.toISOString(),
   subject:`बीमा लोकपाल के समक्ष शिकायत — ${insurer} (विवादित राशि: ₹${amountStr})`,
   body:`प्रति: कार्यालय बीमा लोकपाल (cioins.co.in पोर्टल के माध्यम से)\n\nशिकायतकर्ता का नाम: [आपका नाम]\nपॉलिसी संख्या: [पॉलिसी संख्या]\nदावा संख्या: [दावा संख्या]\nबीमा कंपनी: ${insurer}\nविवादित दावा राशि: ₹${amountStr} (₹50 लाख की सीमा के भीतर)\n\n1. पूर्व शिकायत का विवरण: ${groLine}\n2. विवाद का संक्षिप्त विवरण: ${summary}\n3. माँगी गई राहत: कृपया बीमा कंपनी को पॉलिसी की शर्तों और चिकित्सा रिकॉर्ड के अनुसार ₹${amountStr} की दावा राशि तथा लागू ब्याज का भुगतान करने का निर्देश दें।\n4. घोषणा: यह विवाद किसी न्यायालय, उपभोक्ता आयोग या मध्यस्थता में लंबित या निर्णीत नहीं है।\n\nसंलग्नक: [GRO को भेजी गई शिकायत और उसकी पावती/उत्तर]; [अस्वीकृति या कटौती पत्र]; [पॉलिसी अनुसूची और शर्तें]; [डिस्चार्ज सारांश, डॉक्टर का पत्र, अंतिम बिल और भुगतान रसीदें]।\n\n${citations}`,
   ruleIds,
  };
 }
 const groLine=input.replyStatus==='replied'
  ?`I submitted a written representation to the insurer's Grievance Redressal Officer (GRO) on ${fmt(input.groDate)} and received an unsatisfactory / rejection response on ${fmt(input.replyDate||input.groDate)}.`
  :`I submitted a written representation to the insurer's Grievance Redressal Officer (GRO) on ${fmt(input.groDate)}, and more than one calendar month has elapsed without resolution.`;
 return {
  id:crypto.randomUUID(),kind:'ombudsman',language,generatedAt:now.toISOString(),
  subject:`Insurance Ombudsman complaint summary — ${insurer} (Disputed amount: ₹${amountStr})`,
  body:`To the Office of the Insurance Ombudsman (for submission on cioins.co.in)\n\nComplainant Name: [Your name]\nPolicy number: [Policy number]\nClaim number: [Claim number]\nInsurer: ${insurer}\nRelief / disputed amount sought: ₹${amountStr} (within the ₹50,00,000 Ombudsman jurisdiction)\n\n1. Prior representation to insurer: ${groLine}\n2. Facts of the dispute: ${summary}\n3. Relief sought: Direct the insurer to pay the admissible claim amount of ₹${amountStr} along with applicable interest under the Insurance Ombudsman Rules.\n4. Declaration: The subject matter of this complaint is not pending or decided before any court, consumer commission or arbitrator.\n\nAttachments: [Written GRO complaint and acknowledgement/reply]; [Rejection or settlement letter]; [Policy schedule and wording]; [Discharge summary, treating doctor's note, itemised hospital bill and paid receipts].\n\n${citations}`,
  ruleIds,
 };
}
