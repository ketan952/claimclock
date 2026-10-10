import contactsRaw from '../../data/contacts.json';
import rulesRaw from '../../data/rules.json';
import type { Contact, LetterKind, Rule, Timeline, RequestType } from './types.ts';
import {clockState,duration,formatTime,localInputValue,validSubmission} from './clock.ts';
import {loadTimeline,saveTimeline,download,eraseLocal} from './storage.ts';
import {lang,t} from './i18n';
import {makeLetter,timelineText} from './letters.ts';
import {setupLetterDialog} from './letter-dialog.ts';
import {track} from './events.ts';
import {renderContacts} from './contact-view';
const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=<T extends HTMLFormElement=HTMLFormElement>(id:string)=>el<T>(id);
const showLetter=setupLetterDialog();
let timeline=loadTimeline();
const start=form('start-form');
const input=(f:HTMLFormElement,n:string)=>f.elements.namedItem(n) as HTMLInputElement;
input(start,'submittedAt').value=localInputValue();
input(form('event-form'),'at').value=localInputValue();
input(form('finish-form'),'decidedAt').value=localInputValue();
el('input-timezone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone;
function save(){if(timeline&&!saveTimeline(timeline))el('storage-error').textContent=t('error.storage');}
function addText(parent:HTMLElement,tag:string,text:string){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
function updateClock(){
 if(!timeline)return;
 const state=clockState(timeline);el('clock-label').textContent=t(`clock.${state.stage==='decided'?'decided':state.remaining===null?'tracking':state.stage==='beyond'?'overdue':'remaining'}`);
 el('clock-digits').textContent=duration(state.stage==='decided'?state.elapsed:state.remaining??state.elapsed);
 el('clock-card').classList.toggle('beyond',state.stage==='beyond');
 el('clock-progress').style.width=`${state.minutes?Math.min(100,state.elapsed/(state.minutes*60000)*100):0}%`;
 el('enhancement-note').hidden=timeline.requestType!=='enhancement';
 const next=t(state.stage==='decided'?'clock.nextDecided':state.stage==='beyond'?'clock.nextBeyond':state.stage==='halfway'?'clock.nextHalfway':'clock.nextRunning');if(el('clock-next').textContent!==next)el('clock-next').textContent=next;
 for(const button of document.querySelectorAll<HTMLElement>('[data-letter="followup"]')) button.classList.toggle('ready',state.stage==='halfway'||state.stage==='beyond');
}
function reportPayload(){return timeline?{insurer:timeline.insurerId,tpa:timeline.tpaId||null,city:timeline.city,request_type:timeline.requestType,submitted_at:timeline.submittedAt,decided_at:timeline.decidedAt,outcome:timeline.outcome,consent_version:'2026-10-10'}:null;}
function render(){
 el('intro').hidden=!!timeline;el('start-view').hidden=!!timeline;el('dashboard').hidden=!timeline;
 document.querySelectorAll<HTMLElement>('[data-rule-plain]').forEach(node=>{const rule=rules.find(r=>r.id===node.dataset.rulePlain);if(rule)node.textContent=(lang()==='hi'?rule.plain_hi:rule.plain_en)||rule.title;});
 if(!timeline)return;
 const insurer=contacts.find(c=>c.id===timeline!.insurerId);
 el('clock-meta').textContent=`${insurer?.name||timeline.insurerId} · ${formatTime(timeline.submittedAt,lang())}`;
 el('timeline-list').replaceChildren();
 const entries=[{at:timeline.submittedAt,type:lang()==='hi'?'बताया गया अनुरोध समय':'Reported submission',note:''},...timeline.events.map(e=>({...e,type:t(`timeline.${e.type}`)})),...(timeline.decidedAt?[{at:timeline.decidedAt,type:t('finished.title'),note:t(`finished.${timeline.outcome}`)}]:[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 for(const e of entries){const li=document.createElement('li');const time=addText(li,'time',formatTime(e.at,lang()));time.setAttribute('datetime',e.at);addText(li,'span',e.type);if(e.note)addText(li,'p',e.note);el('timeline-list').append(li);}
 el('active-rule').replaceChildren();
 const active=rules.find(r=>r.id===(timeline!.requestType==='preauth'?'cashless-preauth':timeline!.requestType==='discharge'?'cashless-discharge':''));
 if(active){addText(el('active-rule'),'p',(lang()==='hi'?active.plain_hi:active.plain_en)||active.title);addText(el('active-rule'),'blockquote',`“${active.quote}”`);const a=addText(el('active-rule'),'a',`${active.paragraph} ↗`) as HTMLAnchorElement;a.href=active.source_url;a.target='_blank';a.rel='noopener noreferrer';}
 else addText(el('active-rule'),'p',t('clock.enhancement'));
 renderContacts(el('contacts'),[insurer,contacts.find(c=>c.id===timeline!.tpaId)].filter((c):c is Contact=>!!c));
 if(!insurer?.gro_email){addText(el('contacts'),'p',t('contact.unavailable'));const a=addText(el('contacts'),'a',t('contact.directory')) as HTMLAnchorElement;a.href='https://irdai.gov.in/list-of-gros';a.target='_blank';a.rel='noopener noreferrer';}
 el('recovery-section').hidden=timeline.requestType!=='discharge';
 document.querySelectorAll<HTMLElement>('.discharge-only').forEach(n=>n.hidden=timeline!.requestType!=='discharge');
 el('optin-section').hidden=!timeline.decidedAt;
 if(timeline.decidedAt)el('report-preview').textContent=JSON.stringify(reportPayload(),null,2);
 updateClock();
}
start.addEventListener('submit',e=>{
 e.preventDefault();const value=input(start,'submittedAt').value;
 if(!validSubmission(value)){el('start-error').textContent=t('error.time');return;}
 const previous=timeline;
 timeline={id:previous?.id||crypto.randomUUID(),insurerId:input(start,'insurer').value,tpaId:input(start,'tpa').value,hospital:input(start,'hospital').value.trim(),city:input(start,'city').value.trim(),requestType:input(start,'requestType').value as RequestType,submittedAt:new Date(value).toISOString(),events:previous?.events||[],decidedAt:previous?.decidedAt,outcome:previous?.outcome};
 if(timeline.decidedAt&&Date.parse(timeline.decidedAt)<Date.parse(timeline.submittedAt)){delete timeline.decidedAt;delete timeline.outcome;}
 if(previous&&previous.submittedAt!==timeline.submittedAt)timeline.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),type:'other',note:`Submission corrected from ${previous.submittedAt} to ${timeline.submittedAt}`});
 el('start-error').textContent='';save();render();el('dashboard').scrollIntoView({block:'start'});track('session_started');
});
el('edit-details').addEventListener('click',()=>{if(!timeline)return;for(const [key,v] of Object.entries({insurer:timeline.insurerId,tpa:timeline.tpaId||'',hospital:timeline.hospital,city:timeline.city,requestType:timeline.requestType,submittedAt:localInputValue(new Date(timeline.submittedAt))}))input(start,key).value=v;el('start-view').hidden=false;el('dashboard').hidden=true;start.scrollIntoView();});
document.querySelectorAll<HTMLElement>('[data-letter]').forEach(button=>button.addEventListener('click',()=>{if(timeline)showLetter(makeLetter(button.dataset.letter as LetterKind,timeline,contacts,rules,lang()),['gro','recovery'].includes(button.dataset.letter||'')?contacts.find(c=>c.id===timeline!.insurerId)?.gro_email||'':'');}));
form('event-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('event-form'),at=input(f,'at').value;if(!validSubmission(at)||Date.parse(at)<Date.parse(timeline.submittedAt)){el('event-error').textContent=t('finished.error');return;}timeline.events.push({id:crypto.randomUUID(),at:new Date(at).toISOString(),type:input(f,'type').value,note:input(f,'note').value.trim()});input(f,'note').value='';input(f,'at').value=localInputValue();el('event-error').textContent='';save();render();});
el('print-timeline').addEventListener('click',()=>{if(!timeline)return;const p=el('print-root');p.replaceChildren();addText(p,'h1','ClaimClock — '+t('timeline.title'));addText(p,'p',`${contacts.find(c=>c.id===timeline!.insurerId)?.name}\n${timeline.hospital}, ${timeline.city}\n${t('clock.basis')}\n\n${timelineText(timeline,lang())}\n\n${t('footer.disclaimer')}`);window.print();});
el('export-timeline').addEventListener('click',()=>{if(timeline)download('claimclock-timeline.json',JSON.stringify(timeline,null,2),'application/json');});
form('recovery-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('recovery-form');showLetter(makeLetter('recovery',timeline,contacts,rules,lang(),{amount:Number(input(f,'amount').value).toLocaleString('en-IN'),hours:input(f,'hours').value}),contacts.find(c=>c.id===timeline!.insurerId)?.gro_email||'');track('delay_charge_generated');});
form('finish-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('finish-form'),at=input(f,'decidedAt').value;if(!validSubmission(at)||Date.parse(at)<Date.parse(timeline.submittedAt)){el('finish-error').textContent=t('finished.error');return;}timeline.decidedAt=new Date(at).toISOString();timeline.outcome=input(f,'outcome').value;el('finish-error').textContent='';save();render();});
form('optin-form').addEventListener('submit',async e=>{e.preventDefault();const button=form('optin-form').querySelector('button')!;button.disabled=true;try{const response=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...reportPayload(),consent:true,adult:true})});if(!response.ok)throw Error();const result=await response.json() as {id:string;erase_token:string};el('optin-status').textContent=`${t('optin.sent')} ${result.id}:${result.erase_token}`;try{localStorage.setItem('claimclock:erase',JSON.stringify(result));}catch{}track('opt_in_submitted');}catch{el('optin-status').textContent=t('optin.failed');button.disabled=false;}});
el('erase-timeline').addEventListener('click',()=>{if(confirm(lang()==='hi'?'इस डिवाइस का घटनाक्रम मिटाएँ? पहले बैकअप डाउनलोड कर सकते हैं।':'Delete this device’s timeline? You can download a backup first.')){eraseLocal();timeline=null;render();}});
window.addEventListener('languagechange',render);setInterval(updateClock,1000);render();
