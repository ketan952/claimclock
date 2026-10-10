/** Published channels are never averaged without their claim denominators. */
export type Disclosure = {
 id?:string; document_url?:string; source_url?:string; source_page?:number;
 insurer_id:string; period:string; request_type:string; policy_type:string; tpa:string;
 unit:string; sample_size:number|null; lt1h:number|null; h1_2:number|null; h2_6:number|null;
 h6_12:number|null; h12_24:number|null; gt24h:number|null;
};
export type Share = {min:number;max:number;minChannels?:string[];maxChannels?:string[]}|null;
export type SourceReview = {row_id:string;expected_buckets:(number|null)[];unit:string;sample_size:number|null;document_url:string;source_page:number;reviewed_on:string};
export type RowValidation = {total:number|null;knownTotal:number;status:'pass'|'incomplete'|'fail';flags:('late'|'hundred')[];reviewedOn:string|null};
export type Comparison = {period:string|null;channels:number;channelNames:string[];count:number|null;mode:'single'|'weighted'|'range'|'missing';shares:Share[];validation:{channel:string;result:RowValidation}[]};
const keys=['lt1h','h1_2','h2_6','h6_12','h12_24','gt24h'] as const;
function periodOrder(period:string){const year=Number(period.match(/20\d{2}/)?.[0]||0);const quarter=Number(period.match(/Q([1-4])/i)?.[1]||4);return year*10+quarter;}
function percentages(row:Disclosure):(number|null)[]{
 const values=keys.map(k=>row[k]);
 if(row.unit==='percent')return values;
 if((row.unit==='count'||row.unit==='number')&&row.sample_size&&row.sample_size>0)return values.map(n=>n===null?null:n/row.sample_size!*100);
 return values.map(()=>null);
}
/** Unknown cells stay unknown. A known late subtotal above 10 already warrants review. */
export function validateDisclosure(row:Disclosure,reviews:SourceReview[]=[]):RowValidation{
 const p=percentages(row),known=p.filter((v):v is number=>v!==null);
 const knownTotal=known.reduce((sum,v)=>sum+v,0),complete=known.length===keys.length;
 const invalid=known.some(v=>!Number.isFinite(v)||v<0||v>100)||knownTotal>101+1e-9;
 const status=invalid||(complete&&knownTotal<99-1e-9)?'fail':complete?'pass':'incomplete';
 const flags:RowValidation['flags']=[];
 if(p.slice(3).reduce<number>((sum,v)=>sum+(v??0),0)>10+1e-9)flags.push('late');
 if(p.some(v=>v===100))flags.push('hundred');
 const review=reviews.find(r=>r.row_id===row.id&&r.unit===row.unit&&r.sample_size===row.sample_size&&r.source_page===row.source_page&&r.document_url===(row.document_url||row.source_url)&&r.expected_buckets.length===keys.length&&keys.every((k,i)=>row[k]===r.expected_buckets[i]));
 return{total:complete?knownTotal:null,knownTotal,status,flags,reviewedOn:review?.reviewed_on||null};
}
export const providerKey=(name:string)=>name==='In-house'?'index.inHouse':name.startsWith('Combined TPAs')?'index.combinedTpas':name.startsWith('Consolidated in-house')?'index.combinedProviders':name==='Consolidated insurer disclosure (TPAs listed)'?'index.consolidatedInsurer':undefined;
export function compareInsurer(all:Disclosure[],id:string,reviews:SourceReview[]=[]):Comparison{
 const insurerRows=all.filter(r=>r.insurer_id===id);
 const period=insurerRows.map(r=>r.period).sort((a,b)=>periodOrder(b)-periodOrder(a)||b.localeCompare(a))[0]||null;
 const rows=insurerRows.filter(r=>r.period===period&&r.request_type==='discharge'&&r.policy_type==='individual');
 if(!rows.length)return{period,channels:0,channelNames:[],count:null,mode:'missing',shares:[null,null,null,null],validation:[]};
 const denominators=rows.every(r=>r.sample_size!==null&&r.sample_size>0);
 const count=denominators?rows.reduce((n,r)=>n+r.sample_size!,0):null;
 const values=rows.map(r=>{const p=percentages(r);return[p[0],p[1],p[2],p.slice(3).every(n=>n!==null)?p.slice(3).reduce<number>((n,v)=>n+v!,0):null];});
 const mode=rows.length===1?'single':denominators?'weighted':'range';
 const shares=[0,1,2,3].map(i=>{
  const cells=values.map(v=>v[i]);
  // A missing channel or >6-hour component is unknown, never an assumed zero.
  if(cells.some(v=>v===null))return null;
  if(mode==='weighted'){const n=cells.reduce<number>((sum,v,j)=>sum+v!*rows[j].sample_size!,0)/count!;return{min:n,max:n};}
  const min=Math.min(...cells as number[]),max=Math.max(...cells as number[]);
  return mode==='range'?{min,max,minChannels:rows.filter((_,j)=>cells[j]===min).map(r=>r.tpa),maxChannels:rows.filter((_,j)=>cells[j]===max).map(r=>r.tpa)}:{min,max};
 });
 return{period,channels:rows.length,channelNames:rows.map(r=>r.tpa),count,mode,shares,validation:rows.map(r=>({channel:r.tpa,result:validateDisclosure(r,reviews)}))};
}
export function shareText(value:Share){if(!value)return'—';const f=(n:number)=>Number(n.toFixed(2)).toString();return value.min===value.max?`${f(value.min)}%`:`${f(value.min)}–${f(value.max)}%`;}
