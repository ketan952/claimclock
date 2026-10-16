// The vault (M20): profile, family members, policies and attached cases. It lives in plain
// form in this browser's storage (like cases already do) and leaves the device only as an
// AES-GCM envelope produced by vault-crypto. Every field is validated before it is trusted.
import contacts from '../../data/contacts.json' with {type:'json'};
import plansRaw from '../../data/plans.json' with {type:'json'};
import {parseBackup,backupDate,type CaseBackup} from './backup.ts';
import type {Language} from './types.ts';

export const VAULT_KEY='claimclock:vault:v1';
export const VAULT_SECRET_KEY='claimclock:vault-key:v1';
export const VAULT_SYNC_KEY='claimclock:vault-sync:v1';
export const MAX_MEMBERS=20,MAX_POLICIES=30,MAX_CASES=50,MAX_VAULT_TEXT_BYTES=240*1024;
export const RELATIONS=['self','spouse','child','parent','parent-in-law','other'] as const;
export const POLICY_KINDS=['health','life','motor'] as const;
export const CONSUMABLES_COVER=['included','rider','excluded','unknown'] as const;
export type Relation=typeof RELATIONS[number];
export type PolicyKind=typeof POLICY_KINDS[number];
export type ConsumablesCover=typeof CONSUMABLES_COVER[number];
export type Member={id:string;name:string;relation:Relation;birthYear?:number;conditions?:string};
export type Policy={
 id:string;kind:PolicyKind;insurerId:string;planId?:string;planName?:string;policyNumber:string;
 sumInsured?:number;inceptionDate?:string;continuityFrom?:string;renewalDate?:string;memberIds:string[];
 uhid?:string;claimNumber?:string;corporate?:boolean;roomRent?:string;copayPercent?:number;consumables?:ConsumablesCover;
 healthCheckupLimit?:number;healthCheckupLastClaimedOn?:string;noClaimBonus?:number;notes?:string;
};
export type Profile={name:string;city:string;language:Language};
export type Vault={format:'claimclock-vault';version:1;updatedAt:string;profile:Profile;members:Member[];policies:Policy[];defaultPolicyId:string|null;cases:CaseBackup[]};
export type SyncState={version:number;syncedAt:string|null;userId:string|null};
export type Plan={id:string;insurer_id:string;name:string;kind:PolicyKind;rules:Record<string,{value?:unknown;source_url:string;verified_on:string;evidence:string;[key:string]:unknown}|null>};

const insurerIds=new Set([...contacts.filter(c=>c.kind==='insurer').map(c=>c.id),'unlisted']);
export const plans=plansRaw as unknown as Plan[];
const planIds=new Set(plans.map(p=>p.id));
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function object(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Invalid vault object');
 const row=value as Record<string,unknown>;if(Object.keys(row).some(key=>!keys.includes(key)))throw Error('Unknown vault field');return row;
}
function text(value:unknown,max:number,required=false):string{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))throw Error('Invalid vault text');return value;}
function optionalText(value:unknown,max:number):string|undefined{return value===undefined?undefined:text(value,max);}
function date(value:unknown):string{const v=text(value,10,true);if(!DATE.test(v)||!Number.isFinite(Date.parse(`${v}T00:00:00Z`))||new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)!==v)throw Error('Invalid vault date');return v;}
function optionalDate(value:unknown):string|undefined{return value===undefined?undefined:date(value);}
function number(value:unknown,min:number,max:number,integer=false):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw Error('Invalid vault number');return value;}
function optionalNumber(value:unknown,min:number,max:number,integer=false):number|undefined{return value===undefined?undefined:number(value,min,max,integer);}
function unique(ids:string[]){if(new Set(ids).size!==ids.length)throw Error('Duplicate vault id');}
export function parseMember(value:unknown):Member {
 const row=object(value,['id','name','relation','birthYear','conditions']);
 const member:Member={id:text(row.id,128,true),name:text(row.name,100,true),relation:(RELATIONS as readonly string[]).includes(String(row.relation))?row.relation as Relation:(()=>{throw Error('Invalid relation');})()};
 const birthYear=optionalNumber(row.birthYear,1900,new Date().getUTCFullYear(),true);if(birthYear!==undefined)member.birthYear=birthYear;
 const conditions=optionalText(row.conditions,300);if(conditions!==undefined)member.conditions=conditions;
 return member;
}
export function parsePolicy(value:unknown,memberIds:Set<string>):Policy {
 const row=object(value,['id','kind','insurerId','planId','planName','policyNumber','sumInsured','inceptionDate','continuityFrom','renewalDate','memberIds','uhid','claimNumber','corporate','roomRent','copayPercent','consumables','healthCheckupLimit','healthCheckupLastClaimedOn','noClaimBonus','notes']);
 if(!(POLICY_KINDS as readonly string[]).includes(String(row.kind)))throw Error('Invalid policy kind');
 const insurerId=text(row.insurerId,100,true);if(!insurerIds.has(insurerId))throw Error('Unknown insurer');
 if(!Array.isArray(row.memberIds)||row.memberIds.length>MAX_MEMBERS)throw Error('Invalid policy members');
 const members=row.memberIds.map(id=>text(id,128,true));unique(members);if(members.some(id=>!memberIds.has(id)))throw Error('Unknown policy member');
 const policy:Policy={id:text(row.id,128,true),kind:row.kind as PolicyKind,insurerId,policyNumber:text(row.policyNumber,60),memberIds:members};
 const planId=optionalText(row.planId,100);if(planId!==undefined){if(!planIds.has(planId))throw Error('Unknown plan');policy.planId=planId;}
 const assign=<K extends keyof Policy>(key:K,parsed:Policy[K]|undefined)=>{if(parsed!==undefined)policy[key]=parsed;};
 assign('planName',optionalText(row.planName,120));assign('sumInsured',optionalNumber(row.sumInsured,1,1e9));assign('inceptionDate',optionalDate(row.inceptionDate));assign('continuityFrom',optionalDate(row.continuityFrom));assign('renewalDate',optionalDate(row.renewalDate));
 assign('uhid',optionalText(row.uhid,60));assign('claimNumber',optionalText(row.claimNumber,60));
 if(row.corporate!==undefined){if(typeof row.corporate!=='boolean')throw Error('Invalid flag');policy.corporate=row.corporate;}
 assign('roomRent',optionalText(row.roomRent,120));assign('copayPercent',optionalNumber(row.copayPercent,0,100));
 if(row.consumables!==undefined){if(!(CONSUMABLES_COVER as readonly string[]).includes(String(row.consumables)))throw Error('Invalid consumables cover');policy.consumables=row.consumables as ConsumablesCover;}
 assign('healthCheckupLimit',optionalNumber(row.healthCheckupLimit,0,1e7));assign('healthCheckupLastClaimedOn',optionalDate(row.healthCheckupLastClaimedOn));assign('noClaimBonus',optionalNumber(row.noClaimBonus,0,1e9));assign('notes',optionalText(row.notes,500));
 if(policy.continuityFrom&&policy.inceptionDate&&policy.continuityFrom>policy.inceptionDate)throw Error('Continuity cannot start after inception');
 return policy;
}
export function parseVault(value:unknown):Vault {
 const row=object(value,['format','version','updatedAt','profile','members','policies','defaultPolicyId','cases']);
 if(row.format!=='claimclock-vault'||row.version!==1)throw Error('Unsupported vault version');
 const profileRow=object(row.profile,['name','city','language']);
 const profile:Profile={name:text(profileRow.name,100),city:text(profileRow.city,70),language:profileRow.language==='hi'?'hi':profileRow.language==='en'?'en':(()=>{throw Error('Invalid language');})()};
 if(!Array.isArray(row.members)||row.members.length>MAX_MEMBERS||!Array.isArray(row.policies)||row.policies.length>MAX_POLICIES||!Array.isArray(row.cases)||row.cases.length>MAX_CASES)throw Error('Vault too large');
 const members=row.members.map(parseMember);unique(members.map(m=>m.id));
 const memberIds=new Set(members.map(m=>m.id));
 const policies=row.policies.map(p=>parsePolicy(p,memberIds));unique(policies.map(p=>p.id));
 const cases=row.cases.map(parseBackup);unique(cases.map(c=>c.timeline.id));
 const defaultPolicyId=row.defaultPolicyId===null?null:text(row.defaultPolicyId,128,true);
 if(defaultPolicyId!==null&&!policies.some(p=>p.id===defaultPolicyId))throw Error('Unknown default policy');
 const vault:Vault={format:'claimclock-vault',version:1,updatedAt:backupDate(row.updatedAt),profile,members,policies,defaultPolicyId,cases};
 if(new TextEncoder().encode(JSON.stringify(vault)).byteLength>MAX_VAULT_TEXT_BYTES)throw Error('Vault too large');
 return vault;
}
export function emptyVault(language:Language='en'):Vault{return {format:'claimclock-vault',version:1,updatedAt:new Date().toISOString(),profile:{name:'',city:'',language},members:[],policies:[],defaultPolicyId:null,cases:[]};}

// --- Local storage. Failures are reported through storageIssue(), never swallowed silently. ---
let issue:''|'corrupt'|'unavailable'|'save'='';
export function vaultStorageIssue(){return issue;}
export function loadVault():Vault|null {
 issue='';let raw:string|null;try{raw=localStorage.getItem(VAULT_KEY);}catch{issue='unavailable';return null;}
 if(raw===null)return null;
 try{return parseVault(JSON.parse(raw));}catch{issue='corrupt';return null;}
}
export function saveVault(vault:Vault):boolean {
 try{const checked=parseVault({...vault,updatedAt:new Date().toISOString()});localStorage.setItem(VAULT_KEY,JSON.stringify(checked));issue='';return true;}catch{issue='save';return false;}
}
export function clearVault():void{try{localStorage.removeItem(VAULT_KEY);localStorage.removeItem(VAULT_SYNC_KEY);}catch{issue='unavailable';}}
export function loadVaultKey():string|null{try{const key=localStorage.getItem(VAULT_SECRET_KEY);return key&&/^[A-Za-z0-9_-]{43}$/.test(key)?key:null;}catch{return null;}}
export function saveVaultKey(key:string):boolean{try{localStorage.setItem(VAULT_SECRET_KEY,key);return true;}catch{return false;}}
export function clearVaultKey():void{try{localStorage.removeItem(VAULT_SECRET_KEY);}catch{/* Nothing to clear when storage is unavailable. */}}
export function loadSyncState():SyncState {
 try{const raw=localStorage.getItem(VAULT_SYNC_KEY);if(!raw)return {version:0,syncedAt:null,userId:null};const value=JSON.parse(raw);if(!value||typeof value!=='object'||!Number.isInteger(value.version)||value.version<0)throw Error();return {version:value.version,syncedAt:typeof value.syncedAt==='string'?value.syncedAt:null,userId:typeof value.userId==='string'?value.userId:null};}
 catch{return {version:0,syncedAt:null,userId:null};}
}
export function saveSyncState(state:SyncState):boolean{try{localStorage.setItem(VAULT_SYNC_KEY,JSON.stringify(state));return true;}catch{return false;}}

// --- Derived facts used by letters, the clock and later simulators. ---
export function monthsBetween(from:string,to=new Date()):number {
 const start=new Date(`${from}T00:00:00Z`);if(!Number.isFinite(start.getTime()))return 0;
 const months=(to.getUTCFullYear()-start.getUTCFullYear())*12+(to.getUTCMonth()-start.getUTCMonth())-(to.getUTCDate()<start.getUTCDate()?1:0);
 return Math.max(0,months);
}
/** Health policies cannot be contested for non-disclosure after 60 months of continuous cover (Health MC Ch. I 13); life policies after 36 months (Insurance Act s.45). */
export function indisputabilityMonths(kind:PolicyKind):number|null{return kind==='health'?60:kind==='life'?36:null;}
export function continuityMonths(policy:Policy,now=new Date()):number|null {
 const from=policy.continuityFrom||policy.inceptionDate;return from?monthsBetween(from,now):null;
}
export function daysUntilRenewal(policy:Policy,now=new Date()):number|null {
 if(!policy.renewalDate)return null;
 const renewal=Date.UTC(Number(policy.renewalDate.slice(0,4)),Number(policy.renewalDate.slice(5,7))-1,Number(policy.renewalDate.slice(8,10)));
 return Math.ceil((renewal-Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()))/86400000);
}
export function policyLabel(policy:Policy,language:Language):string {
 const insurer=contacts.find(c=>c.id===policy.insurerId);
 const name=(language==='hi'?insurer?.name_hi:undefined)||insurer?.name||policy.insurerId;
 return [name,policy.planName,policy.policyNumber?`#${policy.policyNumber}`:''].filter(Boolean).join(' · ');
}
/** The policy to pre-fill: a matching insurer first, then the chosen default, then a lone health policy. */
export function selectPolicy(vault:Vault|null,insurerId?:string,kind:PolicyKind='health'):Policy|null {
 if(!vault)return null;
 const candidates=vault.policies.filter(p=>p.kind===kind);
 if(insurerId&&insurerId!=='unlisted'){const match=candidates.filter(p=>p.insurerId===insurerId);if(match.length===1)return match[0];if(match.length>1)return match.find(p=>p.id===vault.defaultPolicyId)||match[0];}
 const fallback=vault.policies.find(p=>p.id===vault.defaultPolicyId);
 if(fallback&&(!insurerId||insurerId==='unlisted'||fallback.insurerId===insurerId))return fallback;
 return !insurerId&&candidates.length===1?candidates[0]:null;
}
