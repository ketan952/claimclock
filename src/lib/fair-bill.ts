// Fair-Bill Benchmark (M26). Pure arithmetic over the curated CGHS 2025 package rates in
// data/cghs-rates.json: the city tier, the hospital column and the ward entitlement give a
// reference rate and a range for one bill line. CGHS rates bind empanelled hospitals for CGHS
// beneficiaries only; for everyone else they are a public reference used to decide which lines
// to question — never a cap, and never a reason to refuse payment.
import data from '../../data/cghs-rates.json' with {type:'json'};

export type Tier='I'|'II'|'III';
export type HospitalType='non_nabh'|'nabh'|'super_speciality';
export type Ward='general'|'semi_private'|'private';
export type CghsItem={code:string;name:string;group:string;classification:string;non_nabh:number;nabh:number;super_speciality:number;ward:boolean};
export const TIERS:Tier[]=['I','II','III'];
export const HOSPITAL_TYPES:HospitalType[]=['non_nabh','nabh','super_speciality'];
export const WARDS:Ward[]=['general','semi_private','private'];
export const cghs=data as unknown as {source:Record<string,unknown>&{source_url:string;verified_on:string;title:string};tiers:Record<Tier,{multiplier:number;label:string;cities:string[];note:string}>;adjustments:{ward:Record<Ward,number>&{note:string}};items:CghsItem[]};
export const items:CghsItem[]=cghs.items;
export const itemByCode=(code:string):CghsItem|undefined=>items.find(i=>i.code===code);
export const tierMultiplier=(tier:Tier):number=>cghs.tiers[tier].multiplier;
export const wardAdjustment=(ward:Ward):number=>cghs.adjustments.ward[ward];
/** Far-above threshold: twice the top of the reference range. */
export const FAR_ABOVE_FACTOR=2;

// --- Cities → tier ------------------------------------------------------------------------------------------
const ALIASES:Record<string,string>={bangalore:'Bengaluru','new delhi':'Delhi',gurugram:'Gurgaon',bombay:'Mumbai',madras:'Chennai',calcutta:'Kolkata',trivandrum:'Thiruvananthapuram',cochin:'Kochi',calicut:'Kozhikode',mysuru:'Mysore',mangaluru:'Mangalore',belagavi:'Belgaum',hubballi:'Hubli-Dharwad',kalaburagi:'Gulbarga',prayagraj:'Allahabad',vadodra:'Vadodara',baroda:'Vadodara',pondicherry:'Puducherry',trichy:'Tiruchirappalli',vizag:'Visakhapatnam',bhubaneshwar:'Bhubaneswar',rourkela:'Raurkela',poona:'Pune',secunderabad:'Hyderabad',navi_mumbai:'Mumbai',thane:'Mumbai',pimpri:'Pune',howrah:'Kolkata',ghaziabad:'Ghaziabad',greater_noida:'Noida','sambhaji nagar':'Aurangabad','chhatrapati sambhajinagar':'Aurangabad'};
const normalise=(city:string)=>city.trim().toLowerCase().replace(/[^a-z\s-]/g,'').replace(/\s+/g,' ');
/** Tier I and II cities are listed in the OM (indicative); everything else is Tier III. Returns null for an empty input so the page can ask. */
export function tierForCity(city:string):Tier|null {
 const key=normalise(city);if(!key)return null;
 const canonical=(ALIASES[key]||ALIASES[key.replace(/\s/g,'_')]||key).toLowerCase();
 const match=(list:string[])=>list.some(c=>{const n=c.toLowerCase();return n===canonical||n.startsWith(canonical)&&canonical.length>=4||canonical.startsWith(n)&&n.length>=4;});
 if(match(cghs.tiers.I.cities))return 'I';
 if(match(cghs.tiers.II.cities))return 'II';
 return 'III';
}

// --- Reference rate and range ------------------------------------------------------------------------------
export type Reference={tier:Tier;hospital:HospitalType;ward:Ward;base:number;multiplier:number;wardFactor:number;rate:number;low:number;high:number;wardApplied:boolean};
export function referenceRate(item:CghsItem,tier:Tier,hospital:HospitalType,ward:Ward):Reference {
 const base=item[hospital],multiplier=tierMultiplier(tier),wardApplied=item.ward,wardFactor=wardApplied?1+wardAdjustment(ward):1;
 const rate=Math.round(base*multiplier*wardFactor);
 const low=Math.round(item.non_nabh*multiplier*(wardApplied?1+wardAdjustment('general'):1));
 const high=Math.round(item.super_speciality*multiplier*(wardApplied?1+wardAdjustment('private'):1));
 return {tier,hospital,ward,base,multiplier,wardFactor,rate,low,high,wardApplied};
}
export type Verdict='within'|'above'|'far_above'|'below'|'no_amount'|'invalid';
export type LineComparison={reference:Reference;amount:number|null;quantity:number;ratio:number|null;excess:number|null;verdict:Verdict;notes:string[];ruleIds:string[]};
/** Compares one billed amount (optionally per-day or per-session × quantity) with the reference range for the chosen tier. */
export function compareLine(item:CghsItem,amount:number|null|undefined,tier:Tier,hospital:HospitalType,ward:Ward,quantity=1):LineComparison {
 const reference=referenceRate(item,tier,hospital,ward);
 const notes=['reference_only','package_inclusions'];
 if(!item.ward)notes.push('uniform_item');
 const ruleIds=['rate-display-rule-9'];
 if(!Number.isInteger(quantity)||quantity<1||quantity>365)return {reference,amount:null,quantity:1,ratio:null,excess:null,verdict:'invalid',notes,ruleIds};
 if(amount===null||amount===undefined)return {reference,amount:null,quantity,ratio:null,excess:null,verdict:'no_amount',notes,ruleIds};
 if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>1e9)return {reference,amount:null,quantity,ratio:null,excess:null,verdict:'invalid',notes,ruleIds};
 const high=reference.high*quantity,low=reference.low*quantity,rate=reference.rate*quantity;
 const ratio=rate>0?Math.round(amount/rate*100)/100:null;
 const verdict:Verdict=amount>high*FAR_ABOVE_FACTOR?'far_above':amount>high?'above':amount<low?'below':'within';
 if(verdict==='far_above'||verdict==='above')notes.push('ask_rate_card');
 return {reference,amount,quantity,ratio,excess:Math.max(0,Math.round(amount-high)),verdict,notes,ruleIds};
}

// --- Finding the item for a bill line -------------------------------------------------------------------------
/** [pattern, codes in preference order, weight]; a lower weight lets a more specific pattern win when both match. */
const SYNONYMS:[RegExp,string[],number?][]=[
 [/\b(icu|iccu|ccu|hdu|micu|sicu|intensive care|critical care)\b/i,['CC001']],[/\b(nicu|neonatal icu)\b/i,['CC007']],[/\bventilat/i,['CC003','CC004']],[/\b(bipap|cpap|niv)\b/i,['CC004']],[/\boxygen|o2\b/i,['CC002']],[/\bnebuli[sz]/i,['CC012']],[/\bincubator\b/i,['CC006']],
 [/\b(consult|visit|doctor fee|physician|opd)\b/i,['CN001','CN002','CN003']],[/\b(cbc|complete blood|haemogram|hemogram)\b/i,['LB012']],[/\b(lft|liver function)\b/i,['LB124']],[/\b(kft|rft|kidney function|renal function)\b/i,['LB123']],[/\blipid\b/i,['LB125']],[/\b(hba1c|glycosylated)\b/i,['LB122']],[/\b(sugar|glucose)\b/i,['LB076']],[/\b(thyroid|tft|tsh)\b/i,['LB160','LB161']],[/\bcreatinine\b/i,['LB058']],[/\b(urea|bun)\b/i,['LB057']],[/\burine\b/i,['LB001']],[/\b(dengue)\b/i,['LB269','LB270']],[/\b(crp)\b/i,['LB069','LB070']],[/\b(pt|inr|prothrombin)\b/i,['LB105']],[/\b(d-?dimer)\b/i,['LB200']],[/\b(troponin)\b/i,['LB111','LB112']],[/\b(abg|blood gas)\b/i,['LB120']],[/\bvitamin d\b/i,['LB154']],[/\b(b12)\b/i,['LB127']],[/\bprocalcitonin\b/i,['LB248']],
 [/\b(x-?ray|xray|chest pa)\b/i,['RI034','RI035','RI041']],[/\b(usg|ultrasound|sonograph)\b/i,['RI020','RI022','RI023','RI025']],[/\b(ct|cect|ncct)\b/i,['RI062','RI063','RI064','RI069','RI070','RI068','RI067'],9],[/\bmri\b/i,['RI089','RI090','RI136','RI137','RI106','RI107','RI133']],[/\bmrcp\b/i,['RI139']],[/\bmammogra/i,['RI060']],[/\b(2d echo|echo|echocardiogra)\b/i,['RI001']],[/\becg\b/i,['CI001']],[/\btmt|treadmill\b/i,['CI002']],[/\bholter\b/i,['CI003']],[/\b(angiogra|cag)\b/i,['CI016','RI009']],[/\b(angioplast|ptca|stent)\b/i,['CP001','CP002']],[/\bpacemaker\b/i,['CP006','CP007','CP005']],[/\b(cabg|bypass)\b/i,['CV013','CV014']],[/\bvalve\b/i,['CV019']],
 [/\b(endoscop|gastroscop|ugi)\b/i,['MG001']],[/\bcolonoscop/i,['MG002']],[/\bercp\b/i,['MG025','MG026','MG027','MG029']],[/\bbronchoscop/i,['PP002']],[/\b(pft|spirometry)\b/i,['PI001']],
 [/\b(prbc|packed (red )?cell|blood unit|whole blood)\b/i,['BC002','BC001']],[/\b(ffp|plasma)\b/i,['BC003']],[/\b(platelet|rdp|sdp)\b/i,['BC004','BC006']],
 [/\bdressing\b/i,['GP001']],[/\b(suture|stitch)\b/i,['GS003','GP006']],[/\bcathet/i,['GP009']],[/\b(i&d|incision and drainage|abscess)\b/i,['GP010','GP012']],[/\b(lipoma|sebaceous|cyst)\b/i,['GS013','GS012']],
 [/\bappendi/i,['AG045','AG046']],[/\b(cholecyst|gall ?bladder|lap chole)\b/i,['AG094','AG037','AG038']],[/\bhernia\b/i,['AG025','AG024','AG096','AG022','AG023','AG097']],[/\b(piles|haemorrhoid|hemorrhoid)\b/i,['GS018','GS019']],[/\bfissure\b/i,['AG072','AG073']],[/\bfistula\b/i,['AG075','AG076']],
 [/\b(tonsil)/i,['EP033']],[/\bsepto/i,['EP017']],[/\b(fess|sinus)\b/i,['EP035','EP036']],[/\badenoid/i,['EP049']],[/\bthyroidectomy\b/i,['EP081','EP078']],[/\btympano/i,['EP011']],
 [/\b(cataract|phaco|iol)\b/i,['OP100','OP099','OP098']],[/\bpterygium\b/i,['OP003']],[/\bglaucoma|trabeculectomy\b/i,['OP070']],
 [/\b(normal delivery|vaginal delivery|delivery)\b/i,['OG002','OG003'],8],[/\b(c-?section|caesarean|cesarean|lscs)\b/i,['OG004','OG005']],[/\bhysterectomy\b/i,['OG026','OG028','OG046','OG044']],[/\b(d&c|d & c|dilatation and curettage|curettage)\b/i,['OG037']],[/\b(myomectomy|fibroid)\b/i,['OG029','OG030']],[/\bovarian\b/i,['OG010','OG011']],[/\bectopic\b/i,['OG008','OG047']],
 [/\b(turp|prostate)\b/i,['NU059','NU136']],[/\b(pcnl|kidney stone|renal stone|nephrolith)\b/i,['NU128','NU129']],[/\b(urs|ureteroscop|ureteric)\b/i,['NU145']],[/\b(eswl|lithotripsy)\b/i,['NU155']],[/\b(dialysis|haemodialysis|hemodialysis)\b/i,['NU122','NU123']],[/\bcircumcision\b/i,['NU074']],[/\bhydrocele\b/i,['NU087','NU088']],[/\bnephrectomy\b/i,['NU010']],[/\bcystoscop/i,['NU157']],
 [/\b(tkr|knee replacement)\b/i,['OR089']],[/\b(thr|hip replacement)\b/i,['OR087']],[/\bhemiarthroplasty\b/i,['OR067']],[/\b(acl|ligament)\b/i,['OR099']],[/\barthroscop/i,['OR079','OR080','OR081']],[/\b(fracture|orif|nailing|plating)\b/i,['OR040','OR041','OR038']],[/\b(plaster|pop|slab)\b/i,['OR006','OR007','OR005']],[/\bimplant removal|removal of (plate|wire|screw)/i,['OR086','OR085']],[/\b(discectomy|disc)\b/i,['OR115','NS032']],[/\bspinal fusion|spine fusion\b/i,['OR118']],[/\b(craniotomy|haematoma|hematoma)\b/i,['NS005','NS006','NS052']],[/\bshunt\b/i,['NS025']],
 [/\bchemo/i,['CT001','CT002','CT003','CT004']],[/\bradiotherapy|radiation\b/i,['RT006']],[/\bphysio/i,['PT003','PT005','PT006']],[/\b(extraction|tooth)\b/i,['DP010','DP012','DP016']],[/\bscaling\b/i,['DP002']],[/\bcleft\b/i,['BP018','BP019']],
];
const STOP=new Set(['the','and','with','for','per','day','days','charges','charge','fee','fees','test','scan','without','including','excluding','cost','under','room','rent','unit','units','session','sessions','package','procedure','surgery','hospital']);
const tokens=(s:string)=>s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w));
const nameTokens=new Map<string,Set<string>>();
const tokensOf=(item:CghsItem)=>{let set=nameTokens.get(item.code);if(!set){set=new Set(item.name.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean));nameTokens.set(item.code,set);}return set;};
/** Deterministic suggestions for a bill line: synonym hits first, then name-token overlap. Never more than `limit`; empty when nothing matches. */
export function suggestItems(description:string,limit=5):CghsItem[] {
 const text=description.trim();if(!text)return [];
 const scores=new Map<string,number>();
 for(const [pattern,codes,weight=10] of SYNONYMS)if(pattern.test(text))codes.forEach((code,i)=>scores.set(code,Math.max(scores.get(code)||0,weight-i)));
 const words=tokens(text);
 // Whole-word overlap only: "icu" must not match "Appendicular" or "Tricuspid".
 if(words.length)for(const item of items){const name=tokensOf(item);let hits=0;for(const w of words)if(name.has(w)||(w.length>=5&&[...name].some(n=>n.startsWith(w))))hits++;if(hits)scores.set(item.code,(scores.get(item.code)||0)+hits*0.5);}
 return [...scores.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([code])=>itemByCode(code)!).filter(Boolean);
}
/** Items grouped for a picker, in a stable order. */
export const GROUP_ORDER=['consultation','critical_care','blood','laboratory','radiology','cardiology','gastro_pulmo','general_procedures','abdomen','ent','ophthalmology','obgyn','urology','orthopaedics','neurosurgery','oncology','physiotherapy','dental','plastic'] as const;
export function itemsByGroup():Record<string,CghsItem[]>{const out:Record<string,CghsItem[]>={};for(const g of GROUP_ORDER)out[g]=items.filter(i=>i.group===g);return out;}
