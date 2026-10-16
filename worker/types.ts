// Structural subset implemented by Cloudflare D1 and the SQLite test adapter.
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export interface Bindings {
  DB?: Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_FREE_TIER_CONFIRMED?: string;
  /** M22 speech model on the same free-tier provider; defaults to whisper-large-v3-turbo and is only used when the provider is Groq. */
  STT_MODEL?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_HOSTNAME?: string;
}
