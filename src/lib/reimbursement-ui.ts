// Reimbursement Tracker page (M26). Saved claims live in this browser only; the page renders the
// 15-day clock, the query log, the seven-document pack, the settlement audit and the Fair-Bill
// check, and opens the letters in the shared dialog. Pure logic lives in reimbursement.ts,
// fair-bill.ts and reimbursement-letters.ts.
import contactsRaw from '../../data/contacts.json';
import rulesRaw from '../../data/rules.json';
import sourceLinks from '../../data/source-links.json';
import {lang,t,setMessage,interpolate} from './i18n';
import {setupLetterDialog} from './letter-dialog';
import {download} from './storage.ts';
import {validDate} from './coverage-simulator.ts';
import {loadVault,type Vault} from './vault.ts';
import {DOCUMENT_KEYS,bankRateFor,claimReadyPack,claimStorageIssue,claimTimeline,documentProgress,loadClaims,newClaim,queryPattern,reimbursementCalendar,rule,saveClaims,settlementAudit,type ClaimTimeline,type DocumentKey,type ReimbursementClaim} from './reimbursement.ts';
import {GROUP_ORDER,HOSPITAL_TYPES,TIERS,WARDS,cghs,compareLine,itemByCode,itemsByGroup,suggestItems,tierForCity,type CghsItem,type HospitalType,type LineComparison,type Tier,type Ward} from './fair-bill.ts';
import {MAX_RATE_CARD_LINES,makeReimbursementLetter,type RateCardLine} from './reimbursement-letters.ts';
import type {Contact,Rule} from './types.ts';

const contacts=contactsRaw as Contact[],rules=rulesRaw as Rule[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=(id:string)=>el<HTMLFormElement>(id);
const field=<T extends HTMLInputElement|HTMLSelectElement=HTMLInputElement>(f:HTMLFormElement,name:string)=>f.elements.namedItem(name) as T;
const addText=(parent:HTMLElement,tag:string,text:string,className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;parent.append(node);return node;};
const rupees=(n:number)=>`₹${Math.round(n).toLocaleString(lang()==='hi'?'hi-IN':'en-IN')}`;
const dateLabel=(ymd:string)=>new Date(`${ymd}T00:00:00Z`).toLocaleDateString(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const num=(f:HTMLFormElement,name:string):number|null=>{const raw=field(f,name).value.trim();if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null;};
const text=(f:HTMLFormElement,name:string):string=>field(f,name).value.trim();
const today=()=>new Date().toISOString().slice(0,10);
const insurerName=(id:string)=>{const c=contacts.find(x=>x.id===id);return c?(lang()==='hi'?c.name_hi||c.name:c.name):id;};
const groEmail=(id:string)=>contacts.find(c=>c.id===id)?.gro_email||'';

const claimForm=form('claim-form'),queryForm=form('query-form'),settlementForm=form('settlement-form'),fairForm=form('fairbill-form');
const openLetter=setupLetterDialog({insurerId:()=>current?.insurerId});
const vault:Vault|null=loadVault();
let claims:ReimbursementClaim[]=loadClaims();
let current:ReimbursementClaim|null=null;
let timeline:ClaimTimeline|null=null;
const photos=new Map<DocumentKey,{url:string;name:string}>();
const usedRules=new Set<string>();

// --- Shared bits -------------------------------------------------------------------------------------------
function sourceLink(parent:HTMLElement,ruleId:string){
 const r=rule(ruleId);usedRules.add(ruleId);
 const a=addText(parent,'a',`${t('vault.verifiedOn')} ${dateLabel(String(r.verified_on))} ↗`) as HTMLAnchorElement;a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';
}
function ruleList(parent:HTMLElement,ids:string[]){
 const ul=document.createElement('ul');ul.className='fine-print';
 for(const id of ids){const r=rule(id);const li=addText(ul,'li',`${String(lang()==='hi'?r.title_hi||r.title:r.title)} `);sourceLink(li,id);}
 parent.append(ul);
}
function renderSources(){
 const box=el('reimb-sources');box.replaceChildren();
 if(!usedRules.size){addText(box,'p',t('coverage.noSources'));return;}
 const bySlug=new Map<string,Rule[]>();
 for(const id of usedRules){const r=rule(id);const slug=String(r.source_slug||'health-mc-2024');bySlug.set(slug,[...(bySlug.get(slug)||[]),r]);}
 for(const [slug,group] of bySlug){
  const link=sourceLinks.find(l=>l.slug===slug);const p=addText(box,'p','');
  addText(p,'strong',link?(lang()==='hi'?link.title_hi:link.title_en):slug);
  for(const r of group){addText(p,'br','');p.append(`${String(lang()==='hi'?r.title_hi||r.title:r.title)} `);const a=addText(p,'a',`${r.paragraph} ↗`) as HTMLAnchorElement;a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';}
 }
 const cg=addText(box,'p','');addText(cg,'strong',t('tracker.cghsSource'));addText(cg,'br','');const a=addText(cg,'a',`${cghs.source.title} ↗`) as HTMLAnchorElement;a.href=cghs.source.source_url;a.target='_blank';a.rel='noopener noreferrer';
}
function persist(next:ReimbursementClaim[]):boolean {
 if(!saveClaims(next)){setMessage(el('claim-status'),claimStorageIssue()==='unavailable'?'error.storage':'tracker.saveFailed');return false;}
 claims=loadClaims();return true;
}
function updateCurrent(mutate:(claim:ReimbursementClaim)=>void):boolean {
 if(!current)return false;
 const copy:ReimbursementClaim=JSON.parse(JSON.stringify(current));mutate(copy);copy.updatedAt=new Date().toISOString();
 const next=claims.map(c=>c.id===copy.id?copy:c);
 if(!persist(next))return false;
 current=claims.find(c=>c.id===copy.id)||null;return true;
}
// --- Claim picker and form ------------------------------------------------------------------------------------
function renderPicker(){
 const select=field<HTMLSelectElement>(claimForm,'claimId');select.replaceChildren(new Option(t('tracker.newClaimOption'),''));
 for(const c of claims)select.append(new Option(`${insurerName(c.insurerId)} · ${dateLabel(c.submittedOn)}${c.hospital?` · ${c.hospital}`:''}`,c.id));
 el('claim-picker-field').hidden=!claims.length;
 select.value=current?.id||'';
 el('claim-new').hidden=!current;el('claim-delete').hidden=!current;
}
function fillForm(){
 const set=(f:HTMLFormElement,name:string,value:unknown)=>{field(f,name).value=value===null||value===undefined?'':String(value);};
 set(claimForm,'insurer',current?.insurerId||(vault?.policies.find(p=>p.id===vault.defaultPolicyId)?.insurerId??''));
 set(claimForm,'intimatedOn',current?.intimatedOn);set(claimForm,'submittedOn',current?.submittedOn);set(claimForm,'claimedAmount',current?.claimedAmount);set(claimForm,'hospital',current?.hospital);
 set(settlementForm,'settledOn',current?.settledOn);set(settlementForm,'settledAmount',current?.settledAmount);set(settlementForm,'interestPaid',current?.interestPaid);
 window.dispatchEvent(new Event('pickerrefresh'));
}
function selectClaim(id:string){current=claims.find(c=>c.id===id)||null;photos.clear();fillForm();renderAll();}
claimForm.addEventListener('submit',e=>{
 e.preventDefault();const status=el('claim-status');setMessage(status,null);
 const insurerId=field<HTMLSelectElement>(claimForm,'insurer').value,intimatedOn=text(claimForm,'intimatedOn'),submittedOn=text(claimForm,'submittedOn');
 if(!insurerId){setMessage(status,'renewal.needInsurer');return;}
 if(!validDate(intimatedOn)||!validDate(submittedOn)||intimatedOn>submittedOn||submittedOn>today()){setMessage(status,'tracker.dateError');return;}
 const claimedAmount=num(claimForm,'claimedAmount'),hospital=text(claimForm,'hospital').slice(0,100);
 if(claimedAmount!==null&&(claimedAmount<0||claimedAmount>1e9)){setMessage(status,'tracker.amountError');return;}
 if(current){if(!updateCurrent(c=>{c.insurerId=insurerId;c.intimatedOn=intimatedOn;c.submittedOn=submittedOn;c.claimedAmount=claimedAmount;c.hospital=hospital;}))return;}
 else{if(claims.length>=20){setMessage(status,'tracker.tooMany');return;}const fresh=newClaim({insurerId,intimatedOn,submittedOn,claimedAmount,hospital});if(!persist([...claims,fresh]))return;current=claims.find(c=>c.id===fresh.id)||null;}
 setMessage(status,'tracker.saved');renderAll();
});
el('claim-new').addEventListener('click',()=>{current=null;photos.clear();fillForm();renderAll();});
el('claim-delete').addEventListener('click',()=>{if(!current||!confirm(t('tracker.deleteConfirm')))return;const id=current.id;if(!persist(claims.filter(c=>c.id!==id)))return;current=null;photos.clear();fillForm();renderAll();});
field<HTMLSelectElement>(claimForm,'claimId').addEventListener('change',()=>selectClaim(field<HTMLSelectElement>(claimForm,'claimId').value));
// --- Clock ---------------------------------------------------------------------------------------------------
function renderClock(){
 const box=el('clock-result');box.replaceChildren();
 timeline=current?claimTimeline(current):null;
 const overdue=timeline?.status==='overdue';
 el<HTMLButtonElement>('claim-calendar').disabled=!timeline||timeline.status==='invalid';
 el<HTMLButtonElement>('delay-letter').disabled=!overdue;
 if(!current||!timeline){addText(box,'p',t('tracker.noClaim'),'fine-print');return;}
 if(timeline.status==='invalid'){addText(box,'p',t('tracker.dateError'),'verdict warn');return;}
 const tone=timeline.status==='awaiting'||timeline.status==='settled_on_time'?'ok':timeline.status==='overdue'||timeline.status==='settled_late'?'no':'warn';
 addText(box,'p',interpolate(`tracker.status.${timeline.status}`,{days:timeline.status==='awaiting'?timeline.daysLeft:timeline.daysOverdue,deadline:dateLabel(timeline.deadline)}),`verdict ${tone}`);
 if(timeline.interest){addText(box,'p',rupees(timeline.interest.amount),'amount');addText(box,'p',interpolate('tracker.interestLine',{rate:timeline.interest.ratePercent,bank:timeline.bankRate!.percent,fy:timeline.bankRate!.fy,days:timeline.interest.days,from:dateLabel(timeline.interest.from),to:dateLabel(timeline.interest.to)}));}
 const ul=document.createElement('ul');
 addText(ul,'li',interpolate('tracker.deadlineLine',{date:dateLabel(timeline.deadline)}));
 addText(ul,'li',interpolate('tracker.intimationLine',{date:dateLabel(current.intimatedOn)}));
 for(const note of timeline.notes)addText(ul,'li',t(`tracker.note.${note}`),'fine-print');
 box.append(ul);ruleList(box,timeline.ruleIds);
}
el('claim-calendar').addEventListener('click',()=>{
 if(!current)return;
 try{download('claimclock-reimbursement.ics',reimbursementCalendar(current,{deadline:t('tracker.calendarDeadline'),followUp:t('tracker.calendarFollowUp'),body:t('tracker.calendarBody')}),'text/calendar;charset=utf-8');setMessage(el('claim-status'),'tracker.calendarDone');}
 catch{setMessage(el('claim-status'),'tracker.dateError');}
});
el('delay-letter').addEventListener('click',()=>{if(!current)return;try{openLetter(()=>makeReimbursementLetter({kind:'reimbursement-delay',claim:current!},contacts,rules,lang()),groEmail(current.insurerId));}catch{setMessage(el('claim-status'),'tracker.dateError');}});
// --- Queries -------------------------------------------------------------------------------------------------
function renderQueries(){
 const list=el('query-list'),box=el('query-result');list.replaceChildren();box.replaceChildren();
 const canLog=Boolean(current);document.querySelector<HTMLButtonElement>('#query-form button[type=submit]')!.disabled=!canLog;
 if(!current){el<HTMLButtonElement>('piecemeal-letter').disabled=true;return;}
 for(const q of [...current.queries].sort((a,b)=>a.at.localeCompare(b.at))){
  const li=document.createElement('li');
  addText(li,'strong',`${dateLabel(q.at)}${q.note?` — ${q.note}`:''}`);
  addText(li,'span',q.repliedOn?interpolate('tracker.repliedOnLabel',{date:dateLabel(q.repliedOn)}):t('tracker.pendingReply'),'fine-print');
  if(!q.repliedOn){const mark=addText(li,'button',t('tracker.markReplied'),'text-button') as HTMLButtonElement;mark.type='button';mark.addEventListener('click',()=>{updateCurrent(c=>{const target=c.queries.find(x=>x.id===q.id);if(target)target.repliedOn=today();});renderAll();});}
  const remove=addText(li,'button',t('vault.remove'),'text-button') as HTMLButtonElement;remove.type='button';remove.addEventListener('click',()=>{updateCurrent(c=>{c.queries=c.queries.filter(x=>x.id!==q.id);});renderAll();});
  list.append(li);
 }
 const pattern=queryPattern(current.queries);
 el<HTMLButtonElement>('piecemeal-letter').disabled=!pattern.piecemeal;
 if(!current.queries.length){addText(box,'p',t('tracker.noQueries'),'fine-print');return;}
 addText(box,'p',pattern.piecemeal?interpolate('tracker.piecemealYes',{count:pattern.distinctDates,span:pattern.spanDays}):t('tracker.piecemealNo'),`verdict ${pattern.piecemeal?'no':'ok'}`);
 if(pattern.unanswered)addText(box,'p',interpolate('tracker.unanswered',{count:pattern.unanswered}));
 ruleList(box,['documents-at-one-go','documents-from-hospital','claim-not-closed-for-documents']);
}
queryForm.addEventListener('submit',e=>{
 e.preventDefault();const status=el('query-status');setMessage(status,null);
 if(!current)return;
 const at=text(queryForm,'at'),repliedOn=text(queryForm,'repliedOn'),note=text(queryForm,'note').slice(0,300);
 if(!validDate(at)||at>today()||(repliedOn&&(!validDate(repliedOn)||repliedOn<at||repliedOn>today()))){setMessage(status,'tracker.dateError');return;}
 if(current.queries.length>=30){setMessage(status,'tracker.tooManyQueries');return;}
 if(!updateCurrent(c=>{c.queries.push({id:crypto.randomUUID(),at,note,...(repliedOn?{repliedOn}:{})});}))return;
 queryForm.reset();renderAll();
});
el('piecemeal-letter').addEventListener('click',()=>{if(!current)return;try{openLetter(()=>makeReimbursementLetter({kind:'piecemeal-objection',claim:current!},contacts,rules,lang()),groEmail(current.insurerId));}catch{setMessage(el('query-status'),'tracker.dateError');}});
// --- Documents and the pack ----------------------------------------------------------------------------------
function renderDocuments(){
 const list=el('document-list');list.replaceChildren();
 const docs=current?.documents||{};
 for(const key of DOCUMENT_KEYS){
  const li=document.createElement('li');if(docs[key])li.classList.add('done');
  const label=document.createElement('label');label.className='checkbox-label';const box=document.createElement('input');box.type='checkbox';box.checked=Boolean(docs[key]);box.disabled=!current;box.dataset.document=key;
  box.addEventListener('change',()=>{updateCurrent(c=>{c.documents[key]=box.checked;});renderAll();});
  label.append(box);addText(label,'span',t(`reimb.item${DOCUMENT_KEYS.indexOf(key)+1}`));li.append(label);
  const photo=photos.get(key);
  const badge=addText(li,'span',photo?t('tracker.photoAttached'):'','fine-print');
  const wrap=document.createElement('div');wrap.className='doc-photo';
  if(photo){const img=document.createElement('img');img.src=photo.url;img.alt=photo.name;wrap.append(img);const remove=addText(wrap,'button',t('vault.remove'),'text-button') as HTMLButtonElement;remove.type='button';remove.addEventListener('click',()=>{URL.revokeObjectURL(photo.url);photos.delete(key);renderAll();});}
  else{const input=document.createElement('input');input.type='file';input.accept='image/*';input.setAttribute('capture','environment');input.disabled=!current;input.setAttribute('aria-label',t('tracker.photoLabel'));input.addEventListener('change',()=>{const file=input.files?.[0];if(!file)return;if(file.size>8*1024*1024){setMessage(el('pack-status'),'tracker.photoTooLarge');input.value='';return;}photos.set(key,{url:URL.createObjectURL(file),name:file.name.slice(0,60)});renderAll();});wrap.append(input);}
  li.append(wrap);badge.hidden=!photo;list.append(li);
 }
 const progress=documentProgress(docs);setMessage(el('document-progress'),current?'tracker.progress':'tracker.noClaim',{done:progress.done,total:progress.total});
 el<HTMLButtonElement>('pack-print').disabled=!current||!timeline||timeline.status==='invalid';el<HTMLButtonElement>('pack-download').disabled=!current||!timeline||timeline.status==='invalid';
}
function packText():string {
 if(!current||!timeline)return '';
 const labels:Record<string,string>={};for(const key of ['title','name','policy','claim','insurer','hospital','intimated','submitted','deadline','claimed','settled','interest','days','documents','queries','notes','footer'])labels[key]=t(`tracker.pack.${key}`);
 const documentLabels=Object.fromEntries(DOCUMENT_KEYS.map(k=>[k,t(`reimb.item${DOCUMENT_KEYS.indexOf(k)+1}`).replace(/^\d+\.\s*/,'')])) as Record<DocumentKey,string>;
 return claimReadyPack(current,timeline,{insurer:insurerName(current.insurerId),hospital:current.hospital,language:lang(),labels,documentLabels,queryLabels:{query:t('tracker.pack.query'),replied:t('tracker.pack.replied'),pending:t('tracker.pack.pending')}});
}
el('pack-download').addEventListener('click',()=>{const body=packText();if(!body)return;download('claimclock-claim-ready-pack.txt',body);setMessage(el('pack-status'),'tracker.packDownloaded');});
el('pack-print').addEventListener('click',()=>{
 const body=packText();if(!body)return;
 const area=el('pack-print-area');area.replaceChildren();area.hidden=false;area.removeAttribute('aria-hidden');
 addText(area,'pre',body);
 for(const key of DOCUMENT_KEYS){const photo=photos.get(key);if(!photo)continue;addText(area,'h2',t(`reimb.item${DOCUMENT_KEYS.indexOf(key)+1}`));const img=document.createElement('img');img.src=photo.url;img.alt=photo.name;area.append(img);}
 document.body.classList.add('print-pack');
 const done=()=>{document.body.classList.remove('print-pack');area.hidden=true;area.setAttribute('aria-hidden','true');window.removeEventListener('afterprint',done);};
 window.addEventListener('afterprint',done);
 window.print();
 setMessage(el('pack-status'),'tracker.packPrinted');
});
// --- Settlement ------------------------------------------------------------------------------------------------
function renderSettlement(){
 const box=el('settlement-result');box.replaceChildren();
 document.querySelector<HTMLButtonElement>('#settlement-form button[type=submit]')!.disabled=!current;
 el<HTMLButtonElement>('interest-letter').disabled=true;
 if(!current)return;
 const audit=settlementAudit(current);
 if(audit.flags.includes('not_settled')){addText(box,'p',t('tracker.notSettled'),'fine-print');return;}
 const tone=audit.flags.length?(audit.flags.some(f=>['no_interest_line','interest_short','partial'].includes(f))?'no':'warn'):'ok';
 addText(box,'p',t(audit.flags.length?'tracker.auditIssues':'tracker.auditClean'),`verdict ${tone}`);
 const ul=document.createElement('ul');
 for(const flag of audit.flags){const fields:Record<string,string|number>={shortfall:audit.shortfall!==null?rupees(audit.shortfall):'',due:audit.interestDue!==null?rupees(audit.interestDue):'',paid:audit.interestPaid!==null?rupees(audit.interestPaid):'',short:audit.interestShortfall!==null?rupees(audit.interestShortfall):'',days:audit.timeline.daysOverdue};addText(ul,'li',interpolate(`tracker.flag.${flag}`,fields),flag==='late'?'warn':'no');}
 if(!audit.flags.length)addText(ul,'li',interpolate('tracker.settledOnTimeLine',{date:dateLabel(current.settledOn!)}));
 box.append(ul);
 el<HTMLButtonElement>('interest-letter').disabled=!(audit.timeline.status==='settled_late'&&audit.interestDue!==null);
 ruleList(box,['penal-interest-bank-rate-plus-2','bank-rate-fy',...(audit.flags.includes('partial')?['deduction-reasons']:[])]);
}
settlementForm.addEventListener('submit',e=>{
 e.preventDefault();const status=el('settlement-status');setMessage(status,null);
 if(!current)return;
 const settledOn=text(settlementForm,'settledOn'),settledAmount=num(settlementForm,'settledAmount'),interestPaid=num(settlementForm,'interestPaid');
 if(settledOn&&(!validDate(settledOn)||settledOn<current.submittedOn||settledOn>today())){setMessage(status,'tracker.dateError');return;}
 if([settledAmount,interestPaid].some(v=>v!==null&&(v<0||v>1e9))){setMessage(status,'tracker.amountError');return;}
 if(!updateCurrent(c=>{c.settledOn=settledOn||null;c.settledAmount=settledAmount;c.interestPaid=interestPaid;}))return;
 setMessage(status,null);setMessage(el('claim-status'),'tracker.saved');renderAll();
});
el('interest-letter').addEventListener('click',()=>{if(!current)return;try{openLetter(()=>makeReimbursementLetter({kind:'settlement-interest',claim:current!},contacts,rules,lang()),groEmail(current.insurerId));}catch{setMessage(el('settlement-status'),'tracker.dateError');}});
// --- Fair-Bill check --------------------------------------------------------------------------------------------
type BillLine={id:string;description:string;amount:number|null;quantity:number;code:string};
let lines:BillLine[]=[];
let tierTouched=false;
function fairSettings():{tier:Tier;hospital:HospitalType;ward:Ward} {
 const tier=field<HTMLSelectElement>(fairForm,'tier').value as Tier,hospital=field<HTMLSelectElement>(fairForm,'hospital').value as HospitalType,ward=field<HTMLSelectElement>(fairForm,'ward').value as Ward;
 return {tier:TIERS.includes(tier)?tier:'I',hospital:HOSPITAL_TYPES.includes(hospital)?hospital:'nabh',ward:WARDS.includes(ward)?ward:'semi_private'};
}
function itemSelect(selected:string):HTMLSelectElement {
 const select=document.createElement('select');select.append(new Option(t('tracker.pickItem'),''));
 const groups=itemsByGroup();
 for(const group of GROUP_ORDER){const og=document.createElement('optgroup');og.label=t(`tracker.group.${group}`);for(const item of groups[group])og.append(new Option(`${item.name} (${item.code})`,item.code));select.append(og);}
 select.value=selected;return select;
}
function comparisonFor(line:BillLine):{item:CghsItem;comparison:LineComparison}|null {
 const item=itemByCode(line.code);if(!item)return null;const s=fairSettings();return {item,comparison:compareLine(item,line.amount,s.tier,s.hospital,s.ward,line.quantity)};
}
function renderLines(){
 const box=el('bill-lines');box.replaceChildren();
 for(const line of lines){
  const card=document.createElement('article');card.className='bill-line';
  const head=document.createElement('div');head.className='line-head';
  const result=comparisonFor(line);
  addText(head,'span',result?t(`tracker.verdict.${result.comparison.verdict}`):t('tracker.verdict.no_item'),`verdict-pill ${result?.comparison.verdict||''}`);
  const remove=addText(head,'button',t('vault.remove'),'text-button') as HTMLButtonElement;remove.type='button';remove.addEventListener('click',()=>{lines=lines.filter(l=>l.id!==line.id);renderLines();});
  card.append(head);
  const grid=document.createElement('div');grid.className='form-grid';
  const mk=(labelKey:string,input:HTMLInputElement|HTMLSelectElement,full=false)=>{const label=document.createElement('label');if(full)label.className='full';addText(label,'span',t(labelKey));label.append(input);grid.append(label);};
  const desc=document.createElement('input');desc.type='text';desc.maxLength=120;desc.value=line.description;desc.autocomplete='off';desc.addEventListener('input',()=>{line.description=desc.value;renderSuggestions();});mk('tracker.lineDescription',desc,true);
  const amount=document.createElement('input');amount.type='number';amount.min='0';amount.max='1000000000';amount.step='1';amount.inputMode='numeric';amount.value=line.amount===null?'':String(line.amount);amount.addEventListener('input',()=>{const n=Number(amount.value);line.amount=amount.value.trim()===''||!Number.isFinite(n)?null:n;renderResult();});mk('tracker.lineAmount',amount);
  const qty=document.createElement('input');qty.type='number';qty.min='1';qty.max='365';qty.step='1';qty.inputMode='numeric';qty.value=String(line.quantity);qty.addEventListener('input',()=>{const n=Number(qty.value);line.quantity=Number.isInteger(n)&&n>=1&&n<=365?n:1;renderResult();});mk('tracker.lineQuantity',qty);
  const select=itemSelect(line.code);select.addEventListener('change',()=>{line.code=select.value;renderResult();renderSuggestions();});mk('tracker.lineItem',select,true);
  card.append(grid);
  const suggestions=document.createElement('div');suggestions.className='suggestions';card.append(suggestions);
  const out=document.createElement('div');out.className='line-result';card.append(out);
  const renderSuggestions=()=>{suggestions.replaceChildren();if(line.code)return;for(const item of suggestItems(line.description,4)){const chip=addText(suggestions,'button',item.name.length>48?`${item.name.slice(0,46)}…`:item.name,'text-button') as HTMLButtonElement;chip.type='button';chip.title=item.name;chip.addEventListener('click',()=>{line.code=item.code;select.value=item.code;renderResult();renderSuggestions();});}};
  const renderResult=()=>{
   out.replaceChildren();const res=comparisonFor(line);
   head.querySelector('.verdict-pill')!.textContent=res?t(`tracker.verdict.${res.comparison.verdict}`):t('tracker.verdict.no_item');head.querySelector('.verdict-pill')!.className=`verdict-pill ${res?.comparison.verdict||''}`;
   if(!res){addText(out,'p',t('tracker.lineNeedsItem'),'fine-print');updateRateCardButton();return;}
   const c=res.comparison,q=c.quantity;
   addText(out,'strong',interpolate('tracker.referenceLine',{rate:rupees(c.reference.rate*q),low:rupees(c.reference.low*q),high:rupees(c.reference.high*q),tier:t(`tracker.tier.${c.reference.tier}`).split(' — ')[0]}));
   if(c.verdict==='above'||c.verdict==='far_above')addText(out,'p',interpolate('tracker.excessLine',{excess:rupees(c.excess||0),ratio:c.ratio??''}));
   if(c.verdict==='below')addText(out,'p',t('tracker.belowLine'));
   const notes=document.createElement('ul');for(const n of c.notes)addText(notes,'li',t(`tracker.lineNote.${n}`),'fine-print');out.append(notes);
   usedRules.add('rate-display-rule-9');updateRateCardButton();
  };
  renderSuggestions();renderResult();
  box.append(card);
 }
 if(!lines.length)addText(box,'p',t('tracker.noLines'),'fine-print');
 updateRateCardButton();
}
function updateRateCardButton(){el<HTMLButtonElement>('ratecard-letter').disabled=!lines.some(l=>l.amount!==null&&l.description.trim());}
function addLine(partial:Partial<BillLine>={}){if(lines.length>=MAX_RATE_CARD_LINES){setMessage(el('fairbill-status'),'tracker.tooManyLines');return;}lines.push({id:crypto.randomUUID(),description:'',amount:null,quantity:1,code:'',...partial});renderLines();}
el('line-add').addEventListener('click',()=>{setMessage(el('fairbill-status'),null);addLine();});
field(fairForm,'city').addEventListener('input',()=>{if(tierTouched)return;const tier=tierForCity(field(fairForm,'city').value);if(tier)field<HTMLSelectElement>(fairForm,'tier').value=tier;renderLines();});
field<HTMLSelectElement>(fairForm,'tier').addEventListener('change',()=>{tierTouched=true;renderLines();});
for(const name of ['hospital','ward'])field<HTMLSelectElement>(fairForm,name).addEventListener('change',renderLines);
el('ratecard-letter').addEventListener('click',()=>{
 const status=el('fairbill-status');setMessage(status,null);
 const hospital=text(fairForm,'hospitalName');
 if(!hospital){setMessage(status,'tracker.needHospital');field(fairForm,'hospitalName').focus();return;}
 const ready:RateCardLine[]=lines.filter(l=>l.amount!==null&&l.description.trim()).map(l=>{const res=comparisonFor(l);return {description:l.description,amount:l.amount!,comparison:res?.comparison||null,itemName:res?.item.name||null};});
 try{openLetter(()=>makeReimbursementLetter({kind:'rate-card-request',hospital,lines:ready},contacts,rules,lang()));}catch{setMessage(status,'tracker.amountError');}
});
// --- Bank rate card --------------------------------------------------------------------------------------------
function renderBankRate(){
 const box=el('bankrate-result');box.replaceChildren();
 const rate=bankRateFor(today());
 if(!rate){addText(box,'p',t('tracker.bankRateUnknown'),'verdict warn');return;}
 addText(box,'p',`${rate.percent}% + 2% = ${rate.percent+2}%`,'amount');
 addText(box,'p',interpolate('tracker.bankRateLine',{fy:rate.fy,percent:rate.percent,date:dateLabel(rate.asOn)}));
 const a=addText(box,'a',`RBI · ${dateLabel(rate.asOn)} ↗`,'fine-print') as HTMLAnchorElement;a.href=rate.source_url;a.target='_blank';a.rel='noopener noreferrer';
}
// --- Wiring ---------------------------------------------------------------------------------------------------------
function renderAll(){usedRules.clear();renderPicker();renderClock();renderQueries();renderDocuments();renderSettlement();renderLines();renderBankRate();renderSources();}
const params=new URLSearchParams(location.search);
if(params.get('item')||params.get('amount')){const amount=Number(params.get('amount'));addLine({description:(params.get('item')||'').slice(0,120),amount:Number.isFinite(amount)&&amount>0?amount:null});}
if(claims.length&&!current){current=claims.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];}
const vaultCity=vault?.profile.city.trim();if(vaultCity){field(fairForm,'city').value=vaultCity;const tier=tierForCity(vaultCity);if(tier)field<HTMLSelectElement>(fairForm,'tier').value=tier;}
fillForm();
window.addEventListener('languagechange',()=>{fillForm();renderAll();});
renderAll();
