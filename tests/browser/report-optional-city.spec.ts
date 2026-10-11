import {test,expect,type Page} from '@playwright/test';
import {installMockTurnstile} from './turnstile-helper';
test.use({trace:'off'});
const casesKey='claimclock:cases:v1';
const localDate=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
async function completedTimeline(page:Page,city=''){
 await page.goto('/');await page.selectOption('#start-form [name=insurer]','hdfc-ergo');
 await page.fill('#start-form [name=city]',city);await page.fill('#start-form [name=submittedAt]',localDate(new Date(Date.now()-4*3600000)));
 await page.click('#start-form button');await page.fill('#finish-form [name=decidedAt]',localDate(new Date(Date.now()-60000)));await page.click('#finish-form button');
 await page.check('#optin-form [name=consent]');
}
test('blank optional city is previewed and sent as null',async({page})=>{
 await installMockTurnstile(page);
 let payload:Record<string,unknown>|undefined;
 await page.route('**/api/reports',route=>{expect(route.request().headers()['x-turnstile-token']).toContain('mock-turnstile-reports-');payload=route.request().postDataJSON();return route.fulfill({status:201,json:{id:'00000000-0000-4000-8000-000000000001',erase_token:'a'.repeat(64)}});});
 await completedTimeline(page);await page.click('#report-exact summary');await expect(page.locator('#report-preview')).toContainText('"city": null');
 await page.click('#optin-form button');await expect(page.locator('#optin-status')).toContainText('Report received');expect(payload?.city).toBeNull();expect(payload).not.toHaveProperty('hospital');
});
test('400 names and highlights the rejected field; correcting it preserves the timeline',async({page})=>{
 await installMockTurnstile(page);
 await page.route('**/api/reports',route=>route.fulfill({status:400,json:{error:'Invalid request.',field:'city'}}));
 await completedTimeline(page,'Room 123');const before=await page.evaluate(key=>localStorage.getItem(key),casesKey);
 await page.click('#optin-form button');await expect(page.locator('#optin-status')).toContainText('City');await expect(page.locator('#start-form [name=city]')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#start-form [name=city]')).toBeFocused();
 expect(await page.evaluate(key=>localStorage.getItem(key),casesKey)).toBe(before);
 await page.fill('#start-form [name=city]','Delhi');await page.click('[data-language=hi]');await expect(page.locator('#start-error')).toContainText('शहर');await expect(page.locator('#optin-status')).toContainText('शहर');await expect(page.locator('#start-form [name=city]')).toHaveValue('Delhi');
 await page.fill('#start-form [name=city]','');await page.click('#start-form button');await expect(page.locator('#start-form [name=city]')).not.toHaveAttribute('aria-invalid','true');await expect(page.locator('#optin-section')).toBeVisible();
});
test('quota, server and network errors use distinct safe retry copy without deleting the timeline',async({page})=>{
 await installMockTurnstile(page);
 let status:number|null=429;
 await page.route('**/api/reports',route=>status===null?route.abort():route.fulfill({status,json:{error:'Sensitive backend detail'}}));
 await completedTimeline(page);const before=await page.evaluate(key=>localStorage.getItem(key),casesKey);
 for(const code of [429,503,null]){status=code;await page.click('#optin-form button');await expect(page.locator('#optin-status')).toHaveText(code===429?'Busy. Try later. Your timeline is safe.':'Not sent. Your timeline is safe. Try later.');await expect(page.locator('#optin-form button')).toBeEnabled();expect(await page.evaluate(key=>localStorage.getItem(key),casesKey)).toBe(before);}
});
test('published escalation stages open on clock breach and respect a later manual collapse',async({page})=>{
 await page.clock.install();await page.goto('/');await page.selectOption('#start-form [name=insurer]','hdfc-ergo');await page.selectOption('#start-form [name=requestType]','preauth');await page.fill('#start-form [name=submittedAt]',localDate(new Date(Date.now()-59*60000)));await page.click('#start-form button');
 const stages=page.locator('details[data-contact-escalation="hdfc-ergo"]');await expect(stages).not.toHaveAttribute('open','');await page.clock.fastForward(2*60000);await expect(stages).toHaveAttribute('open','');await expect(page.locator('.contact-baseline')).not.toHaveAttribute('open','');
 await page.click('[data-language=hi]');await expect(stages).toHaveAttribute('open','');await stages.locator('summary').click();await page.clock.fastForward(2000);await expect(stages).not.toHaveAttribute('open','');await page.click('[data-language=en]');await expect(stages).not.toHaveAttribute('open','');
});
test('live blank-city UI report returns a deletion code and Privacy erases it',async({page})=>{
 test.setTimeout(90000);
 test.skip(process.env.QA_LIVE_REPORTS!=='1','Requires explicit live synthetic-report QA run after migration0002.');
 let receipt:{id:string;erase_token:string}|null=null;
 try{
  await completedTimeline(page);
  // Use the already-suppressed historical synthetic cohort, never a current public cell.
  await page.evaluate(key=>{const store=JSON.parse(localStorage.getItem(key)!);const timeline=store.cases.find((c:{timeline:{id:string}})=>c.timeline.id===store.selectedId).timeline;Object.assign(timeline,{insurerId:'prudential-hcl',requestType:'preauth',submittedAt:'2025-11-10T06:00:00.000Z',decidedAt:'2025-11-10T08:00:00.000Z'});localStorage.setItem(key,JSON.stringify(store));},casesKey);
  await page.reload();await page.check('#optin-form [name=consent]');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/reports')&&response.request().method()==='POST',{timeout:75000});
  await page.click('#optin-form button');const response=await responsePromise;expect(response.status()).toBe(201);receipt=await response.json();
  expect(response.request().postDataJSON().city).toBeNull();await expect(page.locator('#deletion-receipt')).toBeVisible();
  await page.locator('#optin-section').screenshot({path:'qa/screenshots/blank-city-report-sent.png',mask:[page.locator('#deletion-code')]});
  await page.goto('/privacy/');await expect(page.locator('#erase-report button[type=submit]')).toBeEnabled();await page.click('#erase-report button[type=submit]');await expect(page.locator('#erase-status')).toHaveText('Report erased.');expect(await page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('claimclock:receipts:v1')||'{}').receipts?.[id]),receipt!.id)).toBe(false);
  await page.screenshot({path:'qa/screenshots/blank-city-report-erased.png',fullPage:true,mask:[page.locator('#erase-report [name=code]')]});
 }finally{if(receipt)await page.evaluate(async value=>{const response=await fetch(`/api/reports/${value.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({erase_token:value.erase_token})});const raw=localStorage.getItem('claimclock:receipts:v1');if(response.ok&&(await response.json()).erased===true&&raw){const registry=JSON.parse(raw);if(registry.receipts?.[value.id]?.erase_token===value.erase_token){delete registry.receipts[value.id];localStorage.setItem('claimclock:receipts:v1',JSON.stringify(registry));}}},receipt);}
});
