import contacts from '../../data/contacts.json';
import rules from '../../data/rules.json';
import {lang,t} from './i18n';
import {setupLetterDialog} from './letter-dialog';
import {makeRejectionLetter} from './rejection';
const openLetter=setupLetterDialog();
const form=document.querySelector<HTMLFormElement>('#rejection-form')!;
const status=document.querySelector<HTMLElement>('#rejection-status')!;
form.addEventListener('submit',event=>{
 event.preventDefault();const fields=new FormData(form);status.textContent='';
 const input={insurerId:String(fields.get('insurer')||''),rejectedOn:String(fields.get('rejectedOn')||''),ground:String(fields.get('ground')||'')};
 try {openLetter(makeRejectionLetter(input,contacts,rules,lang()),contacts.find(c=>c.id===input.insurerId)?.gro_email||'');}
 catch {status.textContent=t('rejection.invalid');}
});
// Keep native form submission unavailable until this local handler is installed.
form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=false;
