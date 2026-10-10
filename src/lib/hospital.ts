import {renderContacts,expandContactEscalations} from './contact-view';
import contactsRaw from '../../data/contacts.json';
import rulesRaw from '../../data/rules.json';
import type { Contact, LetterKind, Rule, Timeline, RequestType } from './types.ts';
import {clockState,duration,formatTime,localInputValue,validSubmission} from './clock.ts';
import {loadTimeline,saveTimeline,download,eraseLocal} from './storage.ts';
import {lang,t,setMessage,interpolate} from './i18n';
import {makeLetter,timelineText,timelineNote} from './letters.ts';
import {setupLetterDialog} from './letter-dialog.ts';
import {track} from './events.ts';
import {reportPayload,reportFailure,reportFieldLabels,type ReportField} from './report.ts';
const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=<T extends HTMLFormElement=HTMLFormElement>(id:string)=>el<T>(id);
const showLetter=setupLetterDialog();
let timeline=loadTimeline();let reportStatusKey='';let reportErrorField:ReportField|undefined;let deletionSaved=true;let expandedBreach='';
const start=form('start-form');
const input=(f:HTMLFormElement,n:string)=>f.elements.namedItem(n) as HTMLInputElement;
input(start,'submittedAt').value=localInputValue();
input(form('event-form'),'at').value=localInputValue();
input(form('finish-form'),'decidedAt').value=localInputValue();
const deviceTimezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
function save(){if(timeline&&!saveTimeline(timeline))setMessage(el('storage-error'),'error.storage');}
function addText(parent:HTMLElement,tag:string,text:string){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
function populateDetails(){if(timeline)for(const [key,value] of Object.entries({insurer:timeline.insurerId,tpa:timeline.tpaId||'',hospital:timeline.hospital,city:timeline.city||'',requestType:timeline.requestType,submittedAt:localInputValue(new Date(timeline.submittedAt))}))input(start,key).value=value;}
function clearReportError(){reportErrorField=undefined;for(const node of document.querySelectorAll('[data-report-invalid]')){node.removeAttribute('aria-invalid');node.removeAttribute('aria-describedby');node.removeAttribute('data-report-invalid');}if(el('start-error').dataset.i18nMessage==='optin.invalid')setMessage(el('start-error'),null);if(reportStatusKey==='optin.invalid')reportStatusKey='';}
function highlightReportField(focus=false){
 if(!reportErrorField)return;
 const field=reportErrorField;
 const startFields:Partial<Record<ReportField,string>>={insurer:'insurer',tpa:'tpa',city:'city',request_type:'requestType',submitted_at:'submittedAt'};
 let target:HTMLElement;let description='optin-status';
 if(startFields[field]){target=input(start,startFields[field]!);if(target.dataset.reportInvalid!=='true')populateDetails();el('start-view').hidden=false;description='start-error';setMessage(el('start-error'),'optin.invalid',{field:t(reportFieldLabels[field])});}
 else if(field==='decided_at'||field==='outcome')target=input(form('finish-form'),field==='decided_at'?'decidedAt':'outcome');
 else if(field==='consent'||field==='adult'||field==='consent_version')target=input(form('optin-form'),'consent');
 else {target=form('optin-form');target.tabIndex=-1;}
 target.dataset.reportInvalid='true';target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',description);
 if(focus){target.scrollIntoView({block:'center'});target.focus();}
}
function updateClock(){
 if(!timeline)return;
 const state=clockState(timeline);el('clock-label').textContent=t(`clock.${state.stage==='decided'?'decided':state.remaining===null?'tracking':state.stage==='beyond'?'overdue':'remaining'}`);
 el('clock-digits').textContent=duration(state.stage==='decided'?state.elapsed:state.remaining??state.elapsed);
 el('clock-card').classList.toggle('beyond',state.stage==='beyond');
 el('clock-progress').style.width=`${state.minutes?Math.min(100,state.elapsed/(state.minutes*60000)*100):0}%`;
 el('enhancement-note').hidden=timeline.requestType!=='enhancement';
 const next=t(state.stage==='decided'?'clock.nextDecided':state.stage==='tracking'?'clock.nextTracking':state.stage==='beyond'?(timeline.requestType==='discharge'?'clock.nextBeyondDischarge':'clock.nextBeyondPreauth'):state.stage==='halfway'?'clock.nextHalfway':'clock.nextRunning');if(el('clock-next').textContent!==next)el('clock-next').textContent=next;
 el('what-now').dataset.stage=state.stage;const current=state.stage==='beyond'?'step-escalate':state.stage==='halfway'?'step-followup':'step-record';
 for(const step of document.querySelectorAll<HTMLElement>('.what-now-steps li')){step.classList.toggle('active',step.id===current);if(step.id===current)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');step.hidden=state.stage==='decided'||(timeline.requestType==='enhancement'&&step.id==='step-escalate');}

 for(const button of document.querySelectorAll<HTMLElement>('[data-letter="followup"]')) button.classList.toggle('ready',state.stage==='halfway'||state.stage==='beyond');
 const breach=`${timeline.id}|${timeline.submittedAt}|${timeline.requestType}`;
 if(state.stage==='beyond'&&expandedBreach!==breach){expandContactEscalations(el('contacts'));expandedBreach=breach;}
 else if(state.stage!=='beyond')expandedBreach='';
}
function render(){
 el('input-timezone').textContent=`${t('common.timezone')}: ${new Intl.DateTimeFormat(lang()==='hi'?'hi-IN':'en-IN',{timeZone:deviceTimezone,timeZoneName:'long'}).formatToParts(new Date()).find(part=>part.type==='timeZoneName')?.value||deviceTimezone}`;el('optin-status').textContent=reportStatusKey?interpolate(reportStatusKey,{field:reportErrorField?t(reportFieldLabels[reportErrorField]):''}):'';el('deletion-saved').textContent=t(deletionSaved?'optin.saved':'optin.notSaved');
 el('intro').hidden=!!timeline;el('start-view').hidden=!!timeline;el('dashboard').hidden=!timeline;
 document.querySelectorAll<HTMLElement>('[data-rule-plain]').forEach(node=>{const rule=rules.find(r=>r.id===node.dataset.rulePlain);if(rule)node.textContent=(lang()==='hi'?rule.plain_hi:rule.plain_en)||rule.title;});
 if(!timeline)return;
 const insurer=contacts.find(c=>c.id===timeline!.insurerId);
 el('clock-meta').textContent=`${insurer?.name||timeline.insurerId} · ${formatTime(timeline.submittedAt,lang())}`;
 el('timeline-list').replaceChildren();
 const entries=[{at:timeline.submittedAt,type:lang()==='hi'?'बताया गया अनुरोध समय':'Reported submission',note:''},...timeline.events.map(e=>({...e,type:t(`timeline.${e.type}`)})),...(timeline.decidedAt?[{at:timeline.decidedAt,type:t('finished.title'),note:t(`finished.${timeline.outcome}`)}]:[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 for(const e of entries){const li=document.createElement('li');const time=addText(li,'time',formatTime(e.at,lang()));time.setAttribute('datetime',e.at);addText(li,'span',e.type);if(e.note)addText(li,'p',timelineNote(e.note,lang()));el('timeline-list').append(li);}
 el('active-rule').replaceChildren();
 const active=rules.find(r=>r.id===(timeline!.requestType==='preauth'?'cashless-preauth':timeline!.requestType==='discharge'?'cashless-discharge':''));
 if(active){addText(el('active-rule'),'p',(lang()==='hi'?active.plain_hi:active.plain_en)||active.title);addText(el('active-rule'),'blockquote',`“${active.quote}”`);const a=addText(el('active-rule'),'a',`${active.paragraph} ↗`) as HTMLAnchorElement;a.href=active.source_url;a.target='_blank';a.rel='noopener noreferrer';}
 else addText(el('active-rule'),'p',t('clock.enhancement'));
 renderContacts(el('contacts'),[insurer,contacts.find(c=>c.id===timeline!.tpaId)].filter((c):c is Contact=>!!c));
 if(!insurer?.gro_email){addText(el('contacts'),'p',t('contact.unavailable'));const a=addText(el('contacts'),'a',t('contact.directory')) as HTMLAnchorElement;a.href='https://irdai.gov.in/list-of-gros';a.target='_blank';a.rel='noopener noreferrer';}
 el('recovery-section').hidden=timeline.requestType!=='discharge';
 document.querySelectorAll<HTMLElement>('.discharge-only').forEach(n=>n.hidden=timeline!.requestType!=='discharge');
 el('optin-section').hidden=!timeline.decidedAt;
 if(timeline.decidedAt){
  el('report-preview').textContent=JSON.stringify({...reportPayload(timeline),consent:true,adult:true},null,2);el('report-summary').replaceChildren();
  const fields=[['label.insurer',insurer?.name||timeline.insurerId],['label.tpa',contacts.find(c=>c.id===timeline!.tpaId)?.name||t('label.noTpa')],['label.city',timeline.city||t('common.notProvided')],['label.type',t(`type.${timeline.requestType}`)],['optin.submittedAt',formatTime(timeline.submittedAt,lang())],['optin.decidedAt',formatTime(timeline.decidedAt,lang())],['finished.outcome',t(`finished.${timeline.outcome}`)],['optin.consentVersion','2026-10-10']];
  for(const [label,value] of fields){addText(el('report-summary'),'dt',t(label));addText(el('report-summary'),'dd',value);}
 }

 updateClock();
 highlightReportField();
}
start.addEventListener('submit',e=>{
 e.preventDefault();const value=input(start,'submittedAt').value;
 if(!validSubmission(value)){setMessage(el('start-error'),'error.time');return;}
 const previous=timeline;
 timeline={id:previous?.id||crypto.randomUUID(),insurerId:input(start,'insurer').value,tpaId:input(start,'tpa').value,hospital:input(start,'hospital').value.trim(),city:input(start,'city').value.trim(),requestType:input(start,'requestType').value as RequestType,submittedAt:new Date(value).toISOString(),events:previous?.events||[],decidedAt:previous?.decidedAt,outcome:previous?.outcome};
 if(timeline.decidedAt&&Date.parse(timeline.decidedAt)<Date.parse(timeline.submittedAt)){delete timeline.decidedAt;delete timeline.outcome;}
 if(previous&&previous.submittedAt!==timeline.submittedAt)timeline.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),type:'other',note:`@time-correction|${previous.submittedAt}|${timeline.submittedAt}`});
 clearReportError();setMessage(el('start-error'),null);save();render();el('dashboard').scrollIntoView({block:'start'});track('session_started');
});
el('edit-details').addEventListener('click',()=>{if(!timeline)return;populateDetails();el('start-view').hidden=false;el('dashboard').hidden=true;start.scrollIntoView();});
document.querySelectorAll<HTMLElement>('[data-letter]').forEach(button=>button.addEventListener('click',()=>{if(timeline)showLetter(()=>makeLetter(button.dataset.letter as LetterKind,timeline!,contacts,rules,lang()),['gro','recovery'].includes(button.dataset.letter||'')?contacts.find(c=>c.id===timeline!.insurerId)?.gro_email||'':'');}));
form('event-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('event-form'),at=input(f,'at').value;if(!validSubmission(at)||Date.parse(at)<Date.parse(timeline.submittedAt)){setMessage(el('event-error'),'finished.error');return;}timeline.events.push({id:crypto.randomUUID(),at:new Date(at).toISOString(),type:input(f,'type').value,note:input(f,'note').value.trim()});input(f,'note').value='';input(f,'at').value=localInputValue();setMessage(el('event-error'),null);save();render();});
el('print-timeline').addEventListener('click',()=>{if(!timeline)return;const p=el('print-root');p.replaceChildren();addText(p,'h1','ClaimClock — '+t('timeline.title'));addText(p,'p',`${contacts.find(c=>c.id===timeline!.insurerId)?.name}\n${timeline.hospital}, ${timeline.city}\n${t('clock.basis')}\n\n${timelineText(timeline,lang())}\n\n${t('footer.disclaimer')}`);window.print();});
el('export-timeline').addEventListener('click',()=>{if(timeline)download('claimclock-timeline.json',JSON.stringify(timeline,null,2),'application/json');});
form('recovery-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('recovery-form');showLetter(()=>makeLetter('recovery',timeline!,contacts,rules,lang(),{amount:Number(input(f,'amount').value).toLocaleString('en-IN'),hours:input(f,'hours').value}),contacts.find(c=>c.id===timeline!.insurerId)?.gro_email||'');track('delay_charge_generated');});
form('finish-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('finish-form'),at=input(f,'decidedAt').value;if(!validSubmission(at)||Date.parse(at)<Date.parse(timeline.submittedAt)){setMessage(el('finish-error'),'finished.error');return;}timeline.decidedAt=new Date(at).toISOString();timeline.outcome=input(f,'outcome').value;clearReportError();setMessage(el('finish-error'),null);save();render();});
form('optin-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!timeline)return;clearReportError();const button=form('optin-form').querySelector('button')!;button.disabled=true;
 try{
  const response=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...reportPayload(timeline),consent:true,adult:true})});
  if(!response.ok){let body:unknown;try{body=await response.json();}catch{}const failure=reportFailure(response.status,body);reportStatusKey=failure.key;reportErrorField=failure.field;button.disabled=false;render();highlightReportField(true);return;}
  const result=await response.json() as {id:string;erase_token:string};reportStatusKey='optin.sent';el<HTMLInputElement>('deletion-code').value=`${result.id}:${result.erase_token}`;el('deletion-receipt').hidden=false;
  try{localStorage.setItem('claimclock:erase',JSON.stringify(result));deletionSaved=true;}catch{deletionSaved=false;}
  track('opt_in_submitted');
 }catch{reportStatusKey=reportFailure(null,null).key;button.disabled=false;}
 render();
});
el('copy-deletion-code').addEventListener('click',async()=>{const code=el<HTMLInputElement>('deletion-code');try{await navigator.clipboard.writeText(code.value);setMessage(el('deletion-copy-status'),'optin.codeCopied');}catch{code.focus();code.select();setMessage(el('deletion-copy-status'),'optin.copyFailed');}});
el('erase-timeline').addEventListener('click',()=>{if(confirm(t('privacy.eraseLocalConfirm'))){eraseLocal();timeline=null;render();}});
window.addEventListener('languagechange',render);setInterval(updateClock,1000);render();
