import contactsRaw from '../../data/contacts.json';
import rulesRaw from '../../data/rules.json';
import {lang,setMessage} from './i18n';
import {evaluateOmbudsmanEligibility,makeOmbudsmanDraft,makeReimbursementDeskLetter,makeTwoPoliciesLetter,type OmbudsmanCheckInput,type OmbudsmanReplyStatus} from './toolkits';
import type {Contact,Letter,Rule} from './types';

const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const CHECKLIST_KEY='claimclock:reimbursement-checklist:v1';

export function initToolkits(showLetter:(source:Letter|(()=>Letter),email?:string)=>void,context?:{getInsurerId?:()=>string;getHospital?:()=>string;getDisputedAmount?:()=>number;getSummary?:()=>string}) {
 const checklist=document.querySelector<HTMLElement>('#reimbursement-checklist');
 if(checklist){
  let saved:Record<string,boolean>={};
  try{saved=JSON.parse(localStorage.getItem(CHECKLIST_KEY)||'{}')||{};}catch{}
  checklist.querySelectorAll<HTMLInputElement>('[data-reimb-item]').forEach(box=>{
   const key=box.dataset.reimbItem!;
   box.checked=Boolean(saved[key]);
   box.addEventListener('change',()=>{
    saved[key]=box.checked;
    try{localStorage.setItem(CHECKLIST_KEY,JSON.stringify(saved));}catch{}
   });
  });
  const btn=document.querySelector<HTMLButtonElement>('#prepare-reimbursement-desk');
  if(btn)btn.addEventListener('click',()=>{
   const insurerId=context?.getInsurerId?.()||'';
   const insurerName=contacts.find(c=>c.id===insurerId)?.name||'';
   const hospital=context?.getHospital?.()||'';
   showLetter(()=>makeReimbursementDeskLetter(insurerName,hospital,lang()));
  });
 }

 const twoPoliciesForm=document.querySelector<HTMLFormElement>('#two-policies-form');
 if(twoPoliciesForm){
  twoPoliciesForm.addEventListener('submit',e=>{
   e.preventDefault();
   const primary=(twoPoliciesForm.elements.namedItem('primaryInsurer') as HTMLSelectElement).value;
   const secondaryId=(twoPoliciesForm.elements.namedItem('secondaryInsurer') as HTMLSelectElement).value;
   const secondary=contacts.find(c=>c.id===secondaryId);
   const rawAmount=Number((twoPoliciesForm.elements.namedItem('balanceAmount') as HTMLInputElement).value);
   if(!primary||!secondary||!Number.isFinite(rawAmount)||rawAmount<=0)return;
   const amountStr=rawAmount.toLocaleString('en-IN');
   const recipient=secondary.claims_email||secondary.escalation_levels?.find(l=>l.email)?.email||secondary.gro_email||'';
   showLetter(()=>makeTwoPoliciesLetter(primary,secondary.name,amountStr,lang(),rules),recipient);
  });
 }

 const ombudsmanForm=document.querySelector<HTMLFormElement>('#ombudsman-form');
 if(ombudsmanForm){
  const statusEl=document.querySelector<HTMLElement>('#ombudsman-check-status')!;
  const replySelect=ombudsmanForm.elements.namedItem('replyStatus') as HTMLSelectElement;
  const replyWrap=document.querySelector<HTMLElement>('#ombudsman-reply-date-wrap')!;
  const syncReplyWrap=()=>{replyWrap.hidden=replySelect.value==='no-reply';};
  replySelect.addEventListener('change',syncReplyWrap);syncReplyWrap();

  const details=document.querySelector<HTMLDetailsElement>('#ombudsman-details');
  if(details)details.addEventListener('toggle',()=>{
   if(!details.open)return;
   const insSelect=ombudsmanForm.elements.namedItem('ombudsmanInsurer') as HTMLSelectElement;
   const ctxIns=context?.getInsurerId?.()||'';
   if(!insSelect.value&&ctxIns&&contacts.some(c=>c.id===ctxIns))insSelect.value=ctxIns;
   const amtInput=ombudsmanForm.elements.namedItem('amount') as HTMLInputElement;
   const ctxAmt=context?.getDisputedAmount?.()||0;
   if(!amtInput.value&&ctxAmt>0)amtInput.value=String(Math.round(ctxAmt));
   const sumInput=ombudsmanForm.elements.namedItem('summary') as HTMLTextAreaElement;
   const ctxSum=context?.getSummary?.()||'';
   if(!sumInput.value.trim()&&ctxSum)sumInput.value=ctxSum.slice(0,800);
  });

  const readInput=():OmbudsmanCheckInput=>({
   insurerId:(ombudsmanForm.elements.namedItem('ombudsmanInsurer') as HTMLSelectElement).value,
   groDate:(ombudsmanForm.elements.namedItem('groDate') as HTMLInputElement).value,
   replyStatus:replySelect.value as OmbudsmanReplyStatus,
   replyDate:(ombudsmanForm.elements.namedItem('replyDate') as HTMLInputElement).value||undefined,
   amount:Number((ombudsmanForm.elements.namedItem('amount') as HTMLInputElement).value),
   notInCourt:(ombudsmanForm.elements.namedItem('notInCourt') as HTMLInputElement).checked,
   summary:(ombudsmanForm.elements.namedItem('summary') as HTMLTextAreaElement).value,
  });
  const fmtDate=(ymd:string)=>ymd?new Date(`${ymd}T00:00:00Z`).toLocaleDateString(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'';
  const runCheck=()=>{
   const inp=readInput();
   const res=evaluateOmbudsmanEligibility(inp);
   setMessage(statusEl,res.reasonKey,{date:fmtDate(res.triggerDate),limit:fmtDate(res.oneYearLimitDate)});
   return {inp,res};
  };
  document.querySelector<HTMLButtonElement>('#ombudsman-check-btn')!.addEventListener('click',()=>{runCheck();});
  ombudsmanForm.addEventListener('submit',e=>{
   e.preventDefault();
   const {inp,res}=runCheck();
   if(!inp.insurerId||!res.eligible)return;
   showLetter(()=>makeOmbudsmanDraft(inp,contacts,rules,lang()));
  });
 }
}
