import {test,expect} from '@playwright/test';
// Only synthetic reports; trace capture is disabled so erasure tokens are not retained.
test.use({trace:'off'});
const localDate=(value:string)=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
test('live Privacy form restores a deletion code, erases the report and saves analytics choice',async({page})=>{
 test.setTimeout(90000);
 test.skip(process.env.QA_LIVE_REPORTS!=='1','Requires explicit live synthetic-report QA run.');
 let report:{id:string;erase_token:string}|null=null;
 await page.goto('/');
 try{
  // Exercise the real widget and report UI. This historical synthetic cohort is
  // already suppressed; never erase a report in a live public cohort for QA.
  const timeline={id:'synthetic-historical-privacy',insurerId:'prudential-hcl',hospital:'Synthetic QA hospital',city:'Testcity',requestType:'preauth',submittedAt:'2025-11-01T10:00:00.000Z',events:[]};
  await page.setInputFiles('#backup-file',{name:'synthetic-historical-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(timeline))});await expect(page.locator('#restore-dialog')).toBeVisible();await page.click('#restore-new');
  await page.fill('#finish-form [name=decidedAt]',localDate('2025-11-01T10:30:00Z'));await page.click('#finish-form button');await page.check('#optin-form [name=consent]');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/reports')&&response.request().method()==='POST',{timeout:75000});await page.click('#optin-form button');const response=await responsePromise;
  expect(response.status()).toBe(201);report=await response.json();expect(Boolean(report?.id&&report?.erase_token)).toBe(true);
  await page.goto('/privacy/');
  await expect(page.locator('#erase-report button[type=submit]')).toBeEnabled();
  const value=await page.locator('#erase-report [name=code]').inputValue();expect(value===`${report!.id}:${report!.erase_token}`).toBe(true);
  await page.click('#erase-report button[type=submit]');await expect(page.locator('#erase-status')).toHaveText('Report erased.');
  expect(await page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('claimclock:receipts:v1')||'{}').receipts?.[id]),report!.id)).toBe(false);
  await page.check('#analytics-consent');expect(await page.evaluate(()=>localStorage.getItem('claimclock:analytics'))).toBe('yes');
  await page.uncheck('#analytics-consent');expect(await page.evaluate(()=>localStorage.getItem('claimclock:analytics'))).toBe('no');
  await page.screenshot({path:'qa/screenshots/privacy-erased.png',fullPage:true});
 }finally{
  if(report)await page.evaluate(async({id,erase_token})=>{const response=await fetch(`/api/reports/${id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({erase_token})});const raw=localStorage.getItem('claimclock:receipts:v1');if(response.ok&&(await response.json()).erased===true&&raw){const registry=JSON.parse(raw);if(registry.receipts?.[id]?.erase_token===erase_token){delete registry.receipts[id];localStorage.setItem('claimclock:receipts:v1',JSON.stringify(registry));}}},report);
 }
});
