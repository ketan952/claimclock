import template from '../../templates/rejection.json' with {type:'json'};
import {ruleCitations} from './letters.ts';
import type {Contact,Language,Letter,Rule} from './types.ts';
export type RejectionInput={insurerId:string;rejectedOn:string;ground:string};
export function makeRejectionLetter(input:RejectionInput,contacts:Contact[],rules:Rule[],language:Language,now=new Date()):Letter {
 const insurer=contacts.find(c=>c.id===input.insurerId&&c.kind==='insurer');
 const date=new Date(`${input.rejectedOn}T00:00:00Z`);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(!insurer||!/^\d{4}-\d{2}-\d{2}$/.test(input.rejectedOn)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.rejectedOn||input.rejectedOn>today||!input.ground.trim()||input.ground.length>2000)throw Error('Invalid rejection details');
 const fields:Record<string,string>={insurer:insurer.name,date:date.toLocaleDateString(language==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}),ground:input.ground.trim(),citations:ruleCitations(template.rules,rules,language)};
 const fill=(value:string)=>value.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??`[${key}]`);
 return {id:crypto.randomUUID(),kind:'rejection',language,generatedAt:now.toISOString(),subject:fill(template[language].subject),body:fill(template[language].body),ruleIds:template.rules};
}
