import en from '../i18n/en.json';
import hi from '../i18n/hi.json';
import type { Language } from './types.ts';
let language:Language='en';
export const lang=()=>language;
export const t=(key:string)=> ((language==='hi'?hi:en) as Record<string,string>)[key] || (en as Record<string,string>)[key] || key;
export function setLanguage(next:Language) {
  language=next; document.documentElement.lang=next;
  try {localStorage.setItem('claimclock:language',next);} catch {}
  for(const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent=t(el.dataset.i18n!);
  document.querySelectorAll<HTMLElement>('[data-language]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===next)));
  window.dispatchEvent(new CustomEvent('languagechange'));
}
export function initI18n() {
  let saved='en';try{saved=localStorage.getItem('claimclock:language')||'en';}catch{}
  document.querySelectorAll<HTMLElement>('[data-language]').forEach(el=>el.addEventListener('click',()=>setLanguage(el.dataset.language as Language)));
  setLanguage(saved==='hi'?'hi':'en');
}
