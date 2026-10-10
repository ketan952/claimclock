import {test,expect} from '@playwright/test';
// Only synthetic reports; trace capture is disabled so erasure tokens are not retained.
test.use({trace:'off'});
test('live Privacy form restores a deletion code, erases the report and saves analytics choice',async({page})=>{
 test.skip(process.env.QA_LIVE_REPORTS!=='1','Requires explicit live synthetic-report QA run.');
 let report:{id:string;erase_token:string}|null=null;
 await page.goto('/');
 try{
  const result=await page.evaluate(async()=>{
   const response=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({insurer:'prudential-hcl',tpa:null,city:'Testcity',request_type:'preauth',submitted_at:'2025-11-01T10:00:00Z',decided_at:'2025-11-01T10:30:00Z',outcome:'approved',consent_version:'2026-10-10',consent:true,adult:true})});
   if(response.status!==201)return {status:response.status,report:null};
   const report=await response.json();localStorage.setItem('claimclock:erase',JSON.stringify(report));return {status:response.status,report};
  });
  expect(result.status).toBe(201);report=result.report;expect(Boolean(report?.id&&report?.erase_token)).toBe(true);
  await page.goto('/privacy/');
  await expect(page.locator('#erase-report button')).toBeEnabled();
  const value=await page.locator('#erase-report [name=code]').inputValue();expect(value===`${report!.id}:${report!.erase_token}`).toBe(true);
  await page.click('#erase-report button');await expect(page.locator('#erase-status')).toHaveText('Report erased.');
  expect(await page.evaluate(()=>localStorage.getItem('claimclock:erase'))).toBeNull();
  await page.check('#analytics-consent');expect(await page.evaluate(()=>localStorage.getItem('claimclock:analytics'))).toBe('yes');
  await page.uncheck('#analytics-consent');expect(await page.evaluate(()=>localStorage.getItem('claimclock:analytics'))).toBe('no');
  await page.screenshot({path:'qa/screenshots/privacy-erased.png',fullPage:true});
 }finally{
  if(report)await page.evaluate(async({id,erase_token})=>{await fetch(`/api/reports/${id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({erase_token})});localStorage.removeItem('claimclock:erase');},report);
 }
});
