import type { Timeline } from './types.ts';
const KEY='claimclock:timeline:v1';
export function loadTimeline(): Timeline | null {
  try {
    const t=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!t || !Array.isArray(t.events) || !['preauth','enhancement','discharge'].includes(t.requestType) || !Number.isFinite(Date.parse(t.submittedAt))) return null;
    return t;
  } catch { return null; }
}
export function saveTimeline(t:Timeline) {
  try {localStorage.setItem(KEY,JSON.stringify(t)); return true;} catch {return false;}
}
export function eraseLocal() { localStorage.removeItem(KEY); }
export function download(name:string, content:string, type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
