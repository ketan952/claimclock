import type { Letter } from './types.ts';
import { t } from './i18n';
import { download } from './storage.ts';
import { track } from './events.ts';
export function setupLetterDialog() {
  const dialog=document.querySelector<HTMLDialogElement>('#letter-dialog')!;
  const body=document.querySelector<HTMLTextAreaElement>('#letter-body')!;
  let current:Letter|null=null;let recipient='';
  const updateLinks=()=>{
    const text=body.value;
    (document.querySelector('#letter-whatsapp') as HTMLAnchorElement).href=`https://wa.me/?text=${encodeURIComponent(text)}`;
    (document.querySelector('#letter-email') as HTMLAnchorElement).href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(current?.subject||'ClaimClock')}&body=${encodeURIComponent(text)}`;
  };
  body.addEventListener('input',updateLinks);
  document.querySelector('#letter-close')!.addEventListener('click',()=>dialog.close());
  document.querySelector('#letter-copy')!.addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText(body.value);document.querySelector('#letter-status')!.textContent=t('letter.copied');if(current?.kind==='lock')track('clock_lock_copied');else if(['gro','bima','reconsideration','rejection'].includes(current?.kind||''))track('escalation_copied');}
    catch {body.focus();body.select();document.querySelector('#letter-status')!.textContent=t('letter.copyFailed');}
  });
  document.querySelector('#letter-download')!.addEventListener('click',()=>download(`claimclock-${current?.kind||'letter'}.txt`,`${current?.subject}\n\n${body.value}`));
  return (letter:Letter,email='')=>{
    current=letter;recipient=email;document.querySelector('#letter-subject')!.textContent=letter.subject;body.value=letter.body;
    document.querySelector('#letter-status')!.textContent='';(document.querySelector('#bima-instructions') as HTMLElement).hidden=letter.kind!=='bima';updateLinks();dialog.showModal();
  };
}
