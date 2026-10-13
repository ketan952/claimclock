// Picker enhancement is optional; a failed picker chunk must not disable forms.
const refreshPickers=()=>window.dispatchEvent(new Event('pickerrefresh'));
const focusPicker=(field:HTMLElement)=>(field.parentElement?.querySelector<HTMLButtonElement>('[data-picker-trigger]')||field).focus();
import {renderContacts,expandContactEscalations} from './contact-view';
import contactsRaw from '../../data/contacts.json';
import rulesRaw from '../../data/rules.json';
import type { Contact, LetterKind, Rule, Timeline, RequestType } from './types.ts';
import {clockState,duration,formatTime,localInputValue,validSubmission} from './clock.ts';
import {getSelectedBackup,saveTimeline,download,listCases,selectCase,deleteCase,restoreCase,storageIssue,rawLocalBackup,sameCaseIdentity} from './storage.ts';
import {parseBackup,makeBackup,MAX_BACKUP_BYTES,type CaseBackup} from './backup.ts';
import {setupTransfer} from './transfer-ui';
import {getTurnstileToken} from './turnstile';
import {saveReceipt} from './receipts';
import {lang,t,setMessage,interpolate} from './i18n';
import {makeLetter,timelineText,timelineNote} from './letters.ts';
import {initToolkits} from './toolkits-ui';
import {setupLetterDialog} from './letter-dialog.ts';
import {track} from './events.ts';
import {reportPayload,reportFailure,reportFieldLabels,type ReportField} from './report.ts';
const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=<T extends HTMLFormElement=HTMLFormElement>(id:string)=>el<T>(id);
const showLetter=setupLetterDialog();
let baselineCase=getSelectedBackup();let timeline=baselineCase?.timeline||null;let unsavedDraft:Timeline|null=null;let editingDetails=false;let unsavedChanges=false;let reportStatusKey='';let reportErrorField:ReportField|undefined;let deletionSaved=true;let expandedBreach='';
const start=form('start-form');
const input=(f:HTMLFormElement,n:string)=>f.elements.namedItem(n) as HTMLInputElement;
input(start,'submittedAt').value=localInputValue();
input(form('event-form'),'at').value=localInputValue();
input(form('finish-form'),'decidedAt').value=localInputValue();
const deviceTimezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
function validRecordedTime(value:string){const ms=Date.parse(value);return Number.isFinite(ms)&&ms<=Date.now()+30_000&&localInputValue(new Date(ms))===value.slice(0,16);}
function showSaveProblem(conflict:boolean){setMessage(el('workflow-status'),conflict?'workflow.conflict':'error.storage');el('workflow-actions').hidden=false;el('workflow-load-latest').hidden=!conflict;setMessage(el('storage-error'),conflict?'workflow.conflict':'error.storage');}
function save(candidate:Timeline){
 const saved=saveTimeline(candidate,baselineCase?.timeline||null);unsavedChanges=!saved;
 if(saved){timeline=candidate;baselineCase=makeBackup(candidate,baselineCase?.deductions||[]);unsavedDraft=null;setMessage(el('workflow-status'),null);setMessage(el('storage-error'),null);el('workflow-actions').hidden=true;}
 else {unsavedDraft=candidate;if(!baselineCase){timeline=candidate;editingDetails=false;}showSaveProblem(storageIssue()==='conflict');}
 return saved;
}
function leaveUnsaved(){return !unsavedChanges||confirm(t('cases.unsavedConfirm'));}
function addText(parent:HTMLElement,tag:string,text:string){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
const unsavedReceiptCodes=new Set<string>();
function preserveUnsavedReceipt(result:{id:string;erase_token:string}){
 const value=`${result.id}:${result.erase_token}`;if(unsavedReceiptCodes.has(value))return;unsavedReceiptCodes.add(value);
 const card=document.createElement('article');card.className='row-card';const notice=addText(card,'p',t('optin.unsavedOtherCase'));notice.dataset.i18n='optin.unsavedOtherCase';
 const label=document.createElement('label');const caption=addText(label,'span',t('optin.deletionCode'));caption.dataset.i18n='optin.deletionCode';const code=document.createElement('input');code.className='unsaved-receipt-code';code.readOnly=true;code.autocomplete='off';code.value=value;label.append(code);card.append(label);
 const copy=document.createElement('button');copy.type='button';copy.className='button-secondary';copy.textContent=t('optin.copyCode');copy.dataset.i18n='optin.copyCode';const status=document.createElement('p');status.className='status';status.setAttribute('role','status');
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(value);setMessage(status,'optin.codeCopied');}catch{code.focus();code.select();setMessage(status,'optin.copyFailed');}});card.append(copy,status);el('unsaved-receipt-list').append(card);el('unsaved-receipts').hidden=false;
}
// Display name for the case's insurer; 'unlisted' must never leak as a raw id into the UI or print view.
const insurerLabel=(id:string)=>{const c=contacts.find(x=>x.id===id);return c?.name||(id==='unlisted'?t('label.unlisted'):id);};
function caseLabel(backup:CaseBackup){const value=backup.timeline,contact=contacts.find(c=>c.id===value.insurerId);return `${(lang()==='hi'?contact?.name_hi:undefined)||contact?.name||t('label.unlisted')} · ${value.hospital||t('cases.noHospital')} · ${new Intl.DateTimeFormat(lang()==='hi'?'hi-IN':'en-IN',{month:'long',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(value.submittedAt))}`;}
function renderCases(){
 const cases=listCases(),select=el<HTMLSelectElement>('case-select');select.replaceChildren();const blank=new Option(t('cases.unsaved'),'');select.append(blank);for(const backup of cases)select.append(new Option(caseLabel(backup),backup.timeline.id));select.value=timeline?.id||'';
 el<HTMLButtonElement>('case-delete').disabled=!timeline||!cases.some(c=>c.timeline.id===timeline!.id);
 const issue=storageIssue();if(issue)setMessage(el('case-status'),issue==='corrupt'?'cases.corrupt':'error.storage');el('case-raw-backup').hidden=!issue||issue==='unavailable';
}
function resetCaseUI(){
 editingDetails=false;
 reportStatusKey='';reportErrorField=undefined;deletionSaved=true;expandedBreach='';clearReportError();
 form('optin-form').reset();form('event-form').reset();form('finish-form').reset();form('recovery-form').reset();input(form('event-form'),'at').value=localInputValue();input(form('finish-form'),'decidedAt').value=localInputValue();
 el('deletion-receipt').hidden=true;el<HTMLInputElement>('deletion-code').value='';setMessage(el('deletion-copy-status'),null);
 for(const id of ['start-error','event-error','finish-error','storage-error'])setMessage(el(id),null);
 const submit=form('optin-form').querySelector<HTMLButtonElement>('button')!;submit.disabled=false;
 for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))dialog.close();
 window.dispatchEvent(new Event('casechange'));
}
function activateSavedCase(){baselineCase=getSelectedBackup();timeline=baselineCase?.timeline||null;unsavedChanges=false;unsavedDraft=null;setMessage(el('workflow-status'),null);el('workflow-actions').hidden=true;resetCaseUI();start.reset();input(start,'submittedAt').value=localInputValue();render();}
function currentBackup():CaseBackup|null{const draft=unsavedDraft||timeline;if(!draft)return null;const saved=listCases().find(c=>c.timeline.id===draft.id);const deductions=saved&&sameCaseIdentity(saved.timeline,draft)?saved.deductions:baselineCase?.timeline.insurerId===draft.insurerId?baselineCase.deductions:[];return makeBackup(draft,deductions);}
let pendingBackup:CaseBackup|null=null;
let restoreTargets=new Map<string,CaseBackup>();
function parseBackupText(value:string):CaseBackup{if(new TextEncoder().encode(value).byteLength>MAX_BACKUP_BYTES)throw Error('Backup too large');return parseBackup(JSON.parse(value));}
export function previewRestore(value:CaseBackup){
 const samePreview=value===pendingBackup&&el<HTMLDialogElement>('restore-dialog').open;
 try{pendingBackup=parseBackup(value);}catch{setMessage(el('backup-status'),'backup.invalid');return;}
 el<HTMLTextAreaElement>('backup-paste').value='';
 const summary=el('restore-summary');summary.replaceChildren();for(const [key,value] of [['cases.choose',caseLabel(pendingBackup)],['label.type',t(`type.${pendingBackup.timeline.requestType}`)],['label.time',formatTime(pendingBackup.timeline.submittedAt,lang())],['backup.events',String(pendingBackup.timeline.events.length)],['backup.deductions',String(pendingBackup.deductions.length)]]){addText(summary,'dt',t(key));addText(summary,'dd',value);}
 const cases=listCases();if(!samePreview)restoreTargets=new Map(cases.map(backup=>[backup.timeline.id,backup]));const target=el<HTMLSelectElement>('restore-target');target.replaceChildren(new Option(t('backup.noTarget'),''));for(const backup of cases)target.append(new Option(caseLabel(backup),backup.timeline.id));target.value='';el<HTMLButtonElement>('restore-replace').disabled=true;setMessage(el('restore-status'),null);if(!el<HTMLDialogElement>('restore-dialog').open)el<HTMLDialogElement>('restore-dialog').showModal();
}
function completeRestore(replace=false){if(!pendingBackup||!leaveUnsaved())return;const target=el<HTMLSelectElement>('restore-target').value;if(replace&&!target)return;if(replace&&!restoreTargets.has(target)){setMessage(el('restore-status'),'workflow.restoreConflict');return;}if(!restoreCase(pendingBackup,replace?target:undefined,replace?restoreTargets.get(target):undefined)){setMessage(el('restore-status'),storageIssue()==='conflict'?'workflow.restoreConflict':'error.storage');return;}pendingBackup=null;activateSavedCase();setMessage(el('case-status'),'backup.done');}
function populateDetails(){if(timeline)for(const [key,value] of Object.entries({insurer:timeline.insurerId,tpa:timeline.tpaId||'',hospital:timeline.hospital,city:timeline.city||'',requestType:timeline.requestType,submittedAt:localInputValue(new Date(timeline.submittedAt))}))input(start,key).value=value;refreshPickers();}
function clearReportError(){reportErrorField=undefined;for(const node of document.querySelectorAll('[data-report-invalid]')){node.removeAttribute('aria-invalid');node.removeAttribute('aria-describedby');node.removeAttribute('data-report-invalid');}if(el('start-error').dataset.i18nMessage==='optin.invalid')setMessage(el('start-error'),null);if(reportStatusKey==='optin.invalid')reportStatusKey='';}
function highlightReportField(focus=false){
 if(!reportErrorField)return;
 const field=reportErrorField;
 const startFields:Partial<Record<ReportField,string>>={insurer:'insurer',tpa:'tpa',city:'city',request_type:'requestType',submitted_at:'submittedAt'};
 let target:HTMLElement;let description='optin-status';
 if(startFields[field]){target=input(start,startFields[field]!);if(target.dataset.reportInvalid!=='true')populateDetails();editingDetails=true;el('start-view').hidden=false;description='start-error';setMessage(el('start-error'),'optin.invalid',{field:t(reportFieldLabels[field])});}
 else if(field==='decided_at'||field==='outcome')target=input(form('finish-form'),field==='decided_at'?'decidedAt':'outcome');
 else if(field==='consent'||field==='adult'||field==='consent_version')target=input(form('optin-form'),'consent');
 else {target=form('optin-form');target.tabIndex=-1;}
 target.dataset.reportInvalid='true';target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',description);
 if(focus){target.scrollIntoView({block:'center'});focusPicker(target);}
}
function updateClock(){
 if(!timeline)return;
 const state=clockState(timeline);el('clock-label').textContent=t(`clock.${state.stage==='decided'?'decided':state.remaining===null?'tracking':state.stage==='beyond'?'overdue':'remaining'}`);
 el('clock-digits').textContent=duration(state.stage==='decided'?state.elapsed:state.remaining??state.elapsed);
 el('clock-card').classList.toggle('beyond',state.stage==='beyond');
 el('clock-progress').style.width=`${state.minutes?Math.min(100,state.elapsed/(state.minutes*60000)*100):0}%`;
 el('enhancement-note').hidden=timeline.requestType!=='enhancement';
 const next=t(state.stage==='decided'?'clock.nextDecided':state.stage==='tracking'?'clock.nextTracking':state.stage==='beyond'?(timeline.requestType==='discharge'?'clock.nextBeyondDischarge':'clock.nextBeyondPreauth'):state.stage==='halfway'?'clock.nextHalfway':'clock.nextRunning');if(el('clock-next').textContent!==next)el('clock-next').textContent=next;
 const nextLink=el<HTMLAnchorElement>('decision-next');const target=state.stage==='decided'?(timeline.outcome==='rejected'?['/rejected/','finished.nextRejected']:timeline.outcome==='partial'?['/deductions/','finished.nextPartial']:null):null;
 if(target){nextLink.href=target[0];nextLink.textContent=t(target[1]);nextLink.hidden=false;}else nextLink.hidden=true;
 el('what-now').dataset.stage=state.stage;const current=state.stage==='beyond'?'step-escalate':state.stage==='halfway'?'step-followup':'step-record';
 for(const step of document.querySelectorAll<HTMLElement>('.what-now-steps li')){step.classList.toggle('active',step.id===current);if(step.id===current)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');step.hidden=state.stage==='decided'||(timeline.requestType==='enhancement'&&step.id==='step-escalate');}

 for(const button of document.querySelectorAll<HTMLElement>('[data-letter="followup"]')) button.classList.toggle('ready',state.stage==='halfway'||state.stage==='beyond');
 const breach=`${timeline.id}|${timeline.submittedAt}|${timeline.requestType}`;
 if(state.stage==='beyond'&&expandedBreach!==breach){expandContactEscalations(el('contacts'));expandedBreach=breach;}
 else if(state.stage!=='beyond')expandedBreach='';
}
function render(){
 renderCases();
 el('input-timezone').textContent=`${t('common.timezone')}: ${new Intl.DateTimeFormat(lang()==='hi'?'hi-IN':'en-IN',{timeZone:deviceTimezone,timeZoneName:'long'}).formatToParts(new Date()).find(part=>part.type==='timeZoneName')?.value||deviceTimezone}`;el('optin-status').textContent=reportStatusKey?interpolate(reportStatusKey,{field:reportErrorField?t(reportFieldLabels[reportErrorField]):''}):'';el('deletion-saved').textContent=t(deletionSaved?'optin.saved':'optin.notSaved');
 el('intro').hidden=!!timeline;el('start-view').hidden=!!timeline&&!editingDetails;el('dashboard').hidden=!timeline||editingDetails;
 document.querySelectorAll<HTMLElement>('[data-rule-plain]').forEach(node=>{const rule=rules.find(r=>r.id===node.dataset.rulePlain);if(rule)node.textContent=(lang()==='hi'?rule.plain_hi:rule.plain_en)||rule.title;});
 if(!timeline)return;
 const insurer=contacts.find(c=>c.id===timeline!.insurerId);
 el('clock-meta').textContent=`${insurerLabel(timeline.insurerId)} · ${formatTime(timeline.submittedAt,lang())}`;
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
 el('optin-section').hidden=!timeline.decidedAt||timeline.insurerId==='unlisted';
 if(timeline.decidedAt){
  el('report-preview').textContent=JSON.stringify({...reportPayload(timeline),consent:true,adult:true},null,2);el('report-summary').replaceChildren();
  const fields=[['label.insurer',insurerLabel(timeline.insurerId)],['label.tpa',contacts.find(c=>c.id===timeline!.tpaId)?.name||t('label.noTpa')],['label.city',timeline.city||t('common.notProvided')],['label.type',t(`type.${timeline.requestType}`)],['optin.submittedAt',formatTime(timeline.submittedAt,lang())],['optin.decidedAt',formatTime(timeline.decidedAt,lang())],['finished.outcome',t(`finished.${timeline.outcome}`)],['optin.consentVersion','2026-10-10']];
  for(const [label,value] of fields){addText(el('report-summary'),'dt',t(label));addText(el('report-summary'),'dd',value);}
 }

 updateClock();
 highlightReportField();
}
start.addEventListener('submit',e=>{
 e.preventDefault();const value=input(start,'submittedAt').value;
 if(!(timeline?validRecordedTime(value):validSubmission(value))){setMessage(el('start-error'),'error.time');return;}
 const previous=timeline;
 const candidate:Timeline={id:previous?.id||crypto.randomUUID(),insurerId:input(start,'insurer').value,tpaId:input(start,'tpa').value,hospital:input(start,'hospital').value.trim(),city:input(start,'city').value.trim(),requestType:input(start,'requestType').value as RequestType,submittedAt:new Date(value).toISOString(),events:[...(previous?.events||[])],decidedAt:previous?.decidedAt,outcome:previous?.outcome};
 if(candidate.decidedAt&&Date.parse(candidate.decidedAt)<Date.parse(candidate.submittedAt)){delete candidate.decidedAt;delete candidate.outcome;}
 if(previous&&previous.submittedAt!==candidate.submittedAt)candidate.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),type:'other',note:`@time-correction|${previous.submittedAt}|${candidate.submittedAt}`});
 try{makeBackup(candidate);}catch{setMessage(el('start-error'),'backup.invalid');return;}
 if(!save(candidate)){if(!baselineCase)render();return;}resetCaseUI();setMessage(el('start-error'),null);render();el('dashboard').scrollIntoView({block:'start'});track('session_started');
});
el('edit-details').addEventListener('click',()=>{if(!timeline)return;editingDetails=true;populateDetails();el('start-view').hidden=false;el('dashboard').hidden=true;start.scrollIntoView();});
// Email recipient per draft: GRO drafts go to the grievance officer; the follow-up goes to the published claims
// address, or the insurer's first published escalation-level address when no claims email is published.
function letterRecipient(kind:string):string {
 const insurer=contacts.find(c=>c.id===timeline?.insurerId);if(!insurer)return'';
 if(kind==='gro'||kind==='recovery')return insurer.gro_email||'';
 if(kind==='followup')return insurer.claims_email||insurer.escalation_levels?.find(level=>level.email)?.email||'';
 return'';
}
document.querySelectorAll<HTMLElement>('[data-letter]').forEach(button=>button.addEventListener('click',()=>{if(timeline)showLetter(()=>makeLetter(button.dataset.letter as LetterKind,timeline!,contacts,rules,lang()),letterRecipient(button.dataset.letter||''));}));
form('event-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('event-form'),at=input(f,'at').value;if(timeline.events.length>=500||!validRecordedTime(at)||Date.parse(at)<Date.parse(timeline.submittedAt)){setMessage(el('event-error'),'finished.error');return;}const candidate={...timeline,events:[...timeline.events,{id:crypto.randomUUID(),at:new Date(at).toISOString(),type:input(f,'type').value,note:input(f,'note').value.trim()}]};if(!save(candidate))return;input(f,'note').value='';input(f,'at').value=localInputValue();setMessage(el('event-error'),null);render();});
el('print-timeline').addEventListener('click',()=>{if(!timeline)return;const p=el('print-root');p.replaceChildren();addText(p,'h1','ClaimClock — '+t('timeline.title'));addText(p,'p',`${insurerLabel(timeline.insurerId)}\n${timeline.hospital}, ${timeline.city}\n${t('clock.basis')}\n\n${timelineText(timeline,lang())}\n\n${t('footer.disclaimer')}`);window.print();});
el('export-timeline').addEventListener('click',()=>{const backup=currentBackup();if(backup)download('claimclock-case.json',JSON.stringify(backup,null,2),'application/json');});
form('recovery-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('recovery-form');showLetter(()=>makeLetter('recovery',timeline!,contacts,rules,lang(),{amount:Number(input(f,'amount').value).toLocaleString('en-IN'),hours:input(f,'hours').value}),contacts.find(c=>c.id===timeline!.insurerId)?.gro_email||'');track('delay_charge_generated');});
form('finish-form').addEventListener('submit',e=>{e.preventDefault();if(!timeline)return;const f=form('finish-form'),at=input(f,'decidedAt').value;if(!validRecordedTime(at)||Date.parse(at)<Date.parse(timeline.submittedAt)){setMessage(el('finish-error'),'finished.error');return;}const candidate={...timeline,decidedAt:new Date(at).toISOString(),outcome:input(f,'outcome').value};if(!save(candidate))return;resetCaseUI();setMessage(el('finish-error'),null);render();});
form('optin-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!timeline)return;clearReportError();const requestLanguage=lang(),caseId=timeline.id,payload={...reportPayload(timeline),consent:true,adult:true},payloadKey=JSON.stringify(payload);const stillCurrent=()=>timeline?.id===caseId&&JSON.stringify({...reportPayload(timeline),consent:true,adult:true})===payloadKey;const button=form('optin-form').querySelector('button')!;button.disabled=true;
 try{
  const token=await getTurnstileToken('reports');if(!stillCurrent())return;
  if(!input(form('optin-form'),'consent').checked||lang()!==requestLanguage){input(form('optin-form'),'consent').checked=false;reportStatusKey='optin.reviewAgain';button.disabled=false;render();return;}
  const response=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Turnstile-Token':token}:{})},body:payloadKey});
  if(!response.ok){if(!stillCurrent())return;let body:unknown;try{body=await response.json();}catch{}const failure=reportFailure(response.status,body);reportStatusKey=failure.key;reportErrorField=failure.field;button.disabled=false;render();highlightReportField(true);return;}
  const result=await response.json() as {id:string;erase_token:string};const receiptSaved=saveReceipt(result,caseId);if(!stillCurrent()){if(!receiptSaved)preserveUnsavedReceipt(result);return;}
  deletionSaved=receiptSaved;reportStatusKey='optin.sent';el<HTMLInputElement>('deletion-code').value=`${result.id}:${result.erase_token}`;el('deletion-receipt').hidden=false;
  track('opt_in_submitted');
 }catch{if(!stillCurrent())return;reportStatusKey=reportFailure(null,null).key;button.disabled=false;}
 render();
});
el('copy-deletion-code').addEventListener('click',async()=>{const code=el<HTMLInputElement>('deletion-code');try{await navigator.clipboard.writeText(code.value);setMessage(el('deletion-copy-status'),'optin.codeCopied');}catch{code.focus();code.select();setMessage(el('deletion-copy-status'),'optin.copyFailed');}});
function removeCurrentCase(){if(!timeline||!confirm(t('cases.deleteConfirm')))return;if(!deleteCase(timeline.id,baselineCase||undefined)){if(storageIssue()==='conflict')showSaveProblem(true);else setMessage(el('case-status'),'error.storage');return;}activateSavedCase();setMessage(el('case-status'),'cases.deleted');}
el('workflow-download').addEventListener('click',()=>{const backup=currentBackup();if(backup)download('claimclock-case.json',JSON.stringify(backup,null,2),'application/json');});
el('workflow-load-latest').addEventListener('click',()=>{if(!confirm(t('workflow.loadConfirm')))return;const id=baselineCase?.timeline.id||timeline?.id;const latest=listCases().find(c=>c.timeline.id===id);if(!selectCase(latest?.timeline.id||null)){setMessage(el('workflow-status'),'error.storage');return;}activateSavedCase();setMessage(el('case-status'),'workflow.loaded');});
el('erase-timeline').addEventListener('click',removeCurrentCase);
el('case-delete').addEventListener('click',removeCurrentCase);
el<HTMLSelectElement>('case-select').addEventListener('change',()=>{if(!leaveUnsaved()){renderCases();return;}if(!selectCase(el<HTMLSelectElement>('case-select').value||null)){setMessage(el('case-status'),'error.storage');renderCases();return;}activateSavedCase();setMessage(el('case-status'),null);});
el('case-new').addEventListener('click',()=>{if(!leaveUnsaved())return;if(!selectCase(null)){setMessage(el('case-status'),'error.storage');return;}activateSavedCase();setMessage(el('case-status'),null);start.scrollIntoView({block:'start'});});
el('case-raw-backup').addEventListener('click',()=>download('claimclock-preserved-storage.json',rawLocalBackup(),'application/json'));
el<HTMLInputElement>('backup-file').addEventListener('change',async()=>{const field=el<HTMLInputElement>('backup-file'),file=field.files?.[0];if(!file)return;try{if(file.size>MAX_BACKUP_BYTES)throw Error();const backup=parseBackupText(await file.text());setMessage(el('backup-status'),null);previewRestore(backup);}catch{setMessage(el('backup-status'),'backup.invalid');}finally{field.value='';}});
el('backup-paste-preview').addEventListener('click',()=>{try{const backup=parseBackupText(el<HTMLTextAreaElement>('backup-paste').value);setMessage(el('backup-status'),null);previewRestore(backup);}catch{setMessage(el('backup-status'),'backup.invalid');}});
el('restore-new').addEventListener('click',()=>completeRestore());el('restore-replace').addEventListener('click',()=>completeRestore(true));el('restore-cancel').addEventListener('click',()=>{pendingBackup=null;el<HTMLTextAreaElement>('backup-paste').value='';el<HTMLDialogElement>('restore-dialog').close();});el<HTMLSelectElement>('restore-target').addEventListener('change',()=>{el<HTMLButtonElement>('restore-replace').disabled=!el<HTMLSelectElement>('restore-target').value;});
setupTransfer({getBackup:currentBackup,previewBackup:previewRestore});
initToolkits(showLetter,{getInsurerId:()=>timeline?.insurerId||(form('start-form').elements.namedItem('insurer') as HTMLSelectElement).value,getHospital:()=>timeline?.hospital||input(form('start-form'),'hospital').value});
for(const id of ['case-select','case-new','case-raw-backup','backup-file','backup-paste','backup-paste-preview','restore-new','restore-cancel'])(el(id) as HTMLButtonElement).disabled=false;
for(const selector of ['#start-form button[type=submit]','#event-form button[type=submit]','#finish-form button[type=submit]','#recovery-form button[type=submit]','#optin-form button[type=submit]'])document.querySelector<HTMLButtonElement>(selector)!.disabled=false;
window.addEventListener('languagechange',()=>{render();if(pendingBackup&&el<HTMLDialogElement>('restore-dialog').open){const target=el<HTMLSelectElement>('restore-target').value;previewRestore(pendingBackup);el<HTMLSelectElement>('restore-target').value=target;el<HTMLButtonElement>('restore-replace').disabled=!target;}});setInterval(updateClock,1000);render();
