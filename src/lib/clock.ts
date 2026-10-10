import type { RequestType, Timeline } from './types.ts';
export function windowMinutes(type: RequestType): number | null {
  return type === 'preauth' ? 60 : type === 'discharge' ? 180 : null;
}
export function clockState(timeline: Timeline, now = Date.now()) {
  const end = timeline.decidedAt ? Date.parse(timeline.decidedAt) : now;
  const elapsed = Math.max(0, end - Date.parse(timeline.submittedAt));
  const minutes = windowMinutes(timeline.requestType);
  const remaining = minutes === null ? null : minutes * 60_000 - elapsed;
  return { elapsed, remaining, minutes, stage: timeline.decidedAt ? 'decided' : remaining === null ? 'tracking' : remaining < 0 ? 'beyond' : elapsed >= minutes! * 30_000 ? 'halfway' : 'running' };
}
export function duration(ms: number) {
  const seconds = Math.floor(Math.abs(ms)/1000);
  return `${Math.floor(seconds/3600).toString().padStart(2,'0')}:${Math.floor(seconds/60)%60 < 10 ? '0' : ''}${Math.floor(seconds/60)%60}:${(seconds%60).toString().padStart(2,'0')}`;
}
export function validSubmission(value: string, now = Date.now()) {
  const t = Date.parse(value);
  return Number.isFinite(t) && t <= now + 30_000 && t >= now - 90 * 86400_000;
}
export function formatTime(value: string, language: 'en'|'hi' = 'en') {
  return new Date(value).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN',{dateStyle:'medium', timeStyle:'short',timeZone:'Asia/Kolkata'}) + ' IST';
}
export function localInputValue(date = new Date()) {
  const pad=(v:number)=>String(v).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
