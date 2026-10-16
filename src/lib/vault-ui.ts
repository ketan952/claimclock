// My Vault page (M20): profile, family, policies, optional passkey account and encrypted sync.
// Everything renders from the local vault; the server only ever receives ciphertext.
import contactsRaw from '../../data/contacts.json';
import {lang,t,setMessage,interpolate} from './i18n';
import {drawQr} from './qr.ts';
import {download,importCases,listCases} from './storage.ts';
import {parsePolicyText} from './policy-parser.ts';
import {generateVaultKey,recoveryLink,parseRecoveryInput,VaultCryptoError} from './vault-crypto.ts';
import {passkeysSupported,platformPasskeyAvailable} from './webauthn-client.ts';
import {SyncError,eraseAccount,getSession,loginPasskey,logout,pullVault,pushVault,registerPasskey,type SessionSummary} from './vault-sync.ts';
import {CONSUMABLES_COVER,MAX_MEMBERS,MAX_POLICIES,RELATIONS,clearVault,clearVaultKey,continuityMonths,daysUntilRenewal,emptyVault,indisputabilityMonths,loadSyncState,loadVault,loadVaultKey,parseVault,plans,policyLabel,saveSyncState,saveVault,saveVaultKey,vaultStorageIssue,type Member,type Policy,type PolicyKind,type Relation,type SyncState,type Vault} from './vault.ts';
import type {Contact} from './types.ts';

const contacts=contactsRaw as Contact[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=(id:string)=>el<HTMLFormElement>(id);
const field=<T extends HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement=HTMLInputElement>(f:HTMLFormElement,name:string)=>f.elements.namedItem(name) as T;
const addText=(parent:HTMLElement,tag:string,text:string,className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;parent.append(node);return node;};
const button=(parent:HTMLElement,label:string,className:string,onClick:()=>void)=>{const b=addText(parent,'button',label,className) as HTMLButtonElement;b.type='button';b.addEventListener('click',onClick);return b;};
const dateLabel=(ymd:string)=>new Date(`${ymd}T00:00:00Z`).toLocaleDateString(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const rupees=(n:number)=>`₹${n.toLocaleString('en-IN')}`;

let vault:Vault=loadVault()||emptyVault();
let syncState:SyncState=loadSyncState();
let session:SessionSummary|null=null;
let busy=false;
let pendingConflict:{remote:Vault;version:number}|null=null;
const status=(id:string,key:string|null,fields:Record<string,string|number>={})=>setMessage(el(id),key,fields);
function reportStorage(id:string){const issue=vaultStorageIssue();status(id,issue==='corrupt'?'vault.corruptLocal':'error.storage');}

// --- Profile ---
const profileForm=form('profile-form');
function renderProfile(){field(profileForm,'name').value=vault.profile.name;field(profileForm,'city').value=vault.profile.city;field<HTMLSelectElement>(profileForm,'language').value=vault.profile.language;}
profileForm.addEventListener('submit',e=>{
 e.preventDefault();
 const candidate:Vault={...vault,profile:{name:field(profileForm,'name').value.trim(),city:field(profileForm,'city').value.trim(),language:field<HTMLSelectElement>(profileForm,'language').value==='hi'?'hi':'en'}};
 if(!persist(candidate,'profile-status'))return;status('profile-status','vault.saved');
});

// --- Family members ---
const memberForm=form('member-form');
function renderMembers(){
 const list=el('members-list');list.replaceChildren();
 if(!vault.members.length){addText(list,'p',t('vault.noMembers'),'fine-print');}
 for(const member of vault.members){
  const card=document.createElement('article');card.className='row-card';
  addText(card,'h3',member.name);
  const meta=[t(`vault.relation.${member.relation}`),member.birthYear?interpolate('vault.born',{year:member.birthYear}):'',member.conditions||''].filter(Boolean).join(' · ');
  addText(card,'p',meta,'meta');
  const covered=vault.policies.filter(p=>p.memberIds.includes(member.id));
  addText(card,'p',covered.length?covered.map(p=>policyLabel(p,lang())).join('; '):t('vault.notCovered'),'fine-print');
  const row=document.createElement('div');row.className='button-row';
  button(row,t('vault.edit'),'text-button',()=>editMember(member));
  button(row,t('vault.remove'),'text-button',()=>{if(!confirm(t('vault.removeMemberConfirm')))return;persist({...vault,members:vault.members.filter(m=>m.id!==member.id),policies:vault.policies.map(p=>({...p,memberIds:p.memberIds.filter(id=>id!==member.id)}))},'member-status')&&status('member-status','vault.saved');});
  card.append(row);list.append(card);
 }
 renderPolicyMemberChoices();
}
function editMember(member:Member){field(memberForm,'memberId').value=member.id;field(memberForm,'name').value=member.name;field<HTMLSelectElement>(memberForm,'relation').value=member.relation;field(memberForm,'birthYear').value=member.birthYear?String(member.birthYear):'';field(memberForm,'conditions').value=member.conditions||'';el('member-cancel').hidden=false;memberForm.scrollIntoView({block:'center'});}
function resetMemberForm(){memberForm.reset();field(memberForm,'memberId').value='';el('member-cancel').hidden=true;}
el('member-cancel').addEventListener('click',resetMemberForm);
memberForm.addEventListener('submit',e=>{
 e.preventDefault();
 const id=field(memberForm,'memberId').value||crypto.randomUUID();
 if(!field(memberForm,'memberId').value&&vault.members.length>=MAX_MEMBERS){status('member-status','vault.tooMany');return;}
 const member:Member={id,name:field(memberForm,'name').value.trim(),relation:field<HTMLSelectElement>(memberForm,'relation').value as Relation};
 const year=Number(field(memberForm,'birthYear').value);if(field(memberForm,'birthYear').value&&Number.isInteger(year))member.birthYear=year;
 const conditions=field(memberForm,'conditions').value.trim();if(conditions)member.conditions=conditions;
 const members=vault.members.some(m=>m.id===id)?vault.members.map(m=>m.id===id?member:m):[...vault.members,member];
 if(!persist({...vault,members},'member-status'))return;resetMemberForm();status('member-status','vault.saved');
});

// --- Policies ---
const policyForm=form('policy-form');
const insurerSelect=field<HTMLSelectElement>(policyForm,'insurerId'),planSelect=field<HTMLSelectElement>(policyForm,'planId'),kindSelect=field<HTMLSelectElement>(policyForm,'kind');
function renderPolicyMemberChoices(){
 const box=el('policy-members'),checked=new Set([...box.querySelectorAll<HTMLInputElement>('input:checked')].map(i=>i.value));box.replaceChildren();
 if(!vault.members.length){addText(box,'p',t('vault.addMembersFirst'),'fine-print');return;}
 for(const member of vault.members){const label=document.createElement('label');label.className='checkbox-label';const input=document.createElement('input');input.type='checkbox';input.name='memberIds';input.value=member.id;input.checked=checked.has(member.id);label.append(input);addText(label,'span',`${member.name} (${t(`vault.relation.${member.relation}`)})`);box.append(label);}
}
function renderPlanChoices(selected=''){
 const kind=kindSelect.value as PolicyKind,insurer=insurerSelect.value;
 planSelect.replaceChildren(new Option(t('vault.planOther'),''));
 for(const plan of plans.filter(p=>p.kind===kind&&(!insurer||p.insurer_id===insurer)))planSelect.append(new Option(plan.name,plan.id));
 planSelect.value=selected&&plans.some(p=>p.id===selected)?selected:'';
 renderPlanRules();
}
const RULE_LABELS:Record<string,string>={room_rent:'vault.rule.roomRent',copay:'vault.rule.copay',ped_waiting_months:'vault.rule.ped',specific_waiting_months:'vault.rule.specific',initial_waiting_days:'vault.rule.initial',consumables:'vault.rule.consumables',health_checkup:'vault.rule.healthCheckup'};
function ruleText(key:string,rule:Record<string,unknown>):string {
 const hindi=lang()==='hi';
 if(key==='ped_waiting_months'||key==='specific_waiting_months')return interpolate('vault.months',{n:Number(rule.value)})+(rule.detail?` — ${String(hindi?rule.detail_hi||rule.detail:rule.detail)}`:'');
 if(key==='initial_waiting_days')return interpolate('vault.days',{n:Number(rule.value)});
 if(key==='consumables')return t(`vault.consumables.${String(rule.value)}`)+(rule.detail?` — ${String(hindi?rule.detail_hi||rule.detail:rule.detail)}`:'');
 return String(hindi?rule.value_hi||rule.value:rule.value);
}
function renderPlanRules(){
 const box=el('plan-rules');box.replaceChildren();const plan=plans.find(p=>p.id===planSelect.value);
 el('plan-name-field').hidden=Boolean(plan);
 if(!plan)return;
 addText(box,'h3',t('vault.planRules'));
 for(const [key,rule] of Object.entries(plan.rules)){
  const row=document.createElement('p');row.className='fine-print';
  addText(row,'strong',`${t(RULE_LABELS[key])}: `);
  if(!rule){row.append(t('vault.ruleUnknown'));box.append(row);continue;}
  row.append(ruleText(key,rule as Record<string,unknown>)+' ');
  const link=addText(row,'a',`${t('vault.verifiedOn')} ${dateLabel(rule.verified_on)} ↗`) as HTMLAnchorElement;link.href=rule.source_url;link.target='_blank';link.rel='noopener noreferrer';
  box.append(row);
 }
 addText(box,'p',t('vault.planRulesNote'),'fine-print');
 // Pre-fill only empty fields; the schedule always wins over the catalogue.
 const room=plan.rules.room_rent;if(room&&!field(policyForm,'roomRent').value)field(policyForm,'roomRent').value=String(room.value).slice(0,120);
 const copay=plan.rules.copay;if(copay&&!field(policyForm,'copayPercent').value){const text=String(copay.value);if(/^no\b|^none\b/i.test(text))field(policyForm,'copayPercent').value='0';else{const m=text.match(/^(\d{1,2})%/);if(m)field(policyForm,'copayPercent').value=m[1];}}
 const consumables=plan.rules.consumables;if(consumables&&!field<HTMLSelectElement>(policyForm,'consumables').value){const v=String(consumables.value);field<HTMLSelectElement>(policyForm,'consumables').value=v==='included'?'included':v==='excluded'?'excluded':v==='rider'||v==='optional'?'rider':'unknown';}
}
kindSelect.addEventListener('change',()=>renderPlanChoices());insurerSelect.addEventListener('change',()=>renderPlanChoices());planSelect.addEventListener('change',renderPlanRules);
function policyFacts(policy:Policy):string[] {
 const facts:string[]=[];const months=continuityMonths(policy),limit=indisputabilityMonths(policy.kind);
 if(months!==null){facts.push(interpolate('vault.factContinuity',{months}));
  if(limit!==null)facts.push(months>=limit?t(policy.kind==='life'?'vault.factSection45Done':'vault.factMoratoriumDone'):interpolate(policy.kind==='life'?'vault.factSection45Left':'vault.factMoratoriumLeft',{left:limit-months}));}
 const days=daysUntilRenewal(policy);
 if(days!==null)facts.push(days<0?interpolate('vault.factRenewalOverdue',{days:-days}):interpolate('vault.factRenewal',{days}));
 return facts;
}
function renderPolicies(){
 const list=el('policies-list');list.replaceChildren();
 if(!vault.policies.length)addText(list,'p',t('vault.noPolicies'),'fine-print');
 for(const policy of vault.policies){
  const card=document.createElement('article');card.className='row-card';
  addText(card,'h3',`${t(`vault.kind.${policy.kind}`)} · ${policyLabel(policy,lang())}${policy.id===vault.defaultPolicyId?` · ${t('vault.default')}`:''}`);
  const members=policy.memberIds.map(id=>vault.members.find(m=>m.id===id)?.name).filter(Boolean).join(', ');
  const meta=[members,policy.sumInsured?rupees(policy.sumInsured):'',policy.inceptionDate?`${t('vault.since')} ${dateLabel(policy.inceptionDate)}`:'',policy.corporate?t('vault.corporate'):''].filter(Boolean).join(' · ');
  if(meta)addText(card,'p',meta,'meta');
  for(const fact of policyFacts(policy))addText(card,'p',fact,'fine-print');
  const row=document.createElement('div');row.className='button-row';
  button(row,t('vault.edit'),'text-button',()=>editPolicy(policy));
  if(policy.id!==vault.defaultPolicyId)button(row,t('vault.makeDefault'),'text-button',()=>{persist({...vault,defaultPolicyId:policy.id},'policy-status')&&status('policy-status','vault.saved');});
  button(row,t('vault.remove'),'text-button',()=>{if(!confirm(t('vault.removePolicyConfirm')))return;persist({...vault,policies:vault.policies.filter(p=>p.id!==policy.id),defaultPolicyId:vault.defaultPolicyId===policy.id?null:vault.defaultPolicyId},'policy-status')&&status('policy-status','vault.saved');});
  card.append(row);list.append(card);
 }
}
function fillPolicyForm(policy:Partial<Policy>){
 if(policy.kind)kindSelect.value=policy.kind;
 if(policy.insurerId!==undefined){insurerSelect.value=policy.insurerId;window.dispatchEvent(new Event('pickerrefresh'));}
 renderPlanChoices(policy.planId||'');
 const set=(name:string,value:unknown)=>{if(value!==undefined&&value!==null)field(policyForm,name).value=String(value);};
 set('planName',policy.planName);set('policyNumber',policy.policyNumber);set('sumInsured',policy.sumInsured);set('inceptionDate',policy.inceptionDate);set('continuityFrom',policy.continuityFrom);set('renewalDate',policy.renewalDate);set('uhid',policy.uhid);set('claimNumber',policy.claimNumber);set('roomRent',policy.roomRent);set('copayPercent',policy.copayPercent);set('healthCheckupLimit',policy.healthCheckupLimit);set('healthCheckupLastClaimedOn',policy.healthCheckupLastClaimedOn);set('notes',policy.notes);
 if(policy.consumables)field<HTMLSelectElement>(policyForm,'consumables').value=policy.consumables;
 field(policyForm,'corporate').checked=Boolean(policy.corporate);
 if(policy.memberIds)for(const input of el('policy-members').querySelectorAll<HTMLInputElement>('input'))input.checked=policy.memberIds.includes(input.value);
 renderPlanRules();
}
function editPolicy(policy:Policy){resetPolicyForm();field(policyForm,'policyId').value=policy.id;fillPolicyForm(policy);field(policyForm,'isDefault').checked=policy.id===vault.defaultPolicyId;el('policy-cancel').hidden=false;policyForm.scrollIntoView({block:'start'});}
function resetPolicyForm(){policyForm.reset();field(policyForm,'policyId').value='';insurerSelect.value='';window.dispatchEvent(new Event('pickerrefresh'));renderPlanChoices();renderPolicyMemberChoices();el('policy-cancel').hidden=true;status('policy-parse-status',null);}
el('policy-cancel').addEventListener('click',resetPolicyForm);
function readPolicyForm():Policy {
 const id=field(policyForm,'policyId').value||crypto.randomUUID();
 const policy:Policy={id,kind:kindSelect.value as PolicyKind,insurerId:insurerSelect.value,policyNumber:field(policyForm,'policyNumber').value.trim(),memberIds:[...el('policy-members').querySelectorAll<HTMLInputElement>('input:checked')].map(i=>i.value)};
 const text=(name:string)=>field(policyForm,name).value.trim()||undefined;const num=(name:string)=>{const raw=field(policyForm,name).value.trim();return raw?Number(raw):undefined;};
 if(planSelect.value)policy.planId=planSelect.value;
 const planName=planSelect.value?plans.find(p=>p.id===planSelect.value)?.name:text('planName');if(planName)policy.planName=planName;
 const assign=<K extends keyof Policy>(key:K,value:Policy[K]|undefined)=>{if(value!==undefined)policy[key]=value;};
 assign('sumInsured',num('sumInsured'));assign('inceptionDate',text('inceptionDate'));assign('continuityFrom',text('continuityFrom'));assign('renewalDate',text('renewalDate'));assign('uhid',text('uhid'));assign('claimNumber',text('claimNumber'));assign('roomRent',text('roomRent'));assign('copayPercent',num('copayPercent'));
 const consumables=field<HTMLSelectElement>(policyForm,'consumables').value;if((CONSUMABLES_COVER as readonly string[]).includes(consumables))policy.consumables=consumables as Policy['consumables'];
 assign('healthCheckupLimit',num('healthCheckupLimit'));assign('healthCheckupLastClaimedOn',text('healthCheckupLastClaimedOn'));assign('notes',text('notes'));
 if(field(policyForm,'corporate').checked)policy.corporate=true;
 return policy;
}
policyForm.addEventListener('submit',e=>{
 e.preventDefault();
 const editing=Boolean(field(policyForm,'policyId').value);
 if(!editing&&vault.policies.length>=MAX_POLICIES){status('policy-status','vault.tooMany');return;}
 let policy:Policy;try{policy=readPolicyForm();}catch{status('policy-status','vault.invalid');return;}
 const policies=editing?vault.policies.map(p=>p.id===policy.id?policy:p):[...vault.policies,policy];
 const defaultPolicyId=field(policyForm,'isDefault').checked||(!vault.defaultPolicyId&&policies.length===1)?policy.id:vault.defaultPolicyId;
 if(!persist({...vault,policies,defaultPolicyId},'policy-status'))return;resetPolicyForm();status('policy-status','vault.saved');
});
let parsing=false;
el<HTMLInputElement>('policy-file').addEventListener('change',async()=>{
 const input=el<HTMLInputElement>('policy-file'),file=input.files?.[0];if(!file)return;
 if(parsing){status('policy-parse-status','deductions.wait');return;}parsing=true;
 try{
  const {extractFile}=await import('./extract');
  const text=await extractFile(file,(key,fields)=>status('policy-parse-status',key,fields));
  const parsed=parsePolicyText(text);
  const current=readPolicyForm();
  // Keep whatever the user already typed; the parser only fills blanks.
  const merged:Partial<Policy>={...current};
  for(const key of ['insurerId','planId','planName','policyNumber','uhid','sumInsured','inceptionDate','renewalDate','continuityFrom','roomRent','copayPercent'] as const){const value=(parsed as Record<string,unknown>)[key];if(value!==undefined&&(merged[key]===undefined||merged[key]===''))(merged as Record<string,unknown>)[key]=value;}
  let members=vault.members;const memberIds=new Set(current.memberIds);
  for(const found of parsed.members){const existing=members.find(m=>m.name.toLowerCase()===found.name.toLowerCase());if(existing){memberIds.add(existing.id);continue;}if(members.length>=MAX_MEMBERS)break;const member:Member={id:crypto.randomUUID(),name:found.name,relation:found.relation||'other'};if(found.birthYear)member.birthYear=found.birthYear;members=[...members,member];memberIds.add(member.id);}
  if(members!==vault.members){if(!persist({...vault,members},'policy-parse-status'))return;}
  merged.memberIds=[...memberIds];fillPolicyForm(merged);
  status('policy-parse-status',parsed.warnings.length?'vault.parsedPartial':'vault.parsed',{missing:parsed.warnings.map(w=>t(`vault.field.${w}`)).join(', ')});
 }catch(e){status('policy-parse-status',e instanceof Error&&'translationKey' in e&&String(e.translationKey).startsWith('extract.')?String(e.translationKey):'deductions.readFailed');}
 finally{parsing=false;input.value='';}
});

// --- Persistence and sync ---
function persist(candidate:Vault,statusId:string):boolean {
 try{parseVault(candidate);}catch{status(statusId,'vault.invalid');return false;}
 if(!saveVault(candidate)){reportStorage(statusId);return false;}
 vault=loadVault()||candidate;renderAll();
 if(session?.authenticated&&loadVaultKey())void syncNow(true);
 return true;
}
function setBusy(value:boolean){busy=value;for(const id of ['account-register','account-login','account-logout','account-delete','sync-now','recovery-submit'])el<HTMLButtonElement>(id).disabled=value;}
function describeError(error:unknown):[string,Record<string,string|number>] {
 if(error instanceof SyncError)return [error.messageKey,{}];
 if(error instanceof VaultCryptoError)return [error.kind==='unsupported'?'transfer.unsupported':error.kind==='large'?'vault.tooLarge':'vault.wrongKey',{}];
 return ['vault.requestFailed',{}];
}
function renderAccount(){
 const signedIn=Boolean(session?.authenticated),key=loadVaultKey();
 el('account-register').hidden=signedIn;el('account-login').hidden=signedIn;el('account-logout').hidden=!signedIn;el('account-delete').hidden=!signedIn;el('sync-now').hidden=!signedIn;
 el('recovery-form-wrap').hidden=!(signedIn&&!key);
 el('recovery-panel').hidden=!key;
 if(!passkeysSupported())status('account-summary','vault.passkeysUnsupported');
 else if(!signedIn)status('account-summary','vault.notSignedIn');
 else if(!key)status('account-summary','vault.needsKey');
 else status('account-summary','vault.signedIn',{count:session?.credentials?.length||1});
 if(signedIn&&syncState.syncedAt)setMessage(el('sync-summary'),'vault.lastSynced',{time:new Date(syncState.syncedAt).toLocaleString(lang()==='hi'?'hi-IN':'en-IN',{dateStyle:'medium',timeStyle:'short'})});
 else if(signedIn)setMessage(el('sync-summary'),'vault.neverSynced');
 else setMessage(el('sync-summary'),'vault.localOnly');
 el('sync-conflict').hidden=!pendingConflict;
 if(key){el<HTMLInputElement>('recovery-key').value=key;try{drawQr(el<HTMLCanvasElement>('recovery-qr'),recoveryLink(key,location.origin));}catch{/* A QR is a convenience; the text key remains. */}}
}
async function refreshSession(){try{session=await getSession();}catch{session=null;}renderAccount();}
function ensureVaultKey():string{let key=loadVaultKey();if(!key){key=generateVaultKey();if(!saveVaultKey(key))throw new SyncError('error.storage');}return key;}
async function syncNow(quiet=false):Promise<void> {
 if(busy)return;const key=loadVaultKey();
 if(!session?.authenticated){if(!quiet)status('sync-status','vault.notSignedIn');return;}
 if(!key){status('sync-status','vault.needsKey');renderAccount();return;}
 setBusy(true);if(!quiet)status('sync-status','vault.syncing');
 try{
  const local:Vault={...vault,cases:listCases()};
  const remote=await pullVault(key);
  const changedLocally=!syncState.syncedAt||vault.updatedAt>syncState.syncedAt;
  if(remote&&remote.version>syncState.version){
   if(changedLocally&&JSON.stringify({...remote.vault,updatedAt:'',cases:[]})!==JSON.stringify({...local,updatedAt:'',cases:[]})){pendingConflict={remote:remote.vault,version:remote.version};renderAccount();status('sync-status','vault.conflict');return;}
   adoptRemote(remote.vault,remote.version);status('sync-status','vault.pulled');return;
  }
  if(!remote||changedLocally){
   const saved=await pushVault(local,key,remote?remote.version:0);
   syncState={version:saved.version,syncedAt:new Date().toISOString(),userId:session.user_id||null};saveSyncState(syncState);
   status('sync-status','vault.pushed');
  }else if(!quiet)status('sync-status','vault.upToDate');
 }catch(error){const [k,f]=describeError(error);status('sync-status',k,f);if(error instanceof SyncError&&error.messageKey==='vault.signedOut'){session=null;}}
 finally{setBusy(false);renderAccount();}
}
function adoptRemote(remote:Vault,version:number){
 const imported=importCases(remote.cases);
 if(!saveVault({...remote,cases:[]})){reportStorage('sync-status');return;}
 vault=loadVault()||remote;
 syncState={version,syncedAt:new Date().toISOString(),userId:session?.user_id||null};saveSyncState(syncState);pendingConflict=null;renderAll();
 if(imported.added)status('vault-status','vault.casesImported',{count:imported.added});
}
el('conflict-use-server').addEventListener('click',()=>{if(pendingConflict){adoptRemote(pendingConflict.remote,pendingConflict.version);status('sync-status','vault.pulled');}});
el('conflict-use-mine').addEventListener('click',async()=>{
 if(!pendingConflict||busy)return;const key=loadVaultKey();if(!key)return;setBusy(true);
 try{const saved=await pushVault({...vault,cases:listCases()},key,pendingConflict.version);syncState={version:saved.version,syncedAt:new Date().toISOString(),userId:session?.user_id||null};saveSyncState(syncState);pendingConflict=null;status('sync-status','vault.pushed');}
 catch(error){const [k,f]=describeError(error);status('sync-status',k,f);}finally{setBusy(false);renderAccount();}
});
el('sync-now').addEventListener('click',()=>void syncNow());
el('account-register').addEventListener('click',async()=>{
 if(busy)return;setBusy(true);status('account-status','vault.registering');
 try{
  const key=ensureVaultKey();
  const result=await registerPasskey(key);
  session=await getSession();syncState={version:0,syncedAt:null,userId:result.userId};saveSyncState(syncState);
  status('account-status',result.prfWrapped?'vault.registered':'vault.registeredSaveKey');
  el<HTMLDetailsElement>('recovery-panel').open=!result.prfWrapped;
  await syncNow(true);
 }catch(error){const [k,f]=describeError(error);status('account-status',k,f);}
 finally{setBusy(false);renderAccount();}
});
el('account-login').addEventListener('click',async()=>{
 if(busy)return;setBusy(true);status('account-status','vault.signingIn');
 try{
  const result=await loginPasskey();session=await getSession();syncState={...loadSyncState(),userId:result.userId};
  if(syncState.userId!==result.userId)syncState={version:0,syncedAt:null,userId:result.userId};saveSyncState(syncState);
  status('account-status',result.needsRecoveryKey?'vault.needsKey':result.keyRecovered?'vault.keyUnlocked':'vault.signedInShort');
  if(!result.needsRecoveryKey)await syncNow(true);
 }catch(error){const [k,f]=describeError(error);status('account-status',k,f);}
 finally{setBusy(false);renderAccount();}
});
el('account-logout').addEventListener('click',async()=>{
 if(busy)return;setBusy(true);
 try{await logout();}catch{/* The cookie is cleared by the response either way. */}
 session=null;status('account-status','vault.signedOutDone');setBusy(false);renderAccount();
});
el('account-delete').addEventListener('click',async()=>{
 if(busy||!confirm(t('vault.deleteAccountConfirm')))return;setBusy(true);
 try{await eraseAccount();session=null;syncState={version:0,syncedAt:null,userId:null};saveSyncState(syncState);status('account-status','vault.accountDeleted');}
 catch(error){const [k,f]=describeError(error);status('account-status',k,f);}
 finally{setBusy(false);renderAccount();}
});
form('recovery-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 try{const key=parseRecoveryInput(field(form('recovery-form'),'recovery').value);if(!saveVaultKey(key)){status('recovery-status','error.storage');return;}field(form('recovery-form'),'recovery').value='';status('recovery-status','vault.keySaved');renderAccount();await syncNow(true);}
 catch(error){const [k,f]=describeError(error);status('recovery-status',k==='vault.wrongKey'?'vault.invalidKey':k,f);}
});
el('recovery-show').addEventListener('click',()=>{const input=el<HTMLInputElement>('recovery-key');input.type=input.type==='password'?'text':'password';});
el('recovery-copy').addEventListener('click',async()=>{const key=loadVaultKey();if(!key)return;try{await navigator.clipboard.writeText(recoveryLink(key,location.origin));status('recovery-status','vault.keyCopied');}catch{const input=el<HTMLInputElement>('recovery-key');input.type='text';input.focus();input.select();status('recovery-status','transfer.keyCopyManual');}});
// A recovery link opened on a new device carries the key in the fragment; remove it before anything else loads.
if(location.hash.startsWith('#recover=')){
 const fragment=location.hash;history.replaceState(history.state,'',location.pathname+location.search);
 try{const key=parseRecoveryInput(fragment);if(saveVaultKey(key))status('recovery-status','vault.keySaved');else status('recovery-status','error.storage');}catch{status('recovery-status','vault.invalidKey');}
}

// --- Local data ---
el('vault-export').addEventListener('click',()=>download('claimclock-vault.json',JSON.stringify({...vault,cases:listCases()},null,2),'application/json'));
el<HTMLInputElement>('vault-import-file').addEventListener('change',async()=>{
 const input=el<HTMLInputElement>('vault-import-file'),file=input.files?.[0];if(!file)return;
 try{if(file.size>1_000_000)throw Error();const incoming=parseVault(JSON.parse(await file.text()));if(!confirm(t('vault.importConfirm')))return;const imported=importCases(incoming.cases);if(!saveVault({...incoming,cases:[]})){reportStorage('vault-status');return;}vault=loadVault()||incoming;renderAll();status('vault-status',imported.added?'vault.casesImported':'vault.imported',{count:imported.added});}
 catch{status('vault-status','vault.invalid');}finally{input.value='';}
});
el('vault-clear').addEventListener('click',()=>{
 if(!confirm(t('vault.clearConfirm')))return;
 clearVault();clearVaultKey();vault=emptyVault(lang());syncState={version:0,syncedAt:null,userId:null};renderAll();status('vault-status','vault.cleared');
});

function renderAll(){renderProfile();renderMembers();renderPolicies();renderPlanChoices(planSelect.value);renderAccount();const issue=vaultStorageIssue();if(issue)reportStorage('vault-status');}
window.addEventListener('languagechange',renderAll);
for(const selector of ['#profile-form button[type=submit]','#member-form button[type=submit]','#policy-form button[type=submit]','#recovery-form button[type=submit]'])document.querySelector<HTMLButtonElement>(selector)!.disabled=false;
for(const id of ['account-register','account-login','sync-now','vault-export','vault-clear','recovery-show','recovery-copy','conflict-use-server','conflict-use-mine'])el<HTMLButtonElement>(id).disabled=false;
el<HTMLInputElement>('policy-file').disabled=false;el<HTMLInputElement>('vault-import-file').disabled=false;
renderAll();
void refreshSession().then(()=>{if(session?.authenticated&&loadVaultKey())return syncNow(true);});
void platformPasskeyAvailable().then(available=>{if(!available&&passkeysSupported())status('account-hint','vault.noPlatformAuthenticator');});
