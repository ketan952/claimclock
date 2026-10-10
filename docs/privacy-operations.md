# Privacy and optional-service operations

Reviewed 10 October 2026. This document describes implemented safeguards and operational duties. It is **not** a certification of legal compliance or anonymity. Core clocks, templates, document extraction and insurer disclosure pages work without D1 or AI.

## Data and consent

| Flow | Leaves device | Application persistence |
|---|---|---|
| Local clock, timeline, document extraction and rules | Nothing until user shares/exports | Browser storage controlled by the user |
| Optional patient report | Known insurer/TPA ID, city, request type, submitted/decided timestamps, outcome, consent version | D1 report plus random ID and SHA-256 erasure-token hash; scheduled retention up to 365 days |
| Optional usage counts | At most 20 total counts per batch, using five fixed event names | Daily counts only; scheduled retention 90 days |
| Explain with AI | User-reviewed, redacted ambiguous lines, at most 800 characters, explicit consent | Not persisted by ClaimClock; sent to the configured provider under its own processing terms |
| Aggregate reading | Selected insurer ID | Global rate counter only; no IP, user agent or reader ID |

Reports require `consent:true`, `adult:true` and `consent_version:'2026-10-10'`. The adult assertion is self-declaration, not verified age or parental consent. Do not use this research submission flow for children's identifying data. Hospital name, policy number, patient identity and arbitrary extra fields are rejected. A city still can contribute to reidentification when combined with timestamps; reports are minimized, not proven anonymous. Analytics requires a separate optional choice in the browser. No third-party scripts or analytics identifiers are used.

The browser must preview the exact research fields and explain purpose, retention and erasure before submission. It must show the configured AI provider/model from `/api/config` before AI consent. Regex redaction is incomplete for names, unusual identifiers and free text: the user preview is a necessary additional control. The server applies a second redaction pass. Provider output is untrusted text; it cannot change deterministic classifications or citation IDs.

Cloudflare and a configured AI provider necessarily process network metadata. Disabling application logs does not assert that infrastructure retains nothing. Review processor terms and region/retention settings before enabling optional data collection. Publish a working operator contact for privacy requests before enabling the DB binding; never ask users to publish health documents or erasure tokens in GitHub issues.

## Erasure and aggregate disclosure

A successful submission returns `{id,erase_token}`. The browser retains both; only a SHA-256 hash of a 256-bit random token is stored in D1. `DELETE /api/reports/:id` accepts the token in a JSON body. Tokens never belong in URLs. The response returns `erased:true` only when a row was actually deleted. Unknown IDs and incorrect tokens both return `erased:false`, without distinguishing them. The browser must clear its local token only after `erased:true`. If the database or quota is unavailable, the request returns a retryable error and must not be shown as completed. A lost token cannot be recovered by email because no identity or email is collected.

A database trigger invalidates the entire affected insurer/request-type/month aggregate within the same transaction as deletion. It also inserts a suppression marker, so subsequent maintenance cannot republish a one-person subtraction. If the statement fails, the database rolls back deletion and invalidation together. The client must retain its token and retry. An already downloaded public aggregate cannot be recalled.

Public cells group by insurer, request type and submission month; they never group by city or TPA and never expose exact individual dates. Publication requires at least 10 reports, a closed month and a seven-day grace period. Only reports received before the grace deadline enter that cohort. Published cells are frozen: late submissions do not change them. The whole cell remains hidden after erasure, even if its remaining count exceeds 10. Enhancement reports have `beyond_window:null` because no separately verified statutory deadline is assigned. Other `beyond_window` values describe self-reported elapsed times, not adjudicated breaches.

These controls reduce repeated-query differencing but do not provide differential privacy, representative sampling or verified claim authenticity. Anonymous endpoints can be manipulated; global limits constrain volume but cannot stop a determined person from submitting multiple invented records.

## Budgets, failures and maintenance

D1 is optional. Missing bindings, database errors, provider errors and quota exhaustion return generic 503/429 responses. Local functionality remains available. No endpoint accepts a custom provider URL, arbitrary insurer, public SQL filter, document upload or authorization credential. Mutations require same-origin JSON and enforce a streamed 4 KiB body limit before parsing. GET endpoints accept browser same-origin fetch metadata or a matching Origin header. Same-origin policy is a browser protection, not authentication against scripts that forge headers.

Global atomic D1 counters use no IP or device identifiers:

| Action | Per UTC day | Per minute |
|---|---:|---:|
| AI explanation | 100 | 3 |
| Report submission | 100 | 5 |
| Event batches | 200 | 10 |
| Aggregate reads | 500 | 30 |
| Erasure requests | 100 | 10 |

A rejected minute allocation may still consume a day permit. These deliberately low shared budgets favor no-cost operation; one abusive user can exhaust an optional feature for everyone. They cannot guarantee that the entire Cloudflare account stays below its free ceiling if other applications share it.

`worker/aggregate.sql` is the shared source for Workers Cron and the GitHub Actions fallback. It deletes old raw reports and counts, expires quota keys, and inserts eligible frozen aggregates using SQL. Quota keys expire after one day and are removed at the next daily run, targeting at most two days. Retention is scheduled, not a database TTL: a failed/missing job can exceed these targets. Monitor scheduled invocation status and run the fallback immediately on a failure. The Actions fallback uses `wrangler d1 execute`, not a public admin endpoint; enable repository variable `CLOUDFLARE_AGGREGATE_FALLBACK=true` when needed. Never export the raw report table to public CI artifacts.

## Deployment and AI enablement

Use only the personal `ketan952/claimclock` repository and personal Cloudflare account. Bind D1 as `DB` with database name `claimclock`, configure its actual database ID and `migrations_dir:'migrations'`, then apply `migrations/0001_initial.sql`. `ASSETS` remains the static asset binding. The SQL import requires Wrangler's Text rule for `**/*.sql`.

The deploy workflow is off until repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`. It runs checks, tests and the reviewed AGPL compatibility/notice gate before any migration or deployment. A failed license audit must block release. Set `CLOUDFLARE_D1_ENABLED=true` only after provisioning the optional database. Secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never print or commit them.

AI remains disabled unless all of `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` and `LLM_FREE_TIER_CONFIRMED='true'` are set. The first three are Worker secrets; the final value is an operator configuration flag, set only after confirming a no-card free account and model. API hostname alone cannot determine whether an account is billed. Allowed bases are `https://api.groq.com/openai/v1`, `https://api.cerebras.ai/v1` and `https://openrouter.ai/api/v1`; OpenRouter models must end in `:free`. Redirects are rejected. There is no retry to a paid model or another provider, no file/vision transfer and no runtime OCR service. Requests time out after ten seconds, cap completion output at 600 tokens and returned explanation at 1,600 characters and return only the explanation field. Do not enable a paid account, credit balance or automatic billing. See [Groq compatibility](https://console.groq.com/docs/openai), [Cerebras completion API](https://inference-docs.cerebras.ai/api-reference/chat-completions) and [OpenRouter free variant](https://openrouter.ai/docs/guides/routing/model-variants/free).

## Contact maintenance

`node scripts/check-contacts.mjs` is read-only by default. The weekly workflow enables `--write --issues`: it checks every available email/phone against its recorded primary-source page or PDF, including escalation levels. Only a complete match refreshes the contact and escalation verification dates. HTTP 200 alone, whole-page hashes or dynamic navigation changes never refresh factual verification. Missing, blocked or unparseable sources retain the old date and enter a deduplicated review issue in this personal repository. The workflow does not call or email contact recipients. A match verifies publication, not that a number works or somebody reads the inbox.

## Incident response and legal-review boundary

Use this operational sequence from day one; commencement and applicability require current legal review. [The final MeitY Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), Rule 7, provides for affected-person and initial Board notice without delay, then specified detail within 72 hours unless a longer period is allowed. Do not interpret 72 hours as permission to delay the initial notice. Rules 6 and 8 contain security/log-retention requirements, including Rule 8(3)'s minimum-year language, which requires review against this requested immediate-erasure and no-application-logging design before asserting compliance. Consult the [official rules and commencement collection](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025).

1. Record awareness time in a private incident record; restrict access. Disable optional reports/AI and rotate affected secrets while preserving the static app.
2. Contain the incident and preserve necessary security evidence without introducing health-document/request-body logs. Determine data categories, scope, processor involvement, likely harms and affected periods.
3. Arrange the applicable initial notices without delay. Explain the known impact, protective steps and operator contact. Because no user contact details are collected, direct notification may be impossible; document that limitation, obtain qualified advice and publish an in-app/site notice. Do not claim a public notice always satisfies individual notice duties.
4. Prepare the required detailed report within 72 hours of awareness, including cause, remediation and notification actions; track any formally granted extension. The operator, not this application, submits notifications.
5. Review access, fix the cause, test restoration and record decisions. Reassess processor terms, retention, purpose notices and erasure behavior before re-enabling optional services.

No breach notice, complaint or email is automatically sent by ClaimClock. This runbook is implementation guidance, not legal advice.
