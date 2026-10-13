import contacts from '../../data/contacts.json';
import rules from '../../data/rules.json';
import {detectInsurerFromText,extractRejectionInfo} from './deductions';
import {lang,setMessage} from './i18n';
import {setupLetterDialog} from './letter-dialog';
import {knownIdentifiers,redact} from './redact';
import {makeRejectionLetter} from './rejection';
const openLetter=setupLetterDialog();
const form=document.querySelector<HTMLFormElement>('#rejection-form')!;
const status=document.querySelector<HTMLElement>('#rejection-status')!;
const extractStatus=document.querySelector<HTMLElement>('#rejection-extract-status')!;
let processing=false;
document.querySelector<HTMLInputElement>('#rejection-file')!.addEventListener('change',async event=>{
 const file=(event.currentTarget as HTMLInputElement).files?.[0];if(!file)return;
 if(processing){setMessage(extractStatus,'deductions.wait');return;}processing=true;
 try{
  const {extractFile}=await import('./extract');
  const text=await extractFile(file,(key,fields)=>setMessage(extractStatus,key,fields));
  const insurerSelect=form.elements.namedItem('insurer') as HTMLSelectElement;
  if(!insurerSelect.value){const detected=detectInsurerFromText(text,contacts);if(detected){insurerSelect.value=detected;window.dispatchEvent(new Event('pickerrefresh'));}}
  const info=extractRejectionInfo(text);
  const dateField=form.elements.namedItem('rejectedOn') as HTMLInputElement;
  if(!dateField.value&&info.rejectedOn)dateField.value=info.rejectedOn;
  const groundField=form.elements.namedItem('ground') as HTMLTextAreaElement;
  if(!groundField.value.trim()&&info.ground)groundField.value=redact(info.ground,knownIdentifiers(text));
  setMessage(extractStatus,'rejection.readDone');
 }catch(e){
  setMessage(extractStatus,e instanceof Error&&'translationKey' in e&&String(e.translationKey).startsWith('extract.')?String(e.translationKey):'deductions.readFailed');
 }finally{processing=false;}
});
form.addEventListener('submit',event=>{
 event.preventDefault();const fields=new FormData(form);setMessage(status,null);
 const input={insurerId:String(fields.get('insurer')||''),rejectedOn:String(fields.get('rejectedOn')||''),ground:String(fields.get('ground')||'')};
 try {openLetter(()=>makeRejectionLetter(input,contacts,rules,lang()),contacts.find(c=>c.id===input.insurerId)?.gro_email||'');}
 catch {setMessage(status,'rejection.invalid');}
});
// Keep native form submission unavailable until this local handler is installed.
form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=false;
