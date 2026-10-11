import type { Letter } from './types.ts';
import { BIMA_DRAFT_LIMIT } from './letter-limits';
import { setMessage } from './i18n';
import { download } from './storage.ts';
import { track } from './events.ts';
export function setupLetterDialog() {
  const dialog=document.querySelector<HTMLDialogElement>('#letter-dialog')!;
  const body=document.querySelector<HTMLTextAreaElement>('#letter-body')!;
  let current:Letter|null=null;let recipient='';let regenerate:(()=>Letter)|null=null;
  const updateLinks=()=>{
    const text=body.value;const bima=current?.kind==='bima',overBudget=bima&&text.length>BIMA_DRAFT_LIMIT;
    const counter=document.querySelector<HTMLElement>('#bima-character-count')!;counter.hidden=!bima;if(bima)setMessage(counter,overBudget?'bima.overBudget':'bima.characterBudget',{count:text.length,limit:BIMA_DRAFT_LIMIT});
    for(const id of ['letter-copy','letter-download'])(document.getElementById(id) as HTMLButtonElement).disabled=overBudget;
    for(const id of ['letter-whatsapp','letter-email']){const link=document.getElementById(id)!;link.setAttribute('aria-disabled',String(overBudget));if(overBudget)link.removeAttribute('href');}
    if(overBudget)return;
    (document.querySelector('#letter-whatsapp') as HTMLAnchorElement).href=`https://wa.me/?text=${encodeURIComponent(text)}`;
    (document.querySelector('#letter-email') as HTMLAnchorElement).href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(current?.subject||'ClaimClock')}&body=${encodeURIComponent(text)}`;
  };
  body.addEventListener('input',updateLinks);
  document.querySelector('#letter-close')!.addEventListener('click',()=>dialog.close());
  document.querySelector('#letter-copy')!.addEventListener('click',async()=>{
    if(current?.kind==='bima'&&body.value.length>BIMA_DRAFT_LIMIT)return;
    try {await navigator.clipboard.writeText(body.value);setMessage(document.querySelector<HTMLElement>('#letter-status')!,'letter.copied');if(current?.kind==='lock')track('clock_lock_copied');else if(['gro','bima','reconsideration','rejection'].includes(current?.kind||''))track('escalation_copied');}
    catch {body.focus();body.select();setMessage(document.querySelector<HTMLElement>('#letter-status')!,'letter.copyFailed');}
  });
  document.querySelector('#letter-download')!.addEventListener('click',()=>{if(current?.kind==='bima'&&body.value.length>BIMA_DRAFT_LIMIT)return;download(`claimclock-${current?.kind||'letter'}.txt`,`${current?.subject}\n\n${body.value}`);});
  const render=()=>{if(!current)return;document.querySelector('#letter-subject')!.textContent=current.subject;body.value=current.body;if(current.kind==='bima')body.maxLength=BIMA_DRAFT_LIMIT;else body.removeAttribute('maxlength');setMessage(document.querySelector<HTMLElement>('#letter-status')!,null);(document.querySelector('#bima-instructions') as HTMLElement).hidden=current.kind!=='bima';updateLinks();};
  window.addEventListener('languagechange',()=>{if(dialog.open&&regenerate&&current){current=regenerate();render();}});
  window.addEventListener('casechange',()=>{
    dialog.close();current=null;regenerate=null;recipient='';body.value='';body.removeAttribute('maxlength');document.querySelector('#letter-subject')!.textContent='';setMessage(document.querySelector<HTMLElement>('#letter-status')!,null);
    for(const id of ['letter-copy','letter-download'])(document.getElementById(id) as HTMLButtonElement).disabled=true;
    for(const id of ['letter-whatsapp','letter-email']){const link=document.getElementById(id)!;link.removeAttribute('href');link.setAttribute('aria-disabled','true');}
    for(const id of ['bima-character-count','bima-instructions'])(document.getElementById(id) as HTMLElement).hidden=true;
  });
  return (source:Letter|(()=>Letter),email='')=>{
    regenerate=typeof source==='function'?source:null;current=regenerate?regenerate():source as Letter;recipient=email;render();dialog.showModal();
  };
}
