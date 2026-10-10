import templates from '../../templates/messages.json' with { type: 'json' };
import type { Contact, Language, Letter, LetterKind, Rule, Timeline } from './types.ts';
import { duration, formatTime } from './clock.ts';
export function ruleCitations(ids:string[], rules:Rule[], language:Language) {
  return ids.map(id=>rules.find(r=>r.id===id)).filter((r):r is Rule=>Boolean(r)).map(r=>`${r.title} — ${r.paragraph}\n“${r.quote}”\n${language==='hi'&&r.plain_hi?r.plain_hi+'\n':''}${r.source_url}`).join('\n\n');
}
export function timelineText(t:Timeline, language:Language) {
  const labels:Record<string,string>=language==='hi'?{query:'सवाल पूछा गया',documents:'दस्तावेज़ फिर भेजे',call:'कॉल की',ack:'लिखित पुष्टि मिली',other:'अन्य जानकारी',approved:'मंज़ूर',partial:'आंशिक मंज़ूरी',rejected:'अस्वीकृत'}:{query:'Query raised',documents:'Documents re-sent',call:'Call made',ack:'Written acknowledgement received',other:'Other update',approved:'Approved',partial:'Partly approved',rejected:'Rejected'};
  return [`${formatTime(t.submittedAt,language)} — ${language==='hi'?'बताया गया अनुरोध समय':'Reported submission'}`,...[...t.events].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(e=>`${formatTime(e.at,language)} — ${labels[e.type]||e.type}: ${e.note}`),...(t.decidedAt?[`${formatTime(t.decidedAt,language)} — ${language==='hi'?'निर्णय':'Decision'}: ${labels[t.outcome||'']||t.outcome}`]:[])].join('\n');
}
export function makeLetter(kind:LetterKind, timeline:Timeline, contacts:Contact[], rules:Rule[], language:Language, extra:Record<string,string>={}, now=new Date()):Letter {
  const template=templates[kind];
  const windowRule=timeline.requestType==='preauth'?'cashless-preauth':timeline.requestType==='discharge'?'cashless-discharge':null;
  const ruleIds=template.rules.map(id=>id==='window'?windowRule:id).filter((id):id is string=>Boolean(id));
  const fields:Record<string,string>={
    insurer:contacts.find(c=>c.id===timeline.insurerId)?.name || timeline.insurerId || (language==='hi'?'[बीमा कंपनी जोड़ें]':'[add insurer]'),
    tpa:contacts.find(c=>c.id===timeline.tpaId)?.name || (language==='hi'?'पता नहीं / लागू नहीं':'not known / not applicable'),
    hospital:timeline.hospital || (language==='hi'?'[अस्पताल जोड़ें]':'[add hospital]'),city:timeline.city || (language==='hi'?'[शहर जोड़ें]':'[add city]'),
    request:({en:{preauth:'cashless pre-authorisation',discharge:'final discharge',enhancement:'enhancement'},hi:{preauth:'कैशलेस पूर्व-मंज़ूरी',discharge:'अंतिम डिस्चार्ज',enhancement:'अतिरिक्त मंज़ूरी'}})[language][timeline.requestType],
    submitted:formatTime(timeline.submittedAt,language), now:formatTime(now.toISOString(),language),
    elapsed:duration((timeline.decidedAt?Date.parse(timeline.decidedAt):now.getTime())-Date.parse(timeline.submittedAt)),
    decided:timeline.decidedAt?formatTime(timeline.decidedAt,language):(language==='hi'?'अभी दर्ज नहीं':'not yet recorded'),
    timeline:timelineText(timeline,language),citations:ruleCitations(ruleIds,rules,language),...extra
  };
  const fill=(s:string)=>s.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??`[${key}]`);
  return {id:crypto.randomUUID(),kind,language,generatedAt:now.toISOString(),subject:fill(template[language].subject),body:fill(template[language].body)+'\n\n'+(language==='hi'?'ClaimClock: जानकारी, कानूनी सलाह नहीं।':'ClaimClock: information, not legal advice.'),ruleIds};
}
