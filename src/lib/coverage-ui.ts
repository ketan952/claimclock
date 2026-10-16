// "Is this covered?" page (M21). Reads a saved vault policy or a catalogue plan, lets the user
// override any rule the catalogue lacks, and renders the simulator's results with their sources.
import {lang,t,setMessage,interpolate} from './i18n';
import {loadVault,policyLabel,type Policy,type Vault} from './vault.ts';
import {cataloguePlans,planById,type CataloguePlan,type PlanRules,type SourcedRule} from './plan-compare.ts';
import {copayEstimate,healthCheckup,prePostWindow,roomUpgradeImpact,waitingPeriods,type CheckupRule,type CopayRule,type RoomRule} from './coverage-simulator.ts';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const form=(id:string)=>el<HTMLFormElement>(id);
const field=<T extends HTMLInputElement|HTMLSelectElement=HTMLInputElement>(f:HTMLFormElement,name:string)=>f.elements.namedItem(name) as T;
const addText=(parent:HTMLElement,tag:string,text:string,className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;parent.append(node);return node;};
const rupees=(n:number)=>`₹${n.toLocaleString('en-IN')}`;
const dateLabel=(ymd:string)=>new Date(`${ymd}T00:00:00Z`).toLocaleDateString(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const num=(f:HTMLFormElement,name:string):number|null=>{const raw=field(f,name).value.trim();if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null;};
const text=(f:HTMLFormElement,name:string):string|null=>field(f,name).value.trim()||null;

const source=form('source-form'),checkupForm=form('checkup-form'),roomForm=form('room-form'),waitingForm=form('waiting-form'),prepostForm=form('prepost-form'),copayForm=form('copay-form');
const vault:Vault|null=loadVault();
let plan:CataloguePlan|undefined;
let vaultPolicy:Policy|undefined;
const usedSources=new Map<string,SourcedRule>();
function sourceLink(parent:HTMLElement,rule:SourcedRule|null|undefined,label:string){
 if(!rule)return;usedSources.set(label,rule);
 const a=addText(parent,'a',`${t('vault.verifiedOn')} ${dateLabel(rule.verified_on)} ↗`) as HTMLAnchorElement;a.href=rule.source_url;a.target='_blank';a.rel='noopener noreferrer';
}
function renderSources(){
 const box=el('coverage-sources');box.replaceChildren();
 if(!usedSources.size){addText(box,'p',t('coverage.noSources'));return;}
 for(const [label,rule] of usedSources){const p=addText(box,'p',`${label}: `);const a=addText(p,'a',`${new URL(rule.source_url).hostname} · ${t('vault.verifiedOn')} ${dateLabel(rule.verified_on)} ↗`) as HTMLAnchorElement;a.href=rule.source_url;a.target='_blank';a.rel='noopener noreferrer';}
}
// --- Policy source -------------------------------------------------------------------------------
function renderVaultChoices(){
 const policies=vault?.policies.filter(p=>p.kind==='health')||[];
 const select=field<HTMLSelectElement>(source,'vaultPolicy');select.replaceChildren(new Option(t('coverage.vaultNone'),''));
 for(const policy of policies)select.append(new Option(policyLabel(policy,lang()),policy.id));
 el('vault-policy-field').hidden=!policies.length;
 if(policies.length&&!select.value){const preferred=policies.find(p=>p.id===vault?.defaultPolicyId)||policies[0];select.value=preferred.id;}
}
function applyVaultPolicy(){
 vaultPolicy=vault?.policies.find(p=>p.id===field<HTMLSelectElement>(source,'vaultPolicy').value);
 if(!vaultPolicy)return;
 const set=(f:HTMLFormElement,name:string,value:unknown)=>{if(value!==undefined&&value!==null&&value!=='')field(f,name).value=String(value);};
 field<HTMLSelectElement>(source,'planId').value=vaultPolicy.planId&&planById(vaultPolicy.planId)?vaultPolicy.planId:'';
 set(source,'sumInsured',vaultPolicy.sumInsured);set(source,'inceptionDate',vaultPolicy.inceptionDate);set(source,'continuityFrom',vaultPolicy.continuityFrom);
 field(source,'floater').checked=vaultPolicy.memberIds.length>1;
 const member=vault?.members.find(m=>vaultPolicy!.memberIds.includes(m.id)&&m.relation==='self')||vault?.members.find(m=>vaultPolicy!.memberIds.includes(m.id));
 if(member?.birthYear)set(source,'memberAge',new Date().getUTCFullYear()-member.birthYear);
 set(checkupForm,'lastClaimedOn',vaultPolicy.healthCheckupLastClaimedOn);set(checkupForm,'manualCheckupLimit',vaultPolicy.healthCheckupLimit);
 if(vaultPolicy.copayPercent!==undefined&&!plan)field(copayForm,'admissible').dataset.vaultCopay=String(vaultPolicy.copayPercent);
}
const ruleLabels:Record<string,string>={room_rent:'vault.rule.roomRent',copay:'vault.rule.copay',ped_waiting_months:'vault.rule.ped',specific_waiting_months:'vault.rule.specific',initial_waiting_days:'vault.rule.initial',consumables:'vault.rule.consumables',health_checkup:'vault.rule.healthCheckup',pre_post_hospitalisation:'coverage.rule.prePost',sub_limits:'coverage.rule.subLimits'};
function ruleText(key:keyof PlanRules,rule:SourcedRule&Record<string,unknown>):string {
 const hindi=lang()==='hi';
 if(key==='ped_waiting_months'||key==='specific_waiting_months')return interpolate('vault.months',{n:Number(rule.value)});
 if(key==='initial_waiting_days')return interpolate('vault.days',{n:Number(rule.value)});
 if(key==='consumables')return t(`vault.consumables.${String(rule.value)}`);
 if(key==='pre_post_hospitalisation'){const pre=rule.pre_days===null?t('vault.ruleUnknown'):interpolate('vault.days',{n:Number(rule.pre_days)});const post=rule.post_days===null?String((hindi?rule.note_hi:rule.note)||rule.note||t('vault.ruleUnknown')):interpolate('vault.days',{n:Number(rule.post_days)});return `${pre} / ${post}`;}
 return String(hindi?rule.value_hi||rule.value:rule.value);
}
function renderPlanRules(){
 const box=el('plan-rules');box.replaceChildren();
 if(!plan)return;
 addText(box,'h3',`${t('vault.planRules')} — ${plan.name}`);
 for(const key of Object.keys(ruleLabels) as (keyof PlanRules)[]){
  const rule=plan.rules[key] as (SourcedRule&Record<string,unknown>)|null;const p=addText(box,'p','','fine-print');addText(p,'strong',`${t(ruleLabels[key])}: `);
  if(!rule){p.append(t('vault.ruleUnknown'));continue;}
  p.append(ruleText(key,rule)+' ');sourceLink(p,rule,t(ruleLabels[key]));
 }
 addText(box,'p',t('vault.planRulesNote'),'fine-print');
}
function applyPlanDefaults(){
 plan=planById(field<HTMLSelectElement>(source,'planId').value);
 const set=(f:HTMLFormElement,name:string,value:unknown)=>{field(f,name).value=value===null||value===undefined?'':String(value);};
 set(waitingForm,'pedMonths',plan?.rules.ped_waiting_months?.value??null);set(waitingForm,'specificMonths',plan?.rules.specific_waiting_months?.value??null);set(waitingForm,'initialDays',plan?.rules.initial_waiting_days?.value??null);
 set(prepostForm,'preDays',plan?.rules.pre_post_hospitalisation?.pre_days??null);set(prepostForm,'postDays',plan?.rules.pre_post_hospitalisation?.post_days??null);
 const roomRule=field<HTMLSelectElement>(roomForm,'roomRule');roomRule.querySelector('option[value=catalogue]')!.toggleAttribute('disabled',!plan?.rules.room_rent);
 if(!plan&&roomRule.value==='catalogue')roomRule.value='category';if(plan&&plan.rules.room_rent)roomRule.value='catalogue';
 el('manual-checkup-field').hidden=Boolean(plan?.rules.health_checkup);
 renderPlanRules();
}
// --- Health check-up ---------------------------------------------------------------------------
function checkupRule():CheckupRule|null {
 if(plan?.rules.health_checkup)return plan.rules.health_checkup;
 const manual=num(checkupForm,'manualCheckupLimit');
 return manual===null?null:{mode:'unknown',eligibility:{from:'policy_year'},limit:{type:'fixed',amount:manual}};
}
function renderCheckup(){
 const rule=checkupRule(),box=el('checkup-result');box.replaceChildren();
 const claimFree=field<HTMLSelectElement>(checkupForm,'claimFree').value;
 el('claim-free-field').hidden=rule?.eligibility.from!=='claim_free_year';
 const result=healthCheckup({rule,sumInsured:num(source,'sumInsured'),floater:field(source,'floater').checked,inceptionDate:text(source,'inceptionDate'),lastClaimedOn:text(checkupForm,'lastClaimedOn'),claimFreePreviousYear:claimFree===''?null:claimFree==='yes',memberAge:num(source,'memberAge')});
 const verdictClass=result.status==='available'?'ok':['unknown_rule','unknown_timing','needs_claim_free_year','invalid'].includes(result.status)?'warn':'no';
 addText(box,'p',t(`coverage.checkup.${result.status}`),`verdict ${verdictClass}`);
 if(result.amount!==null)addText(box,'p',rupees(result.amount),'amount');
 if(result.amountBasis)addText(box,'p',t(`coverage.checkupBasis.${result.amountBasis}`));
 if(result.mode&&result.mode!=='unknown')addText(box,'p',t(`coverage.checkupMode.${result.mode}`));
 if(result.nextEligibleOn)addText(box,'p',interpolate('coverage.nextEligible',{date:dateLabel(result.nextEligibleOn)}));
 if(result.policyYear)addText(box,'p',interpolate('coverage.policyYear',{index:result.policyYear.index+1,start:dateLabel(result.policyYear.start),end:dateLabel(result.policyYear.end)}),'fine-print');
 if(result.notes.length){const ul=document.createElement('ul');for(const note of result.notes)addText(ul,'li',t(`coverage.note.${note}`));box.append(ul);}
 if(plan?.rules.health_checkup){const p=addText(box,'p','','fine-print');sourceLink(p,plan.rules.health_checkup,t('vault.rule.healthCheckup'));}
}
// --- Room upgrade -----------------------------------------------------------------------------
function roomRule():RoomRule|null {
 const choice=field<HTMLSelectElement>(roomForm,'roomRule').value;
 if(choice==='catalogue')return plan?.rules.room_rent||null;
 if(choice==='any')return {category:'any'};
 if(choice==='category')return {category:'single_private_ac'};
 if(choice==='percent'){const percent=num(roomForm,'roomPercent');return percent===null?null:{category:'percent_si',percent};}
 const cap=num(roomForm,'roomCap');return cap===null?null:{category:'rupee_cap',cap_by_si:[[1e12,{amount:cap}]]};
}
function syncRoomFields(){
 const choice=field<HTMLSelectElement>(roomForm,'roomRule').value,rule=roomRule();
 el('room-percent-field').hidden=choice!=='percent';el('room-cap-field').hidden=choice!=='cap';
 const needsHospitalRate=choice==='category'||(choice==='catalogue'&&rule!==null&&!['any','percent_si','rupee_cap'].includes(rule.category));
 el('room-eligible-field').hidden=!needsHospitalRate;
}
function renderRoom(){
 const box=el('room-result');box.replaceChildren();const rule=roomRule();
 if(!rule){addText(box,'p',t('coverage.room.needs_rule'),'verdict warn');return;}
 const result=roomUpgradeImpact({rule,sumInsured:num(source,'sumInsured'),chosenRoomRent:num(roomForm,'chosenRoomRent')??Number.NaN,hospitalEligibleRate:num(roomForm,'hospitalEligibleRate'),days:num(roomForm,'days')??Number.NaN,associatedExpenses:num(roomForm,'associatedExpenses')??0});
 addText(box,'p',t(`coverage.room.${result.status}`),`verdict ${result.status==='impact'?'no':result.status==='no_limit'||result.status==='within_limit'?'ok':'warn'}`);
 if(result.status==='impact'){
  addText(box,'p',rupees(result.totalImpact!),'amount');
  const ul=document.createElement('ul');
  addText(ul,'li',interpolate('coverage.roomEligible',{amount:rupees(result.eligiblePerDay!)}));
  addText(ul,'li',interpolate('coverage.roomDifference',{amount:rupees(result.roomDifference)}));
  addText(ul,'li',interpolate('coverage.roomAssociated',{amount:rupees(result.associatedDeduction!),percent:Math.round((1-result.proportion!)*100)}));
  box.append(ul);
 }else if(result.eligiblePerDay!==null)addText(box,'p',interpolate('coverage.roomEligible',{amount:rupees(result.eligiblePerDay)}));
 const ul=document.createElement('ul');for(const note of result.notes)addText(ul,'li',t(`coverage.note.${note}`));box.append(ul);
 if(field<HTMLSelectElement>(roomForm,'roomRule').value==='catalogue'&&plan?.rules.room_rent){const p=addText(box,'p','','fine-print');sourceLink(p,plan.rules.room_rent,t('vault.rule.roomRent'));}
}
// --- Waiting periods --------------------------------------------------------------------------
function renderWaiting(){
 const box=el('waiting-result');box.replaceChildren();
 const result=waitingPeriods({inceptionDate:text(source,'inceptionDate'),continuityFrom:text(source,'continuityFrom'),pedMonths:num(waitingForm,'pedMonths'),specificMonths:num(waitingForm,'specificMonths'),initialDays:num(waitingForm,'initialDays')});
 if(result.status!=='ok'){addText(box,'p',t(`coverage.waiting.${result.status}`),'verdict warn');return;}
 addText(box,'p',interpolate('coverage.waitingServed',{months:result.servedMonths!,date:dateLabel(result.from!)}),'verdict ok');
 const ul=document.createElement('ul');
 const line=(labelKey:string,period:typeof result.ped,unit:'months'|'days')=>{
  if(!period){addText(ul,'li',`${t(labelKey)}: ${t('vault.ruleUnknown')}`);return;}
  const remaining=interpolate(unit==='months'?'vault.months':'vault.days',{n:period.remaining});
  addText(ul,'li',`${t(labelKey)}: ${period.done?interpolate('coverage.waitDone',{date:dateLabel(period.endsOn)}):interpolate('coverage.waitLeft',{remaining,date:dateLabel(period.endsOn)})}`,period.done?'ok':'warn');
 };
 line('coverage.initialWait',result.initial,'days');line('coverage.specificWait',result.specific,'months');line('coverage.pedWait',result.ped,'months');line('coverage.moratorium',result.moratorium,'months');
 box.append(ul);
 const notes=document.createElement('ul');for(const note of result.notes)addText(notes,'li',t(`coverage.note.${note}`),'fine-print');box.append(notes);
 if(plan){const p=addText(box,'p','','fine-print');sourceLink(p,plan.rules.ped_waiting_months,t('vault.rule.ped'));}
}
// --- Pre/post --------------------------------------------------------------------------------
function renderPrePost(){
 const box=el('prepost-result');box.replaceChildren();
 const pre=num(prepostForm,'preDays'),post=num(prepostForm,'postDays');
 const result=prePostWindow({rule:{pre_days:pre,post_days:post},admissionDate:text(prepostForm,'admissionDate')||'',dischargeDate:text(prepostForm,'dischargeDate')||'',expenseDate:text(prepostForm,'expenseDate')||''});
 addText(box,'p',t(`coverage.prepost.${result.position}`),`verdict ${['pre','post','during'].includes(result.position)?'ok':result.position.startsWith('unknown')||result.position==='invalid'?'warn':'no'}`);
 if(result.daysBeforeAdmission!==null)addText(box,'p',interpolate('coverage.daysBefore',{days:result.daysBeforeAdmission,start:result.preWindowStart?dateLabel(result.preWindowStart):t('vault.ruleUnknown')}));
 if(result.daysAfterDischarge!==null)addText(box,'p',interpolate('coverage.daysAfter',{days:result.daysAfterDischarge,end:result.postWindowEnd?dateLabel(result.postWindowEnd):t('vault.ruleUnknown')}));
 const ul=document.createElement('ul');for(const note of result.notes)addText(ul,'li',t(`coverage.note.${note}`));box.append(ul);
 if(plan?.rules.pre_post_hospitalisation){const p=addText(box,'p','','fine-print');sourceLink(p,plan.rules.pre_post_hospitalisation,t('coverage.rule.prePost'));}
}
// --- Co-pay and sub-limits ----------------------------------------------------------------------
function copayRule():CopayRule|null {
 if(plan?.rules.copay)return plan.rules.copay;
 const vaultPercent=vaultPolicy?.copayPercent;return vaultPercent===undefined?null:{percent:vaultPercent};
}
function renderCopay(){
 const box=el('copay-result');box.replaceChildren();
 const result=copayEstimate(copayRule(),num(copayForm,'admissible'),num(source,'entryAge'));
 addText(box,'p',interpolate('coverage.copayPercent',{percent:result.percent}),`verdict ${result.percent>0?'no':'ok'}`);
 if(result.amount!==null)addText(box,'p',rupees(result.amount),'amount');
 addText(box,'p',t(`coverage.copayReason.${result.reason}`));
 if(result.notes.length){const ul=document.createElement('ul');for(const note of result.notes)addText(ul,'li',t(`coverage.note.${note}`));box.append(ul);}
 if(plan?.rules.copay){const p=addText(box,'p','','fine-print');sourceLink(p,plan.rules.copay,t('vault.rule.copay'));}
}
function renderSubLimits(){
 const box=el('sublimits-result');box.replaceChildren();const rule=plan?.rules.sub_limits;
 if(!plan){addText(box,'p',t('coverage.sublimitsNoPlan'));return;}
 if(!rule){addText(box,'p',t('vault.ruleUnknown'));return;}
 addText(box,'p',String(lang()==='hi'?rule.value_hi||rule.value:rule.value));
 if(rule.items.length){const ul=document.createElement('ul');for(const item of rule.items)addText(ul,'li',`${item.treatment}: ${item.limit}`);box.append(ul);}
 const p=addText(box,'p','','fine-print');sourceLink(p,rule,t('coverage.rule.subLimits'));
}
function renderAll(){usedSources.clear();renderPlanRules();renderCheckup();syncRoomFields();renderRoom();renderWaiting();renderPrePost();renderCopay();renderSubLimits();renderSources();}
// --- Wiring ----------------------------------------------------------------------------------
renderVaultChoices();applyVaultPolicy();applyPlanDefaults();
field<HTMLSelectElement>(source,'vaultPolicy').addEventListener('change',()=>{applyVaultPolicy();applyPlanDefaults();renderAll();});
field<HTMLSelectElement>(source,'planId').addEventListener('change',()=>{applyPlanDefaults();renderAll();});
source.addEventListener('input',renderAll);checkupForm.addEventListener('input',renderAll);checkupForm.addEventListener('change',renderAll);waitingForm.addEventListener('input',renderAll);copayForm.addEventListener('input',renderAll);
roomForm.addEventListener('change',()=>{syncRoomFields();renderRoom();renderSources();});
roomForm.addEventListener('submit',e=>{e.preventDefault();renderRoom();renderSources();el('room-result').scrollIntoView({block:'nearest'});});
prepostForm.addEventListener('submit',e=>{e.preventDefault();renderPrePost();renderSources();});
prepostForm.addEventListener('change',()=>{renderPrePost();renderSources();});
window.addEventListener('languagechange',()=>{renderVaultChoices();renderAll();});
for(const selector of ['#room-form button[type=submit]','#prepost-form button[type=submit]'])document.querySelector<HTMLButtonElement>(selector)!.disabled=false;
if(cataloguePlans.length===0)el('plan-rules').textContent='';
renderAll();
