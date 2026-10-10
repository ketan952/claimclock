import {chromium,devices} from '@playwright/test';
import {readFile,writeFile,access,rm} from 'node:fs/promises';
const milestone=process.argv[2]||'m10';
const signal=`.cache/${milestone}-deployed.json`;
await rm(signal,{force:true});
const browser=await chromium.launch();
try{
 const context=await browser.newContext({...devices['Pixel 7']});const page=await context.newPage();
 await page.goto('https://claimclock.ketan952.workers.dev/');
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 const before=await page.locator('meta[name=claimclock-build]').getAttribute('content',{timeout:1000}).catch(()=>null);
 console.log(JSON.stringify({milestone,installed:true,before,waitingFor:signal}));
 for(let i=0;;i++){try{await access(signal);break;}catch{if(i>2400)throw Error('Deployment signal timed out');await new Promise(r=>setTimeout(r,1000));}}
 const {buildId}=JSON.parse(await readFile(signal,'utf8'));
 await page.goto('https://claimclock.ketan952.workers.dev/');
 await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.ready;await reg.update();
  const worker=reg.installing||reg.waiting;
  if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker activation timeout')),30000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}});});
 });
 await page.waitForFunction(async expected=>{
  const worker=navigator.serviceWorker.controller;if(!worker)return false;
  return new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(false);},500);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data===expected);};worker.postMessage('CLAIMCLOCK_BUILD',[channel.port2]);});
 },buildId,{timeout:30000});
 const toast=await page.locator('#update-toast').isVisible();
 await page.goto('https://claimclock.ketan952.workers.dev/');
 const after=await page.locator('meta[name=claimclock-build]').getAttribute('content');
 await page.waitForFunction(expected=>caches.keys().then(keys=>keys.filter(key=>key.startsWith('claimclock-pages-')).every(key=>key===`claimclock-pages-${expected}`)),buildId,{timeout:5000});
 const navigationCaches=await page.evaluate(()=>caches.keys().then(keys=>keys.filter(key=>key.startsWith('claimclock-pages-'))));
 if(navigationCaches.some(key=>key!==`claimclock-pages-${buildId}`))throw Error('Old navigation cache remains');
 if(before!==null&&!toast)throw Error('Updated — reload toast did not appear');
 if(after!==buildId)throw Error(`Second navigation build mismatch: ${after} vs ${buildId}`);
 const result={checked_at:new Date().toISOString(),milestone,before,expected:buildId,after,secondNavigationPassed:true,updateToastVisible:toast,toastApplicable:before!==null,navigationCaches};
 await writeFile(`qa/${milestone}-worker-update.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
