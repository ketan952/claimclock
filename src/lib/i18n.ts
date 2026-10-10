import en from '../i18n/en.json';
import hi from '../i18n/hi.json';
import type { Language } from './types.ts';
let language:Language='en';
let initialized=false;
export const lang=()=>language;
export const t=(key:string)=> ((language==='hi'?hi:en) as Record<string,string>)[key] || (en as Record<string,string>)[key] || key;
export const interpolate=(key:string,fields:Record<string,string|number>)=>t(key).replace(/\{(\w+)\}/g,(_,name)=>String(fields[name]??`[${name}]`));
export function setMessage(node:HTMLElement,key:string|null,fields:Record<string,string|number>={}){
 if(key===null){delete node.dataset.i18nMessage;delete node.dataset.i18nFields;node.textContent='';return;}
 node.dataset.i18nMessage=key;node.dataset.i18nFields=JSON.stringify(fields);node.textContent=interpolate(key,fields);
}
export function setLanguage(next:Language) {
  language=next;document.documentElement.lang=next;
  try{localStorage.setItem('claimclock:language',next);}catch{}
  for(const el of document.querySelectorAll<HTMLElement>('[data-i18n]'))el.textContent=t(el.dataset.i18n!);
  for(const [attribute,key] of [['placeholder','i18nPlaceholder'],['aria-label','i18nAriaLabel'],['title','i18nTitle']] as const)for(const el of document.querySelectorAll<HTMLElement>(`[data-${key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}]`))el.setAttribute(attribute,t(el.dataset[key]!));
  for(const node of document.querySelectorAll<HTMLElement>('[data-local-date]'))node.textContent=new Date(node.dataset.localDate!).toLocaleDateString(next==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'});
  for(const node of document.querySelectorAll<HTMLElement>('[data-i18n-message]'))setMessage(node,node.dataset.i18nMessage!,JSON.parse(node.dataset.i18nFields||'{}'));
  const skip=document.querySelector<HTMLElement>('.skip-link');if(skip)skip.textContent=t('common.skip');
  document.querySelector('header nav')?.setAttribute('aria-label',t('common.mainNav'));
  document.querySelector('.language')?.setAttribute('aria-label',t('common.language'));
  document.querySelectorAll('.beta').forEach(el=>el.textContent=t('common.beta'));
  document.querySelectorAll<HTMLElement>('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===next)));
  const titleKeys:Record<string,string>={'/':'hero.title','/privacy/':'privacy.title','/deductions/':'deductions.title','/rejected/':'rejection.title','/death/':'death.title','/index/':'index.title','/methodology/':'method.title','/about/':'about.title','/offline/':'offline.title'};
  const title=titleKeys[location.pathname];if(title)document.title=`${t(title)} — ClaimClock`;else if(location.pathname.startsWith('/index/'))document.title=`${document.querySelector('h1')?.textContent||''} — ${t('index.title')}`;
  window.dispatchEvent(new CustomEvent('languagechange'));
}
export function initI18n() {
  if(initialized)return;
  initialized=true;
  let saved='en';try{saved=localStorage.getItem('claimclock:language')||'en';}catch{}
  document.querySelectorAll<HTMLElement>('[data-language]').forEach(el=>el.addEventListener('click',()=>setLanguage(el.dataset.language as Language)));
  setLanguage(saved==='hi'?'hi':'en');
}
// A surviving page entry can initialize language even when the shared layout
// entry fails to load. The guard also prevents duplicate button listeners.
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initI18n,{once:true});
  else initI18n();
}
