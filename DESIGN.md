# ClaimClock — design, 10 October 2026

**Purpose:** get a written cashless-request timestamp in under a minute; preserve evidence, prepare user-filed representations, and show sourced insurer disclosures. Information, not legal advice. No login, claim filing, calls, tracking scripts, or paid fallback.

## Architecture and data boundaries

Astro emits static HTML, CSS, JavaScript and insurer Index pages. Cloudflare serves assets before the Worker; only `/api/*` invokes Hono. Workbox caches the app shell and datasets. JSON translations provide English/Hindi; CSS uses system fonts. Heavy PDF/OCR modules and self-hosted English model assets load only after file selection. The initial route targets <150 KB compressed and Lighthouse mobile ≥90.

**A:** inputs → browser localStorage → visible clock, editable timeline, deterministic templates → copy/share/email/print-to-PDF. Nothing leaves the device until the user selects a sharing action or explicitly submits anonymous research data. Sending a message in WhatsApp/mail is the user's action. A local entry is a self-reported record, not independent proof or a trusted timestamp. Enhancement has no separately verified statutory countdown.

**B:** file → pdf.js text / Tesseract worker with image preprocessing → user-corrected lines → deterministic rules → letter and calendar reminders, all local. Only **Explain with AI** sends a user-reviewed, redacted selection of ambiguous lines to Hono and the configured free provider. No files, names, policy/UHID numbers or full documents are sent intentionally. Regex redaction cannot guarantee anonymity; the preview is mandatory. The server never persists document text or logs request bodies. AI output is untrusted explanatory text and cannot replace classification/citations.

**Index:** versioned NL-48 CSV/JSON → build-time pages → static delivery. Optional patient data goes to D1 only after a separate purpose notice, unchecked consent, and field preview. Daily SQL aggregates suppress every cell below n=10; dates, denominators and methodology accompany publication. No aggregate means “insufficient reports”, never zero delay. A quota failure must not impair the statutory clock or published filings.

## Contracts and storage

Machine-readable JSON Schemas live in `data/schemas.json`; abbreviated required shapes:

| Object | Fields |
|---|---|
| Timeline | id, insurerId, tpaId?, hospital, city, requestType, submittedAt, events[{id,at,type,note}], decidedAt?, outcome? |
| Deduction | id, description, amount, category, status, policyClause?, ruleIds[], explanation |
| Letter | id, kind, language, generatedAt, subject, body, ruleIds[] |
| NL48Row | id, insurer_id, insurer, tpa, period, request_type, policy_type, lt1h, h1_2, h2_6, h6_12, h12_24, gt24h, unit, sample_size?, source_url, source_page, retrieved_on |
| Contact | id, name, kind, gro_email?, gro_phone?, helpline?, source_url, verified_on, evidence |

D1/Drizzle: `reports(id TEXT PK, erase_hash TEXT, insurer TEXT, tpa TEXT, city TEXT, request_type TEXT, submitted_at TEXT, decided_at TEXT, outcome TEXT, consent_version TEXT, created_at TEXT)`; `aggregates(insurer, request_type, period, n, total_minutes, beyond_window, updated_at, PRIMARY KEY(insurer,request_type,period))`; `events(day,name,n, PRIMARY KEY(day,name))`; `quotas(key TEXT PK, count INTEGER, expires_at INTEGER)`. Index on report aggregation dimensions. No name, hospital, policy number, IP, user agent or persistent analytics identifier. Random erasure token is retained only on-device; only its hash is stored. Erasure removes the row and recomputes affected aggregates. Retain raw reports ≤365 days, event counts ≤90 days, quota rows ≤2 days.

## Free budget and degraded operation

| Resource | Verified free ceiling | App budget / exhaustion behavior |
|---|---|---|
| Static assets | Unlimited requests; 20,000 files, 25 MiB/file | Asset-first routes remain available; offline copy remains usable |
| Worker | 100,000 requests/day/account; 10 ms CPU; 128 MB; 50 external subrequests | API-only invocation; show optional service unavailable; keep local work |
| D1 | 5M rows read/day; 100k written/day; 500 MB/database, 5 GB/account; 50 queries/invocation | Indexed queries, batched event counts; catch quota failures, no false “submitted” |
| Cron | 5 triggers/account | One daily SQL aggregation; manual/GitHub fallback if CPU fails |
| Groq gpt-oss-120b | 30 RPM, 1,000 RPD, 8k TPM, 200k TPD; account limits authoritative | App global ceiling 100 calls/day, 3/minute; 800-character input, 300 output tokens; fail closed to templates |
| GitHub Actions | Standard hosted runners free for public repos | Build/deploy on main; weekly HTTP contact checks; no LLM |

Sources checked 2026-10-10: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [static billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Groq](https://console.groq.com/docs/rate-limits). Free plans only; never enable billing, credit purchases or automatic paid-model fallback. Provider/model/base URL are secret-configurable; provider eligibility must be checked before enabling.

## Safety, verification and delivery

Only five aggregate event names exist: session started, clock-lock copied, escalation copied, delay-charge generated, opt-in submitted. Client batches counts and drops on failure; collection uses separate optional analytics consent. Server validates enums, lengths, time order and same-origin requests. Rate limits are global atomic D1 counters, independent of IP. Observability/body logging disabled; infrastructure necessarily handles network metadata. CSP permits only self-hosted code; exports escape user text. A documented incident plan provides notification without delay and detailed reporting within 72 hours, with deletion and response records; it is design support, not a claim of legal compliance.

Primary rules/contacts have retrieval dates; source health does not alone renew factual verification. Weekly checks compare normalized contact evidence, update verification only when the same contact values remain present, and create review issues on changes. Filings keep source pages and verbatim units; no conversion of the 2–6 h bucket into 3 h compliance. Missing or inconsistent sources remain explicit gaps.

Tests cover clock boundaries/timezones, template paragraph references, redaction, 10 deduction fixtures, API validation/quotas/erasure, n<10 suppression, and CSV/JSON parity. Browser QA covers mobile Hindi/English, ten insurer contacts, offline/reload, optional API absence, print export and 5 PDF spot checks. Do not mark unrun checks as passing.

`wrangler deploy` builds and deploys static assets + API; initial D1 provisioning/migration needs the personal Cloudflare token. GitHub Actions uses repo-scoped secrets. AGPL-3.0 project; direct packages and transitive licenses are audited before release. Never commit secrets or third-party PDFs. Each milestone updates `RESUME.md`, commits, then pushes to the existing personal origin. Resume: read that file, confirm account/remote, run checks, continue the next incomplete task. M2/M3 precede Mode C.
