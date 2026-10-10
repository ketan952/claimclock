import type {Timeline} from './types.ts';

export function reportPayload(timeline:Timeline){
 return {insurer:timeline.insurerId,tpa:timeline.tpaId||null,city:timeline.city?.trim()||null,request_type:timeline.requestType,submitted_at:timeline.submittedAt,decided_at:timeline.decidedAt,outcome:timeline.outcome,consent_version:'2026-10-10'};
}
export const reportFieldLabels={report:'optin.summary',insurer:'label.insurer',tpa:'label.tpa',city:'label.city',request_type:'label.type',submitted_at:'optin.submittedAt',decided_at:'optin.decidedAt',outcome:'finished.outcome',consent:'optin.consentField',adult:'optin.consentField',consent_version:'optin.consentVersion'} as const;
export type ReportField=keyof typeof reportFieldLabels;
export function reportFailure(status:number|null,body:unknown):{key:string;field?:ReportField}{
 if(status===400){const field=body&&typeof body==='object'&&'field' in body?body.field:null;return {key:'optin.invalid',field:typeof field==='string'&&Object.hasOwn(reportFieldLabels,field)?field as ReportField:'report'};}
 return {key:status===429?'optin.busy':'optin.failed'};
}
