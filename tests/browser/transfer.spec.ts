import {test,expect,type BrowserContext,type Request,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
test.use({trace:'off'});
const live=process.env.QA_LIVE_TRANSFERS==='1';
const CASES_KEY='claimclock:cases:v1';
const sourceCase={format:'claimclock-case',version:1,exportedAt:'2026-10-10T09:00:00.000Z',timeline:{id:'synthetic-transfer-case',insurerId:'hdfc-ergo',hospital:'SYNTHETIC_TRANSFER_HOSPITAL_ONLY',city:'Pune',requestType:'discharge',submittedAt:'2026-10-10T08:00:00.000Z',events:[{id:'e1',at:'2026-10-10T08:15:00.000Z',type:'call',note:'SYNTHETIC_TRANSFER_PRIVATE_NOTE_ONLY'}]},deductions:[{id:'d1',description:'SYNTHETIC_TRANSFER_DEDUCTION_ONLY',amount:1500}]};
const store={version:1,selectedId:sourceCase.timeline.id,cases:[sourceCase]};
type Seen={url:string;method:string;body:string;headers:Record<string,string>};
function observe(context:BrowserContext,seen:Seen[]){context.on('request',(request:Request)=>seen.push({url:request.url(),method:request.method(),body:request.postData()||'',headers:request.headers()}));}
async function mockChallenge(context:BrowserContext){
 await context.route('**/api/config',route=>route.fulfill({json:{turnstile_enabled:true,turnstile_site_key:'local-test-key',ai_enabled:false}}));
 await context.addInitScript(()=>{
  let count=0;const widgets=new Map<string,{callback:(token:string)=>void}>();
  (window as unknown as {turnstile:unknown}).turnstile={ready:(callback:()=>void)=>callback(),render:(_container:HTMLElement,options:{callback:(token:string)=>void})=>{if(location.hash.startsWith('#transfer='))throw Error('Private fragment still visible to challenge');const id=String(++count);widgets.set(id,options);return id;},execute:(id:string)=>queueMicrotask(()=>widgets.get(id)?.callback('mock-turnstile-token')),remove:(id:string)=>widgets.delete(id)};
 });
}
function mockTransferServer(){
 const values=new Map<string,{ciphertext:string;expires_at:string;lookups:number}>();
 const control:{createGate?:Promise<void>;lookupGate?:Promise<void>;status?:number;creates:number;lookups:number}={creates:0,lookups:0};
 return{control,attach:async(context:BrowserContext)=>{
  await mockChallenge(context);
  await context.route('**/api/transfers',async route=>{control.creates++;if(control.createGate)await control.createGate;if(control.status)return route.fulfill({status:control.status,json:{error:'unavailable'}});expect(route.request().headers()['x-turnstile-token']).toBe('mock-turnstile-token');const payload=route.request().postDataJSON();expect(Object.keys(payload)).toEqual(['ciphertext']);const code=`QATEST${String(control.creates).padStart(2,'0')}`,expires_at=new Date(Date.now()+7*86400_000).toISOString();values.set(code,{ciphertext:payload.ciphertext,expires_at,lookups:0});await route.fulfill({json:{code,expires_at}});});
  await context.route('**/api/transfers/lookup',async route=>{control.lookups++;if(control.lookupGate)await control.lookupGate;const payload=route.request().postDataJSON();expect(Object.keys(payload)).toEqual(['code']);const saved=values.get(payload.code);if(!saved||saved.lookups>=3)return route.fulfill({status:404,json:{error:'unavailable'}});saved.lookups++;await route.fulfill({json:{ciphertext:saved.ciphertext,expires_at:saved.expires_at,attempts_remaining:3-saved.lookups}});});
 }};
}
async function seed(context:BrowserContext){await context.addInitScript(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));},{key:CASES_KEY,value:store});}
async function openTransfer(page:Page){await page.locator('#transfer-panel').evaluate((el:HTMLDetailsElement)=>el.open=true);}
async function createLink(page:Page){await openTransfer(page);await page.click('#transfer-create');await expect(page.locator('#transfer-created')).toBeVisible({timeout:70000});return page.locator('#transfer-link').inputValue();}

test('encrypted case transfer round trip uses two independent browser contexts and never sends the key or plaintext',async({browser,baseURL})=>{
 test.setTimeout(360000);if(live)expect(baseURL,'Live transfer QA requires an HTTPS QA_BASE_URL.').toMatch(/^https:\/\//);
 const sender=await browser.newContext(),receiver=await browser.newContext(),seen:Seen[]=[];
 try{
  observe(sender,seen);observe(receiver,seen);await seed(sender);
  if(!live){const server=mockTransferServer();await server.attach(sender);await server.attach(receiver);}
  const from=await sender.newPage(),to=await receiver.newPage();await from.goto(baseURL!);
  const link=await createLink(from),fragment=new URL(link).hash.slice('#transfer='.length),[code,key]=fragment.split('.');
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);expect(key).toHaveLength(43);await expect(from.locator('#transfer-code')).toHaveValue(code);expect(await from.locator('#transfer-generated-key').inputValue()===key).toBe(true);
  expect(await from.locator('#transfer-qr').evaluate((canvas:HTMLCanvasElement)=>{const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;return data.some((v,i)=>i%4===0&&v===0);})).toBe(true);
  // A fresh browser has no source case, account, cookie or local-storage handoff.
  await to.goto(link);await expect(to).toHaveURL(baseURL!.replace(/\/$/,'')+'/');await expect.poll(async()=>await to.locator('#transfer-reference').inputValue()===fragment).toBe(true);
  expect(await to.evaluate(key=>localStorage.getItem(key),CASES_KEY)).toBeNull();
  await to.click('#transfer-receive');await expect(to.locator('#restore-dialog')).toBeVisible({timeout:70000});
  expect(await to.evaluate(key=>localStorage.getItem(key),CASES_KEY)).toBeNull();await expect(to.locator('#restore-summary')).toContainText(sourceCase.timeline.hospital);
  await to.click('#restore-new');await expect(to.locator('#restore-dialog')).not.toBeVisible();
  const restored=await to.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),CASES_KEY);expect(restored.cases).toHaveLength(1);const actual=restored.cases[0];expect({...actual.timeline,id:sourceCase.timeline.id}).toEqual(sourceCase.timeline);expect(actual.deductions).toEqual(sourceCase.deductions);
  // Inspect every outbound request, including third-party challenge traffic.
  for(const request of seen){const text=JSON.stringify(request);for(const secret of [key,sourceCase.timeline.hospital,sourceCase.timeline.events[0].note,sourceCase.deductions[0].description])expect(text.includes(secret),`Secret present in outbound ${new URL(request.url).pathname}`).toBe(false);}
  const posts=seen.filter(r=>r.method==='POST'&&new URL(r.url).pathname.startsWith('/api/transfers'));expect(posts).toHaveLength(2);expect(Object.keys(JSON.parse(posts[0].body))).toEqual(['ciphertext']);expect(JSON.parse(posts[1].body)).toEqual({code});
  let replayStatus:number|null=null;
  if(live){
   const token=posts[1].headers['x-turnstile-token'];expect(Boolean(token)).toBe(true);
   replayStatus=await to.evaluate(async({code,token})=>(await fetch('/api/transfers/lookup',{method:'POST',headers:{'Content-Type':'application/json','X-Turnstile-Token':token},body:JSON.stringify({code}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'})).status,{code,token});
   expect(replayStatus).toBe(403);
   // Fresh challenge tokens still allow the remaining two legitimate lookups.
   for(const remaining of [1,0]){
    await to.fill('#transfer-reference',fragment);await to.click('#transfer-receive');await expect(to.locator('#restore-dialog')).toBeVisible({timeout:70000});await to.click('#restore-cancel');await expect(to.locator('#transfer-status')).toContainText(`Lookups remaining: ${remaining}`);
   }
  }
  for(const request of seen){const text=JSON.stringify(request);for(const secret of [key,sourceCase.timeline.hospital,sourceCase.timeline.events[0].note,sourceCase.deductions[0].description])expect(text.includes(secret)).toBe(false);}
  await from.locator('#transfer-card').screenshot({path:'qa/screenshots/transfer-created.png',mask:[from.locator('[data-transfer-secret]')],maskColor:'#b4c3b9'});
  await to.setViewportSize({width:1100,height:1000});await to.locator('#transfer-panel > summary').click();await to.evaluate(()=>window.scrollTo(0,0));
  await to.screenshot({path:'qa/screenshots/transfer-round-trip.png',scale:'css',mask:[to.locator('[data-transfer-secret]')],maskColor:'#b4c3b9'});
  await writeFile('qa/transfer-round-trip.json',JSON.stringify({checked_at:new Date().toISOString(),mode:live?'live-public-real-turnstile':'mocked-api-and-challenge',base_url:baseURL,independent_contexts:2,request_count:seen.length,transfer_posts:seen.filter(r=>r.method==='POST'&&new URL(r.url).pathname.startsWith('/api/transfers')).length,replayed_token_status:replayStatus,plaintext_or_key_sent:false,preview_before_save:true,restored_events:actual.timeline.events.length,restored_deductions:actual.deductions.length,recipient_restored_screenshot:'qa/screenshots/transfer-round-trip.png',sender_secret_masked_screenshot:'qa/screenshots/transfer-created.png'},null,2)+'\n');
 }finally{await sender.close();await receiver.close();}
});

test('case changes clear private outputs and discard in-flight create or receive results',async({browser,baseURL})=>{
test.setTimeout(60000);
 const context=await browser.newContext();try{
  await seed(context);const server=mockTransferServer();await server.attach(context);const page=await context.newPage();await page.goto(baseURL!);
  const first=await createLink(page);await page.click('#case-new');await expect(page.locator('#transfer-created')).not.toBeVisible();await expect(page.locator('#transfer-link')).toHaveValue('');await expect(page.locator('#transfer-generated-key')).toHaveValue('');
  await page.selectOption('#case-select',sourceCase.timeline.id);
  let release!:()=>void;server.control.createGate=new Promise(resolve=>release=resolve);await page.click('#transfer-create');await expect.poll(()=>server.control.creates).toBe(2);await expect(page.locator('#transfer-create')).toBeDisabled();await page.click('#case-new');release();await expect(page.locator('#transfer-create')).toBeEnabled();await expect(page.locator('#transfer-created')).not.toBeVisible();await expect(page.locator('#transfer-status')).toContainText('selected case changed');
  let releaseLookup!:()=>void;server.control.lookupGate=new Promise(resolve=>releaseLookup=resolve);await page.fill('#transfer-reference',first);await page.click('#transfer-receive');await expect.poll(()=>server.control.lookups).toBe(1);await page.selectOption('#case-select',sourceCase.timeline.id);releaseLookup();await expect(page.locator('#transfer-receive')).toBeEnabled();await expect(page.locator('#restore-dialog')).not.toBeVisible();await expect(page.locator('#transfer-status')).toContainText('selected case changed');
 }finally{await context.close();}
});

test('short ID alone makes no lookup, three retrievals are bounded, and service failures keep the local case',async({browser,baseURL})=>{
test.setTimeout(60000);
 const context=await browser.newContext();try{
  await seed(context);const server=mockTransferServer();await server.attach(context);const page=await context.newPage();await page.goto(baseURL!);const link=await createLink(page),[code,key]=new URL(link).hash.slice('#transfer='.length).split('.');
  await page.fill('#transfer-reference',code);await page.click('#transfer-receive');await expect(page.locator('#transfer-status')).toContainText('complete private key');expect(server.control.lookups).toBe(0);
  await page.fill('#transfer-private-key',key);
  for(let i=0;i<3;i++){await page.fill('#transfer-reference',code);await page.fill('#transfer-private-key',key);await page.click('#transfer-receive');await expect(page.locator('#restore-dialog')).toBeVisible();await page.click('#restore-cancel');}
  await page.fill('#transfer-reference',code);await page.fill('#transfer-private-key',key);await page.click('#transfer-receive');await expect(page.locator('#transfer-status')).toContainText('may have expired');
  for(const [status,text]of [[429,'busy'],[403,'Verification did not complete'],[503,'unavailable right now']]as const){server.control.status=status;await page.click('#transfer-create');await expect(page.locator('#transfer-status')).toContainText(text);await expect(page.locator('#transfer-create')).toBeEnabled();}
  expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),CASES_KEY)).cases).toHaveLength(1);
 }finally{await context.close();}
});
