/** Published channels are never averaged without their claim denominators. */
export type Disclosure = {
 insurer_id:string; period:string; request_type:string; policy_type:string; tpa:string;
 unit:string; sample_size:number|null; lt1h:number|null; h1_2:number|null; h2_6:number|null;
 h6_12:number|null; h12_24:number|null; gt24h:number|null;
};
export type Share = {min:number;max:number}|null;
export type Comparison = {period:string|null;channels:number;count:number|null;mode:'single'|'weighted'|'range'|'missing';shares:Share[]};
const keys=['lt1h','h1_2','h2_6','h6_12','h12_24','gt24h'] as const;
function periodOrder(period:string){const year=Number(period.match(/20\d{2}/)?.[0]||0);const quarter=Number(period.match(/Q([1-4])/i)?.[1]||4);return year*10+quarter;}
function percentages(row:Disclosure):(number|null)[]{
 const values=keys.map(k=>row[k]);
 if(row.unit==='percent')return values;
 if((row.unit==='count'||row.unit==='number')&&row.sample_size&&row.sample_size>0)return values.map(n=>n===null?null:n/row.sample_size!*100);
 return values.map(()=>null);
}
export function compareInsurer(all:Disclosure[],id:string):Comparison{
 const insurerRows=all.filter(r=>r.insurer_id===id);
 const period=insurerRows.map(r=>r.period).sort((a,b)=>periodOrder(b)-periodOrder(a)||b.localeCompare(a))[0]||null;
 const rows=insurerRows.filter(r=>r.period===period&&r.request_type==='discharge'&&r.policy_type==='individual');
 if(!rows.length)return{period,channels:0,count:null,mode:'missing',shares:[null,null,null,null]};
 const denominators=rows.every(r=>r.sample_size!==null&&r.sample_size>0);
 const count=denominators?rows.reduce((n,r)=>n+r.sample_size!,0):null;
 const values=rows.map(r=>{const p=percentages(r);return[p[0],p[1],p[2],p.slice(3).every(n=>n!==null)?p.slice(3).reduce<number>((n,v)=>n+v!,0):null];});
 const mode=rows.length===1?'single':denominators?'weighted':'range';
 const shares=[0,1,2,3].map(i=>{
  const cells=values.map(v=>v[i]);
  // A missing channel or >6-hour component is unknown, never an assumed zero.
  if(cells.some(v=>v===null))return null;
  if(mode==='weighted'){const n=cells.reduce<number>((sum,v,j)=>sum+v!*rows[j].sample_size!,0)/count!;return{min:n,max:n};}
  return{min:Math.min(...cells as number[]),max:Math.max(...cells as number[])};
 });
 return{period,channels:rows.length,count,mode,shares};
}
export function shareText(value:Share){if(!value)return'—';const f=(n:number)=>Number(n.toFixed(2)).toString();return value.min===value.max?`${f(value.min)}%`:`${f(value.min)}–${f(value.max)}%`;}
