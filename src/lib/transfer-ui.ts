import {drawQr} from './qr.ts';
import type {CaseBackup} from './backup.ts';
import {decryptBackup,encryptBackup,parseTransferReference,transferLink,TransferError} from './transfer-crypto.ts';
import {getTurnstileToken} from './turnstile';
import {lang,setMessage} from './i18n';

// Capture once in memory and remove the secret before any challenge can load.
// Fragments are never added to requests, localStorage, analytics or logs.
function takeFragment():string {
 if(typeof location==='undefined'||!location.hash.startsWith('#transfer='))return'';
 const value=location.hash.slice('#transfer='.length);
 history.replaceState(history.state,'',location.pathname+location.search);
 return value;
}
let incomingFragment=takeFragment();
class ApiFailure extends Error{readonly messageKey:string;constructor(messageKey:string){super(messageKey);this.messageKey=messageKey;}}
async function transferRequest(path:string,body:{ciphertext:string}|{code:string},action:'transfer_create'|'transfer_lookup',isCurrent:()=>boolean):Promise<Record<string,unknown>> {
 takeFragment();
 let token:string;try{token=await getTurnstileToken(action);}catch{throw new ApiFailure('transfer.verification');}
 // Verification can remain pending while the visitor switches cases. Recheck
 // immediately before dispatch, so cancellation creates no copy or lookup.
 if(!isCurrent())throw new ApiFailure('transfer.caseChanged');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
 try{
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Turnstile-Token':token},body:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok){const key=response.status===429?'transfer.busy':response.status===403?'transfer.verification':response.status===503?'transfer.unavailable':[404,410].includes(response.status)?'transfer.notFound':'transfer.requestFailed';throw new ApiFailure(key);}
  const text=await response.text();if(text.length>90_000)throw new ApiFailure('transfer.requestFailed');
  const result:unknown=JSON.parse(text);if(!result||typeof result!=='object'||Array.isArray(result))throw new ApiFailure('transfer.requestFailed');return result as Record<string,unknown>;
 }catch(error){if(error instanceof ApiFailure)throw error;throw new ApiFailure('transfer.network');}finally{clearTimeout(timer);}
}
function expiration(value:unknown):string {
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new ApiFailure('transfer.requestFailed');return value;
}
export function setupTransfer({getBackup,previewBackup}:{getBackup:()=>CaseBackup|null;previewBackup:(backup:CaseBackup)=>void}):void {
 const root=document.querySelector<HTMLElement>('#transfer-card');if(!root||root.dataset.initialized)return;root.dataset.initialized='true';
 const element=<T extends HTMLElement>(id:string)=>root.querySelector<T>(`#${id}`)!;
 const panel=element<HTMLDetailsElement>('transfer-panel'),create=element<HTMLButtonElement>('transfer-create'),receive=element<HTMLButtonElement>('transfer-receive');
 const form=element<HTMLFormElement>('transfer-receive-form'),reference=element<HTMLInputElement>('transfer-reference'),privateKey=element<HTMLInputElement>('transfer-private-key');
 const created=element<HTMLElement>('transfer-created'),link=element<HTMLTextAreaElement>('transfer-link'),qr=element<HTMLCanvasElement>('transfer-qr'),status=element<HTMLElement>('transfer-status');
 const displayedCode=element<HTMLInputElement>('transfer-code'),displayedKey=element<HTMLInputElement>('transfer-generated-key');
 let busy=false,expiresAt='',caseGeneration=0;
 const setBusy=(value:boolean)=>{busy=value;create.disabled=value;receive.disabled=value;reference.disabled=value;privateKey.disabled=value;form.setAttribute('aria-busy',String(value));};
 const renderExpiry=()=>{if(!expiresAt)return;const expires=new Date(expiresAt).toLocaleString(lang()==='hi'?'hi-IN':'en-IN',{dateStyle:'medium',timeStyle:'short'});setMessage(element('transfer-expiry'),'transfer.expires',{expires});};
 const clearSecret=()=>{link.value='';displayedCode.value='';displayedKey.value='';displayedKey.type='password';created.hidden=true;expiresAt='';qr.getContext('2d')?.clearRect(0,0,qr.width,qr.height);};
 const showError=(error:unknown)=>{
  const key=error instanceof ApiFailure?error.messageKey:error instanceof TransferError?error.kind==='large'?'transfer.tooLarge':error.kind==='unsupported'?'transfer.unsupported':error.kind==='decrypt'?'transfer.decryptFailed':'transfer.invalid':'transfer.requestFailed';
  setMessage(status,key);
 };
 const useFragment=()=>{const value=takeFragment()||incomingFragment;incomingFragment='';if(value){reference.value=value;privateKey.value='';panel.open=true;setMessage(status,'transfer.ready');}};
 useFragment();window.addEventListener('hashchange',()=>{caseGeneration++;useFragment();});window.addEventListener('languagechange',renderExpiry);
 window.addEventListener('casechange',()=>{caseGeneration++;clearSecret();setMessage(status,null);});
 create.addEventListener('click',async()=>{
  if(busy)return;const generation=caseGeneration;
  setBusy(true);clearSecret();setMessage(status,'transfer.creating');
  try{
   const backup=getBackup();if(!backup){setMessage(status,'transfer.noCase');return;}
   const encrypted=await encryptBackup(backup);
   if(generation!==caseGeneration){setMessage(status,'transfer.caseChanged');return;}
   // Only authenticated ciphertext is sent; the key remains in this closure.
   const result=await transferRequest('/api/transfers',{ciphertext:encrypted.ciphertext},'transfer_create',()=>generation===caseGeneration);
   if(generation!==caseGeneration){setMessage(status,'transfer.caseChanged');return;}
   if(typeof result.code!=='string'||!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(result.code))throw new ApiFailure('transfer.requestFailed');
   expiresAt=expiration(result.expires_at);displayedCode.value=result.code;displayedKey.value=encrypted.key;link.value=transferLink({code:result.code,key:encrypted.key},location.origin);
   drawQr(qr,link.value);created.hidden=false;renderExpiry();setMessage(status,'transfer.created');
  }catch(error){clearSecret();showError(error);}finally{setBusy(false);}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const generation=caseGeneration;setBusy(true);setMessage(status,'transfer.receiving');
  try{
   const parsed=parseTransferReference(reference.value,privateKey.value);
   const result=await transferRequest('/api/transfers/lookup',{code:parsed.code},'transfer_lookup',()=>generation===caseGeneration);
   if(typeof result.ciphertext!=='string'||!Number.isInteger(result.attempts_remaining)||(result.attempts_remaining as number)<0||(result.attempts_remaining as number)>2)throw new ApiFailure('transfer.requestFailed');
   expiration(result.expires_at);
   const backup=await decryptBackup(result.ciphertext,parsed.key);
   if(generation!==caseGeneration){setMessage(status,'transfer.caseChanged');return;}
   reference.value='';privateKey.value='';
   // This callback opens the existing restore preview; it never saves directly.
   previewBackup(backup);setMessage(status,'transfer.previewReady',{remaining:result.attempts_remaining as number});
  }catch(error){showError(error);}finally{setBusy(false);}
 });
 element<HTMLButtonElement>('transfer-copy').addEventListener('click',async()=>{if(!link.value)return;try{await navigator.clipboard.writeText(link.value);setMessage(status,'transfer.copied');}catch{link.focus();link.select();setMessage(status,'transfer.copyManual');}});
 element<HTMLButtonElement>('transfer-copy-key').addEventListener('click',async()=>{if(!displayedKey.value)return;try{await navigator.clipboard.writeText(displayedKey.value);setMessage(status,'transfer.keyCopied');}catch{displayedKey.type='text';displayedKey.focus();displayedKey.select();setMessage(status,'transfer.keyCopyManual');}});
 element<HTMLButtonElement>('transfer-clear').addEventListener('click',()=>{clearSecret();setMessage(status,'transfer.hidden');});
 window.addEventListener('pagehide',()=>{clearSecret();reference.value='';privateKey.value='';incomingFragment='';});
 setBusy(false);
}
