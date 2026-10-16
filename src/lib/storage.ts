import type {Timeline} from './types.ts';
import type {DeductionInput} from './deductions.ts';
import {parseBackup,makeBackup,parseDeductionInputs,type CaseBackup} from './backup.ts';
export const CASES_KEY='claimclock:cases:v1';
export const LEGACY_KEY='claimclock:timeline:v1';
type CaseStore={version:1;selectedId:string|null;cases:CaseBackup[]};
let issue:''|'corrupt'|'unavailable'|'save'|'conflict'='';
const empty=():CaseStore=>({version:1,selectedId:null,cases:[]});
function readStore():CaseStore|null{
 issue='';try{
  let raw:string|null;try{raw=localStorage.getItem(CASES_KEY);}catch{issue='unavailable';return null;}
  if(raw!==null){
   const value=JSON.parse(raw);if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['version','selectedId','cases'].includes(k))||value.version!==1||!Array.isArray(value.cases)||value.cases.length>50||(value.selectedId!==null&&typeof value.selectedId!=='string'))throw Error();
   const cases=value.cases.map(parseBackup) as CaseBackup[];if(new Set(cases.map(c=>c.timeline.id)).size!==cases.length||(value.selectedId!==null&&!cases.some(c=>c.timeline.id===value.selectedId)))throw Error();return {version:1,selectedId:value.selectedId,cases};
  }
  let legacy:string|null;try{legacy=localStorage.getItem(LEGACY_KEY);}catch{issue='unavailable';return null;}if(legacy===null)return empty();
  const backup=parseBackup(JSON.parse(legacy));const migrated:CaseStore={version:1,selectedId:backup.timeline.id,cases:[backup]};
  // The original survives unless the complete replacement has been saved successfully.
  if(writeStore(migrated)){try{localStorage.removeItem(LEGACY_KEY);}catch{/* Keep the original if removal is unavailable. */}}return migrated;
 }catch(error){issue=error instanceof SyntaxError?'corrupt':issue||'corrupt';return null;}
}
function writeStore(store:CaseStore):boolean{try{localStorage.setItem(CASES_KEY,JSON.stringify(store));issue='';return true;}catch{issue='save';return false;}}
export function storageIssue(){return issue;}
export function listCases():CaseBackup[]{return readStore()?.cases||[];}
export function getSelectedBackup():CaseBackup|null{const store=readStore();return store?.cases.find(c=>c.timeline.id===store.selectedId)||null;}
export function loadTimeline():Timeline|null{return getSelectedBackup()?.timeline||null;}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const caseContents=(value:CaseBackup|undefined)=>value?{timeline:value.timeline,deductions:value.deductions}:null;
export function sameCaseIdentity(a:Timeline,b:Timeline){return ['id','insurerId','tpaId','hospital','city','requestType','submittedAt'].every(key=>a[key as keyof Timeline]===b[key as keyof Timeline]);}
function conflict(){issue='conflict';return false;}
export function saveTimeline(timeline:Timeline,expected?:Timeline|null):boolean{
 const store=readStore();if(!store)return false;try{const old=store.cases.find(c=>c.timeline.id===timeline.id);if(expected!==undefined&&!same(old?.timeline||null,expected?makeBackup(expected).timeline:null))return conflict();const backup=makeBackup(timeline,old?.deductions||[]);if(old)store.cases[store.cases.indexOf(old)]=backup;else {if(store.cases.length>=50)return false;store.cases.push(backup);}store.selectedId=timeline.id;return writeStore(store);}catch{issue='save';return false;}
}
export function selectCase(id:string|null):boolean{const store=readStore();if(!store||(id!==null&&!store.cases.some(c=>c.timeline.id===id)))return false;store.selectedId=id;return writeStore(store);}
export function deleteCase(id:string,expected?:CaseBackup):boolean{const store=readStore();if(!store)return false;if(expected&&!same(caseContents(store.cases.find(c=>c.timeline.id===id)),caseContents(expected)))return conflict();store.cases=store.cases.filter(c=>c.timeline.id!==id);if(store.selectedId===id)store.selectedId=store.cases[0]?.timeline.id||null;return writeStore(store);}
export function saveDeductions(id:string,inputs:DeductionInput[],expected?:CaseBackup):boolean{const store=readStore();if(!store)return false;const backup=store.cases.find(c=>c.timeline.id===id);if(!backup)return expected?conflict():false;if(expected&&(!same(backup.deductions,expected.deductions)||!sameCaseIdentity(backup.timeline,expected.timeline)))return conflict();try{backup.deductions=parseDeductionInputs(inputs);backup.exportedAt=new Date().toISOString();return writeStore(store);}catch{issue='save';return false;}}
export function restoreCase(value:CaseBackup,replaceId?:string,expected?:CaseBackup):boolean{
 const store=readStore();if(!store)return false;try{const backup=parseBackup(value);if(replaceId){const index=store.cases.findIndex(c=>c.timeline.id===replaceId);if(expected&&!same(caseContents(store.cases[index]),caseContents(expected)))return conflict();if(index<0)return false;backup.timeline.id=replaceId;store.cases[index]=backup;}else {if(store.cases.length>=50)return false;backup.timeline.id=crypto.randomUUID();store.cases.push(backup);}store.selectedId=backup.timeline.id;return writeStore(store);}catch{issue='save';return false;}
}
/** Vault sync (M20): adds cases from another device without renaming them; existing ids and the 50-case limit are respected. */
export function importCases(incoming:CaseBackup[]):{added:number;skipped:number}{
 const store=readStore();if(!store)return {added:0,skipped:incoming.length};
 let added=0,skipped=0;
 for(const value of incoming){
  try{const backup=parseBackup(value);if(store.cases.some(c=>c.timeline.id===backup.timeline.id)||store.cases.length>=50){skipped++;continue;}store.cases.push(backup);added++;}
  catch{skipped++;}
 }
 if(added&&!writeStore(store))return {added:0,skipped:incoming.length};
 return {added,skipped};
}
export function rawLocalBackup():string{try{return JSON.stringify({cases:localStorage.getItem(CASES_KEY),legacy:localStorage.getItem(LEGACY_KEY)},null,2);}catch{return '';}}
export function eraseLocal(){const selected=getSelectedBackup();return selected?deleteCase(selected.timeline.id):true;}
export function download(name:string,content:string,type='text/plain;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
