import {lang} from './i18n';
const consent=document.querySelector<HTMLInputElement>('#analytics-consent')!;
try{consent.checked=localStorage.getItem('claimclock:analytics')==='yes';}catch{}
consent.addEventListener('change',()=>{try{localStorage.setItem('claimclock:analytics',consent.checked?'yes':'no');}catch{}});
const form=document.querySelector<HTMLFormElement>('#erase-report')!;
const codeInput=form.elements.namedItem('code') as HTMLInputElement;
const button=form.querySelector<HTMLButtonElement>('button')!;
const status=document.querySelector<HTMLElement>('#erase-status')!;
try{const saved=JSON.parse(localStorage.getItem('claimclock:erase')||'null');if(saved?.id&&saved?.erase_token)codeInput.value=`${saved.id}:${saved.erase_token}`;}catch{}
const messages={
 invalid:{en:'Check the deletion code.',hi:'हटाने का कोड जाँचें।'},
 erased:{en:'Report erased.',hi:'रिपोर्ट हटा दी गई।'},
 failed:{en:'Erasure was not confirmed. Check the code or try again later.',hi:'हटाने की पुष्टि नहीं हुई। कोड जाँचें या बाद में कोशिश करें।'}
};
let current:keyof typeof messages|null=null;
const renderStatus=()=>{status.textContent=current?messages[current][lang()]:'';};
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const [id,erase_token,...extra]=codeInput.value.trim().split(':');
 if(!id||!erase_token||extra.length){current='invalid';renderStatus();return;}
 button.disabled=true;
 try{
  const response=await fetch(`/api/reports/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({erase_token})});
  if(!response.ok||!(await response.json()).erased)throw Error();
  current='erased';codeInput.value='';try{localStorage.removeItem('claimclock:erase');}catch{}
 }catch{current='failed';}
 finally{button.disabled=false;renderStatus();}
});
window.addEventListener('languagechange',renderStatus);
button.disabled=false;
