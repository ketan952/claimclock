// Plan comparison and family-structure advice page (M21). Static data, no network.
import rowsRaw from '../../data/nl48.json';
import {lang,t,setMessage,interpolate} from './i18n';
import {comparePlans,familyAdvice,MAX_COMPARE,MAX_FAMILY,type FamilyMember} from './plan-compare.ts';
import type {Disclosure} from './index-comparison.ts';

// Review flags are shown on the Index itself; the comparison only needs the published shares.
const disclosures=rowsRaw as Disclosure[];
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const addText=(parent:HTMLElement,tag:string,text:string,className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;parent.append(node);return node;};
const dateLabel=(ymd:string)=>new Date(`${ymd}T00:00:00Z`).toLocaleDateString(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const compareForm=el<HTMLFormElement>('compare-form');
const selects=()=>[1,2,3].map(n=>compareForm.elements.namedItem(`plan${n}`) as HTMLSelectElement);
const PARAM='plans';

function selectedIds():string[]{return selects().map(s=>s.value).filter(Boolean);}
function renderCompare(){
 const ids=selectedIds();
 const comparison=comparePlans(ids,{disclosures,language:lang(),text:{months:n=>interpolate('vault.months',{n}),days:n=>interpolate('vault.days',{n}),unknown:t('vault.ruleUnknown'),consumables:v=>t(`vault.consumables.${v}`),noDisclosure:t('compare.noDisclosure')}});
 const head=el('compare-head');head.replaceChildren();const first=addText(head,'th',t('compare.rule'));first.dataset.i18n='compare.rule';
 for(const plan of comparison.plans){const th=addText(head,'th',plan.insurerName);addText(th,'small',plan.name);}
 for(const row of comparison.rows){
  const tr=document.querySelector<HTMLTableRowElement>(`#compare-body tr[data-row="${row.key}"]`)!;
  for(const td of tr.querySelectorAll('td'))td.remove();
  for(const cell of row.cells){
   const td=document.createElement('td');if(cell.unknown)td.className='unknown';td.textContent=cell.text;
   if(cell.period){addText(td,'small',` ${interpolate('compare.disclosurePeriod',{period:cell.period,mode:t(`compare.mode.${cell.mode||'missing'}`)})}`);}
   if(cell.sourceUrl&&cell.verifiedOn){const a=addText(td,'a',`${t('vault.verifiedOn')} ${dateLabel(cell.verifiedOn)} ↗`) as HTMLAnchorElement;a.href=cell.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';}
   tr.append(td);
  }
 }
 el('compare-table').hidden=comparison.plans.length===0;
 setMessage(el('compare-status'),comparison.plans.length?null:'compare.pickPrompt');
 // The selection lives in the URL so a comparison can be shared without any server.
 const url=new URL(location.href);if(ids.length)url.searchParams.set(PARAM,ids.join(','));else url.searchParams.delete(PARAM);history.replaceState(history.state,'',url);
}
function restoreFromUrl(){
 const ids=(new URL(location.href).searchParams.get(PARAM)||'').split(',').filter(Boolean).slice(0,MAX_COMPARE);
 selects().forEach((select,i)=>{const id=ids[i]||'';select.value=select.querySelector(`option[value="${CSS.escape(id)}"]`)?id:'';});
}
compareForm.addEventListener('change',renderCompare);

// --- Family advisor ---------------------------------------------------------------------------
const membersBox=el('family-members');
function memberRows():HTMLElement[]{return [...membersBox.querySelectorAll<HTMLElement>('.member-row')];}
function readMembers():FamilyMember[]|null {
 const rows=memberRows();if(!rows.length)return null;
 const members:FamilyMember[]=[];
 for(const row of rows){const age=row.querySelector<HTMLInputElement>('input[type=number]')!.value.trim();if(age==='')return null;members.push({age:Number(age),preExisting:row.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked});}
 return members;
}
function addMemberRow(age='',preExisting=false){
 if(memberRows().length>=MAX_FAMILY)return;
 const row=document.createElement('div');row.className='member-row';
 const ageLabel=document.createElement('label');addText(ageLabel,'span',t('compare.memberAge')).dataset.i18n='compare.memberAge';const ageInput=document.createElement('input');ageInput.type='number';ageInput.min='0';ageInput.max='120';ageInput.inputMode='numeric';ageInput.value=age;ageInput.addEventListener('input',renderAdvice);ageLabel.append(ageInput);
 const pedLabel=document.createElement('label');pedLabel.className='checkbox-label';const ped=document.createElement('input');ped.type='checkbox';ped.checked=preExisting;ped.addEventListener('change',renderAdvice);pedLabel.append(ped);addText(pedLabel,'span',t('compare.memberPed')).dataset.i18n='compare.memberPed';
 const remove=addText(row,'button','','text-button') as HTMLButtonElement;remove.type='button';remove.textContent=t('vault.remove');remove.dataset.i18n='vault.remove';remove.addEventListener('click',()=>{row.remove();renderAdvice();});
 row.prepend(ageLabel,pedLabel);membersBox.append(row);
 el<HTMLButtonElement>('family-add').disabled=memberRows().length>=MAX_FAMILY;
}
function renderAdvice(){
 const box=el('family-advice');box.replaceChildren();el<HTMLButtonElement>('family-add').disabled=memberRows().length>=MAX_FAMILY;
 const members=readMembers();
 if(!members){if(memberRows().length)addText(box,'p',t('compare.enterAges'),'fine-print');return;}
 const advice=familyAdvice(members);
 if(!advice.length){addText(box,'p',t('compare.invalidAges'),'fine-print');return;}
 const ul=document.createElement('ul');
 for(const item of advice)addText(ul,'li',interpolate(item.key,item.fields||{}),item.key==='advice.notRecommendation'?'final':'');
 box.append(ul);
}
el('family-add').addEventListener('click',()=>{addMemberRow();renderAdvice();membersBox.lastElementChild?.querySelector('input')?.focus();});
el('family-clear').addEventListener('click',()=>{membersBox.replaceChildren();renderAdvice();});
for(const id of ['family-add','family-clear'])el<HTMLButtonElement>(id).disabled=false;
addMemberRow('38');addMemberRow('36');addMemberRow('8');
window.addEventListener('languagechange',()=>{renderCompare();renderAdvice();});
restoreFromUrl();renderCompare();renderAdvice();
