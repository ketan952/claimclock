import {test,expect,chromium,type Download} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('installed worker preserves online query pages, genuine 404 and network-only source redirects',async({page,context,baseURL})=>{
 test.setTimeout(90000);
 test.skip(!process.env.QA_BASE_URL,'The static preview has no redirect or custom 404 rules.');
 await page.goto('/');await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 const build=await page.locator('meta[name=claimclock-build]').getAttribute('content');expect(build).toMatch(/^[a-f0-9]{16}$/);
 await page.goto('/?utm_source=whatsapp');await expect(page.locator('#intro h1')).toHaveText('A clock on your side.');
 await page.goto('/index/star-health/?x=1');await expect(page.locator('h1')).toContainText('Star');
 const missing=await page.goto('/does-not-exist/');expect(missing?.status()).toBe(404);await expect(page.locator('h1')).toHaveText('Page not found');
 // Full Chromium can render a primary PDF; the lightweight test shell downloads it.
 const sourceBrowser=await chromium.launch({channel:'chromium'});
 try{
  const sourceContext=await sourceBrowser.newContext({viewport:{width:1440,height:1000}});const sourcePage=await sourceContext.newPage();
  await sourcePage.goto(baseURL!);await sourcePage.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  const redirected=sourcePage.waitForResponse(r=>r.url().includes('/s/health-mc-2024')&&r.status()===302);
  const sourceRequest=sourcePage.waitForRequest(r=>new URL(r.url()).hostname==='irdai.gov.in');
  let download:Download|undefined;sourcePage.on('download',value=>download=value);
  const nav=sourcePage.goto(new URL('/s/health-mc-2024',baseURL).href).catch(error=>{if(!String(error).includes('Download is starting'))throw error;return null;});
  const [response,request,external]=await Promise.all([redirected,sourceRequest,nav]);
  expect(response.headers().location).toContain('https://irdai.gov.in/');
  if(download){expect(new URL(download.url()).hostname).toBe('irdai.gov.in');expect(await download.failure()).toBeNull();await download.saveAs('.cache/IRDAI-health-circular.pdf');expect((await readFile('.cache/IRDAI-health-circular.pdf')).subarray(0,4).toString()).toBe('%PDF');await sourcePage.goto(pathToFileURL(resolve('.cache/IRDAI-health-circular.pdf')).href+'#page=1&zoom=75');await sourcePage.waitForTimeout(1000);}
  else expect(new URL(sourcePage.url()).hostname).toBe('irdai.gov.in');
  await writeFile('qa/worker-source-navigation.json',JSON.stringify({checked_at:new Date().toISOString(),baseURL,installed:true,build,status:response.status(),location:response.headers().location,followedRequest:request.url(),destinationStatus:external?.status()??null,downloaded:Boolean(download),downloadName:download?.suggestedFilename()??null},null,2)+'\n');
  await sourcePage.screenshot({path:'qa/screenshots/worker-source-irdai.png'});
 }finally{await sourceBrowser.close();}
 // Excluded URLs have no offline fallback even if a matching public page was cached.
 await page.goto('/');await context.setOffline(true);
 await expect(page.goto('/?utm_source=whatsapp')).rejects.toThrow();
 await context.setOffline(false);
});

test('offline unknown page uses offline fallback while a precached page keeps its real content',async({page,context})=>{
 await page.goto('/');await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 await context.setOffline(true);await page.goto('/index/star-health/');await expect(page.locator('h1')).toContainText('Star');
 await page.goto('/not-cached-anywhere/');await expect(page.locator('h1')).toHaveText('You are offline');await context.setOffline(false);
});
