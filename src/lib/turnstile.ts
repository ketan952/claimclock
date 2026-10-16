/** Loaded only after a visitor chooses an optional server operation. */
export type TurnstileAction = 'reports' | 'explain' | 'transfer_create' | 'transfer_lookup' | 'auth_register' | 'voice' | 'copilot';
type WidgetOptions = {
 sitekey:string; action:TurnstileAction; execution:'execute'; language:'auto';
 'response-field':false; retry:'never'; 'refresh-expired':'never';
 callback:(token:string)=>void; 'error-callback':()=>void;
 'expired-callback':()=>void; 'timeout-callback':()=>void;
 'unsupported-callback':()=>void;
};
type Turnstile = {render:(container:HTMLElement,options:WidgetOptions)=>string; execute:(id:string)=>void; remove:(id:string)=>void; ready:(callback:()=>void)=>void};
declare global {interface Window {turnstile?:Turnstile;claimclockTurnstileReady?:()=>void}}
let loading:Promise<Turnstile>|undefined;
let siteKey:string|undefined;

async function getSiteKey():Promise<string>{
 if(siteKey)return siteKey;
 const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('verification_unavailable');
 const config=await response.json();
 if(config.turnstile_enabled!==true||typeof config.turnstile_site_key!=='string'||!config.turnstile_site_key)throw new Error('verification_unavailable');
 siteKey=config.turnstile_site_key;
 return siteKey!;
}

function loadTurnstile():Promise<Turnstile>{
 if(loading)return loading;
 if(window.turnstile)return Promise.resolve(window.turnstile);
 loading=new Promise<Turnstile>((resolve,reject)=>{
  const script=document.createElement('script');
  const timer=window.setTimeout(fail,15000);
  function fail(){window.clearTimeout(timer);delete window.claimclockTurnstileReady;script.remove();reject(new Error('verification_unavailable'));}
  // The vendor's ready() rejects async/defer scripts. Its explicit onload
  // callback is the supported readiness signal for this lazy-loaded script.
  window.claimclockTurnstileReady=()=>{
   if(!window.turnstile){fail();return;}
   window.clearTimeout(timer);delete window.claimclockTurnstileReady;resolve(window.turnstile);
  };
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=claimclockTurnstileReady';
  script.async=true;script.defer=true;script.referrerPolicy='no-referrer';
  script.addEventListener('error',fail,{once:true});
  document.head.append(script);
 }).catch(error=>{loading=undefined;throw error;});
 return loading;
}

export async function getTurnstileToken(action:TurnstileAction):Promise<string>{
 // A transfer's private fragment must be removed before any third-party script runs.
 if(location.hash.startsWith('#transfer='))throw new Error('transfer_fragment_not_consumed');
 const key=await getSiteKey();
 const turnstile=await loadTurnstile();
 return new Promise((resolve,reject)=>{
  const container=document.createElement('div');container.className='turnstile-check';
  document.body.append(container);
  let id:string|undefined;let settled=false;
  const timer=window.setTimeout(()=>finish(),45000);
  function finish(token?:string){
   if(settled)return;settled=true;window.clearTimeout(timer);
   // A callback can be synchronous in tests; defer removal until render returns.
   queueMicrotask(()=>{try{if(id)turnstile.remove(id);}catch{/* A removed widget must not interrupt the completed request. */}finally{container.remove();}});
   if(token&&token.length<=2048)resolve(token);else reject(new Error('verification_failed'));
  }
  try{
   id=turnstile.render(container,{sitekey:key,action,execution:'execute',language:'auto','response-field':false,retry:'never','refresh-expired':'never',callback:token=>finish(token),'error-callback':()=>finish(),'expired-callback':()=>finish(),'timeout-callback':()=>finish(),'unsupported-callback':()=>finish()});
   turnstile.execute(id);
  }catch{finish();}
 });
}
