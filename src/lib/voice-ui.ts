// ClaimClock Voice (M22) — browser glue loaded on the first tap: microphone and turn-taking,
// speech output with barge-in, the dialog, its transcript and action cards. Every decision
// (turn detection, conversation bounds, the tools) lives in voice-agent.ts and is unit-tested;
// this file only moves bytes and pixels. The microphone is never opened before consent.
import {getTurnstileToken,type TurnstileAction} from './turnstile';
import {lang,setMessage,interpolate,t} from './i18n';
import {loadVault,saveVault} from './vault.ts';
import {getSelectedBackup,saveTimeline} from './storage.ts';
import {VoiceActivity,executeTool,groundingContext,pickVoice,rmsLevel,speechChunks,toolResultContent,trimHistory,voiceLang,type Card,type ChatMessage,type ToolCall,type VoiceDeps} from './voice-agent.ts';

type Config={ai_enabled:boolean;provider:string|null;model:string|null;voice_enabled?:boolean;stt_model?:string|null};
type State='off'|'idle'|'listening'|'recording'|'thinking'|'speaking';
const CONSENT_KEY='claimclock:voice-consent:v1',CONSENT_VERSION='2026-10-17';
const MAX_UTTERANCE_MS=25_000,MAX_AUDIO_BYTES=600*1024,MIN_AUDIO_BYTES=1024,MAX_ROUNDS=3,TOKEN_MAX_AGE_MS=4*60_000,MAX_CARDS=6;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
class ApiError extends Error{status:number;constructor(status:number){super(`api_${status}`);this.status=status;}}
const errorKey=(error:unknown)=>error instanceof ApiError?(error.status===429?'voice.busy':error.status===403?'voice.verificationFailed':error.status===413?'voice.tooLong':'voice.serviceUnavailable'):error instanceof Error&&/verification/.test(error.message)?'voice.serviceUnavailable':'voice.networkError';

/** One Turnstile token per protected call, fetched while the user is still talking so a turn never waits for the challenge. */
class TokenPool {
 active=false;pending=new Map<TurnstileAction,{promise:Promise<string>;at:number}>();
 prefetch(action:TurnstileAction){if(!this.active||this.pending.has(action))return;const promise=getTurnstileToken(action);promise.catch(()=>this.pending.delete(action));this.pending.set(action,{promise,at:Date.now()});}
 async take(action:TurnstileAction):Promise<string>{
  const entry=this.pending.get(action);this.pending.delete(action);
  if(entry&&Date.now()-entry.at<TOKEN_MAX_AGE_MS){try{return await entry.promise;}catch{/* fall through to a fresh challenge */}}
  return getTurnstileToken(action);
 }
 clear(){this.pending.clear();this.active=false;}
}

let wired=false,config:Config|null=null,state:State='off';
let stream:MediaStream|null=null,audioContext:AudioContext|null=null,analyser:AnalyserNode|null=null,frame=0;
let recorder:MediaRecorder|null=null,chunks:Blob[]=[],recorderStartedAt=0,sendOnStop=false,recorderMime='',manualTurn=false;
let vad=new VoiceActivity();let history:ChatMessage[]=[];let busy=false;let speakingToken=0;let sessionId=0;
const tokens=new TokenPool();
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
const canRecord=()=>typeof navigator.mediaDevices?.getUserMedia==='function'&&typeof MediaRecorder!=='undefined';
const handsFree=()=>Boolean(stream)&&el<HTMLInputElement>('voice-handsfree').checked;
const currentTimeline=()=>getSelectedBackup()?.timeline||null;
const deps=():VoiceDeps=>({language:lang(),vault:loadVault,
 saveVault:vault=>{const ok=saveVault(vault);if(ok)window.dispatchEvent(new CustomEvent('claimclock:vault'));return ok;},
 timeline:currentTimeline,
 saveTimeline:(timeline,expected)=>{const ok=saveTimeline(timeline,expected);if(ok)window.dispatchEvent(new CustomEvent('claimclock:cases'));return ok;},
 deductions:()=>getSelectedBackup()?.deductions||[]});

export async function openVoice():Promise<void> {
 wire();
 const dialog=el<HTMLDialogElement>('voice-dialog');
 if(!dialog.open)dialog.showModal();
 el('voice-consent').hidden=false;el('voice-session').hidden=true;setMessage(el('voice-error'),null);
 el<HTMLInputElement>('voice-consent-box').checked=false;el<HTMLButtonElement>('voice-start').disabled=true;el<HTMLButtonElement>('voice-text-only').disabled=true;
 config=await loadConfig();
 describeProcessors();
 const unavailable=el('voice-unavailable');
 if(!config.ai_enabled){setMessage(unavailable,'voice.unavailable');unavailable.hidden=false;return;}
 if(!canRecord()){setMessage(unavailable,'voice.noMic');unavailable.hidden=false;}
 else unavailable.hidden=true;
 if(consented())await startSession(Boolean(config.voice_enabled)&&canRecord());
 else el<HTMLInputElement>('voice-consent-box').focus();
}
async function loadConfig():Promise<Config> {
 try{const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error('config');const value=await response.json() as Config;return {ai_enabled:value.ai_enabled===true,provider:typeof value.provider==='string'?value.provider:null,model:typeof value.model==='string'?value.model:null,voice_enabled:value.voice_enabled===true,stt_model:typeof value.stt_model==='string'?value.stt_model:null};}
 catch{return {ai_enabled:false,provider:null,model:null,voice_enabled:false,stt_model:null};}
}
function describeProcessors(){
 const line=el('voice-processor');
 if(!config?.ai_enabled||!config.provider||!config.model){setMessage(line,null);return;}
 if(config.voice_enabled&&config.stt_model)setMessage(line,'voice.processors',{provider:config.provider,stt:config.stt_model,model:config.model});
 else setMessage(line,'voice.processorsText',{provider:config.provider,model:config.model});
}
const consented=()=>{try{return sessionStorage.getItem(CONSENT_KEY)===CONSENT_VERSION;}catch{return false;}};
const rememberConsent=()=>{try{sessionStorage.setItem(CONSENT_KEY,CONSENT_VERSION);}catch{/* a session without storage simply asks again next time */}};

function wire(){
 if(wired)return;wired=true;
 const dialog=el<HTMLDialogElement>('voice-dialog');
 const consentBox=el<HTMLInputElement>('voice-consent-box');
 consentBox.addEventListener('change',()=>{const ok=consentBox.checked&&Boolean(config?.ai_enabled);el<HTMLButtonElement>('voice-start').disabled=!ok||!config?.voice_enabled||!canRecord();el<HTMLButtonElement>('voice-text-only').disabled=!ok;});
 el('voice-start').addEventListener('click',()=>{rememberConsent();void startSession(true);});
 el('voice-text-only').addEventListener('click',()=>{rememberConsent();void startSession(false);});
 el('voice-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',endSession);
 el('voice-talk').addEventListener('click',onTalk);
 el('voice-stop').addEventListener('click',()=>{stopSpeaking();backToListening();});
 el<HTMLInputElement>('voice-handsfree').addEventListener('change',()=>{if(!stream)return;if(handsFree()&&state==='idle')beginListening();else if(!handsFree()&&state==='listening'){stopRecorder(false);setState('idle');}});
 el<HTMLFormElement>('voice-text-form').addEventListener('submit',event=>{event.preventDefault();const input=el<HTMLFormElement>('voice-text-form').elements.namedItem('text') as HTMLInputElement;const value=input.value.trim();if(!value||busy)return;input.value='';if(state==='speaking')stopSpeaking();if(state==='recording')stopRecorder(false);void ask(value);});
 window.addEventListener('languagechange',()=>{describeProcessors();if(state!=='off')setState(state);});
}

async function startSession(withMic:boolean){
 el('voice-consent').hidden=true;el('voice-session').hidden=false;
 history=[];el('voice-log').replaceChildren();el('voice-cards').replaceChildren();setMessage(el('voice-error'),null);
 tokens.active=true;tokens.prefetch('copilot');
 el<HTMLButtonElement>('voice-talk').hidden=!withMic;el('voice-handsfree').parentElement!.hidden=!withMic;
 if(withMic){
  try{await openMic();tokens.prefetch('voice');}
  catch{setMessage(el('voice-error'),'voice.micDenied');closeMic();setState('idle');}
 } else setState('idle');
 if(stream)el('voice-talk').focus();else(el<HTMLFormElement>('voice-text-form').elements.namedItem('text') as HTMLInputElement).focus();
}
async function openMic(){
 // Created synchronously inside the tap so iOS treats it as user-activated, before the permission prompt can consume the gesture.
 audioContext=new AudioContext();
 stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
 await audioContext.resume();
 analyser=audioContext.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=0.4;
 audioContext.createMediaStreamSource(stream).connect(analyser);
 vad=new VoiceActivity();
 cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);
 if(handsFree())beginListening();else setState('idle');
}
function closeMic(){
 cancelAnimationFrame(frame);frame=0;
 if(recorder){sendOnStop=false;try{if(recorder.state!=='inactive')recorder.stop();}catch{/* already stopped */}recorder=null;chunks=[];}
 stream?.getTracks().forEach(track=>track.stop());stream=null;
 void audioContext?.close().catch(()=>{/* closing twice is harmless */});audioContext=null;analyser=null;
}
function endSession(){
 sessionId++;stopSpeaking();closeMic();tokens.clear();history=[];busy=false;manualTurn=false;
 el('voice-log').replaceChildren();el('voice-cards').replaceChildren();setMessage(el('voice-error'),null);
 setState('off');el<HTMLButtonElement>('voice-launch')?.focus();
}
function beginListening(){setState('listening');startRecorder();}
function backToListening(){
 busy=false;manualTurn=false;
 if(stream&&handsFree())beginListening();else setState('idle');
}
function setState(next:State){
 state=next;
 const dialog=el<HTMLDialogElement>('voice-dialog');dialog.dataset.voiceState=next;
 setMessage(el('voice-state'),next==='off'?null:`voice.state.${next}`);
 const talk=el<HTMLButtonElement>('voice-talk');talk.disabled=!stream||next==='thinking';setMessage(talk,next==='recording'?'voice.talkSend':'voice.talk');
 el('voice-stop').hidden=next!=='speaking';
 if(!analyser)drawOrb(0,new Uint8Array(0));
}
function pickMime():string{
 if(typeof MediaRecorder==='undefined')return '';
 return ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type))||'';
}
function startRecorder(){
 if(!stream||recorder)return;
 chunks=[];recorderMime=pickMime();
 try{recorder=new MediaRecorder(stream,{...(recorderMime?{mimeType:recorderMime}:{}),audioBitsPerSecond:32_000});}
 catch{setMessage(el('voice-error'),'voice.noMic');closeMic();setState('idle');return;}
 const current=recorder;
 current.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data);});
 current.addEventListener('stop',()=>{
  const type=(current.mimeType||recorderMime||'audio/webm').split(';')[0];
  const blob=new Blob(chunks,{type});const send=sendOnStop;
  if(recorder===current){recorder=null;chunks=[];}
  if(send)void handleUtterance(blob);
  else if(state==='listening'&&handsFree())startRecorder();
 });
 current.start(250);recorderStartedAt=performance.now();
}
function stopRecorder(send:boolean){
 if(!recorder)return;sendOnStop=send;
 try{if(recorder.state!=='inactive')recorder.stop();else recorder=null;}catch{recorder=null;}
}
function onTalk(){
 if(!stream||state==='thinking')return;
 if(state==='recording'){stopRecorder(true);return;}
 if(state==='speaking')stopSpeaking();
 manualTurn=true;setState('recording');startRecorder();
}
function tick(){
 if(!analyser){frame=0;return;}
 const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);
 const level=rmsLevel(data),now=performance.now();
 drawOrb(level,data);
 if(state==='recording'&&recorder&&now-recorderStartedAt>MAX_UTTERANCE_MS)stopRecorder(true);
 else if(state==='listening'&&recorder&&now-recorderStartedAt>MAX_UTTERANCE_MS)stopRecorder(false);
 if(handsFree()&&!manualTurn&&(state==='listening'||state==='recording'||state==='speaking')){
  const event=vad.update(level,now,state==='speaking');
  if(event==='speech_start'){if(state==='speaking')stopSpeaking();setState('recording');startRecorder();}
  else if(event==='speech_end'||event==='max_duration'){if(state==='recording')stopRecorder(true);}
  else if(event==='speech_discard'){if(state==='recording'){stopRecorder(false);setState('listening');}}
 }
 frame=requestAnimationFrame(tick);
}
function drawOrb(level:number,data:Uint8Array){
 const canvas=el<HTMLCanvasElement>('voice-orb');const ctx=canvas?.getContext('2d');if(!ctx)return;
 const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2;ctx.clearRect(0,0,w,h);
 const colour=state==='speaking'?'#7e9464':state==='recording'?'#b04a3a':state==='thinking'?'#8a7a3c':state==='off'?'#9aa49a':'#183f35';
 const grow=reducedMotion()?0:Math.min(0.25,level)*w*0.5;
 const radius=Math.min(w,h)*0.26+grow;
 ctx.beginPath();ctx.arc(cx,cy,radius+12,0,Math.PI*2);ctx.fillStyle=`${colour}22`;ctx.fill();
 ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=colour;ctx.fill();
 if(data.length&&!reducedMotion()&&(state==='listening'||state==='recording'||state==='speaking')){
  ctx.beginPath();const points=180,step=Math.max(1,Math.floor(data.length/points));
  for(let i=0,k=0;i<data.length&&k<points;i+=step,k++){const angle=(k/points)*Math.PI*2,v=(data[i]-128)/128,r=radius+16+v*24;const x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r;if(k)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
  ctx.closePath();ctx.strokeStyle=`${colour}99`;ctx.lineWidth=2;ctx.stroke();
 }
}

async function handleUtterance(blob:Blob){
 const wasManual=manualTurn;manualTurn=false;
 if(blob.size<MIN_AUDIO_BYTES){if(wasManual)setMessage(el('voice-error'),'voice.nothingHeard');backToListening();return;}
 if(blob.size>MAX_AUDIO_BYTES){setMessage(el('voice-error'),'voice.tooLong');backToListening();return;}
 busy=true;setState('thinking');
 try{
  const token=await tokens.take('voice');tokens.prefetch('voice');
  const response=await fetch('/api/voice/transcribe',{method:'POST',headers:{'Content-Type':blob.type||'audio/webm','X-Voice-Consent':'true','X-Turnstile-Token':token,...(lang()==='hi'?{'X-Voice-Language':'hi'}:{})},body:blob,signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new ApiError(response.status);
  const result=await response.json() as {text?:unknown};
  if(state==='off')return;
  const text=typeof result.text==='string'?result.text.trim():'';
  if(!text){if(wasManual)setMessage(el('voice-error'),'voice.nothingHeard');backToListening();return;}
  await ask(text);
 } catch(error){setMessage(el('voice-error'),errorKey(error));backToListening();}
}
type CopilotResult={reply:string|null;tool_calls:ToolCall[]};
async function copilot():Promise<CopilotResult> {
 const token=await tokens.take('copilot');tokens.prefetch('copilot');
 const body={messages:trimHistory(history),context:groundingContext(loadVault(),currentTimeline(),location.pathname),language:lang(),consent:true};
 const response=await fetch('/api/copilot',{method:'POST',headers:{'Content-Type':'application/json','X-Turnstile-Token':token},body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
 if(!response.ok)throw new ApiError(response.status);
 const value=await response.json() as {reply?:unknown;tool_calls?:unknown};
 const calls=Array.isArray(value.tool_calls)?value.tool_calls.filter((c):c is ToolCall=>Boolean(c)&&typeof c==='object'&&typeof (c as ToolCall).id==='string'&&typeof (c as ToolCall).name==='string'&&typeof (c as ToolCall).arguments==='object'&&(c as ToolCall).arguments!==null):[];
 return {reply:typeof value.reply==='string'&&value.reply.trim()?value.reply.trim():null,tool_calls:calls};
}
async function ask(text:string){
 const session=sessionId;
 busy=true;setMessage(el('voice-error'),null);setState('thinking');
 addLog('user',text);history.push({role:'user',content:text});
 let reply:string|null=null;
 try{
  for(let round=0;round<MAX_ROUNDS;round++){
   const result=await copilot();
   if(session!==sessionId)return; // the dialog was closed mid-turn; nothing more is shown or spoken
   if(!result.tool_calls.length){reply=result.reply;if(reply)history.push({role:'assistant',content:reply});break;}
   history.push({role:'assistant',content:result.reply,tool_calls:result.tool_calls});
   for(const call of result.tool_calls){const outcome=executeTool(call,deps());if(outcome.card)renderCard(outcome.card);history.push({role:'tool',tool_call_id:call.id,name:call.name,content:toolResultContent(outcome.result)});}
  }
 } catch(error){if(session!==sessionId)return;setMessage(el('voice-error'),errorKey(error));backToListening();return;}
 if(!reply){setMessage(el('voice-error'),'voice.noReply');backToListening();return;}
 addLog('assistant',reply);
 await speak(reply);
}
function addLog(role:'user'|'assistant',text:string){
 const item=document.createElement('li');item.className=role;item.textContent=text;
 const log=el('voice-log');log.append(item);item.scrollIntoView({block:'nearest'});
}
function renderCard(card:Card){
 const cards=el('voice-cards');
 const article=document.createElement('article');article.className='voice-card';article.dataset.kind=card.kind;
 const heading=document.createElement('h3');heading.textContent=card.title;article.append(heading);
 if(card.lines.length){const list=document.createElement('ul');for(const line of card.lines){const item=document.createElement('li');item.textContent=line;list.append(item);}article.append(list);}
 if(card.letter){
  const subject=document.createElement('strong');subject.className='voice-letter-subject';subject.textContent=card.letter.letter.subject;article.append(subject);
  const body=document.createElement('pre');body.textContent=card.letter.letter.body;article.append(body);
  const note=document.createElement('p');note.className='fine-print';note.textContent=card.letter.recipient?interpolate('voice.recipientNote',{recipient:card.letter.recipient}):t('voice.noRecipient');article.append(note);
  const row=document.createElement('div');row.className='button-row';
  const copy=document.createElement('button');copy.type='button';copy.className='button-secondary';copy.textContent=t('letter.copy');
  const status=document.createElement('p');status.className='status';status.setAttribute('role','status');
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(card.letter!.letter.body);setMessage(status,'voice.copied');}catch{setMessage(status,'voice.copyFailed');}});
  row.append(copy);
  const email=document.createElement('a');email.className='button-secondary';email.textContent=t('letter.email');email.href=`mailto:${encodeURIComponent(card.letter.recipient)}?subject=${encodeURIComponent(card.letter.letter.subject)}&body=${encodeURIComponent(card.letter.letter.body)}`;row.append(email);
  const whatsapp=document.createElement('a');whatsapp.className='button-secondary';whatsapp.textContent=t('letter.whatsapp');whatsapp.href=`https://wa.me/?text=${encodeURIComponent(card.letter.letter.body)}`;whatsapp.target='_blank';whatsapp.rel='noopener noreferrer';row.append(whatsapp);
  article.append(row,status);
 }
 if(card.link||card.source){
  const links=document.createElement('div');links.className='voice-card-links';
  if(card.link){const a=document.createElement('a');a.href=card.link.href;a.textContent=card.link.label;links.append(a);}
  if(card.source){const a=document.createElement('a');a.href=card.source.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${t('vault.verifiedOn')} ${card.source.verifiedOn?new Date(`${card.source.verifiedOn}T00:00:00Z`).toLocaleDateString(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):''} ↗`;links.append(a);}
  article.append(links);
 }
 cards.append(article);
 while(cards.children.length>MAX_CARDS)cards.firstElementChild?.remove();
 article.scrollIntoView({block:'nearest'});
}
function speak(text:string):Promise<void> {
 if(!('speechSynthesis' in window)){backToListening();return Promise.resolve();}
 const parts=speechChunks(text);
 if(!parts.length){backToListening();return Promise.resolve();}
 const token=++speakingToken;setState('speaking');
 const voice=pickVoice(speechSynthesis.getVoices(),lang());
 return new Promise(resolve=>{
  let index=0;
  const finish=()=>{if(token===speakingToken)backToListening();resolve();};
  const next=()=>{
   if(token!==speakingToken){resolve();return;}
   if(index>=parts.length){finish();return;}
   const utterance=new SpeechSynthesisUtterance(parts[index++]);
   utterance.lang=voiceLang(lang());utterance.rate=1;
   if(voice){try{utterance.voice=voice;}catch{/* an engine that rejects the voice object still speaks in the requested language */}}
   utterance.addEventListener('end',next);utterance.addEventListener('error',next);
   speechSynthesis.speak(utterance);
  };
  speechSynthesis.cancel();
  // Chromium drops an utterance queued in the same task as cancel(); yield once first.
  setTimeout(next,60);
 });
}
function stopSpeaking(){speakingToken++;if('speechSynthesis' in window)speechSynthesis.cancel();el('voice-stop').hidden=true;}
