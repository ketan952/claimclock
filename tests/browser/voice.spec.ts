import {test,expect,type Page} from '@playwright/test';
import {installMockTurnstile,mockTurnstileConfig} from './turnstile-helper';

// Saathi against Chromium's fake microphone and a scripted assistant API. The Worker's own
// validation is covered by tests/voice.test.ts and the tools by tests/voice-agent.test.ts;
// this proves the browser side: consent before any microphone access, push-to-talk recording,
// transcription → tool → card → streamed and spoken reply, the identifier-free request, suggestion
// chips, typed and Hindi paths, premium-voice playback with fallback, error handling and the clock
// hook on the hospital page.
test.use({launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']}});

const vault={format:'claimclock-vault',version:1,updatedAt:'2026-10-16T00:00:00.000Z',profile:{name:'Ramesh Kumar',city:'Pune',language:'en'},
 members:[{id:'m-self',name:'Ramesh Kumar',relation:'self',birthYear:1980},{id:'m-spouse',name:'Sunita Kumar',relation:'spouse',birthYear:1983}],
 policies:[{id:'p-star',kind:'health',insurerId:'star-health',planId:'star-comprehensive',policyNumber:'P/700001/01/2026/004321',sumInsured:1000000,inceptionDate:'2024-10-01',continuityFrom:'2021-05-12',renewalDate:'2027-09-30',memberIds:['m-self','m-spouse'],uhid:'UH-99887'}],
 defaultPolicyId:'p-star',cases:[]};
const identifiers=/Ramesh|Sunita|P\/700001|UH-99887/;
type Reply={reply:string|null;tool_calls:{id:string;name:string;arguments:Record<string,unknown>}[];sentences?:string[]}|{status:number};
type Script=(body:{messages:{role:string;content?:string|null;name?:string}[]})=>Reply;
const sse=(events:[string,unknown][])=>({status:200,headers:{'content-type':'text/event-stream'},body:events.map(([event,data])=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')});
// A 1-sample 8 kHz mono WAV: enough for <audio> to play and end.
const TINY_WAV='UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';
async function setup(page:Page,{ai=true,voice=true,tts=false,speakFails=false,script,transcript='Will my policy pay for my wife\'s full body check-up?'}:{ai?:boolean;voice?:boolean;tts?:boolean;speakFails?:boolean;script?:Script;transcript?:string}={}){
 const seen={transcribe:[] as {type:string;consent:string|null;token:string|null;language:string|null;bytes:number}[],copilot:[] as Record<string,unknown>[],speak:[] as {text:string;language:string;token:string|null}[]};
 await installMockTurnstile(page,{mockConfig:false});
 await page.route('**/api/config',route=>route.fulfill({json:{ai_enabled:ai,provider:ai?'api.groq.com':null,model:ai?'openai/gpt-oss-120b':null,voice_enabled:ai&&voice,stt_model:ai&&voice?'whisper-large-v3-turbo':null,tts_enabled:ai&&tts,tts_provider:ai&&tts?'sarvam':null,...mockTurnstileConfig}}));
 await page.route('**/api/voice/transcribe',async route=>{const request=route.request();seen.transcribe.push({type:request.headers()['content-type']||'',consent:request.headers()['x-voice-consent']||null,token:request.headers()['x-turnstile-token']||null,language:request.headers()['x-voice-language']||null,bytes:request.postDataBuffer()?.byteLength||0});await route.fulfill({json:{text:transcript,advisory_only:true}});});
 await page.route('**/api/voice/speak',async route=>{const body=route.request().postDataJSON();seen.speak.push({text:body.text,language:body.language,token:route.request().headers()['x-turnstile-token']||null});if(speakFails)return route.fulfill({status:503,json:{error:'off'}});await route.fulfill({json:{mime:'audio/wav',audio:TINY_WAV}});});
 await page.route('**/api/copilot',async route=>{
  const body=route.request().postDataJSON();seen.copilot.push(body);
  const reply=script?script(body):{reply:'Hello.',tool_calls:[]};
  if('status' in reply)return route.fulfill({status:reply.status,json:{error:'busy'}});
  const accepts=(route.request().headers().accept||'').includes('text/event-stream');
  if(!accepts)return route.fulfill({json:{...reply,advisory_only:true}});
  const events:[string,unknown][]=[...(reply.sentences||[]).map(text=>['sentence',{text}] as [string,unknown]),['done',{reply:reply.reply,tool_calls:reply.tool_calls,advisory_only:true}]];
  await route.fulfill(sse(events));
 });
 await page.addInitScript((value)=>{localStorage.setItem('claimclock:vault:v1',JSON.stringify(value));},vault);
 await page.addInitScript(()=>{
  const w=window as unknown as {__voice:{media:number;spoken:string[];cancelled:number;played:number}};w.__voice={media:0,spoken:[],cancelled:0,played:0};
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=(constraints)=>{w.__voice.media++;return original(constraints);};
  const synth={speak:(u:SpeechSynthesisUtterance)=>{w.__voice.spoken.push(u.text);setTimeout(()=>u.dispatchEvent(new Event('end')),40);},cancel:()=>{w.__voice.cancelled++;},getVoices:()=>[],pending:false,speaking:false,paused:false,pause(){},resume(){},addEventListener(){},removeEventListener(){},onvoiceschanged:null};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){w.__voice.played++;return play.call(this);};
 });
 const probe=async()=>page.evaluate(()=>(window as unknown as {__voice:{media:number;spoken:string[];cancelled:number;played:number}}).__voice);
 return {seen,probe};
}
const benefitScript:Script=body=>{
 const last=body.messages[body.messages.length-1];
 if(last.role==='tool')return {sentences:['Yes — your wife’s check-up is available this policy year.','It is booked as cashless through the insurer.'],reply:'Yes — your wife’s check-up is available this policy year. It is booked as cashless through the insurer.',tool_calls:[]};
 return {reply:null,tool_calls:[{id:'call_1',name:'check_policy_benefit',arguments:{topic:'health_checkup',member:'spouse',claimFreePreviousYear:true}}]};
};
async function openAndConsent(page:Page,{mic}:{mic:boolean}){
 await page.click('#voice-launch');
 await expect(page.locator('#voice-consent')).toBeVisible();
 await page.check('#voice-consent-box');
 if(mic){await page.evaluate(()=>{(document.getElementById('voice-handsfree') as HTMLInputElement).checked=false;});await page.click('#voice-start');}
 else await page.click('#voice-text-only');
 await expect(page.locator('#voice-session')).toBeVisible();
}

test('the microphone is never opened before consent; a push-to-talk turn is transcribed, grounded without identifiers, answered through a tool card and spoken sentence by sentence as it streams',async({page})=>{
 test.setTimeout(60000);
 const {seen,probe}=await setup(page,{script:benefitScript});
 await page.goto('/check-coverage/');
 await expect(page.locator('#voice-launch')).toBeVisible();await expect(page.locator('#voice-launch')).toContainText('Saathi');
 await page.click('#voice-launch');
 const dialog=page.locator('#voice-dialog');await expect(dialog).toBeVisible();
 await expect(page.locator('#voice-title')).toHaveText('Saathi');
 await expect(page.locator('#voice-consent')).toContainText('never your name, policy number or UHID');
 await expect(page.locator('#voice-consent')).not.toContainText(/groq|gpt-oss|whisper/i,{useInnerText:true});
 await expect(page.locator('#voice-start')).toBeDisabled();await expect(page.locator('#voice-text-only')).toBeDisabled();
 expect((await probe()).media).toBe(0);
 await page.check('#voice-consent-box');
 await expect(page.locator('#voice-start')).toBeEnabled();
 expect((await probe()).media).toBe(0);
 await page.evaluate(()=>{(document.getElementById('voice-handsfree') as HTMLInputElement).checked=false;});
 await page.click('#voice-start');
 await expect(page.locator('#voice-session')).toBeVisible();
 await expect.poll(async()=>(await probe()).media).toBe(1);
 await expect(page.locator('#voice-state')).toHaveText('Tap the mic or type below');
 await expect(page.locator('#voice-chips .saathi-chip')).toHaveCount(6);
 await expect(page.locator('#voice-talk')).toBeEnabled();
 await page.click('#voice-talk');
 await expect(page.locator('#voice-state')).toContainText('I’m listening');await expect(page.locator('#voice-talk-label')).toHaveText('Tap when you’re done');
 await page.waitForTimeout(1500);
 await page.click('#voice-talk');
 await expect(page.locator('#voice-log li.user')).toHaveText('Will my policy pay for my wife\'s full body check-up?',{timeout:15000});
 await expect(page.locator('#voice-log li.assistant')).toHaveText('Yes — your wife’s check-up is available this policy year. It is booked as cashless through the insurer.',{timeout:15000});
 await expect(page.locator('#voice-state')).toHaveText('Tap the mic or type below');
 await expect(page.locator('#voice-chips')).toBeHidden();
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
 expect(JSON.parse(second.messages[2].content as string).status).toBe('available');
 const card=page.locator('#voice-cards .voice-card');await expect(card).toHaveCount(1);await expect(card).toContainText('full-body check-up');await expect(card.locator('a[href="/check-coverage/"]')).toBeVisible();await expect(card.locator('a[href^="https://"]')).toContainText('verified');
 await expect.poll(async()=>(await probe()).spoken).toEqual(['Yes — your wife’s check-up is available this policy year.','It is booked as cashless through the insurer.']);
 await page.click('#voice-close');
 await expect(dialog).not.toBeVisible();
 await page.click('#voice-launch');
 await expect(page.locator('#voice-session')).toBeVisible();
 await expect(page.locator('#voice-consent')).toBeHidden();
 await expect(page.locator('#voice-log li')).toHaveCount(0);await expect(page.locator('#voice-cards .voice-card')).toHaveCount(0);await expect(page.locator('#voice-chips')).toBeVisible();
 await expect.poll(async()=>(await probe()).media).toBe(2);
});

test('suggestion chips and typed questions work without a microphone, Hindi labels follow the interface language, and the clock tool updates the hospital page',async({page})=>{
 test.setTimeout(60000);
 const clockScript:Script=body=>{
  const last=body.messages[body.messages.length-1];
  if(last.role==='tool'){const result=JSON.parse(last.content as string) as {status:string};const text=result.status==='started'?'घड़ी शुरू हो गई। लिखित निर्णय की समय-सीमा एक घंटा है।':`Status ${result.status}.`;return {sentences:[text],reply:text,tool_calls:[]};}
  return {reply:null,tool_calls:[{id:'call_7',name:'manage_claim_clock',arguments:{action:'start',insurer:'Star Health',requestType:'preauth',submittedAt:'now',hospital:'Ruby Hall Clinic'}}]};
 };
 const {seen,probe}=await setup(page,{voice:false,script:clockScript});
 await page.goto('/');
 await page.click('[data-language=hi]');
 await expect(page.locator('#intro')).toBeVisible();
 await expect(page.locator('#voice-launch')).toContainText('साथी');
 await page.click('#voice-launch');
 await expect(page.locator('#voice-title')).toHaveText('साथी');
 await page.check('#voice-consent-box');
 await expect(page.locator('#voice-start')).toBeDisabled();await expect(page.locator('#voice-text-only')).toBeEnabled();
 await page.click('#voice-text-only');
 await expect(page.locator('#voice-session')).toBeVisible();
 await expect(page.locator('#voice-talk')).toBeHidden();
 expect((await probe()).media).toBe(0);
 await expect(page.locator('#voice-chips .saathi-chip').nth(1)).toHaveText('अस्पताल की घड़ी शुरू करो');
 await page.locator('#voice-chips .saathi-chip').nth(1).click();
 await expect(page.locator('#voice-log li.user')).toHaveText('अस्पताल की घड़ी शुरू करो');
 await expect(page.locator('#voice-log li.assistant')).toContainText('घड़ी शुरू हो गई',{timeout:15000});
 await expect(page.locator('#voice-cards .voice-card[data-kind=clock]')).toContainText('घड़ी शुरू हुई');
 await expect(page.locator('#voice-cards .voice-card')).toContainText(/Star Health|स्टार/);
 expect((seen.copilot[0] as {language:string}).language).toBe('hi');
 await expect(page.locator('#voice-state')).toHaveText('माइक टैप करें या नीचे टाइप करें');
 await page.fill('#voice-text-form [name=text]','धन्यवाद');await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-log li.user')).toHaveCount(2);
 await page.click('#voice-close');
 await expect(page.locator('#dashboard')).toBeVisible();
 await expect(page.locator('#clock-meta')).toContainText('Star');
 await expect(page.locator('#intro')).toBeHidden();
 expect(JSON.stringify(seen.copilot)).not.toMatch(identifiers);
 const toolResults=(seen.copilot[1] as {messages:{role:string;content?:string}[]}).messages.filter(m=>m.role==='tool').map(m=>m.content).join(' ');
 expect(toolResults).toContain('"status":"started"');expect(toolResults).not.toContain('Ruby Hall');
});

test('premium voice plays the Worker’s audio for the first sentence while the rest streams, and falls back to the browser voice when the speech provider fails',async({page})=>{
 test.setTimeout(60000);
 const twoSentences:Script=()=>({sentences:['Your policy renews on 30 September 2027.','You have plenty of time.'],reply:'Your policy renews on 30 September 2027. You have plenty of time.',tool_calls:[]});
 const ok=await setup(page,{voice:false,tts:true,script:twoSentences});
 await page.goto('/vault/');
 await openAndConsent(page,{mic:false});
 await expect.poll(async()=>(await ok.probe()).played).toBeGreaterThan(0);
 await page.fill('#voice-text-form [name=text]','When does my policy renew?');await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-log li.assistant')).toHaveText('Your policy renews on 30 September 2027. You have plenty of time.',{timeout:15000});
 await expect(page.locator('#voice-state')).toHaveText('Tap the mic or type below',{timeout:20000});
 expect(ok.seen.speak.map(s=>s.text)).toEqual(['Your policy renews on 30 September 2027.','You have plenty of time.']);
 expect(ok.seen.speak.every(s=>s.language==='en'&&s.token?.startsWith('mock-turnstile-speak'))).toBe(true);
 expect((await ok.probe()).spoken).toEqual([],'the browser voice is not used while premium audio plays');
 await page.click('#voice-close');
 await page.unrouteAll({behavior:'ignoreErrors'});
 const failing=await setup(page,{voice:false,tts:true,speakFails:true,script:twoSentences});
 await page.goto('/vault/');await page.evaluate(()=>sessionStorage.clear());
 await openAndConsent(page,{mic:false});
 await page.fill('#voice-text-form [name=text]','When does my policy renew?');await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-log li.assistant')).toHaveText('Your policy renews on 30 September 2027. You have plenty of time.',{timeout:15000});
 await expect(page.locator('#voice-state')).toHaveText('Tap the mic or type below',{timeout:20000});
 expect(failing.seen.speak.length).toBeGreaterThan(0);
 await expect.poll(async()=>(await failing.probe()).spoken.join(' ')).toContain('30 September 2027');
});

test('a disabled deployment, a busy assistant and a thrown tool are all reported without breaking the page',async({page})=>{
 const off=await setup(page,{ai:false});
 await page.goto('/vault/');
 await page.click('#voice-launch');
 await expect(page.locator('#voice-unavailable')).toHaveText('Saathi is not available on this deployment. The tools on each page work without it.');
 await page.check('#voice-consent-box');
 await expect(page.locator('#voice-start')).toBeDisabled();await expect(page.locator('#voice-text-only')).toBeDisabled();
 expect(off.seen.copilot).toHaveLength(0);
 await page.click('#voice-close');
 await page.unrouteAll({behavior:'ignoreErrors'});
 const busy=await setup(page,{voice:false,script:()=>({status:429})});
 await page.goto('/vault/');await page.evaluate(()=>sessionStorage.clear());
 await openAndConsent(page,{mic:false});
 await page.fill('#voice-text-form [name=text]','When does my policy renew?');await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-error')).toHaveText('The assistant is busy right now (free-tier limit). Try again in a minute, or use the page tools.');
 await expect(page.locator('#voice-log li.user')).toHaveCount(1);await expect(page.locator('#voice-log li.assistant')).toHaveCount(0);
 await expect(page.locator('#voice-state')).toHaveText('Tap the mic or type below');
 expect(busy.seen.copilot).toHaveLength(1);
 await page.unrouteAll({behavior:'ignoreErrors'});
 const renewal=await setup(page,{voice:false,script:body=>body.messages[body.messages.length-1].role==='tool'?{reply:'Your renewal is on 30 September 2027.',tool_calls:[]}:{reply:null,tool_calls:[{id:'c1',name:'check_renewal',arguments:{}},{id:'c2',name:'nonexistent_tool',arguments:{}},{id:'c3',name:'check_policy_benefit',arguments:{topic:'bogus'}}]}});
 await page.goto('/vault/');await page.evaluate(()=>sessionStorage.clear());
 await openAndConsent(page,{mic:false});
 await page.fill('#voice-text-form [name=text]','When does my policy renew?');await page.click('#voice-text-form button[type=submit]');
 await expect(page.locator('#voice-log li.assistant')).toContainText('30 September 2027',{timeout:15000});
 await expect(page.locator('#voice-cards .voice-card[data-kind=renewal]')).toContainText('30 September 2027');
 const toolMessages=(renewal.seen.copilot[1] as {messages:{role:string;name?:string;content?:string}[]}).messages.filter(m=>m.role==='tool');
 expect(toolMessages.map(m=>m.name)).toEqual(['check_renewal','nonexistent_tool','check_policy_benefit']);
 expect(JSON.parse(toolMessages[1].content!).status).toBe('unknown_tool');expect(JSON.parse(toolMessages[2].content!).status).toBe('invalid_arguments');
});
