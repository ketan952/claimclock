import contacts from '../../data/contacts.json' with {type:'json'};
import type {Timeline} from './types.ts';
import type {DeductionInput} from './deductions.ts';
export type CaseBackup={format:'claimclock-case';version:1;exportedAt:string;timeline:Timeline;deductions:DeductionInput[]};
export const MAX_BACKUP_BYTES=1_000_000;
const insurers=new Set([...contacts.filter(c=>c.kind==='insurer').map(c=>c.id),'unlisted']);
const tpas=new Set(contacts.filter(c=>c.kind==='tpa').map(c=>c.id));
function object(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Invalid backup object');
 const row=value as Record<string,unknown>;if(Object.keys(row).some(key=>!keys.includes(key)))throw Error('Unknown backup field');return row;
}
function text(value:unknown,max:number,required=false):string {if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))throw Error('Invalid backup text');return value;}
export function backupDate(value:unknown):string {
 const date=text(value,24,true);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date))throw Error('Invalid backup date');
 const ms=Date.parse(date);if(!Number.isFinite(ms)||new Date(ms).toISOString()!==date.replace(/Z$/,date.includes('.')?'Z':'.000Z'))throw Error('Invalid calendar date');return new Date(ms).toISOString();
}
function parseTimeline(value:unknown):Timeline {
 const row=object(value,['id','insurerId','tpaId','hospital','city','requestType','submittedAt','events','decidedAt','outcome']);
 const insurerId=text(row.insurerId,100,true),tpaId=row.tpaId===undefined?undefined:text(row.tpaId,100);if(!insurers.has(insurerId)||(tpaId&&!tpas.has(tpaId)))throw Error('Unknown insurer or TPA');
 if((typeof row.requestType!=='string'||!['preauth','enhancement','discharge'].includes(row.requestType)))throw Error('Unknown request type');
 const submittedAt=backupDate(row.submittedAt);if(!Array.isArray(row.events)||row.events.length>500)throw Error('Invalid events');
 const ids=new Set<string>();const events=row.events.map(value=>{const e=object(value,['id','at','type','note']);const id=text(e.id,128,true);if(ids.has(id))throw Error('Duplicate event');ids.add(id);const at=backupDate(e.at);if((typeof e.type!=='string'||!['query','documents','call','ack','other'].includes(e.type)))throw Error('Invalid event');return {id,at,type:String(e.type),note:text(e.note,500)};});
 const result:Timeline={id:text(row.id,128,true),insurerId,hospital:text(row.hospital,100),city:text(row.city,70),requestType:row.requestType as Timeline['requestType'],submittedAt,events};
 if(tpaId!==undefined)result.tpaId=tpaId;
 if(row.decidedAt!==undefined||row.outcome!==undefined){const decidedAt=backupDate(row.decidedAt);if(Date.parse(decidedAt)<Date.parse(submittedAt)||(typeof row.outcome!=='string'||!['approved','partial','rejected'].includes(row.outcome)))throw Error('Invalid decision');result.decidedAt=decidedAt;result.outcome=String(row.outcome);}
 return result;
}
export function parseDeductionInputs(value:unknown):DeductionInput[]{
 if(!Array.isArray(value)||value.length>200)throw Error('Invalid deductions');const ids=new Set<string>();
 return value.map(value=>{const d=object(value,['id','description','amount','policyClause','policyCalculationConfirmed','noApplicablePolicyClause']);const id=text(d.id,128,true);if(ids.has(id))throw Error('Duplicate deduction');ids.add(id);if(typeof d.amount!=='number'||!Number.isFinite(d.amount)||d.amount<=0||d.amount>1e8||Math.abs(d.amount*100-Math.round(d.amount*100))>0.000001)throw Error('Invalid amount');
  const result:DeductionInput={id,description:text(d.description,300,true),amount:d.amount};if(d.policyClause!==undefined)result.policyClause=text(d.policyClause,150);for(const key of ['policyCalculationConfirmed','noApplicablePolicyClause'] as const)if(d[key]!==undefined){if(typeof d[key]!=='boolean')throw Error('Invalid confirmation');result[key]=d[key];}if(result.noApplicablePolicyClause&&(result.policyClause?.trim()||result.policyCalculationConfirmed))throw Error('Conflicting policy confirmation');return result;
 });
}
export function parseBackup(value:unknown):CaseBackup {
 // The earlier Download a backup action exported a plain Timeline.
 if(value&&typeof value==='object'&&!Object.hasOwn(value,'format'))return {format:'claimclock-case',version:1,exportedAt:new Date().toISOString(),timeline:parseTimeline(value),deductions:[]};
 const row=object(value,['format','version','exportedAt','timeline','deductions']);if(row.format!=='claimclock-case'||row.version!==1)throw Error('Unsupported backup version');
 return {format:'claimclock-case',version:1,exportedAt:backupDate(row.exportedAt),timeline:parseTimeline(row.timeline),deductions:parseDeductionInputs(row.deductions)};
}
export function makeBackup(timeline:Timeline,deductions:DeductionInput[]=[]):CaseBackup{return parseBackup({format:'claimclock-case',version:1,exportedAt:new Date().toISOString(),timeline,deductions});}
