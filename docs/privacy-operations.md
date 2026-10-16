# Privacy and optional-service operations

Reviewed 10 October 2026. This document describes implemented safeguards and operational duties. It is **not** a certification of legal compliance or anonymity. Core clocks, templates, document extraction and insurer disclosure pages work without D1 or AI.

## Data and consent

| Flow | Leaves device | Application persistence |
|---|---|---|
| Local clock, timeline, document extraction and rules | Nothing until user shares/exports | Browser storage controlled by the user |
| Optional patient report | Known insurer/TPA ID, optional city (`null` when blank), request type, submitted/decided timestamps, outcome, consent version | D1 report plus random ID and SHA-256 erasure-token hash; reports older than 365 days are removed by daily cleanup, subject to the maintenance failure boundary below |
| Optional usage counts | At most 20 total counts per batch, using five fixed event names | Daily counts only; scheduled retention 90 days |
| Explain with AI | User-reviewed, redacted ambiguous lines, at most 800 characters, explicit consent | Not persisted by ClaimClock; sent to the configured provider under its own processing terms |
| Aggregate reading | Selected insurer ID | Global rate counter only; no IP, user agent or reader ID |
| Optional encrypted device transfer | AES-256-GCM envelope only; retrieval sends its eight-character code | D1 SHA-256 code hash, ciphertext, seven-day expiry and lookup count; no decryption key or plaintext |
| Turnstile verification for optional operations | Browser challenge traffic to Cloudflare; Worker submits token and secret to Siteverify | No application token, IP or device-identity table; Cloudflare processes verification traffic |

Reports require `consent:true`, `adult:true` and `consent_version:'2026-10-10'`. The adult assertion is self-declaration, not verified age or parental consent. Do not use this research submission flow for children's identifying data. Hospital name, policy number, patient identity and arbitrary extra fields are rejected. A supplied city still can contribute to reidentification when combined with timestamps; reports are minimized, not proven anonymous. Analytics requires a separate optional choice in the browser. No analytics identifiers are used. The optional operations load Cloudflare's Turnstile script only after the visitor requests one; core local work does not require it.

The browser must preview the exact research fields and explain purpose, retention and erasure before submission. It must show the configured AI provider/model from `/api/config` before AI consent. Regex redaction is incomplete for names, unusual identifiers and free text: the user preview is a necessary additional control. The server applies a second redaction pass. Provider output is untrusted text; it cannot change deterministic classifications or citation IDs.

Cloudflare and a configured AI provider necessarily process network metadata. Disabling application logs does not assert that infrastructure retains nothing. Review processor terms and region/retention settings before enabling optional data collection. Publish a working operator contact for privacy requests before enabling the DB binding; never ask users to publish health documents or erasure tokens in GitHub issues.

## Local cases, backups and encrypted transfer

Up to 50 cases live in the browser's `claimclock:cases:v1` store. A case includes its timeline and explicitly attached deduction inputs, not an uploaded source document or an AI-derived verdict. The old single timeline migrates only after the replacement store is saved. Invalid storage is preserved for recovery; a failed save is reported. Case deletion removes that local case, not a separately submitted research report. Restore validates an at-most-1,000,000-byte JSON backup and previews it before creating or replacing a case. A downloaded JSON backup is plaintext and must be handled accordingly.

The optional transfer encrypts a validated backup in the browser using a fresh 256-bit key, a random 12-byte IV and AES-GCM's 128-bit authentication tag. The server accepts only `{ciphertext}`: canonical unpadded base64url containing version byte `1`, IV, encrypted bytes and tag, 30–65,536 decoded bytes. Its JSON request cap is 90 KiB. It cannot inspect or authenticate the encrypted content. The eight-character code is generated with Web Crypto from a 32-character alphabet; only its SHA-256 hash is stored. The key stays in the browser/recovery link's fragment, which is removed before the Turnstile script loads, and is never accepted as an API field. A person holding the complete recovery link can read the backup.

`POST /api/transfers/lookup` accepts only `{code}`. Each successful atomic lookup increments the count and returns ciphertext, expiry and `attempts_remaining` (2, 1, 0). The third lookup deletes the ciphertext row in the same database statement. This counts delivery, even if browser decryption later fails. Missing, expired and exhausted codes share a 404 response. Expiry is checked on every lookup, independently of cron. There is no key recovery, account linkage or cross-device identity record. Seven-day expiry is never extended by retrieval; expired rows are purged hourly. Downloaded copies and infrastructure backups are outside application-level deletion.

## Turnstile verification

Configure an **invisible** Turnstile widget for `claimclock.ketan952.workers.dev`. Both `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` must be configured. For Turnstile, `/api/config` exposes only `turnstile_enabled` and the public `turnstile_site_key`; it also retains the public AI configuration fields. The trusted `TURNSTILE_HOSTNAME` binding defaults to the live hostname, never the request's Host. Any local hostname override must be explicit operator configuration.

Report submission, AI explanation, transfer creation and transfer lookup require `X-Turnstile-Token`, with exact actions `reports`, `explain`, `transfer_create` and `transfer_lookup`. Their JSON whitelists are unchanged. Input validation precedes verification, and verification precedes D1 quota allocation. Tokens are bounded to 2,048 characters. Siteverify has an eight-second timeout, rejects redirects, bounds its response to 4 KiB, and requires `success:true`, the exact hostname and the expected action. It sends only secret and response, never `remoteip`, and neither logs nor caches tokens. Cloudflare enforces [five-minute, single-use validity](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). Invalid or replayed tokens return 403; missing configuration or unavailable verification returns 503. No production test bypass exists. Report erasure does not require Turnstile.

## Erasure and aggregate disclosure

A successful submission returns `{id,erase_token}`. The browser retains each receipt in a separate report-ID registry, `claimclock:receipts:v1`; only a SHA-256 hash of the 256-bit token is stored in D1. The old single receipt migrates by appending before its original is removed. Corrupt bytes are preserved, failed saves are disclosed, and a newly submitted report cannot replace another report's receipt. Privacy provides a picker and private copy action. Case deletion does not delete receipts; case backups and encrypted transfers never contain them. Clearing browser storage does, so keep private copies first.

`DELETE /api/reports/:id` accepts the token in a JSON body. Tokens never belong in URLs. The response returns `erased:true` only when a row was actually deleted. Unknown IDs and incorrect tokens both return `erased:false`, without distinguishing them. The browser removes only the matching report/token receipt after `erased:true`; manually erasing an older report cannot clear a newer code. A local-storage failure after confirmed erasure is reported separately and preserves prior entries. If the database or quota is unavailable, the request returns a retryable error and must not be shown as completed. A lost token cannot be recovered by email because no identity or email is collected.

A database trigger invalidates the entire affected insurer/request-type/month aggregate within the same transaction as deletion. It also inserts a suppression marker, so subsequent maintenance cannot republish a one-person subtraction. If the statement fails, the database rolls back deletion and invalidation together. The client must retain its token and retry. An already downloaded public aggregate cannot be recalled.

Public cells group by insurer, request type and submission month; they never group by city or TPA and never expose exact individual dates. Publication requires at least 10 reports, a closed month and a seven-day grace period. Only reports received before the grace deadline enter that cohort. Published cells are frozen: late submissions do not change them. The whole cell remains hidden after erasure, even if its remaining count exceeds 10. Enhancement reports have `beyond_window:null` because no separately verified statutory deadline is assigned. Other `beyond_window` values describe self-reported elapsed times, not adjudicated breaches.

These controls reduce repeated-query differencing but do not provide differential privacy, representative sampling or verified claim authenticity. Anonymous endpoints can be manipulated; global limits constrain volume but cannot stop a determined person from submitting multiple invented records.

## Budgets, failures and maintenance

D1 is optional. Missing bindings, database errors, provider errors and quota exhaustion return generic 503/429 responses. Local functionality remains available. No endpoint accepts a custom provider URL, arbitrary insurer, public SQL filter or raw document upload. Mutations require same-origin JSON and enforce a streamed 4 KiB body limit before parsing, except the bounded encrypted-transfer creation body described above. GET endpoints accept browser same-origin fetch metadata or a matching Origin header. Same-origin policy is a browser protection, not authentication against scripts that forge headers. Report validation names a fixed rejected field without echoing its value; the UI retains the timeline and distinguishes validation, busy and unsent failures.

Global atomic D1 counters use no IP or device identifiers:

| Action | Per UTC day | Per minute |
|---|---:|---:|
| AI explanation | 100 | 3 |
| Report submission | 100 | 5 |
| Event batches | 200 | 10 |
| Aggregate reads | 500 | 30 |
| Erasure requests | 100 | 10 |
| Transfer creation | 100 | 3 |
| Transfer lookup | 500 | 10 |
| Passkey registration | 200 | 5 |
| Passkey login | 1,000 | 20 |
| Session check | 10,000 | 200 |
| Vault read | 5,000 | 100 |
| Vault write / wrapped key | 2,000 | 30 |
| Account erasure | 100 | 5 |

A rejected minute allocation may still consume a day permit. These deliberately low shared budgets favor no-cost operation; one abusive user can exhaust an optional feature for everyone. They cannot guarantee that the entire Cloudflare account stays below its free ceiling if other applications share it.

At the maximum envelope size, each transfer stores 87,382 base64url characters. With healthy hourly cleanup, conservatively budget 800 rows across partial UTC days: about 69.9 MB of ciphertext plus metadata/indexes, below the 500 MB per-database free ceiling. These application caps supplement account-level monitoring; they do not reserve Cloudflare capacity.

Cron `43 * * * *` purges expired transfers, expired passkey challenges and expired sessions. Daily cron `17 2 * * *` runs `worker/aggregate.sql`, shared with the GitHub Actions fallback: it purges expired transfers and old raw reports/counts, expires quota keys, and inserts eligible frozen aggregates. The hourly path never publishes aggregates. Quota keys expire after one day and are removed at the next daily run, targeting at most two days. Physical retention is scheduled: a failed/missing job can exceed these targets, although expired transfer lookup still fails immediately. Monitor scheduled invocation status and run the fallback immediately on a failure. The Actions fallback uses `wrangler d1 execute`, not a public admin endpoint; enable repository variable `CLOUDFLARE_AGGREGATE_FALLBACK=true` when needed. Never export raw report or transfer tables to public CI artifacts.

## M20 accounts and vaults

`/api/auth/*` and `/api/vault` hold: `users.id` (random UUID), `passkey_credentials` (public key, algorithm, counter, transports, optional PRF-wrapped vault key — opaque ciphertext), `webauthn_challenges` (SHA-256 only, deleted on use or by the hourly purge), `sessions` (SHA-256 of the cookie token, 30-day expiry) and `vaults` (one AES-256-GCM envelope of at most 256 KiB, plus version and update time). No name, policy number, health detail, key, IP or user agent is stored. The operator cannot decrypt a vault or reset a lost key; the user's recovery link or a PRF-capable synced passkey are the only unlock paths, and the page says so before the account is created. `DELETE /api/auth/account` (session + `{confirm:true}`) removes all five rows in one batch and clears the cookie; a user who has lost the passkey and the recovery key can only clear local data, since no server-side identity exists to authenticate an erasure request. Sign-out deletes the session row. At 256 KiB per vault, 5,000 accounts would need about 1.75 GB — monitor D1 storage against the free ceiling and lower `VAULT_ENVELOPE_LIMIT` before approaching it.

## Deployment and AI enablement

Use only the personal `ketan952/claimclock` repository and personal Cloudflare account. Bind D1 as `DB` with database name `claimclock`, configure its actual database ID and `migrations_dir:'migrations'`, then apply all pending migrations through Wrangler (`0001` initial tables, `0002` nullable report city, `0003` encrypted transfers, `0004` passkey accounts and encrypted vaults). `ASSETS` remains the static asset binding. The SQL import requires Wrangler's Text rule for `**/*.sql`. Keep real development values in ignored `.dev.vars`; `.dev.vars.example` contains placeholders only. Never put secrets in chat or commit them.

The deploy workflow is off until repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`. It runs checks, tests and the reviewed AGPL compatibility/notice gate before any migration or deployment. A failed license audit must block release. Set `CLOUDFLARE_D1_ENABLED=true` only after provisioning the optional database. Secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never print or commit them.

AI remains disabled unless all of `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` and `LLM_FREE_TIER_CONFIRMED='true'` are set. The first three are Worker secrets; the final value is an operator configuration flag, set only after confirming a no-card free account and model. API hostname alone cannot determine whether an account is billed. Allowed bases are `https://api.groq.com/openai/v1`, `https://api.cerebras.ai/v1` and `https://openrouter.ai/api/v1`; OpenRouter models must end in `:free`. Redirects are rejected. There is no retry to a paid model or another provider, no file/vision transfer and no runtime OCR service. Requests time out after ten seconds, cap completion output at 600 tokens and returned explanation at 1,600 characters and return only the explanation field. Do not enable a paid account, credit balance or automatic billing. See [Groq compatibility](https://console.groq.com/docs/openai), [Cerebras completion API](https://inference-docs.cerebras.ai/api-reference/chat-completions) and [OpenRouter free variant](https://openrouter.ai/docs/guides/routing/model-variants/free).

Backend tests use fetch mocks for Siteverify and the AI provider; they cover token failure/replay, binding/action/hostname checks, strict envelopes, quotas, concurrent retrieval, deletion rollback and expiry. Actual local D1 testing verifies the third-lookup trigger with `UPDATE…RETURNING`. Browser widget mocks exist only in tests that explicitly mock their protected API. `QA_LIVE_REPORTS=1`, `QA_LIVE_TRANSFERS=1` and `QA_LIVE_TURNSTILE=1` cases must use real verification. Live report QA uses the already-suppressed historical Prudential HCL/November 2025 synthetic cohort; creating then erasing a current public cohort would suppress that cohort permanently and is prohibited.

## Contact maintenance

`node scripts/check-contacts.mjs` is read-only by default. The weekly workflow enables `--write --issues`: it checks every available email/phone against its recorded primary-source page or PDF, including escalation levels. Only a complete match refreshes the contact and escalation verification dates. HTTP 200 alone, whole-page hashes or dynamic navigation changes never refresh factual verification. Missing, blocked or unparseable sources retain the old date and enter a deduplicated review issue in this personal repository. The workflow does not call or email contact recipients. A match verifies publication, not that a number works or somebody reads the inbox.

## Incident response and legal-review boundary

Use this operational sequence from day one; commencement and applicability require current legal review. [The final MeitY Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), Rule 7, provides for affected-person and initial Board notice without delay, then specified detail within 72 hours unless a longer period is allowed. Do not interpret 72 hours as permission to delay the initial notice. Rules 6 and 8 contain security/log-retention requirements, including Rule 8(3)'s minimum-year language, which requires review against this requested immediate-erasure and no-application-logging design before asserting compliance. Consult the [official rules and commencement collection](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025).

1. Record awareness time in a private incident record; restrict access. Disable optional reports, AI and transfer creation/lookup, then rotate affected secrets while preserving the static app.
2. Contain the incident and preserve necessary security evidence without introducing health-document/request-body logs. Determine data categories, scope, processor involvement, likely harms and affected periods.
3. Arrange the applicable initial notices without delay. Explain the known impact, protective steps and operator contact. Because no user contact details are collected, direct notification may be impossible; document that limitation, obtain qualified advice and publish an in-app/site notice. Do not claim a public notice always satisfies individual notice duties.
4. Prepare the required detailed report within 72 hours of awareness, including cause, remediation and notification actions; track any formally granted extension. The operator, not this application, submits notifications.
5. Review access, fix the cause, test restoration and record decisions. Reassess processor terms, retention, purpose notices and erasure behavior before re-enabling optional services.

No breach notice, complaint or email is automatically sent by ClaimClock. This runbook is implementation guidance, not legal advice.
