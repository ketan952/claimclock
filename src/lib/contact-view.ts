import type {Contact,ContactFieldSource} from './types.ts';
import {lang} from './i18n';
const label=(en:string,hi:string)=>lang()==='hi'?hi:en;
const add=(root:HTMLElement,tag:string,text:string)=>{const el=document.createElement(tag);el.textContent=text;root.append(el);return el;};
const date=(value:string)=>new Intl.DateTimeFormat(lang()==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T00:00:00Z'));
function source(root:HTMLElement,url:string,verified:string|null|undefined){const line=add(root,'small',verified?`${label('Verified','जाँच')}: ${date(verified)} · `:'');const link=add(line,'a',label('Published source ↗','प्रकाशित स्रोत ↗')) as HTMLAnchorElement;link.href=url;link.target='_blank';link.rel='noopener noreferrer';}
function field(root:HTMLElement,title:string,value:string|null|undefined,kind:'email'|'phone',provenance:ContactFieldSource|undefined,fallback:{source_url:string;verified_on?:string|null}){
 const row=add(root,'div','');row.className='contact-field';add(row,'span',title+': ');
 if(value){for(const item of kind==='phone'?value.split(/[,;/]|\bor\b/i).map(s=>s.trim()).filter(Boolean):[value]){const a=add(row,'a',item) as HTMLAnchorElement;a.href=kind==='email'?`mailto:${item}`:`tel:${item.replace(/[^+\d]/g,'')}`;}source(row,provenance?.source_url||fallback.source_url,provenance?.verified_on||fallback.verified_on);}
 else add(row,'span',label('Not published in reviewed source','जाँचे गए स्रोत में प्रकाशित नहीं'));
}
export function renderContacts(root:HTMLElement,contacts:Contact[]){
 root.replaceChildren();
 for(const c of contacts){const block=add(root,'section','');block.className='contact-block';add(block,'h3',lang()==='hi'?(c.name_hi||c.name):c.name);
 if(c.own_page){
  add(block,'h4',label('Insurer’s own publication','बीमा कंपनी का अपना प्रकाशन'));
  field(block,label('Help line','सहायता नंबर'),c.helpline,'phone',c.field_sources?.helpline,c);
  if(c.helpline_scope)add(block,'small',lang()==='hi'?(c.helpline_scope_hi||'प्रकाशित सेवा का दायरा स्रोत में देखें।'):c.helpline_scope);
  field(block,label('Claims email','दावे का ईमेल'),c.claims_email,'email',c.field_sources?.claims_email,c);
  field(block,label('Grievance email','शिकायत ईमेल'),c.own_page.gro_email,'email',c.field_sources?.gro_email,c.own_page);
  field(block,label('Grievance phone','शिकायत नंबर'),c.own_page.gro_phone,'phone',c.field_sources?.gro_phone,c.own_page);
  const details=add(block,'details','');add(details,'summary',label('Published escalation stages','प्रकाशित शिकायत के चरण'));
  for(const level of c.escalation_levels||[]){const stage=add(details,'div','');stage.className='contact-stage';add(stage,'h4',lang()==='hi'?`चरण ${level.level} · ${level.role_hi}`:`${level.source_label} · ${level.role}`);source(stage,level.field_sources.role?.source_url||level.source_url,level.field_sources.role?.verified_on||level.verified_on);field(stage,label('Email','ईमेल'),level.email,'email',level.field_sources.email,level);field(stage,label('Phone','फ़ोन'),level.phone,'phone',level.field_sources.phone,level);}
  if(!c.escalation_levels?.length)add(details,'p',label('No numbered internal stages published in the reviewed source.','जाँचे गए स्रोत में क्रमबद्ध आंतरिक चरण प्रकाशित नहीं हैं।'));
  source(details,c.own_page.source_url,c.own_page.verified_on);
 }
 if(c.irdai_baseline){const baseline=add(block,'details','');baseline.className='contact-baseline';add(baseline,'summary',label('IRDAI GRO directory baseline','आईआरडीएआई शिकायत अधिकारी निर्देशिका का मूल रिकॉर्ड'));field(baseline,label('Email','ईमेल'),c.irdai_baseline.gro_email,'email',c.irdai_baseline.field_sources?.gro_email,c.irdai_baseline);field(baseline,label('Phone','फ़ोन'),c.irdai_baseline.gro_phone,'phone',c.irdai_baseline.field_sources?.gro_phone,c.irdai_baseline);add(baseline,'small',label('Directory entries may differ from the insurer’s current publication. Each source is labelled separately.','निर्देशिका का विवरण कंपनी के वर्तमान प्रकाशन से अलग हो सकता है। दोनों स्रोत अलग दिखाए गए हैं।'));}
 if(!c.own_page&&!c.irdai_baseline){field(block,label('Email','ईमेल'),c.gro_email,'email',c.field_sources?.gro_email,c);field(block,label('Phone','फ़ोन'),c.gro_phone||c.helpline,'phone',c.field_sources?.gro_phone,c);}
 }
}
