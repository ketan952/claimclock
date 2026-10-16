// Saathi (M22) — browser glue loaded on the first tap: microphone and turn-taking, streamed replies
// spoken sentence by sentence (browser voices, or the optional premium voice when the deployment
// enables it), the sheet, its transcript and action cards. Every decision (turn detection,
// conversation bounds, the tools) lives in voice-agent.ts and is unit-tested; this file only moves
// bytes and pixels. The microphone is never opened before consent.
import {getTurnstileToken,type TurnstileAction} from './turnstile';
import {lang,setMessage,interpolate,t} from './i18n';
import {loadVault,saveVault} from './vault.ts';
import {getSelectedBackup,saveTimeline} from './storage.ts';
import {VoiceActivity,executeTool,groundingContext,pickVoice,rmsLevel,speechChunks,toolResultContent,trimHistory,voiceLang,type Card,type ChatMessage,type ToolCall,type VoiceDeps} from './voice-agent.ts';

type Config={ai_enabled:boolean;voice_enabled:boolean;tts_enabled:boolean};
type State='off'|'idle'|'listening'|'recording'|'thinking'|'speaking';
const CONSENT_KEY='claimclock:voice-consent:v1',CONSENT_VERSION='2026-10-17';
const MAX_UTTERANCE_MS=25_000,MAX_AUDIO_BYTES=600*1024,MIN_AUDIO_BYTES=1024,MAX_ROUNDS=3,TOKEN_MAX_AGE_MS=4*60_000,MAX_CARDS=6,SPEAK_MAX_CHARS=600;
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

// --- Speaking: sentences are queued as they stream in; either backend can be interrupted at once. ----
interface Speaker{enqueue(text:string):void;finish():Promise<void>;stop():void}
/** Browser voices: instant and free; each sentence is one utterance so an interruption lands within a sentence. */
class BrowserSpeaker implements Speaker {
 private queue:string[]=[];private speaking=false;private scheduled=false;private stopped=false;private finishing=false;private resolveDone:(()=>void)|null=null;private readonly voice:SpeechSynthesisVoice|undefined;
 constructor(){this.voice=pickVoice(speechSynthesis.getVoices(),lang());speechSynthesis.cancel();}
 // Chromium drops an utterance queued in the same task as cancel(); the first one waits a beat.
 enqueue(text:string){if(this.stopped)return;this.queue.push(...speechChunks(text));if(!this.speaking&&!this.scheduled){this.scheduled=true;setTimeout(()=>{this.scheduled=false;this.next();},60);}}
 finish(){this.finishing=true;if(!this.speaking&&!this.queue.length)return Promise.resolve();return new Promise<void>(resolve=>{this.resolveDone=resolve;});}
 stop(){this.stopped=true;this.queue=[];this.speaking=false;speechSynthesis.cancel();this.resolveDone?.();this.resolveDone=null;}
 private next(){
  if(this.stopped)return;
  const text=this.queue.shift();
  if(text===undefined){this.speaking=false;if(this.finishing){this.resolveDone?.();this.resolveDone=null;}return;}
  this.speaking=true;
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang=voiceLang(lang());utterance.rate=1;
  if(this.voice){try{utterance.voice=this.voice;}catch{/* an engine that rejects the voice object still speaks in the requested language */}}
  const advance=()=>{if(!this.stopped)this.next();};
  utterance.addEventListener('end',advance);utterance.addEventListener('error',advance);
  speechSynthesis.speak(utterance);
 }
}
/** Premium voice through the Worker: the first sentence is fetched at once and plays while the rest of the reply is still streaming; the remainder is fetched in one batch. Any failure falls back to the browser voice for that text. */
class ServerSpeaker implements Speaker {
 private audio:HTMLAudioElement;private clips:Promise<Blob|null>[]=[];private rest:string[]=[];private first=true;private playing=false;private stopped=false;private finishing=false;private resolveDone:(()=>void)|null=null;private fallback:BrowserSpeaker|null=null;private tokens:TokenPool;
 constructor(audio:HTMLAudioElement,tokens:TokenPool){this.audio=audio;this.tokens=tokens;}
 enqueue(text:string){if(this.stopped)return;if(this.first){this.first=false;this.push(text);}else this.rest.push(text);}
 finish(){this.finishing=true;if(this.rest.length){this.push(this.rest.join(' '));this.rest=[];}if(!this.playing&&!this.clips.length)return this.fallback?this.fallback.finish():Promise.resolve();return new Promise<void>(resolve=>{this.resolveDone=resolve;});}
 stop(){this.stopped=true;this.clips=[];this.rest=[];this.playing=false;this.audio.pause();this.audio.removeAttribute('src');this.fallback?.stop();this.resolveDone?.();this.resolveDone=null;}
 private push(text:string){
  for(const part of batches(text,SPEAK_MAX_CHARS))this.clips.push(fetchSpeech(part,this.tokens).catch(()=>null).then(blob=>{if(blob===null)this.speakFallback(part);return blob;}));
  if(!this.playing)void this.playNext();
 }
 private speakFallback(text:string){if(this.stopped)return;this.fallback=this.fallback||new BrowserSpeaker();this.fallback.enqueue(text);}
 private async playNext():Promise<void>{
  if(this.stopped)return;
  const next=this.clips.shift();
  if(!next){this.playing=false;if(this.finishing){const done=()=>{this.resolveDone?.();this.resolveDone=null;};if(this.fallback)void this.fallback.finish().then(done);else done();}return;}
  this.playing=true;
  const blob=await next;
  if(this.stopped)return;
  if(blob){await playBlob(this.audio,blob).catch(()=>undefined);}
  else if(this.fallback){await this.fallback.finish();this.fallback=null;}
  void this.playNext();
 }
}
function batches(text:string,max:number):string[]{const out:string[]=[];let current='';for(const chunk of speechChunks(text,max)){if((current+' '+chunk).trim().length>max){if(current)out.push(current);current=chunk;}else current=(current+' '+chunk).trim();}if(current)out.push(current);return out;}
async function fetchSpeech(text:string,tokens:TokenPool):Promise<Blob> {
 const token=await tokens.take('speak');tokens.prefetch('speak');
 const response=await fetch('/api/voice/speak',{method:'POST',headers:{'Content-Type':'application/json','X-Turnstile-Token':token},body:JSON.stringify({text,language:lang(),consent:true}),signal:AbortSignal.timeout(20_000)});
 if(!response.ok)throw new ApiError(response.status);
 if((response.headers.get('content-type')||'').includes('application/json')){
  const value=await response.json() as {mime?:string;audio?:string};
  if(typeof value.audio!=='string'||!value.audio)throw new ApiError(503);
  const bytes=Uint8Array.from(atob(value.audio),c=>c.charCodeAt(0));
  return new Blob([bytes],{type:value.mime||'audio/wav'});
 }
 return response.blob();
}
function playBlob(audio:HTMLAudioElement,blob:Blob):Promise<void> {
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(blob);
  const cleanup=()=>{URL.revokeObjectURL(url);audio.removeEventListener('ended',done);audio.removeEventListener('error',fail);audio.removeEventListener('pause',done);};
  const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('playback'));};
  audio.addEventListener('ended',done);audio.addEventListener('error',fail);audio.addEventListener('pause',done);
  audio.src=url;audio.play().catch(fail);
 });
}
/** iOS allows programmatic playback only on an element that first played inside a tap; a silent clip unlocks it. */
function unlockAudio(audio:HTMLAudioElement){
 const header=new Uint8Array([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,64,31,0,0,128,62,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]);
 const url=URL.createObjectURL(new Blob([header],{type:'audio/wav'}));
 audio.src=url;audio.play().catch(()=>undefined).finally(()=>setTimeout(()=>URL.revokeObjectURL(url),1000));
}

let wired=false,config:Config|null=null,state:State='off';
let stream:MediaStream|null=null,audioContext:AudioContext|null=null,analyser:AnalyserNode|null=null,frame=0,level=0,sample=new Uint8Array(0);
let recorder:MediaRecorder|null=null,chunks:Blob[]=[],recorderStartedAt=0,sendOnStop=false,recorderMime='',manualTurn=false;
let vad=new VoiceActivity();let history:ChatMessage[]=[];let busy=false;let sessionId=0;let speaker:Speaker|null=null;let player:HTMLAudioElement|null=null;
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
 const unavailable=el('voice-unavailable');
 if(!config.ai_enabled){setMessage(unavailable,'voice.unavailable');unavailable.hidden=false;return;}
 if(!canRecord()){setMessage(unavailable,'voice.noMic');unavailable.hidden=false;}
 else unavailable.hidden=true;
 if(consented())await startSession(config.voice_enabled&&canRecord());
 else el<HTMLInputElement>('voice-consent-box').focus();
}
async function loadConfig():Promise<Config> {
 try{const response=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error('config');const value=await response.json() as Record<string,unknown>;return {ai_enabled:value.ai_enabled===true,voice_enabled:value.voice_enabled===true,tts_enabled:value.tts_enabled===true};}
 catch{return {ai_enabled:false,voice_enabled:false,tts_enabled:false};}
}
const consented=()=>{try{return sessionStorage.getItem(CONSENT_KEY)===CONSENT_VERSION;}catch{return false;}};
const rememberConsent=()=>{try{sessionStorage.setItem(CONSENT_KEY,CONSENT_VERSION);}catch{/* a session without storage simply asks again next time */}};

function wire(){
 if(wired)return;wired=true;
 const dialog=el<HTMLDialogElement>('voice-dialog');
 const consentBox=el<HTMLInputElement>('voice-consent-box');
 consentBox.addEventListener('change',()=>{const ok=consentBox.checked&&Boolean(config?.ai_enabled);el<HTMLButtonElement>('voice-start').disabled=!ok||!config?.voice_enabled||!canRecord();el<HTMLButtonElement>('voice-text-only').disabled=!ok;});
 el('voice-start').addEventListener('click',()=>{rememberConsent();preparePlayer();void startSession(true);});
 el('voice-text-only').addEventListener('click',()=>{rememberConsent();preparePlayer();void startSession(false);});
 el('voice-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',endSession);
 el('voice-talk').addEventListener('click',onTalk);
 el('voice-stop').addEventListener('click',()=>{stopSpeaking();backToListening();});
 el<HTMLInputElement>('voice-handsfree').addEventListener('change',()=>{if(!stream)return;if(handsFree()&&state==='idle')beginListening();else if(!handsFree()&&state==='listening'){stopRecorder(false);setState('idle');}});
 el<HTMLFormElement>('voice-text-form').addEventListener('submit',event=>{event.preventDefault();const input=el<HTMLFormElement>('voice-text-form').elements.namedItem('text') as HTMLInputElement;const value=input.value.trim();if(!value||busy)return;input.value='';submitText(value);});
 for(const chip of document.querySelectorAll<HTMLButtonElement>('#voice-chips .saathi-chip'))chip.addEventListener('click',()=>{if(busy)return;submitText(chip.textContent?.trim()||'');});
 window.addEventListener('languagechange',()=>{if(state!=='off')setState(state);});
}
function submitText(value:string){if(!value)return;if(state==='speaking')stopSpeaking();if(state==='recording')stopRecorder(false);void ask(value);}
function preparePlayer(){if(!config?.tts_enabled)return;player=player||new Audio();player.preload='auto';unlockAudio(player);}

async function startSession(withMic:boolean){
 el('voice-consent').hidden=true;el('voice-session').hidden=false;
 const dialog=el<HTMLDialogElement>('voice-dialog');dialog.classList.add('in-session');delete dialog.dataset.hasLog;
 history=[];el('voice-log').replaceChildren();el('voice-cards').replaceChildren();el('voice-chips').hidden=false;setMessage(el('voice-error'),null);
 tokens.active=true;tokens.prefetch('copilot');if(config?.tts_enabled)tokens.prefetch('speak');
 el<HTMLButtonElement>('voice-talk').hidden=!withMic;el('voice-handsfree').parentElement!.hidden=!withMic;el('voice-talk-label').hidden=!withMic;
 startAnimation();
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
 sample=new Uint8Array(analyser.fftSize);vad=new VoiceActivity();
 if(handsFree())beginListening();else setState('idle');
}
function closeMic(){
 if(recorder){sendOnStop=false;try{if(recorder.state!=='inactive')recorder.stop();}catch{/* already stopped */}recorder=null;chunks=[];}
 stream?.getTracks().forEach(track=>track.stop());stream=null;
 void audioContext?.close().catch(()=>{/* closing twice is harmless */});audioContext=null;analyser=null;level=0;
}
function endSession(){
 sessionId++;stopSpeaking();closeMic();stopAnimation();tokens.clear();history=[];busy=false;manualTurn=false;
 el('voice-log').replaceChildren();el('voice-cards').replaceChildren();setMessage(el('voice-error'),null);
 const dialog=el<HTMLDialogElement>('voice-dialog');dialog.classList.remove('in-session');delete dialog.dataset.hasLog;
 setState('off');el<HTMLButtonElement>('voice-launch')?.focus();
}
function beginListening(){setState('listening');startRecorder();}
function backToListening(){
 busy=false;manualTurn=false;speaker=null;
 if(stream&&handsFree())beginListening();else setState('idle');
}
function setState(next:State){
 state=next;
 const dialog=el<HTMLDialogElement>('voice-dialog');dialog.dataset.voiceState=next;
 setMessage(el('voice-state'),next==='off'?null:`voice.state.${next}`);
 const talk=el<HTMLButtonElement>('voice-talk');talk.disabled=!stream||next==='thinking';
 talk.setAttribute('aria-label',t(next==='recording'?'voice.talkSend':'voice.talk'));
 setMessage(el('voice-talk-label'),stream?(next==='recording'?'voice.talkSend':'voice.talk'):null);
 el('voice-stop').hidden=next!=='speaking';
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

// --- The orb: breathes when idle, ripples with the voice, spins while thinking, pulses while speaking. ---
function startAnimation(){if(!frame)frame=requestAnimationFrame(tick);}
function stopAnimation(){cancelAnimationFrame(frame);frame=0;drawOrb(0);}
function tick(){
 const now=performance.now();
 if(analyser){analyser.getByteTimeDomainData(sample);level=rmsLevel(sample);
  if(state==='recording'&&recorder&&now-recorderStartedAt>MAX_UTTERANCE_MS)stopRecorder(true);
  else if(state==='listening'&&recorder&&now-recorderStartedAt>MAX_UTTERANCE_MS)stopRecorder(false);
  if(handsFree()&&!manualTurn&&(state==='listening'||state==='recording'||state==='speaking')){
   const event=vad.update(level,now,state==='speaking');
   if(event==='speech_start'){if(state==='speaking')stopSpeaking();setState('recording');startRecorder();}
   else if(event==='speech_end'||event==='max_duration'){if(state==='recording')stopRecorder(true);}
   else if(event==='speech_discard'){if(state==='recording'){stopRecorder(false);setState('listening');}}
  }
 } else level=0;
 drawOrb(now);
 frame=requestAnimationFrame(tick);
}
const PALETTE:Record<State,[string,string]>={off:['#9aa49a','#c9cfc6'],idle:['#1f6b57','#7e9464'],listening:['#1f6b57','#9fb77f'],recording:['#b04a3a','#e0a070'],thinking:['#8a7a3c','#d9c56a'],speaking:['#7e9464','#d9c56a']};
function drawOrb(now:number){
 const canvas=el<HTMLCanvasElement>('voice-orb');const ctx=canvas?.getContext('2d');if(!ctx)return;
 const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,still=reducedMotion();
 ctx.clearRect(0,0,w,h);
 const [deep,light]=PALETTE[state];
 const breath=still?0:Math.sin(now/900)*3;
 const base=Math.min(w,h)*0.24+breath+(still?0:Math.min(0.25,level)*w*0.45);
 // Soft halo and, while thinking, a slowly turning dashed ring.
 const halo=ctx.createRadialGradient(cx,cy,base*0.6,cx,cy,base*1.9);halo.addColorStop(0,`${light}55`);halo.addColorStop(1,`${light}00`);
 ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,base*1.9,0,Math.PI*2);ctx.fill();
 if(state==='thinking'&&!still){ctx.save();ctx.translate(cx,cy);ctx.rotate(now/700);ctx.setLineDash([10,12]);ctx.strokeStyle=`${deep}aa`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,base+18,0,Math.PI*2);ctx.stroke();ctx.restore();}
 if(state==='speaking'&&!still){for(let i=0;i<2;i++){const phase=((now/1400)+i*0.5)%1;ctx.strokeStyle=`${deep}${Math.round((1-phase)*120).toString(16).padStart(2,'0')}`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,base+8+phase*34,0,Math.PI*2);ctx.stroke();}}
 if((state==='listening'||state==='recording')&&!still&&sample.length){ctx.beginPath();const points=160,step=Math.max(1,Math.floor(sample.length/points));for(let i=0,k=0;i<sample.length&&k<points;i+=step,k++){const angle=(k/points)*Math.PI*2,v=(sample[i]-128)/128,r=base+12+v*26;const x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r;if(k)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();ctx.strokeStyle=`${deep}88`;ctx.lineWidth=2;ctx.stroke();}
 const body=ctx.createRadialGradient(cx-base*0.35,cy-base*0.4,base*0.1,cx,cy,base);body.addColorStop(0,light);body.addColorStop(1,deep);
 ctx.fillStyle=body;ctx.beginPath();ctx.arc(cx,cy,base,0,Math.PI*2);ctx.fill();
 const shine=ctx.createRadialGradient(cx-base*0.3,cy-base*0.45,0,cx-base*0.3,cy-base*0.45,base*0.7);shine.addColorStop(0,'#ffffff66');shine.addColorStop(1,'#ffffff00');
 ctx.fillStyle=shine;ctx.beginPath();ctx.arc(cx,cy,base,0,Math.PI*2);ctx.fill();
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
/** Streams one copilot round: sentences arrive as events and are handed over immediately; the shaped result comes last. */
async function copilot(onSentence:(text:string)=>void):Promise<CopilotResult> {
 const token=await tokens.take('copilot');tokens.prefetch('copilot');
 const body={messages:trimHistory(history),context:groundingContext(loadVault(),currentTimeline(),location.pathname),language:lang(),consent:true};
 const response=await fetch('/api/copilot',{method:'POST',headers:{'Content-Type':'application/json','X-Turnstile-Token':token,Accept:'text/event-stream'},body:JSON.stringify(body),signal:AbortSignal.timeout(45_000)});
 if(!response.ok)throw new ApiError(response.status);
 const shape=(value:{reply?:unknown;tool_calls?:unknown}):CopilotResult=>({reply:typeof value.reply==='string'&&value.reply.trim()?value.reply.trim():null,tool_calls:Array.isArray(value.tool_calls)?value.tool_calls.filter((c):c is ToolCall=>Boolean(c)&&typeof c==='object'&&typeof (c as ToolCall).id==='string'&&typeof (c as ToolCall).name==='string'&&typeof (c as ToolCall).arguments==='object'&&(c as ToolCall).arguments!==null):[]});
 if(!(response.headers.get('content-type')||'').includes('text/event-stream'))return shape(await response.json() as {reply?:unknown;tool_calls?:unknown});
 const reader=response.body?.getReader();if(!reader)throw new ApiError(503);
 const decoder=new TextDecoder();let buffer='';let result:CopilotResult|null=null;
 const handle=(block:string)=>{
  const event=block.match(/^event:\s*(\w+)/m)?.[1],data=block.match(/^data:\s*(.*)$/m)?.[1];
  if(!event||data===undefined)return;
  let value:unknown;try{value=JSON.parse(data);}catch{return;}
  if(event==='sentence'&&value&&typeof value==='object'&&typeof (value as {text:unknown}).text==='string')onSentence((value as {text:string}).text);
  else if(event==='done'&&value&&typeof value==='object')result=shape(value as {reply?:unknown;tool_calls?:unknown});
  else if(event==='error')throw new ApiError(503);
 };
 while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});let index;while((index=buffer.indexOf('\n\n'))!==-1){handle(buffer.slice(0,index));buffer=buffer.slice(index+2);}}
 buffer+=decoder.decode();if(buffer.trim())handle(buffer);
 if(!result)throw new ApiError(503);
 return result;
}
async function ask(text:string){
 const session=sessionId;
 busy=true;setMessage(el('voice-error'),null);setState('thinking');el('voice-chips').hidden=true;
 addLog('user',text);history.push({role:'user',content:text});
 let reply:string|null=null;let spokenParts=0;
 const live:{bubble:HTMLLIElement|null}={bubble:null};
 const voiceOut=()=>{if(!speaker){speaker=config?.tts_enabled&&player?new ServerSpeaker(player,tokens):('speechSynthesis' in window?new BrowserSpeaker():null);}return speaker;};
 const onSentence=(sentence:string)=>{
  if(session!==sessionId)return;
  if(!live.bubble){live.bubble=addLog('assistant','');live.bubble.classList.add('live');}
  live.bubble.textContent=`${live.bubble.textContent?live.bubble.textContent+' ':''}${sentence}`;
  if(state!=='speaking')setState('speaking');
  voiceOut()?.enqueue(sentence);spokenParts++;
 };
 try{
  for(let round=0;round<MAX_ROUNDS;round++){
   const result=await copilot(onSentence);
   if(session!==sessionId)return; // the sheet was closed mid-turn; nothing more is shown or spoken
   if(!result.tool_calls.length){reply=result.reply;if(reply)history.push({role:'assistant',content:reply});break;}
   history.push({role:'assistant',content:result.reply,tool_calls:result.tool_calls});
   for(const call of result.tool_calls){const outcome=executeTool(call,deps());if(outcome.card)renderCard(outcome.card);history.push({role:'tool',tool_call_id:call.id,name:call.name,content:toolResultContent(outcome.result)});}
   if(state!=='speaking')setState('thinking');
  }
 } catch(error){if(session!==sessionId)return;speaker?.stop();speaker=null;setMessage(el('voice-error'),errorKey(error));backToListening();return;}
 live.bubble?.classList.remove('live');
 if(!reply){if(!spokenParts){setMessage(el('voice-error'),'voice.noReply');backToListening();return;}}
 else if(live.bubble){live.bubble.textContent=reply;} else {addLog('assistant',reply);}
 if(reply&&!spokenParts){setState('speaking');voiceOut()?.enqueue(reply);}
 const current=speaker;
 if(current){await current.finish();if(session!==sessionId||speaker!==current)return;}
 backToListening();
}
function addLog(role:'user'|'assistant',text:string):HTMLLIElement{
 const item=document.createElement('li');item.className=role;item.textContent=text;
 const log=el('voice-log');log.append(item);el<HTMLDialogElement>('voice-dialog').dataset.hasLog='true';item.scrollIntoView({block:'nearest'});return item;
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
function stopSpeaking(){speaker?.stop();speaker=null;busy=false;if('speechSynthesis' in window)speechSynthesis.cancel();player?.pause();el('voice-stop').hidden=true;}
