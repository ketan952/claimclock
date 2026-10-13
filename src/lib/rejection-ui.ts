import contacts from '../../data/contacts.json';
import rules from '../../data/rules.json';
import {detectInsurerFromText,extractRejectionInfo} from './deductions';
import {lang,setMessage} from './i18n';
import {setupLetterDialog} from './letter-dialog';
import {knownIdentifiers,redact} from './redact';
import {detectRejectionCategory,makeDoctorJustificationNote,makeRejectionLetter,type RejectionCategory} from './rejection';
import {initToolkits} from './toolkits-ui';

const openLetter=setupLetterDialog();
const form=document.querySelector<HTMLFormElement>('#rejection-form')!;
const status=document.querySelector<HTMLElement>('#rejection-status')!;
const extractStatus=document.querySelector<HTMLElement>('#rejection-extract-status')!;
const categorySelect=form.elements.namedItem('category') as HTMLSelectElement;
const groundField=form.elements.namedItem('ground') as HTMLTextAreaElement;
let categoryManuallyChosen=false;
categorySelect.addEventListener('change',()=>{categoryManuallyChosen=true;});
groundField.addEventListener('input',()=>{
 if(!categoryManuallyChosen)categorySelect.value=detectRejectionCategory(groundField.value);
});

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
  if(!groundField.value.trim()&&info.ground)groundField.value=redact(info.ground,knownIdentifiers(text));
  if(!categoryManuallyChosen)categorySelect.value=detectRejectionCategory(groundField.value||text);
  setMessage(extractStatus,'rejection.readDone');
 }catch(e){
  setMessage(extractStatus,e instanceof Error&&'translationKey' in e&&String(e.translationKey).startsWith('extract.')?String(e.translationKey):'deductions.readFailed');
 }finally{processing=false;}
});

document.querySelector<HTMLButtonElement>('#prepare-doctor-note')!.addEventListener('click',()=>{
 const insurerId=String((form.elements.namedItem('insurer') as HTMLSelectElement).value||'');
 const insurerName=contacts.find(c=>c.id===insurerId)?.name||'';
 openLetter(()=>makeDoctorJustificationNote(insurerName,lang()));
});

form.addEventListener('submit',event=>{
 event.preventDefault();const fields=new FormData(form);setMessage(status,null);
 const input={
  insurerId:String(fields.get('insurer')||''),
  rejectedOn:String(fields.get('rejectedOn')||''),
  ground:String(fields.get('ground')||''),
  category:(String(fields.get('category')||'general') as RejectionCategory),
  moratorium60Months:Boolean(fields.get('moratorium60Months')),
 };
 try {openLetter(()=>makeRejectionLetter(input,contacts,rules,lang()),contacts.find(c=>c.id===input.insurerId)?.gro_email||'');}
 catch {setMessage(status,'rejection.invalid');}
});

initToolkits(openLetter,{
 getInsurerId:()=>(form.elements.namedItem('insurer') as HTMLSelectElement).value,
 getSummary:()=>groundField.value.trim(),
});

// Keep native form submission unavailable until this local handler is installed.
form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=false;
