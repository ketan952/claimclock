// Renewal Guardian page (M25). Reads a saved vault policy or typed dates, renders the schedule,
// the premium check, the porting and migration checklists and the free-look diff, and opens the
// letters in the shared dialog. Pure logic lives in renewal.ts and renewal-letters.ts.
import contactsRaw from '../../data/contacts.json';
import rulesRaw from '../../data/rules.json';
import sourceLinks from '../../data/source-links.json';
import {lang,t,setMessage,interpolate} from './i18n';
import {continuityMonths,loadVault,policyLabel,plans,type Policy,type Vault} from './vault.ts';
import {setupLetterDialog} from './letter-dialog';
import {download} from './storage.ts';
import {validDate} from './coverage-simulator.ts';
import {MIGRATION_STEPS,PORTING_STEPS,freeLookDiff,freeLookWindow,isSeniorCitizen,premiumHike,renewalCalendar,renewalSchedule,rule,type FreeLookWindow,type HikeResult,type PaymentMode,type PromiseField,type PromiseFields,type RenewalSchedule} from './renewal.ts';
import {describeMismatch,makeRenewalLetter} from './renewal-letters.ts';
import type {Contact,Rule} from './types.ts';

const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=(id:string)=>el<HTMLFormElement>(id);
const field=<T extends HTMLInputElement|HTMLSelectElement=HTMLInputElement>(f:HTMLFormElement,name:string)=>f.elements.namedItem(name) as T;
const addText=(parent:HTMLElement,tag:string,text:string,className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;parent.append(node);return node;};
const rupees=(n:number)=>`₹${Math.round(n).toLocaleString(lang()==='hi'?'hi-IN':'en-IN')}`;
const percent=(n:number)=>`${n>0?'+':''}${n.toLocaleString('en-IN',{maximumFractionDigits:1})}%`;
const dateLabel=(ymd:string)=>new Date(`${ymd}T00:00:00Z`).toLocaleDateString(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const num=(f:HTMLFormElement,name:string):number|null=>{const raw=field(f,name).value.trim();if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null;};
const text=(f:HTMLFormElement,name:string):string=>field(f,name).value.trim();
const groEmail=(insurerId:string)=>contacts.find(c=>c.id===insurerId)?.gro_email||'';

const datesForm=form('dates-form'),hikeForm=form('hike-form'),portingForm=form('porting-form'),migrationForm=form('migration-form'),freelookForm=form('freelook-form');
const openLetter=setupLetterDialog({insurerId:()=>currentInsurerId()});
const vault:Vault|null=loadVault();
let vaultPolicy:Policy|undefined;
let schedule:RenewalSchedule|null=null;
let hike:HikeResult|null=null;
let freeLook:FreeLookWindow|null=null;
const usedRules=new Set<string>();
let letterInsurer='';
const currentInsurerId=()=>letterInsurer||vaultPolicy?.insurerId||undefined;

// --- Sources -----------------------------------------------------------------------------------------
function sourceLink(parent:HTMLElement,ruleId:string){
 const r=rule(ruleId);usedRules.add(ruleId);
 const a=addText(parent,'a',`${t('vault.verifiedOn')} ${dateLabel(String(r.verified_on))} ↗`) as HTMLAnchorElement;a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';
}
function renderSources(){
 const box=el('renewal-sources');box.replaceChildren();
 if(!usedRules.size){addText(box,'p',t('coverage.noSources'));return;}
 const bySlug=new Map<string,Rule[]>();
 for(const id of usedRules){const r=rule(id);const slug=String(r.source_slug||'health-mc-2024');bySlug.set(slug,[...(bySlug.get(slug)||[]),r]);}
 for(const [slug,group] of bySlug){
  const link=sourceLinks.find(l=>l.slug===slug);const p=addText(box,'p','');
  addText(p,'strong',link?(lang()==='hi'?link.title_hi:link.title_en):slug);
  for(const r of group){addText(p,'br','');p.append(`${String(lang()==='hi'?r.title_hi||r.title:r.title)} `);const a=addText(p,'a',`${r.paragraph} ↗`) as HTMLAnchorElement;a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';}
 }
}
// --- Vault pre-fill ------------------------------------------------------------------------------------
function renderVaultChoices(){
 const policies=vault?.policies.filter(p=>p.kind==='health')||[];
 const select=field<HTMLSelectElement>(datesForm,'vaultPolicy');const previous=select.value;select.replaceChildren(new Option(t('coverage.vaultNone'),''));
 for(const policy of policies)select.append(new Option(policyLabel(policy,lang()),policy.id));
 el('vault-policy-field').hidden=!policies.length;
 const wanted=new URLSearchParams(location.search).get('policy');
 if(policies.length){const preferred=policies.find(p=>p.id===previous)||policies.find(p=>p.id===wanted)||policies.find(p=>p.id===vault?.defaultPolicyId)||policies[0];select.value=preferred.id;}
}
function applyVaultPolicy(){
 vaultPolicy=vault?.policies.find(p=>p.id===field<HTMLSelectElement>(datesForm,'vaultPolicy').value);
 if(!vaultPolicy)return;
 const set=(f:HTMLFormElement,name:string,value:unknown)=>{if(value!==undefined&&value!==null&&value!=='')field(f,name).value=String(value);};
 if(vaultPolicy.renewalDate)set(datesForm,'renewalDate',vaultPolicy.renewalDate);
 const insurer=contacts.find(c=>c.id===vaultPolicy!.insurerId);
 const plan=vaultPolicy.planId?plans.find(p=>p.id===vaultPolicy!.planId):undefined;
 set(datesForm,'label',[insurer?(lang()==='hi'?insurer.name_hi||insurer.name:insurer.name):'',plan?.name||vaultPolicy.planName||''].filter(Boolean).join(' · ').slice(0,80));
 for(const f of [hikeForm,portingForm,migrationForm,freelookForm])if(contacts.some(c=>c.id===vaultPolicy!.insurerId)){field<HTMLSelectElement>(f,'insurer').value=vaultPolicy.insurerId;}
 window.dispatchEvent(new Event('pickerrefresh'));
 const members=vault?.members.filter(m=>vaultPolicy!.memberIds.includes(m.id))||[];
 field(hikeForm,'senior').checked=members.some(m=>isSeniorCitizen(m.birthYear));
 field(hikeForm,'newIncludesGst').checked=Boolean(vaultPolicy.corporate);
 const months=continuityMonths(vaultPolicy);if(months!==null)set(migrationForm,'continuousMonths',months);
 field(migrationForm,'groupExit').checked=Boolean(vaultPolicy.corporate);
 const actual=(name:PromiseField,value:unknown)=>{const input=document.querySelector<HTMLInputElement>(`#freelook-diff input[data-side=actual][data-field=${name}]`);if(input&&value!==undefined&&value!==null&&value!=='')input.value=String(value);};
 actual('sumInsured',vaultPolicy.sumInsured);actual('roomRent',vaultPolicy.roomRent);actual('copayPercent',vaultPolicy.copayPercent);actual('members',vaultPolicy.memberIds.length||undefined);actual('planName',plan?.name||vaultPolicy.planName);
}
// --- Dates -------------------------------------------------------------------------------------------------
function renderDates(){
 const box=el('dates-result');box.replaceChildren();
 const renewalDate=text(datesForm,'renewalDate'),mode=field<HTMLSelectElement>(datesForm,'mode').value as PaymentMode;
 schedule=renewalDate?renewalSchedule(renewalDate,mode):null;
 el<HTMLButtonElement>('dates-calendar').disabled=!schedule||schedule.status==='invalid';
 if(!schedule){return;}
 if(schedule.status==='invalid'){addText(box,'p',t('renewal.status.invalid'),'verdict warn');return;}
 const tone=['upcoming','porting_window'].includes(schedule.status)?'ok':['lapsed'].includes(schedule.status)?'no':'warn';
 addText(box,'p',interpolate(`renewal.status.${schedule.status}`,{days:Math.abs(schedule.daysLeft),graceDays:schedule.graceDays,graceLeft:Math.max(0,schedule.graceDaysLeft)}),`verdict ${tone}`);
 const list=document.createElement('ol');list.className='timeline';
 const next=schedule.checkpoints.find(c=>!c.passed);
 for(const c of schedule.checkpoints){
  const li=document.createElement('li');if(c.passed)li.classList.add('passed');if(c===next)li.classList.add('next');
  const time=document.createElement('time');time.dateTime=c.date;time.textContent=dateLabel(c.date);
  const span=document.createElement('span');span.textContent=t(`renewal.checkpoint.${c.key}`);
  const small=addText(span,'small',t(`renewal.checkpointHint.${c.key}`));if(c.ruleId){small.append(' ');sourceLink(small,c.ruleId);}
  li.append(time,span);list.append(li);
 }
 box.append(list);
 const ul=document.createElement('ul');
 addText(ul,'li',interpolate('renewal.portingWindow',{open:dateLabel(schedule.portingOpensOn),close:dateLabel(schedule.portingClosesOn),discretion:dateLabel(schedule.portingDiscretionUntil)}));
 addText(ul,'li',interpolate('renewal.migrationBy',{date:dateLabel(schedule.migrationBy)}));
 addText(ul,'li',interpolate('renewal.graceEnds',{date:dateLabel(schedule.graceEndsOn),days:schedule.graceDays}));
 box.append(ul);
 const notes=document.createElement('ul');for(const note of schedule.notes)addText(notes,'li',t(`renewal.note.${note}`),'fine-print');box.append(notes);
 for(const id of schedule.ruleIds)usedRules.add(id);
}
el('dates-calendar').addEventListener('click',()=>{
 if(!schedule||schedule.status==='invalid')return;
 try{download('claimclock-renewal.ics',renewalCalendar(schedule,text(datesForm,'label'),lang()),'text/calendar;charset=utf-8');setMessage(el('dates-status'),'renewal.calendarDone');}
 catch{setMessage(el('dates-status'),'deductions.dateError');}
});
// --- Premium check -------------------------------------------------------------------------------------------
function hikeInput(){
 const old=num(hikeForm,'oldPremium'),next=num(hikeForm,'newPremium');
 if(old===null||next===null)return null;
 const band=field<HTMLSelectElement>(hikeForm,'ageBandChanged').value;
 return {oldPremium:old,newPremium:next,oldIncludesGst:field(hikeForm,'oldIncludesGst').checked,newIncludesGst:field(hikeForm,'newIncludesGst').checked,seniorCitizen:field(hikeForm,'senior').checked,ageBandChanged:band===''?null:band==='yes',sumInsuredChanged:field(hikeForm,'sumInsuredChanged').checked,claimedLastYear:field(hikeForm,'claimedLastYear').checked};
}
function renderHike(){
 const box=el('hike-result');box.replaceChildren();
 const input=hikeInput();hike=input?premiumHike(input):null;
 const ready=Boolean(hike&&hike.status==='ok');
 el<HTMLButtonElement>('hike-letter').disabled=!ready;el<HTMLButtonElement>('hike-bima').disabled=!ready;
 if(!hike)return;
 if(hike.status==='invalid'){addText(box,'p',t('renewal.verdict.invalid'),'verdict warn');return;}
 const tone=hike.verdict==='exceeds_senior_cap'?'no':hike.verdict==='rate_rise'?'warn':'ok';
 addText(box,'p',t(`renewal.verdict.${hike.verdict}`),`verdict ${tone}`);
 addText(box,'p',percent(hike.baseChangePercent),'amount');
 const ul=document.createElement('ul');
 addText(ul,'li',interpolate('renewal.hikeBase',{old:rupees(hike.oldBase),next:rupees(hike.newBase)}));
 addText(ul,'li',interpolate('renewal.hikeTotal',{percent:percent(hike.totalChangePercent)}));
 if(hike.gstEffectPercent!==0)addText(ul,'li',interpolate('renewal.hikeGst',{percent:percent(hike.gstEffectPercent)}));
 if(hike.seniorCap!=='not_applicable')addText(ul,'li',t(`renewal.seniorCap.${hike.seniorCap}`),hike.seniorCap==='exceeds'?'warn':'ok');
 box.append(ul);
 const notes=document.createElement('ul');for(const note of hike.notes)addText(notes,'li',t(`renewal.hikeNote.${note}`),'fine-print');box.append(notes);
 const sources=document.createElement('ul');sources.className='fine-print';for(const id of hike.ruleIds){const r=rule(id);const li=addText(sources,'li',`${String(lang()==='hi'?r.title_hi||r.title:r.title)} `);sourceLink(li,id);}box.append(sources);
}
function hikeLetter(kind:'premium-hike'|'premium-hike-bima'){
 const input=hikeInput();if(!input||!hike||hike.status!=='ok')return;
 const insurerId=field<HTMLSelectElement>(hikeForm,'insurer').value||vaultPolicy?.insurerId||'';
 const renewalDate=text(datesForm,'renewalDate');
 if(!insurerId){setMessage(el('dates-status'),'renewal.needInsurer');field<HTMLSelectElement>(hikeForm,'insurer').focus();return;}
 if(!validDate(renewalDate)){setMessage(el('dates-status'),'renewal.needRenewalDate');field(datesForm,'renewalDate').focus();return;}
 letterInsurer=insurerId;setMessage(el('dates-status'),null);
 try{openLetter(()=>makeRenewalLetter({kind,insurerId,renewalDate,oldPremium:input.oldPremium,newPremium:input.newPremium,hike:premiumHike(input)},contacts,rules,lang()),groEmail(insurerId));}
 catch{setMessage(el('dates-status'),'deductions.dateError');}
}
el('hike-letter').addEventListener('click',()=>hikeLetter('premium-hike'));
el('hike-bima').addEventListener('click',()=>hikeLetter('premium-hike-bima'));
// --- Checklists -------------------------------------------------------------------------------------------------
function renderSteps(id:string,prefix:string,steps:{key:string;ruleId:string|null}[]){
 const list=el(id);list.replaceChildren();
 const dateFor=(key:string):string|null=>{
  if(!schedule||schedule.status==='invalid')return null;
  if(prefix==='porting'&&key==='compare')return `${dateLabel(schedule.portingOpensOn)} → ${dateLabel(schedule.portingClosesOn)}`;
  if(prefix==='porting'&&key==='apply')return dateLabel(schedule.portingClosesOn);
  if(prefix==='porting'&&key==='keepOld')return dateLabel(schedule.graceEndsOn);
  if(prefix==='migration'&&key==='when')return dateLabel(schedule.migrationBy);
  return null;
 };
 for(const step of steps){
  const li=document.createElement('li');
  addText(li,'strong',t(`renewal.${prefix}.${step.key}`));
  const when=dateFor(step.key);if(when)addText(li,'span',when,'fine-print');
  const hint=addText(li,'p',`${t(`renewal.${prefix}.${step.key}Hint`)} `,'fine-print');if(step.ruleId)sourceLink(hint,step.ruleId);
  list.append(li);
 }
}
portingForm.addEventListener('submit',e=>{
 e.preventDefault();const status=el('porting-status');setMessage(status,null);
 const insurerId=field<HTMLSelectElement>(portingForm,'insurer').value,requestDate=text(portingForm,'requestDate');
 if(!insurerId){setMessage(status,'renewal.needInsurer');return;}
 if(!validDate(requestDate)||requestDate>new Date().toISOString().slice(0,10)){setMessage(status,'deductions.dateError');return;}
 letterInsurer=insurerId;
 try{openLetter(()=>makeRenewalLetter({kind:'porting-delay',insurerId,role:field<HTMLSelectElement>(portingForm,'role').value as 'existing'|'acquiring',otherInsurer:text(portingForm,'otherInsurer'),requestDate,renewalDate:text(datesForm,'renewalDate')||null},contacts,rules,lang()),groEmail(insurerId));}
 catch{setMessage(status,'deductions.dateError');}
});
migrationForm.addEventListener('submit',e=>{
 e.preventDefault();const status=el('migration-status');setMessage(status,null);
 const insurerId=field<HTMLSelectElement>(migrationForm,'insurer').value,effectiveDate=text(migrationForm,'effectiveDate');
 if(!insurerId){setMessage(status,'renewal.needInsurer');return;}
 if(!validDate(effectiveDate)){setMessage(status,'deductions.dateError');return;}
 letterInsurer=insurerId;
 try{openLetter(()=>makeRenewalLetter({kind:'migration-request',insurerId,target:text(migrationForm,'target'),effectiveDate,groupExit:field(migrationForm,'groupExit').checked,continuousMonths:num(migrationForm,'continuousMonths')},contacts,rules,lang()),contacts.find(c=>c.id===insurerId)?.claims_email||groEmail(insurerId));}
 catch{setMessage(status,'deductions.dateError');}
});
// --- Free look -----------------------------------------------------------------------------------------------------
function promiseSide(side:'promised'|'actual'):PromiseFields {
 const out:PromiseFields={};
 for(const input of document.querySelectorAll<HTMLInputElement>(`#freelook-diff input[data-side=${side}]`)){
  const value=input.value.trim();if(!value)continue;
  const name=input.dataset.field as PromiseField;
  out[name]=input.type==='number'?Number(value):value;
 }
 return out;
}
function renderFreeLook(){
 const windowBox=el('freelook-window'),box=el('freelook-result');windowBox.replaceChildren();box.replaceChildren();
 const receivedOn=text(freelookForm,'receivedOn'),requestedOn=text(freelookForm,'requestedOn');
 freeLook=receivedOn?freeLookWindow(receivedOn,requestedOn||null):null;
 if(freeLook){
  const tone=freeLook.status==='open'?'ok':freeLook.status==='closed'||freeLook.status==='invalid'?'no':'warn';
  addText(windowBox,'p',interpolate(`renewal.freeLook.${freeLook.status}`,{date:freeLook.endsOn?dateLabel(freeLook.endsOn):'',days:Math.abs(freeLook.daysLeft)}),`verdict ${tone}`);
  if(freeLook.refundDueOn)addText(windowBox,'p',interpolate('renewal.refundDue',{date:dateLabel(freeLook.refundDueOn)}));
  if(freeLook.status!=='invalid'){const notes=document.createElement('ul');for(const note of freeLook.notes)addText(notes,'li',t(`renewal.freeLookNote.${note}`),'fine-print');windowBox.append(notes);const sources=document.createElement('ul');sources.className='fine-print';for(const id of freeLook.ruleIds){const r=rule(id);const li=addText(sources,'li',`${String(lang()==='hi'?r.title_hi||r.title:r.title)} `);sourceLink(li,id);}windowBox.append(sources);}
 }
 const diff=freeLookDiff(promiseSide('promised'),promiseSide('actual'));
 if(diff.compared.length){
  addText(box,'p',interpolate('renewal.diffSummary',{compared:diff.compared.length,mismatches:diff.mismatches.length}),`verdict ${diff.mismatches.length?'no':'ok'}`);
  if(diff.mismatches.length){const ul=document.createElement('ul');ul.className='mismatches';for(const m of diff.mismatches)addText(ul,'li',describeMismatch(m,lang()).replace(/^- /,''),`mismatch ${m.severity}`);box.append(ul);}
 }
 const insurerId=field<HTMLSelectElement>(freelookForm,'insurer').value;
 el<HTMLButtonElement>('freelook-letter').disabled=!(freeLook&&['open','last_day'].includes(freeLook.status)&&insurerId);
}
el('freelook-letter').addEventListener('click',()=>{
 const status=el('freelook-status');setMessage(status,null);
 const insurerId=field<HTMLSelectElement>(freelookForm,'insurer').value,receivedOn=text(freelookForm,'receivedOn');
 if(!insurerId){setMessage(status,'renewal.needInsurer');return;}
 letterInsurer=insurerId;
 try{openLetter(()=>makeRenewalLetter({kind:'free-look-cancel',insurerId,receivedOn,mismatches:freeLookDiff(promiseSide('promised'),promiseSide('actual')).mismatches},contacts,rules,lang()),groEmail(insurerId));}
 catch{setMessage(status,'deductions.dateError');}
});
let parsing=false;
field(freelookForm,'schedule').addEventListener('change',async event=>{
 const input=event.currentTarget as HTMLInputElement;const file=input.files?.[0];if(!file)return;
 const status=el('freelook-extract-status');
 if(parsing){setMessage(status,'deductions.wait');return;}parsing=true;
 try{
  const [{extractFile},{parsePolicyText}]=await Promise.all([import('./extract'),import('./policy-parser.ts')]);
  const parsed=parsePolicyText(await extractFile(file,(key,fields)=>setMessage(status,key,fields)));
  const actual=(name:PromiseField,value:unknown)=>{const target=document.querySelector<HTMLInputElement>(`#freelook-diff input[data-side=actual][data-field=${name}]`);if(target&&value!==undefined&&value!==null&&value!=='')target.value=String(value);};
  actual('sumInsured',parsed.sumInsured);actual('roomRent',parsed.roomRent);actual('copayPercent',parsed.copayPercent);actual('members',parsed.members.length||undefined);actual('planName',parsed.planName||(parsed.planId?plans.find(p=>p.id===parsed.planId)?.name:undefined));
  if(parsed.insurerId&&!field<HTMLSelectElement>(freelookForm,'insurer').value){field<HTMLSelectElement>(freelookForm,'insurer').value=parsed.insurerId;window.dispatchEvent(new Event('pickerrefresh'));}
  const found=['sumInsured','roomRent','copayPercent','planName'].filter(k=>(parsed as Record<string,unknown>)[k]!==undefined).length+(parsed.members.length?1:0);
  setMessage(status,found?'renewal.scheduleRead':'renewal.scheduleNothing',{count:found});
  renderFreeLook();
 }catch(e){setMessage(status,e instanceof Error&&'translationKey' in e&&String(e.translationKey).startsWith('extract.')?String(e.translationKey):'deductions.readFailed');}
 finally{parsing=false;input.value='';}
});
// --- Wiring ----------------------------------------------------------------------------------------------------------
function renderAll(){usedRules.clear();renderDates();renderHike();renderSteps('porting-steps','porting',PORTING_STEPS);renderSteps('migration-steps','migration',MIGRATION_STEPS);renderFreeLook();renderSources();}
renderVaultChoices();applyVaultPolicy();
field<HTMLSelectElement>(datesForm,'vaultPolicy').addEventListener('change',()=>{applyVaultPolicy();renderAll();});
datesForm.addEventListener('input',renderAll);datesForm.addEventListener('change',renderAll);
hikeForm.addEventListener('input',renderAll);hikeForm.addEventListener('change',renderAll);
freelookForm.addEventListener('input',renderAll);freelookForm.addEventListener('change',renderAll);
el('freelook-diff').addEventListener('input',renderAll);
window.addEventListener('languagechange',()=>{renderVaultChoices();renderAll();});
for(const selector of ['#porting-form button[type=submit]','#migration-form button[type=submit]'])document.querySelector<HTMLButtonElement>(selector)!.disabled=false;
renderAll();
