import type {Page} from '@playwright/test';

export const mockTurnstileConfig={turnstile_enabled:true,turnstile_site_key:'synthetic-browser-site-key'};
/** Call only in tests whose protected endpoint is explicitly mocked as well.
 * Never install this helper in QA_LIVE_REPORTS or QA_LIVE_TRANSFERS cases. */
export async function installMockTurnstile(page:Page,{mockConfig=true}:{mockConfig?:boolean}={}){
 if(mockConfig)await page.context().route('**/api/config',route=>route.fulfill({json:{ai_enabled:false,provider:null,model:null,...mockTurnstileConfig}}));
 await page.addInitScript(()=>{
  let sequence=0;
  const widgets=new Map<string,{action:string;callback:(token:string)=>void}>();
  window.turnstile={
   ready:callback=>callback(),
   render:(_container,options)=>{const id=`synthetic-widget-${++sequence}`;widgets.set(id,options);return id;},
   execute:id=>{const options=widgets.get(id);if(!options)throw Error('Unknown synthetic widget');queueMicrotask(()=>options.callback(`mock-turnstile-${options.action}-${sequence}`));},
   remove:id=>{widgets.delete(id);},
  };
 });
}
