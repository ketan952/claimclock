import contactsRaw from '../../data/contacts.json';import rulesRaw from '../../data/rules.json';
import consumables from '../../data/consumables.json';
import type {Contact,Rule,Letter} from './types';import {classify,parseManualLines,verdictTotals,type Deduction,type DeductionInput} from './deductions';
import {knownIdentifiers,redact} from './redact';import {lang,t} from './i18n';import {makeDeductionLetter} from './deduction-letter';
import {setupLetterDialog} from './letter-dialog';import {download} from './storage';import {reminders} from './reminders';
const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const showLetter=setupLetterDialog();let inputs:DeductionInput[]=[],deductions:Deduction[]=[];let insurer='';let processing=false;
const statusLabel=(status:string)=>t(`deductions.verdict.${status}`);
function append(parent:HTMLElement,tag:string,text:string,className=''){const n=document.createElement(tag);n.textContent=text;n.className=className;parent.append(n);return n;}
const normalized=(s:string)=>s.toUpperCase().replace(/\s+/g,' ').trim();
async function read(file:File){
 if(processing){el('extract-status').textContent=t('deductions.wait');return;}processing=true;
 try{const {extractFile}=await import('./extract');const text=await extractFile(file,s=>el('extract-status').textContent=s);const box=el<HTMLTextAreaElement>('extracted-text');box.value+=(box.value?'\n\n':'')+text;el<HTMLDetailsElement>('extracted-details').open=true;el('extract-status').textContent=t('deductions.readDone');}
 catch(e){el('extract-status').textContent=e instanceof Error?e.message:t('deductions.readFailed');}finally{processing=false;}
}
for(const id of ['settlement-file','bill-file','policy-file'])el<HTMLInputElement>(id).addEventListener('change',()=>{const file=el<HTMLInputElement>(id).files?.[0];if(file)void read(file);});
function render(){
 deductions=inputs.map(classify);el('deduction-results').hidden=!deductions.length;const cards=el('deduction-cards');cards.replaceChildren();
 deductions.forEach((d,index)=>{
  const card=document.createElement('article');card.className='row-card';append(card,'h3',`${index+1}. ${d.description}`);append(card,'p',`₹${d.amount.toLocaleString('en-IN')} · ${statusLabel(d.status)}`,'badge');append(card,'p',t(`deductions.category.${d.category}`),'fine-print');append(card,'p',lang()==='hi'?d.explanation_hi:d.explanation,'fine-print');
  const sources=document.createElement('details');append(sources,'summary',t('deductions.sourceBasis'));
  for(const id of d.ruleIds){const rule=rules.find(r=>r.id===id);if(!rule)continue;append(sources,'p',lang()==='hi'?rule.plain_hi||rule.title:rule.plain_en||rule.title,'fine-print');const link=append(sources,'a',rule.paragraph+' ↗','fine-print') as HTMLAnchorElement;link.href=rule.source_url;link.target='_blank';link.rel='noopener noreferrer';}
  if(d.category==='consumable'){const link=append(sources,'a',t('deductions.historicalLink')+' ↗','fine-print') as HTMLAnchorElement;link.href=consumables[0].source_url;link.target='_blank';link.rel='noopener noreferrer';}card.append(sources);
  const match=consumables.filter(c=>normalized(c.item)===normalized(d.description.replace(/^non[ -]?medical\s*:\s*/i,'')));
  if(match.length){for(const c of match){append(card,'p',`${t('deductions.historical')} ${c.list} / ${c.serial_number}: ${lang()==='hi'?c.list_label_hi:c.list_label_en}`,'fine-print');const a=append(card,'a',c.paragraph+' ↗','fine-print') as HTMLAnchorElement;a.href=c.source_url;a.target='_blank';a.rel='noopener noreferrer';}append(card,'p',lang()==='hi'?match[0].caveat_hi:match[0].caveat_en,'fine-print');}
  if(['co-pay','sub-limit','room-rent-cap'].includes(d.category)){
   const label=document.createElement('label');label.className='fine-print';const span=append(label,'span',t('deductions.clause'));const field=document.createElement('input');field.value=d.policyClause||'';field.maxLength=150;field.addEventListener('change',()=>{inputs[index].policyClause=field.value;render();});label.append(field);card.append(label);
   const checked=document.createElement('label');checked.className='checkbox-label';const check=document.createElement('input');check.type='checkbox';check.checked=!!d.policyCalculationConfirmed;check.addEventListener('change',()=>{inputs[index].policyCalculationConfirmed=check.checked;render();});checked.append(check);append(checked,'span',t('deductions.policyConfirm'));card.append(checked);
  }
  cards.append(card);
 });
 const totals=verdictTotals(deductions);el('deduction-total').textContent=`${t('deductions.total')}: ₹${Object.values(totals).reduce((sum,value)=>sum+value,0).toLocaleString('en-IN')}`;
 let summary=document.getElementById('verdict-totals');if(!summary){summary=document.createElement('section');summary.id='verdict-totals';summary.className='row-card';el('deduction-total').after(summary);}summary.replaceChildren();append(summary,'h3',t('deductions.verdictTotals'));
 for(const [status,amount] of Object.entries(totals)){const row=append(summary,'p',`${statusLabel(status)}: ₹${amount.toLocaleString('en-IN')}`);row.dataset.verdict=status;}

}
el<HTMLFormElement>('deduction-form').addEventListener('submit',e=>{e.preventDefault();const result=parseManualLines(el<HTMLTextAreaElement>('deduction-lines').value);if(result.errors.length||!result.inputs.length){el('deduction-error').textContent=`${t('deductions.lineError')}: ${result.errors.join(', ')}`;return;}el('deduction-error').textContent='';inputs=result.inputs;insurer=(el<HTMLFormElement>('deduction-form').elements.namedItem('insurer') as HTMLSelectElement).value;render();el('deduction-results').scrollIntoView({block:'start'});});
function letter(kind:'reconsideration'|'bima'):Letter {return makeDeductionLetter(kind,deductions,insurer,contacts,rules,lang());}
el('reconsideration').addEventListener('click',()=>showLetter(letter('reconsideration'),contacts.find(c=>c.id===insurer)?.gro_email||''));el('deduction-bima').addEventListener('click',()=>showLetter(letter('bima')));
el('prepare-ai').addEventListener('click',async()=>{
 if(!deductions.length){el('ai-status').textContent=t('deductions.reviewFirst');return;}
 const uncertain=deductions.filter(d=>d.status!=='likely valid');
 el<HTMLTextAreaElement>('ai-preview').value=redact(uncertain.map(d=>`${d.description}: ₹${d.amount}; ${d.category}`).join('\n'),knownIdentifiers(el<HTMLTextAreaElement>('extracted-text').value));
 el('ai-form').hidden=false;el('ai-status').textContent='';
 try{const r=await fetch('/api/config');if(!r.ok)throw Error();const config=await r.json() as {ai_enabled:boolean;provider:string;model:string};el('ai-provider').textContent=config.ai_enabled?`${config.provider} · ${config.model}`:t('deductions.aiUnavailable');}catch{el('ai-provider').textContent=t('deductions.aiUnavailable');}
});
el<HTMLFormElement>('ai-form').addEventListener('submit',async e=>{
 e.preventDefault();const preview=el<HTMLTextAreaElement>('ai-preview');const cleaned=redact(preview.value,knownIdentifiers(el<HTMLTextAreaElement>('extracted-text').value));
 if(cleaned!==preview.value){preview.value=cleaned;(el<HTMLFormElement>('ai-form').elements.namedItem('consent') as HTMLInputElement).checked=false;el('ai-status').textContent=t('deductions.checkAgain');return;}
 const button=el('ai-form').querySelector('button')!;button.disabled=true;
 try{const r=await fetch('/api/explain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines:cleaned,consent:true})});if(!r.ok)throw Error();const result=await r.json() as {explanation:string};el('ai-output').textContent=result.explanation;el('ai-status').textContent=t('deductions.aiCaution');}
 catch{el('ai-status').textContent=t('deductions.aiUnavailable');}finally{button.disabled=false;}
});
el<HTMLFormElement>('reminder-form').addEventListener('submit',e=>{e.preventDefault();const form=el<HTMLFormElement>('reminder-form');const complaint=(form.elements.namedItem('complaintDate') as HTMLInputElement).value;const response=(form.elements.namedItem('responseDate') as HTMLInputElement).value;try{if(complaint>new Date().toISOString().slice(0,10)||response>new Date().toISOString().slice(0,10))throw Error();download('claimclock-reminders.ics',reminders(complaint,response||undefined),'text/calendar;charset=utf-8');el('reminder-status').textContent=t('deductions.calendarDone');}catch{el('reminder-status').textContent=t('deductions.dateError');}});
window.addEventListener('languagechange',render);
