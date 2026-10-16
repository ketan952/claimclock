import {test,expect,type Page} from '@playwright/test';
import {installMockTurnstile,mockTurnstileConfig} from './turnstile-helper';

// ClaimClock Voice against Chromium's fake microphone and a scripted assistant API. The Worker's
// own validation is covered by tests/voice.test.ts and the tools by tests/voice-agent.test.ts;
// this proves the browser side: consent before any microphone access, push-to-talk recording,
// transcription → tool → card → spoken reply, the identifier-free request, typed and Hindi paths,
// error handling and the clock hook on the hospital page.
test.use({launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}});

const vault={format:'claimclock-vault',version:1,updatedAt:'2026-10-16T00:00:00.000Z',profile:{name:'Ramesh Kumar',city:'Pune',language:'en'},
 members:[{id:'m-self',name:'Ramesh Kumar',relation:'self',birthYear:1980},{id:'m-spouse',name:'Sunita Kumar',relation:'spouse',birthYear:1983}],
 policies:[{id:'p-star',kind:'health',insurerId:'star-health',planId:'star-comprehensive',policyNumber:'P/700001/01/2026/004321',sumInsured:1000000,inceptionDate:'2024-10-01',continuityFrom:'2021-05-12',renewalDate:'2027-09-30',memberIds:['m-self','m-spouse'],uhid:'UH-99887'}],
 defaultPolicyId:'p-star',cases:[]};
const identifiers=/Ramesh|Sunita|P\/700001|UH-99887/;
type Script=(body:{messages:{role:string;content?:string|null;name?:string}[]})=>Record<string,unknown>;
async function setup(page:Page,{ai=true,voice=true,script,transcript='Will my policy pay for my wife\'s full body check-up?'}:{ai?:boolean;voice?:boolean;script?:Script;transcript?:string}={}){
 const seen={config:0,media:0,transcribe:[] as {type:string;consent:string|null;token:string|null;language:string|null;bytes:number}[],copilot:[] as Record<string,unknown>[],spoken:[] as string[],cancelled:0};
 await installMockTurnstile(page,{mockConfig:false});
 await page.route('**/api/config',route=>{seen.config++;return route.fulfill({json:{ai_enabled:ai,provider:ai?'api.groq.com':null,model:ai?'openai/gpt-oss-120b':null,voice_enabled:ai&&voice,stt_model:ai&&voice?'whisper-large-v3-turbo':null,...mockTurnstileConfig}});});
 await page.route('**/api/voice/transcribe',async route=>{const request=route.request();seen.transcribe.push({type:request.headers()['content-type']||'',consent:request.headers()['x-voice-consent']||null,token:request.headers()['x-turnstile-token']||null,language:request.headers()['x-voice-language']||null,bytes:request.postDataBuffer()?.byteLength||0});await route.fulfill({json:{text:transcript,advisory_only:true}});});
 await page.route('**/api/copilot',async route=>{const body=route.request().postDataJSON();seen.copilot.push(body);const reply=script?script(body):{reply:'Hello.',tool_calls:[]};if('status' in reply)return route.fulfill({status:reply.status as number,json:{error:'busy'}});await route.fulfill({json:{...reply,advisory_only:true}});});
 await page.addInitScript((value)=>{localStorage.setItem('claimclock:vault:v1',JSON.stringify(value));},vault);
 await page.addInitScript(()=>{
  const w=window as unknown as {__voice:{media:number;spoken:string[];cancelled:number}};w.__voice={media:0,spoken:[],cancelled:0};
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=(constraints)=>{w.__voice.media++;return original(constraints);};
  const synth={speak:(u:SpeechSynthesisUtterance)=>{w.__voice.spoken.push(u.text);setTimeout(()=>u.dispatchEvent(new Event('end')),40);},cancel:()=>{w.__voice.cancelled++;},getVoices:()=>[],pending:false,speaking:false,paused:false,pause(){},resume(){},addEventListener(){},removeEventListener(){},onvoiceschanged:null};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
 });
 const probe=async()=>page.evaluate(()=>(window as unknown as {__voice:{media:number;spoken:string[];cancelled:number}}).__voice);
 return {seen,probe};
}
const benefitScript:Script=body=>{
 const last=body.messages[body.messages.length-1];
 if(last.role==='tool')return {reply:'Yes — your wife’s check-up is available this policy year, booked as cashless through the insurer.',tool_calls:[]};
 return {reply:null,tool_calls:[{id:'call_1',name:'check_policy_benefit',arguments:{topic:'health_checkup',member:'spouse'}}]};
};

test('the microphone is never opened before consent; a push-to-talk turn is transcribed, grounded without identifiers, answered through a tool card and spoken',async({page})=>{
 test.setTimeout(60000);
 const {seen,probe}=await setup(page,{script:benefitScript});
 await page.goto('/check-coverage/');
 await expect(page.locator('#voice-launch')).toBeVisible();
 await page.click('#voice-launch');
 const dialog=page.locator('#voice-dialog');await expect(dialog).toBeVisible();
 await expect(page.locator('#voice-consent')).toBeVisible();
 await expect(page.locator('#voice-processor')).toContainText('whisper-large-v3-turbo');await expect(page.locator('#voice-processor')).toContainText('openai/gpt-oss-120b');
 await expect(page.locator('#voice-consent')).toContainText('never names, policy numbers, UHIDs or claim numbers');
 await expect(page.locator('#voice-start')).toBeDisabled();await expect(page.locator('#voice-text-only')).toBeDisabled();
 expect((await probe()).media).toBe(0);
 await page.check('#voice-consent-box');
 await expect(page.locator('#voice-start')).toBeEnabled();
 expect((await probe()).media).toBe(0);
 await page.evaluate(()=>{(document.getElementById('voice-handsfree') as HTMLInputElement).checked=false;});
 await page.click('#voice-start');
 await expect(page.locator('#voice-session')).toBeVisible();
 await expect.poll(async()=>(await probe()).media).toBe(1);
 await expect(page.locator('#voice-state')).toHaveText('Tap to talk, or type below');
 await expect(page.locator('#voice-talk')).toBeEnabled();
 await page.click('#voice-talk');
 await expect(page.locator('#voice-state')).toContainText('I’m listening');await expect(page.locator('#voice-talk')).toHaveText('Tap to send');
 await page.waitForTimeout(1500);
 await page.click('#voice-talk');
 await expect(page.locator('#voice-log li.user')).toHaveText('Will my policy pay for my wife\'s full body check-up?',{timeout:15000});
 await expect(page.locator('#voice-log li.assistant')).toContainText('available this policy year',{timeout:15000});
 await expect(page.locator('#voice-state')).toHaveText('Tap to talk, or type below');
 expect(seen.transcribe).toHaveLength(1);
 expect(seen.transcribe[0].type.startsWith('audio/')).toBe(true);expect(seen.transcribe[0].consent).toBe('true');expect(seen.transcribe[0].token).toMatch(/^mock-turnstile-voice/);expect(seen.transcribe[0].language).toBeNull();
 expect(seen.transcribe[0].bytes).toBeGreaterThan(1024);
 expect(seen.copilot).toHaveLength(2);
 const first=seen.copilot[0] as {messages:{role:string}[];context:{policies:{planId:string;members:string[]}[];members:{relation:string;age:number}[];page:string};language:string;consent:boolean};
 expect(first.language).toBe('en');expect(first.consent).toBe(true);expect(first.context.page).toBe('/check-coverage/');
 expect(first.context.policies[0].planId).toBe('star-comprehensive');expect(first.context.policies[0].members).toEqual(['self','spouse']);expect(first.context.members[1].relation).toBe('spouse');
 expect(JSON.stringify(seen.copilot)).not.toMatch(identifiers);
 const second=seen.copilot[1] as {messages:{role:string;name?:string;content?:string|null}[]};
 expect(second.messages.map(m=>m.role)).toEqual(['user','assistant','tool']);expect(second.messages[2].name).toBe('check_policy_benefit');
 expect(JSON.parse(second.messages[2].content as string).status).toMatch(/available|needs_claim_free_year/);
 const card=page.locator('#voice-cards .voice-card');await expect(card).toHaveCount(1);await expect(card).toContainText('full-body check-up');await expect(card.locator('a[href="/check-coverage/"]')).toBeVisible();await expect(card.locator('a[href^="https://"]')).toContainText('verified');
 await expect.poll(async()=>(await probe()).spoken.join(' ')).toContain('available this policy year');
 await page.click('#voice-close');
 await expect(dialog).not.toBeVisible();
 await page.click('#voice-launch');
 await expect(page.locator('#voice-session')).toBeVisible();
 await expect(page.locator('#voice-consent')).toBeHidden();
 await expect(page.locator('#voice-log li')).toHaveCount(0);await expect(page.locator('#voice-cards .voice-card')).toHaveCount(0);
 await expect.poll(async()=>(await probe()).media).toBe(2);
});

test('typed questions work without a microphone, Hindi labels follow the interface language, and the clock tool updates the hospital page',async({page})=>{
 test.setTimeout(60000);
 const clockScript:Script=body=>{
  const last=body.messages[body.messages.length-1];
  if(last.role==='tool'){const result=JSON.parse(last.content as string) as {status:string};return {reply:result.status==='started'?'घड़ी शुरू हो गई। लिखित निर्णय की समय-सीमा एक घंटा है।':`Status ${result.status}.`,tool_calls:[]};}
  return {reply:null,tool_calls:[{id:'call_7',name:'manage_claim_clock',arguments:{action:'start',insurer:'Star Health',requestType:'preauth',submittedAt:'now',hospital:'Ruby Hall Clinic'}}]};
 };
 const {seen,probe}=await setup(page,{voice:false,script:clockScript});
 await page.goto('/');
 await page.click('[data-language=hi]');
 await expect(page.locator('#intro')).toBeVisible();
 await page.click('#voice-launch');
 await expect(page.locator('#voice-title')).toHaveText('ClaimClock Voice');
 await expect(page.locator('#voice-processor')).toContainText('वॉइस इनपुट उपलब्ध नहीं');
 await page.check('#voice-consent-box');
 await expect(page.locator('#voice-start')).toBeDisabled();await expect(page.locator('#voice-text-only')).toBeEnabled();
 await page.click('#voice-text-only');
 await expect(page.locator('#voice-session')).toBeVisible();
 await expect(page.locator('#voice-talk')).toBeHidden();
 expect((await probe()).media).toBe(0);
 await page.fill('#voice-text-form [name=text]','स्टार हेल्थ के लिए प्री-ऑथ की घड़ी शुरू करो');
 await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-log li.assistant')).toContainText('घड़ी शुरू हो गई',{timeout:15000});
 await expect(page.locator('#voice-cards .voice-card[data-kind=clock]')).toContainText('घड़ी शुरू हुई');
 await expect(page.locator('#voice-cards .voice-card')).toContainText(/Star Health|स्टार/);
 expect((seen.copilot[0] as {language:string}).language).toBe('hi');
 await expect(page.locator('#voice-state')).toHaveText('बोलने के लिए टैप करें, या नीचे टाइप करें');
 await page.click('#voice-close');
 await expect(page.locator('#dashboard')).toBeVisible();
 await expect(page.locator('#clock-meta')).toContainText('Star');
 await expect(page.locator('#intro')).toBeHidden();
 expect(JSON.stringify(seen.copilot)).not.toMatch(identifiers);
 const toolResults=(seen.copilot[1] as {messages:{role:string;content?:string}[]}).messages.filter(m=>m.role==='tool').map(m=>m.content).join(' ');
 expect(toolResults).toContain('"status":"started"');expect(toolResults).not.toContain('Ruby Hall');
});

test('a disabled deployment, a busy assistant and a thrown tool are all reported without breaking the page',async({page})=>{
 const off=await setup(page,{ai:false});
 await page.goto('/vault/');
 await page.click('#voice-launch');
 await expect(page.locator('#voice-unavailable')).toHaveText('The assistant is not available on this deployment. The tools on each page work without it.');
 await page.check('#voice-consent-box');
 await expect(page.locator('#voice-start')).toBeDisabled();await expect(page.locator('#voice-text-only')).toBeDisabled();
 expect(off.seen.copilot).toHaveLength(0);
 await page.click('#voice-close');
 await page.unrouteAll({behavior:'ignoreErrors'});
 const busy=await setup(page,{voice:false,script:()=>({status:429})});
 await page.goto('/vault/');await page.evaluate(()=>sessionStorage.clear());
 await page.click('#voice-launch');await page.check('#voice-consent-box');await page.click('#voice-text-only');
 await page.fill('#voice-text-form [name=text]','When does my policy renew?');await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-error')).toHaveText('The assistant is busy right now (free-tier limit). Try again in a minute, or use the page tools.');
 await expect(page.locator('#voice-log li.user')).toHaveCount(1);await expect(page.locator('#voice-log li.assistant')).toHaveCount(0);
 await expect(page.locator('#voice-state')).toHaveText('Tap to talk, or type below');
 expect(busy.seen.copilot).toHaveLength(1);
 await page.unrouteAll({behavior:'ignoreErrors'});
 const renewal=await setup(page,{voice:false,script:body=>body.messages[body.messages.length-1].role==='tool'?{reply:'Your renewal is on 30 September 2027.',tool_calls:[]}:{reply:null,tool_calls:[{id:'c1',name:'check_renewal',arguments:{}},{id:'c2',name:'nonexistent_tool',arguments:{}},{id:'c3',name:'check_policy_benefit',arguments:{topic:'bogus'}}]}});
 await page.goto('/vault/');await page.evaluate(()=>sessionStorage.clear());
 await page.click('#voice-launch');await page.check('#voice-consent-box');await page.click('#voice-text-only');
 await page.fill('#voice-text-form [name=text]','When does my policy renew?');await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-log li.assistant')).toContainText('30 September 2027',{timeout:15000});
 await expect(page.locator('#voice-cards .voice-card[data-kind=renewal]')).toContainText('30 September 2027');
 const toolMessages=(renewal.seen.copilot[1] as {messages:{role:string;name?:string;content?:string}[]}).messages.filter(m=>m.role==='tool');
 expect(toolMessages.map(m=>m.name)).toEqual(['check_renewal','nonexistent_tool','check_policy_benefit']);
 expect(JSON.parse(toolMessages[1].content!).status).toBe('unknown_tool');expect(JSON.parse(toolMessages[2].content!).status).toBe('invalid_arguments');
});
