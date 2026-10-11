import {test,expect} from '@playwright/test';

test('lazy Turnstile uses the vendor onload callback and reuses its loaded API on retry',async({page})=>{
 let scripts=0,posts=0;const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().route('**/api/config',route=>route.fulfill({json:{ai_enabled:false,turnstile_enabled:true,turnstile_site_key:'synthetic-loader-key'}}));
 await page.context().route('https://challenges.cloudflare.com/turnstile/v0/api.js?*',route=>{
  scripts++;
  return route.fulfill({contentType:'application/javascript',body:`
   const vendorScript=document.currentScript;
   const callbackName=new URL(vendorScript.src).searchParams.get('onload');
   let sequence=0;const widgets=new Map();
   window.turnstile={
    ready(){throw Error('Remove async/defer before using turnstile.ready()');},
    render(container,options){const id=String(++sequence);widgets.set(id,options);return id;},
    execute(id){queueMicrotask(()=>widgets.get(id).callback('synthetic-loader-token'));},
    remove(id){widgets.delete(id);}
   };
   if(callbackName)window[callbackName]();
  `});
 });
 await page.context().route('**/api/reports',route=>{posts++;expect(route.request().headers()['x-turnstile-token']).toBe('synthetic-loader-token');return route.fulfill({status:503,json:{error:'synthetic unavailable'}});});
 await page.goto('/');expect(scripts).toBe(0);
 const timeline={id:'synthetic-loader-case',insurerId:'care',hospital:'Synthetic',city:'',requestType:'preauth',submittedAt:'2025-11-01T10:00:00.000Z',decidedAt:'2025-11-01T10:30:00.000Z',outcome:'approved',events:[]};
 await page.setInputFiles('#backup-file',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(timeline))});await page.click('#restore-new');await page.check('#optin-form [name=consent]');
 for(let attempt=1;attempt<=2;attempt++){
  await page.click('#optin-form button');await expect.poll(()=>posts).toBe(attempt);await expect(page.locator('#optin-form button')).toBeEnabled();
  await expect(page.locator('#optin-status')).toContainText('Your timeline is safe');await expect(page.locator('.turnstile-check')).toHaveCount(0);
 }
 expect(scripts).toBe(1);expect(errors).toEqual([]);
});
