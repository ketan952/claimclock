// Fills the identity placeholders in generated letters from the vault (M20). Generators stay
// unchanged and keep producing placeholders, so snapshots, guests and partial vaults all work;
// substitution happens once, at display time, and inserted values are never re-expanded.
import {loadVault,selectPolicy,type Vault} from './vault.ts';
import type {Letter} from './types.ts';

export type Identity={name?:string;policyNumber?:string;claimNumber?:string;uhid?:string;patientName?:string};
export type Placeholder={key:keyof Identity|'policyOrClaim';en:string;hi:string};
export const PLACEHOLDERS:Placeholder[]=[
 {key:'name',en:'[Your name]',hi:'[आपका नाम]'},
 {key:'policyOrClaim',en:'[Policy / Claim number]',hi:'[पॉलिसी / दावा संख्या]'},
 {key:'policyNumber',en:'[Policy number]',hi:'[पॉलिसी संख्या]'},
 {key:'claimNumber',en:'[Claim number]',hi:'[दावा संख्या]'},
 {key:'uhid',en:'[UHID]',hi:'[UHID]'},
 {key:'patientName',en:'[Patient name]',hi:'[मरीज़ का नाम]'},
];
export function identityFor(vault:Vault|null,insurerId?:string):Identity {
 if(!vault)return {};
 const policy=selectPolicy(vault,insurerId);
 const identity:Identity={};
 if(vault.profile.name.trim())identity.name=vault.profile.name.trim();
 if(policy){
  if(policy.policyNumber.trim())identity.policyNumber=policy.policyNumber.trim();
  if(policy.claimNumber?.trim())identity.claimNumber=policy.claimNumber.trim();
  if(policy.uhid?.trim())identity.uhid=policy.uhid.trim();
 }
 return identity;
}
export function currentIdentity(insurerId?:string):Identity{return identityFor(loadVault(),insurerId);}
function valueFor(identity:Identity,key:Placeholder['key']):string|undefined {
 if(key==='policyOrClaim'){const parts=[identity.policyNumber,identity.claimNumber].filter((v):v is string=>Boolean(v));return parts.length?parts.join(' / '):undefined;}
 return identity[key];
}
function substitute(text:string,identity:Identity):string {
 // Split on every placeholder token first so a substituted value containing brackets is left alone.
 const tokens=PLACEHOLDERS.flatMap(p=>[p.en,p.hi]).filter((t,i,all)=>all.indexOf(t)===i);
 const pattern=new RegExp(tokens.map(t=>t.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&')).join('|'),'g');
 return text.replace(pattern,token=>{const placeholder=PLACEHOLDERS.find(p=>p.en===token||p.hi===token)!;return valueFor(identity,placeholder.key)??token;});
}
export function personalize(letter:Letter,identity:Identity):Letter {
 if(!Object.values(identity).some(Boolean))return letter;
 return {...letter,subject:substitute(letter.subject,identity),body:substitute(letter.body,identity)};
}
export function hasPlaceholders(text:string):boolean{return PLACEHOLDERS.some(p=>text.includes(p.en)||text.includes(p.hi));}
