// Erasure credentials are deliberately separate from cases, backups and transfers.
export const RECEIPTS_KEY='claimclock:receipts:v1';
export const LEGACY_RECEIPT_KEY='claimclock:erase';
export type Receipt={id:string;erase_token:string;caseId?:string};
type Registry={version:1;receipts:Record<string,Receipt>};
let issue:''|'corrupt'|'unavailable'|'save'|'legacy'|'conflict'='';
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
export function parseReceipt(value:unknown):Receipt|null{
 if(!object(value)||Object.keys(value).some(key=>!['id','erase_token','caseId'].includes(key))||typeof value.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.id)||typeof value.erase_token!=='string'||!/^[0-9a-f]{64}$/.test(value.erase_token))return null;
 if(value.caseId!==undefined&&(typeof value.caseId!=='string'||!value.caseId.trim()||value.caseId.length>128||/[\u0000-\u001f]/.test(value.caseId)))return null;
 return {id:value.id,erase_token:value.erase_token,...(value.caseId?{caseId:value.caseId as string}:{})};
}
function parseRegistry(raw:string):Registry{
 const value:unknown=JSON.parse(raw);
 if(!object(value)||Object.keys(value).some(key=>!['version','receipts'].includes(key))||value.version!==1||!object(value.receipts))throw Error();
 const receipts:Record<string,Receipt>={};
 for(const [id,input] of Object.entries(value.receipts)){const receipt=parseReceipt(input);if(!receipt||receipt.id!==id)throw Error();receipts[id]=receipt;}
 return {version:1,receipts};
}
function read(){
 issue='';let registry:Registry|null={version:1,receipts:{}},legacy:Receipt|null=null,legacyRaw:string|null=null;
 try{
  const raw=localStorage.getItem(RECEIPTS_KEY);if(raw!==null){try{registry=parseRegistry(raw);}catch{registry=null;issue='corrupt';}}
  legacyRaw=localStorage.getItem(LEGACY_RECEIPT_KEY);
  if(legacyRaw!==null){try{legacy=parseReceipt(JSON.parse(legacyRaw));}catch{}if(!legacy&&!issue)issue='legacy';}
 }catch{registry=null;issue='unavailable';}
 return {registry,legacy,legacyRaw};
}
function write(registry:Registry):boolean{
 try{const raw=JSON.stringify(registry);parseRegistry(raw);localStorage.setItem(RECEIPTS_KEY,raw);if(localStorage.getItem(RECEIPTS_KEY)!==raw)throw Error();return true;}
 catch{issue='save';return false;}
}
function clearLegacy(raw:string|null):boolean{
 // Another tab/older page may have written a different receipt in the meantime.
 try{if(raw!==null&&localStorage.getItem(LEGACY_RECEIPT_KEY)===raw)localStorage.removeItem(LEGACY_RECEIPT_KEY);return true;}catch{issue='save';return false;}
}
function mergeLegacy(state:ReturnType<typeof read>):boolean{
 if(!state.registry)return false;
 if(state.legacy){const previous=state.registry.receipts[state.legacy.id];if(previous&&previous.erase_token!==state.legacy.erase_token){issue='conflict';return false;}state.registry.receipts[state.legacy.id]=previous||state.legacy;}
 return true;
}
export function receiptIssue(){return issue;}
export function listReceipts():Receipt[]{
 const state=read();if(!mergeLegacy(state))return state.registry?Object.values(state.registry.receipts):state.legacy?[state.legacy]:[];
 if(state.legacy&&write(state.registry!))clearLegacy(state.legacyRaw);
 return Object.values(state.registry!.receipts);
}
export function saveReceipt(value:{id:string;erase_token:string},caseId?:string):boolean{
 const receipt=parseReceipt({...value,...(caseId===undefined?{}:{caseId})});if(!receipt){issue='corrupt';return false;}
 const state=read();if(!mergeLegacy(state))return false;
 const previous=state.registry!.receipts[receipt.id];
 if(previous&&previous.erase_token!==receipt.erase_token){issue='conflict';return false;}
 state.registry!.receipts[receipt.id]={...previous,...receipt};
 if(!write(state.registry!))return false;
 if(state.legacy)clearLegacy(state.legacyRaw);
 return true;
}
// Call only after this exact report/token pair receives erased:true from the API.
export function removeReceipt(value:{id:string;erase_token:string}):boolean{
 const receipt=parseReceipt(value);if(!receipt){issue='corrupt';return false;}
 const state=read();if(!mergeLegacy(state))return false;
 const previous=state.registry!.receipts[receipt.id];
 if(previous?.erase_token===receipt.erase_token)delete state.registry!.receipts[receipt.id];
 if(!write(state.registry!))return false;
 if(state.legacy&&!clearLegacy(state.legacyRaw))return false;
 return true;
}
