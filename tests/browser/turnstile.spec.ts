import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
test.use({trace:'off'});

test('live protected APIs fail closed on missing and invalid Turnstile tokens',async({page})=>{
 test.setTimeout(90000);
 test.skip(process.env.QA_LIVE_TURNSTILE!=='1','Requires an explicitly enabled production Turnstile fail-path check.');
 // No widget, fetch, or API mocks. Every attempted protected request must fail;
 // it cannot legitimately create a report/transfer or call the AI provider.
 await page.goto('/');
 const config=await page.evaluate(async()=>{
  const response=await fetch('/api/config',{cache:'no-store'}),body=await response.json();
  return {status:response.status,enabled:body.turnstile_enabled,keyPresent:typeof body.turnstile_site_key==='string'&&body.turnstile_site_key.length>0,keys:Object.keys(body).sort()};
 });
 expect(config.status).toBe(200);expect(config.enabled).toBe(true);expect(config.keyPresent).toBe(true);
 expect(config.keys).toEqual(['ai_enabled','model','provider','turnstile_enabled','turnstile_site_key']);
 const results=await page.evaluate(async()=>{
  const bytes=new Uint8Array(30);bytes[0]=1;const ciphertext=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const report={insurer:'prudential-hcl',tpa:null,city:null,request_type:'preauth',submitted_at:'2025-11-01T10:00:00Z',decided_at:'2025-11-01T10:30:00Z',outcome:'approved',consent_version:'2026-10-10',consent:true,adult:true};
  const calls:[string,unknown][]=[['/api/reports',report],['/api/explain',{lines:'Synthetic unexplained deduction | 100',consent:true,language:'en'}],['/api/transfers',{ciphertext}],['/api/transfers/lookup',{code:'00000000'}]];
  const results=[];
  for(const [path,body] of calls)for(const token of [null,'synthetic-invalid-turnstile-token']){
   const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Turnstile-Token':token}:{})},body:JSON.stringify(body)});
   const text=await response.text();
   // Keep unexpected credentials, provider text or identifiers out of artifacts.
   results.push({path,token:token?'invalid':'missing',status:response.status,generic:text===JSON.stringify({error:'Verification failed. Try again.'}),cacheControl:response.headers.get('cache-control')});
  }
  return results;
 });
 expect(results).toHaveLength(8);
 for(const result of results){expect(result.status,`${result.path} ${result.token}`).toBe(403);expect(result.generic,`${result.path} has only generic error`).toBe(true);expect(result.cacheControl).toBe('no-store');}
 await writeFile('qa/turnstile-failures.json',JSON.stringify({checked_at:new Date().toISOString(),base_url:process.env.QA_BASE_URL,mode:'live-public-no-mocks',results},null,2)+'\n');
});

test('live AI explanation verifies a real Turnstile action before one synthetic Free-tier request',async({page})=>{
 test.setTimeout(100000);
 test.skip(process.env.QA_LIVE_TURNSTILE!=='1','Requires explicit live verification and one synthetic free-provider request.');
 await page.goto('/deductions/');await page.selectOption('#deduction-form [name=insurer]','hdfc-ergo');
 await page.fill('#deduction-lines','Unexplained adjustment | 3250');await page.check('#deduction-form [name=confirmed]');await page.click('#deduction-form button');
 await page.click('#prepare-ai');await expect(page.locator('#ai-provider')).toContainText('api.groq.com');
 const preview=await page.locator('#ai-preview').inputValue();await page.check('#ai-form [name=consent]');
 const pending=page.waitForResponse(response=>response.url().endsWith('/api/explain')&&response.request().method()==='POST',{timeout:85000});
 await page.click('#ai-form button');const response=await pending;
 expect(response.status()).toBe(200);expect(Boolean(response.request().headers()['x-turnstile-token'])).toBe(true);
 expect(response.request().postDataJSON()).toEqual({lines:preview,consent:true,language:'en'});
 const body=await response.json();expect(typeof body.explanation).toBe('string');expect(body.explanation.length).toBeGreaterThan(0);expect(body.explanation.length).toBeLessThanOrEqual(1600);
 await expect(page.locator('#ai-output')).toHaveText(body.explanation);
 await writeFile('qa/turnstile-explain.json',JSON.stringify({checked_at:new Date().toISOString(),base_url:process.env.QA_BASE_URL,mode:'live-public-real-turnstile',status:response.status(),synthetic_input_only:true,exact_preview_sent:true,explanation_characters:body.explanation.length},null,2)+'\n');
});
