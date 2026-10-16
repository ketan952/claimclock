import {t,setMessage} from './i18n';
import {listReceipts,parseReceipt,receiptIssue,removeReceipt} from './receipts.ts';
const consent=document.querySelector<HTMLInputElement>('#analytics-consent')!;
try{consent.checked=localStorage.getItem('claimclock:analytics')==='yes';}catch{}
consent.addEventListener('change',()=>{try{localStorage.setItem('claimclock:analytics',consent.checked?'yes':'no');}catch{}});
const form=document.querySelector<HTMLFormElement>('#erase-report')!;
const codeInput=form.elements.namedItem('code') as HTMLInputElement;
const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
const picker=document.querySelector<HTMLSelectElement>('#saved-receipt')!;
const copy=document.querySelector<HTMLButtonElement>('#copy-saved-receipt')!;
const warning=document.querySelector<HTMLElement>('#receipt-warning')!;
const status=document.querySelector<HTMLElement>('#erase-status')!;
let current='',copyStatus='';
function renderStatus(){status.textContent=current?t(current):'';document.querySelector('#receipt-copy-status')!.textContent=copyStatus?t(copyStatus):'';}
function renderReceipts(selectInitial=false){
 const saved=listReceipts(),selected=picker.value;
 picker.replaceChildren(new Option(t('privacy.receiptManual'),''));
 for(const receipt of saved)picker.append(new Option(`${t('privacy.savedReport')} ${receipt.id}`,receipt.id));
 picker.value=saved.some(receipt=>receipt.id===selected)?selected:'';
 if(selectInitial&&saved.length){const latest=saved[saved.length-1];picker.value=latest.id;codeInput.value=`${latest.id}:${latest.erase_token}`;}
 warning.textContent=receiptIssue()?t('privacy.receiptsProblem'):'';
 copy.disabled=!codeInput.value.trim();renderStatus();
}
picker.addEventListener('change',()=>{
 const receipt=listReceipts().find(value=>value.id===picker.value);
 codeInput.value=receipt?`${receipt.id}:${receipt.erase_token}`:'';copy.disabled=!receipt;current='';copyStatus='';renderStatus();
});
codeInput.addEventListener('input',()=>{picker.value='';copy.disabled=!codeInput.value.trim();current='';copyStatus='';renderStatus();});
copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(codeInput.value.trim());copyStatus='optin.codeCopied';}catch{codeInput.focus();codeInput.select();copyStatus='optin.copyFailed';}renderStatus();});
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const [id,erase_token,...extra]=codeInput.value.trim().split(':');
 const receipt=extra.length?null:parseReceipt({id,erase_token});
 if(!receipt){current='privacy.eraseInvalid';renderStatus();return;}
 button.disabled=true;
 try{
  const response=await fetch(`/api/reports/${receipt.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({erase_token:receipt.erase_token})});
  if(!response.ok||(await response.json()).erased!==true)throw Error();
  const removed=removeReceipt(receipt);current=removed?'privacy.erased':'privacy.erasedLocalFailed';
  // A different code selected during the request must remain intact.
  if(codeInput.value.trim()===`${receipt.id}:${receipt.erase_token}`){codeInput.value='';picker.value='';}
  copyStatus='';renderReceipts();
 }catch{current='privacy.eraseFailed';}
 finally{button.disabled=false;renderStatus();}
});
window.addEventListener('languagechange',()=>renderReceipts());
window.addEventListener('storage',()=>renderReceipts());
renderReceipts(true);button.disabled=false;
// Saathi names its processors here rather than inside the assistant, so the live configuration is always one place.
void (async()=>{
 const line=document.querySelector<HTMLElement>('#voice-providers');if(!line)return;
 try{
  const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('config');
  const config=await response.json() as {ai_enabled?:boolean;provider?:string|null;model?:string|null;voice_enabled?:boolean;stt_model?:string|null;tts_enabled?:boolean;tts_provider?:string|null};
  if(!config.ai_enabled||!config.provider){setMessage(line,'privacy.voiceProvidersOff');return;}
  const parts=[`${config.provider} (${config.model||''}${config.voice_enabled&&config.stt_model?`; ${config.stt_model}`:''})`];
  if(config.tts_enabled&&config.tts_provider)parts.push(config.tts_provider==='sarvam'?'api.sarvam.ai (voice)':config.tts_provider==='openai'?'api.openai.com (voice)':config.tts_provider);
  setMessage(line,'privacy.voiceProviders',{providers:parts.join(' · ')});
 }catch{setMessage(line,'privacy.voiceProvidersOff');}
})();
