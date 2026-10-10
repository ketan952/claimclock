export type Language = 'en' | 'hi';
export type RequestType = 'preauth' | 'enhancement' | 'discharge';
export type TimelineEvent = { id: string; at: string; type: string; note: string };
export type Timeline = {
  id: string; insurerId: string; tpaId?: string; hospital: string; city: string;
  requestType: RequestType; submittedAt: string; events: TimelineEvent[];
  decidedAt?: string; outcome?: string;
};
export type ContactFieldSource = {
  source_url: string; verified_on: string; evidence: string;
  method?: string; source_sha256?: string;
};
export type ContactEscalationLevel = {
  level: number; source_label: string; role: string; role_hi: string;
  email: string | null; phone: string | null; source_url: string; verified_on: string;
  field_sources: Record<string, ContactFieldSource | undefined>;
};
export type Contact = {
  id: string; name: string; kind: string; gro_email?: string | null;
  gro_phone?: string | null; helpline?: string | null; source_url: string;
  verified_on: string; evidence: unknown; aliases?: string[];
  name_hi?: string; claims_email?: string | null;
  helpline_scope?: string; helpline_scope_hi?: string; claims_email_scope_hi?: string | null; claims_email_scope?: string | null;
  field_sources?: Record<string, ContactFieldSource | undefined>;
  escalation_levels?: ContactEscalationLevel[];
  own_page?: { source_url: string; verified_on: string; browser_status: string; method: string; gro_email: string | null; gro_phone: string | null };
  irdai_baseline?: { gro_email: string | null; gro_phone: string | null; raw_phone?: string | null; source_url: string; verified_on: string | null; evidence: string; field_sources?: Record<string, ContactFieldSource | undefined> };
  notes?: string[];
};
export type Rule = { id: string; title: string; paragraph: string; quote: string; source_url: string; plain_en?: string; plain_hi?: string; [key:string]:unknown };
export type LetterKind = 'lock' | 'followup' | 'gro' | 'bima' | 'billing' | 'protest' | 'recovery' | 'death';
export type Letter = { id: string; kind: string; language: Language; generatedAt: string; subject: string; body: string; ruleIds: string[] };
