import templates from '../../templates/messages.json' with { type: 'json' };
import type { Contact, Language, Letter, LetterKind, Rule, Timeline } from './types.ts';
import { proseDuration, formatTime, windowMinutes } from './clock.ts';
const sourceBase='https://claimclock.ketan952.workers.dev';
export function ruleCitations(ids:string[], rules:Rule[], language:Language) {
 const entries=ids.map(id=>rules.find(r=>r.id===id)).filter((r):r is Rule=>Boolean(r));
 const health=entries.filter(r=>!['grievance-14-days','financial-limits-2024'].includes(r.id));
 const result:string[]=[];
 if(health.length){
  const quotations=health.map(r=>`${r.paragraph.match(/Chapter I ([^,;]+)/)?.[1]||r.paragraph}: “${r.quote}”`).join('\n');
  result.push(`${language==='hi'?'स्वास्थ्य बीमा मास्टर परिपत्र, 29 मई 2024':'Health Insurance Master Circular, 29 May 2024'}\n${quotations}\n${sourceBase}/s/health-mc-2024`);
 }
 const financial=entries.find(r=>r.id==='financial-limits-2024');
 if(financial)result.push(`${language==='hi'?'स्वास्थ्य बीमा परिपत्र के अनुबंध, 29 मई 2024':'Annexures to Health Insurance Circular, 29 May 2024'} — ${financial.paragraph}\n“${financial.quote}”\n${sourceBase}/s/health-annexures-2024`);
 const grievance=entries.find(r=>r.id==='grievance-14-days');
 if(grievance)result.push(`${language==='hi'?'पॉलिसीधारकों के हितों की सुरक्षा संबंधी मास्टर परिपत्र, 5 सितंबर 2024':'PPHI Master Circular, 5 September 2024'} — Part B VI.2(i)\n“${grievance.quote}”\n${sourceBase}/s/pphi-mc-2024`);
 return result.join('\n\n');
}
export function timingDemand(timeline:Timeline,language:Language,now=new Date()):string {
 const elapsed=Math.max(0,(timeline.decidedAt?Date.parse(timeline.decidedAt):now.getTime())-Date.parse(timeline.submittedAt));
 const minutes=windowMinutes(timeline.requestType);
 if(minutes===null)return language==='hi'?`मेरा दर्ज इंतज़ार ${proseDuration(elapsed,language)} है; प्राप्ति समय और अतिरिक्त मंज़ूरी का निर्णय दें।`:`My recorded wait is ${proseDuration(elapsed,language)}; confirm receipt and provide the enhancement decision.`;
 const hours=minutes/60;
 if(elapsed>minutes*60000)return language==='hi'?`अस्पताल के बताए समय से मेरा दर्ज इंतज़ार ${hours} घंटे की समय-सीमा से ${proseDuration(elapsed-minutes*60000,language)} अधिक है; अपने प्राप्ति समय की पुष्टि करें और देरी का कारण दें।`:`Based on the hospital's reported time, my recorded wait exceeds the ${hours}-hour window by ${proseDuration(elapsed-minutes*60000,language)}; confirm your receipt time and explain the delay.`;
 return language==='hi'?`मेरा दर्ज इंतज़ार ${proseDuration(elapsed,language)} है; अनुरोध मिलने से ${hours} घंटे की समय-सीमा में निर्णय दें और प्राप्ति समय की पुष्टि करें।`:`My recorded wait is ${proseDuration(elapsed,language)}; decide within the ${hours}-hour window from receipt and confirm your receipt time.`;
}
export function timelineNote(note:string,language:Language):string {
 if(!note.startsWith('@time-correction|'))return note;
 const [,before,after]=note.split('|');if(!before||!after)return note;
 return language==='hi'?`अनुरोध समय ${formatTime(before,language)} से बदलकर ${formatTime(after,language)} किया गया।`:`Submission time corrected from ${formatTime(before,language)} to ${formatTime(after,language)}.`;
}
export function timelineText(t:Timeline, language:Language) {
  const labels:Record<string,string>=language==='hi'?{query:'सवाल पूछा गया',documents:'दस्तावेज़ फिर भेजे',call:'कॉल की',ack:'लिखित पुष्टि मिली',other:'अन्य जानकारी',approved:'मंज़ूर',partial:'आंशिक मंज़ूरी',rejected:'अस्वीकृत'}:{query:'Query raised',documents:'Documents re-sent',call:'Call made',ack:'Written acknowledgement received',other:'Other update',approved:'Approved',partial:'Partly approved',rejected:'Rejected'};
  return [`${formatTime(t.submittedAt,language)} — ${language==='hi'?'बताया गया अनुरोध समय':'Reported submission'}`,...[...t.events].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(e=>`${formatTime(e.at,language)} — ${labels[e.type]||e.type}: ${timelineNote(e.note,language)}`),...(t.decidedAt?[`${formatTime(t.decidedAt,language)} — ${language==='hi'?'निर्णय':'Decision'}: ${labels[t.outcome||'']||t.outcome}`]:[])].join('\n');
}
export function makeLetter(kind:LetterKind, timeline:Timeline, contacts:Contact[], rules:Rule[], language:Language, extra:Record<string,string>={}, now=new Date()):Letter {
  const template=templates[kind];
  const windowRule=timeline.requestType==='preauth'?'cashless-preauth':timeline.requestType==='discharge'?'cashless-discharge':null;
  const ruleIds=template.rules.map(id=>id==='window'?windowRule:id).filter((id):id is string=>Boolean(id));
  const fields:Record<string,string>={
    insurer:contacts.find(c=>c.id===timeline.insurerId)?.name || (timeline.insurerId&&timeline.insurerId!=='unlisted'?timeline.insurerId:(language==='hi'?'[बीमा कंपनी का नाम जोड़ें]':'[add insurer name]')),
    tpa:contacts.find(c=>c.id===timeline.tpaId)?.name || (language==='hi'?'पता नहीं / लागू नहीं':'not known / not applicable'),
    hospital:timeline.hospital || (language==='hi'?'[अस्पताल जोड़ें]':'[add hospital]'),city:timeline.city || (language==='hi'?'[शहर जोड़ें]':'[add city]'),
    request:({en:{preauth:'cashless pre-authorisation',discharge:'final discharge',enhancement:'enhancement'},hi:{preauth:'कैशलेस पूर्व-मंज़ूरी',discharge:'अंतिम डिस्चार्ज',enhancement:'अतिरिक्त मंज़ूरी'}})[language][timeline.requestType],
    submitted:formatTime(timeline.submittedAt,language), now:formatTime(now.toISOString(),language),
    elapsed:proseDuration((timeline.decidedAt?Date.parse(timeline.decidedAt):now.getTime())-Date.parse(timeline.submittedAt),language),
    decided:timeline.decidedAt?formatTime(timeline.decidedAt,language):(language==='hi'?'अभी दर्ज नहीं':'not yet recorded'),
    timeline:timelineText(timeline,language),timing:timingDemand(timeline,language,now),citations:ruleCitations(ruleIds,rules,language),...extra
  };
  const fill=(s:string)=>s.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??`[${key}]`);
  return {id:crypto.randomUUID(),kind,language,generatedAt:now.toISOString(),subject:fill(template[language].subject),body:fill(template[language].body),ruleIds};
}
