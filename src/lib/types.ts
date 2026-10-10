export type Language = 'en' | 'hi';
export type RequestType = 'preauth' | 'enhancement' | 'discharge';
export type TimelineEvent = { id: string; at: string; type: string; note: string };
export type Timeline = {
  id: string; insurerId: string; tpaId?: string; hospital: string; city: string;
  requestType: RequestType; submittedAt: string; events: TimelineEvent[];
  decidedAt?: string; outcome?: string;
};
export type Contact = {
  id: string; name: string; kind: string; gro_email?: string | null;
  gro_phone?: string | null; helpline?: string | null; source_url: string;
  verified_on: string; evidence: unknown; aliases?: string[];
};
export type Rule = { id: string; title: string; paragraph: string; quote: string; source_url: string; plain_en?: string; plain_hi?: string; [key:string]:unknown };
export type LetterKind = 'lock' | 'followup' | 'gro' | 'bima' | 'billing' | 'protest' | 'recovery' | 'death';
export type Letter = { id: string; kind: string; language: Language; generatedAt: string; subject: string; body: string; ruleIds: string[] };
