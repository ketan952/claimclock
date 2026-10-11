import {test,expect,type Page} from '@playwright/test';
import {mockTurnstileConfig} from './turnstile-helper';
async function delayChallenge(page:Page){
 await page.context().route('**/api/config',route=>route.fulfill({json:{ai_enabled:true,provider:'synthetic',model:'synthetic',...mockTurnstileConfig}}));
 await page.addInitScript(()=>{
  const state=window as unknown as {challengePending:boolean;completeChallenge:()=>void};state.challengePending=false;
  let callback:(token:string)=>void=()=>{};
  window.turnstile={ready:done=>done(),render:(_container,options)=>{callback=options.callback;return 'delayed-synthetic';},execute:()=>{state.challengePending=true;},remove:()=>{state.challengePending=false;}};
  state.completeChallenge=()=>callback('delayed-synthetic-token');
 });
}
const pending=(page:Page)=>page.waitForFunction(()=>(window as unknown as {challengePending:boolean}).challengePending);
const complete=(page:Page)=>page.evaluate(()=>(window as unknown as {completeChallenge:()=>void}).completeChallenge());
const record={id:'synthetic-consent-case',insurerId:'care',hospital:'Synthetic Hospital',city:'Pune',requestType:'discharge',submittedAt:'2019-11-10T06:00:00.000Z',decidedAt:'2019-11-10T08:00:00.000Z',outcome:'approved',events:[]};
test('report consent withdrawal during verification sends nothing and allows a reviewed retry',async({page})=>{
 await delayChallenge(page);let posts=0;await page.context().route('**/api/reports',route=>{posts++;return route.fulfill({status:503,json:{error:'synthetic unavailable'}});});
 await page.goto('/');await page.setInputFiles('#backup-file',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});await page.click('#restore-new');await page.check('#optin-form [name=consent]');await page.click('#optin-form button');await pending(page);await page.uncheck('#optin-form [name=consent]');await complete(page);
 await expect(page.locator('#optin-status')).toContainText('Nothing was sent');await expect(page.locator('#optin-form button')).toBeEnabled();expect(posts).toBe(0);
 await page.check('#optin-form [name=consent]');await page.click('#optin-form button');await pending(page);await page.click('[data-language=hi]');await complete(page);await expect(page.locator('#optin-status')).toContainText('कुछ नहीं भेजा गया');await expect(page.locator('#optin-form button')).toBeEnabled();expect(posts).toBe(0);await page.click('[data-language=en]');
 await page.check('#optin-form [name=consent]');await page.click('#optin-form button');await pending(page);await complete(page);await expect.poll(()=>posts).toBe(1);await expect(page.locator('#optin-form button')).toBeEnabled();
});
test('AI rechecks consent, edited preview, deduction lines and language after delayed verification',async({page})=>{
 await delayChallenge(page);let posts=0;await page.context().route('**/api/explain',route=>{posts++;return route.fulfill({json:{explanation:'Synthetic explanation'}});});
 await page.goto('/deductions/');await page.selectOption('#deduction-form [name=insurer]','care');await page.fill('#deduction-lines','Co-payment | 1500');await page.check('#deduction-form [name=confirmed]');await page.click('#deduction-form button');await page.click('#prepare-ai');
 for(const change of ['consent','preview','lines','language']){
  await page.check('#ai-form [name=consent]');await page.click('#ai-form button');await pending(page);
  if(change==='consent')await page.uncheck('#ai-form [name=consent]');
  if(change==='preview')await page.fill('#ai-preview','Edited synthetic preview: ₹1500');
  if(change==='lines')await page.fill('#deduction-lines','Co-payment | 1600');
  if(change==='language')await page.click('[data-language=hi]');
  await complete(page);await expect(page.locator('#ai-status')).toContainText(change==='language'?'कुछ नहीं भेजा गया':'Nothing was sent');await expect(page.locator('#ai-form button')).toBeEnabled();await expect(page.locator('#ai-form [name=consent]')).not.toBeChecked();expect(posts).toBe(0);
 }
});
