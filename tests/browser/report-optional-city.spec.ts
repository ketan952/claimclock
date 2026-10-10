import {test,expect,type Page} from '@playwright/test';
test.use({trace:'off'});
const localDate=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
async function completedTimeline(page:Page,city=''){
 await page.goto('/');await page.selectOption('#start-form [name=insurer]','hdfc-ergo');
 await page.fill('#start-form [name=city]',city);await page.fill('#start-form [name=submittedAt]',localDate(new Date(Date.now()-4*3600000)));
 await page.click('#start-form button');await page.fill('#finish-form [name=decidedAt]',localDate(new Date(Date.now()-60000)));await page.click('#finish-form button');
 await page.check('#optin-form [name=consent]');
}
test('blank optional city is previewed and sent as null',async({page})=>{
 let payload:Record<string,unknown>|undefined;
 await page.route('**/api/reports',route=>{payload=route.request().postDataJSON();return route.fulfill({status:201,json:{id:'synthetic-report',erase_token:'synthetic-code'}});});
 await completedTimeline(page);await page.click('#report-exact summary');await expect(page.locator('#report-preview')).toContainText('"city": null');
 await page.click('#optin-form button');await expect(page.locator('#optin-status')).toContainText('Report received');expect(payload?.city).toBeNull();expect(payload).not.toHaveProperty('hospital');
});
test('400 names and highlights the rejected field; correcting it preserves the timeline',async({page})=>{
 await page.route('**/api/reports',route=>route.fulfill({status:400,json:{error:'Invalid request.',field:'city'}}));
 await completedTimeline(page,'Room 123');const before=await page.evaluate(()=>localStorage.getItem('claimclock:timeline:v1'));
 await page.click('#optin-form button');await expect(page.locator('#optin-status')).toContainText('City');await expect(page.locator('#start-form [name=city]')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#start-form [name=city]')).toBeFocused();
 expect(await page.evaluate(()=>localStorage.getItem('claimclock:timeline:v1'))).toBe(before);
 await page.fill('#start-form [name=city]','Delhi');await page.click('[data-language=hi]');await expect(page.locator('#start-error')).toContainText('शहर');await expect(page.locator('#optin-status')).toContainText('शहर');await expect(page.locator('#start-form [name=city]')).toHaveValue('Delhi');
 await page.fill('#start-form [name=city]','');await page.click('#start-form button');await expect(page.locator('#start-form [name=city]')).not.toHaveAttribute('aria-invalid','true');await expect(page.locator('#optin-section')).toBeVisible();
});
test('quota, server and network errors use distinct safe retry copy without deleting the timeline',async({page})=>{
 let status:number|null=429;
 await page.route('**/api/reports',route=>status===null?route.abort():route.fulfill({status,json:{error:'Sensitive backend detail'}}));
 await completedTimeline(page);const before=await page.evaluate(()=>localStorage.getItem('claimclock:timeline:v1'));
 for(const code of [429,503,null]){status=code;await page.click('#optin-form button');await expect(page.locator('#optin-status')).toHaveText(code===429?'Busy. Try later. Your timeline is safe.':'Not sent. Your timeline is safe. Try later.');await expect(page.locator('#optin-form button')).toBeEnabled();expect(await page.evaluate(()=>localStorage.getItem('claimclock:timeline:v1'))).toBe(before);}
});
test('published escalation stages open on clock breach and respect a later manual collapse',async({page})=>{
 await page.clock.install();await page.goto('/');await page.selectOption('#start-form [name=insurer]','hdfc-ergo');await page.selectOption('#start-form [name=requestType]','preauth');await page.fill('#start-form [name=submittedAt]',localDate(new Date(Date.now()-59*60000)));await page.click('#start-form button');
 const stages=page.locator('details[data-contact-escalation="hdfc-ergo"]');await expect(stages).not.toHaveAttribute('open','');await page.clock.fastForward(2*60000);await expect(stages).toHaveAttribute('open','');await expect(page.locator('.contact-baseline')).not.toHaveAttribute('open','');
 await page.click('[data-language=hi]');await expect(stages).toHaveAttribute('open','');await stages.locator('summary').click();await page.clock.fastForward(2000);await expect(stages).not.toHaveAttribute('open','');await page.click('[data-language=en]');await expect(stages).not.toHaveAttribute('open','');
});
test('live blank-city UI report returns a deletion code and Privacy erases it',async({page})=>{
 test.skip(process.env.QA_LIVE_REPORTS!=='1','Requires explicit live synthetic-report QA run after migration0002.');
 let receipt:{id:string;erase_token:string}|null=null;
 try{
  await completedTimeline(page);
  // Use the already-suppressed historical synthetic cohort, never a current public cell.
  await page.evaluate(()=>{const timeline=JSON.parse(localStorage.getItem('claimclock:timeline:v1')!);Object.assign(timeline,{insurerId:'prudential-hcl',requestType:'preauth',submittedAt:'2025-11-10T06:00:00.000Z',decidedAt:'2025-11-10T08:00:00.000Z'});localStorage.setItem('claimclock:timeline:v1',JSON.stringify(timeline));});
  await page.reload();await page.check('#optin-form [name=consent]');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/reports')&&response.request().method()==='POST');
  await page.click('#optin-form button');const response=await responsePromise;expect(response.status()).toBe(201);receipt=await response.json();
  expect(response.request().postDataJSON().city).toBeNull();await expect(page.locator('#deletion-receipt')).toBeVisible();
  await page.locator('#optin-section').screenshot({path:'qa/screenshots/blank-city-report-sent.png',mask:[page.locator('#deletion-code')]});
  await page.goto('/privacy/');await expect(page.locator('#erase-report button')).toBeEnabled();await page.click('#erase-report button');await expect(page.locator('#erase-status')).toHaveText('Report erased.');expect(await page.evaluate(()=>localStorage.getItem('claimclock:erase'))).toBeNull();
  await page.screenshot({path:'qa/screenshots/blank-city-report-erased.png',fullPage:true,mask:[page.locator('#erase-report [name=code]')]});
 }finally{if(receipt)await page.evaluate(async value=>{await fetch(`/api/reports/${value.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({erase_token:value.erase_token})});localStorage.removeItem('claimclock:erase');},receipt);}
});
