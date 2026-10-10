# ClaimClock design

Updated 10 October 2026. Preserve a user's cashless-request timeline, prepare user-filed representations and explain sourced insurer disclosures. Information, not legal advice. No login, automatic complaint filing, calls or paid fallback. **Live deployment:** [claimclock.ketan952.workers.dev](https://claimclock.ketan952.workers.dev/) with personal Cloudflare hosting and migrated D1. Mode C was started after Mode A and the Index went live. The user approved the existing dependency snapshot; the strict license audit remains unchanged.

## Architecture and consent boundaries

Astro produces static English/Hindi pages and insurer Index pages. Matched Cloudflare assets are served first; `/api/*` routes through Hono. Workbox caches the shell and public datasets. System fonts avoid third-party font requests. PDF/OCR modules and self-hosted English OCR assets load after file selection. Performance targets are an initial route below 150 KB compressed and Lighthouse mobile ≥90; measured results belong in [QA](qa/REPORT.md), not an assumed design claim.

**Mode A:** inputs → browser localStorage → estimated clock/editable timeline → deterministic letter → user-selected copy, share, email or print/export. Hospital submission time is a self-report; the regulatory trigger is insurer receipt. Written acknowledgement can support the record, but the app cannot certify it. Enhancement has no separately verified statutory countdown.

**Mode B:** PDF.js text or Tesseract/preprocessing worker → user-corrected lines → local deterministic classification → letter/calendar. Files and extracted document text stay on the page. English OCR is fallible; manual entry remains available. Policy clause and arithmetic confirmations gate “likely valid”; historical consumable lists cannot establish current entitlement.

**Mode C:** rejection reason/date and insurer → local English/Hindi GRO representation → user-controlled copy/email/print. The page distinguishes a cashless refusal from final repudiation, requests the relevant reasons and review, and explains Bima Bharosa, Ombudsman and Consumer Commission routes. It does not store these entries or file a complaint. This is a basic representation flow, not a complete litigation kit.

**Optional AI:** the user previews/edits redacted ambiguous lines and explicitly consents. Hono accepts at most 800 characters, applies another redaction pass and sends only those lines to the configured provider. Regex redaction cannot guarantee anonymity. No document-upload route, document persistence or request-body logging exists. Provider output is untrusted explanation and cannot change classifications or citations. `/api/config` exposes provider/model before consent. AI requires `DB`, three provider settings and `LLM_FREE_TIER_CONFIRMED=true`; allowed endpoints are Groq, Cerebras and OpenRouter, with `:free` required for OpenRouter. Free-account eligibility requires operator verification; failures never switch providers/models. The read-only Groq model-list request succeeded (HTTP 200) and includes the configured model. AI remains disabled pending confirmation of a no-card Free account; no inference request has been made.

**Optional research:** separate purpose notice, unchecked consent and preview precede submission. The API requires adult self-declaration, consent and the current consent version. Optional usage counts have a separate browser consent choice and only five fixed event names. Infrastructure/provider processing of network metadata remains outside the no-application-logging claim.

## Storage and public patient cohorts

[JSON contracts](data/schemas.json), [Drizzle schema](worker/schema.ts) and [SQL migration](migrations/0001_initial.sql) document structures. Runtime queries use parameterized D1 statements. Browser timelines contain insurer/TPA, optional hospital/city, request type/times and user events. Deduction records contain description, amount, category/status, policy confirmation and citation IDs. NL-48 rows preserve source PDF/page, period, units and published buckets.

D1 stores:

- `reports`: random ID, erasure-token hash, insurer/TPA, city, request type, submitted/decided timestamps, outcome, consent version and creation time.
- `aggregates`: insurer, request type, submission month, count, total minutes, beyond-window count and update time.
- `aggregate_suppressions`: permanently excluded insurer/type/month keys after erasure.
- `events`: daily counts of five fixed actions; `quotas`: global action counters and expiry.

No patient name, hospital, policy number, IP, user agent or persistent analytics identifier is stored by the application. City plus precise timestamps may still enable reidentification; these are minimized reports, not proven anonymous data.

[Shared maintenance SQL](worker/aggregate.sql) freezes **closed monthly cohorts after seven days' grace**. Only reports received before that month's cutoff qualify. Publication requires **n≥10** and groups by insurer/request type/month, never city or TPA. `INSERT OR IGNORE` freezes the published cell; late reports do not change it. Enhancement has `beyond_window:null`. Other counts describe self-reported elapsed times, not adjudicated breaches. API reads exclude current/outdated months and suppressed cells.

Submission returns a random 256-bit erasure token; only its SHA-256 hash reaches D1. Successful token-based deletion and a database trigger atomically remove the row, delete its entire public cell and add a suppression marker. Maintenance cannot republish the reduced cell, even if n remains ≥10. Wrong IDs/tokens do not confirm erasure; failures require retry. Already downloaded aggregates cannot be recalled. These measures reduce differencing; they do not provide differential privacy or verify report authenticity.

Scheduled retention targets are reports **365 days**, events **90 days**, and quota keys approximately **two days**. These are not TTL guarantees: failed jobs can exceed targets. Daily Workers Cron and the optional Actions fallback execute identical SQL; monitor failures. Suppression markers persist to prevent republishing. The [privacy runbook](docs/privacy-operations.md) covers deletion, processor review, incident notices without delay and detailed 72-hour reporting where applicable; it is not compliance certification.

## Budgets and failure behavior

Verified free ceilings: static requests unlimited; Workers **100,000/day/account, 10 ms CPU**; D1 **5M rows read/day, 100k written/day, 500 MB/database, 5 GB/account**. See [Workers](https://developers.cloudflare.com/workers/platform/limits/), [static billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

[Atomic global quotas](worker/security.ts) avoid IP/device tracking:

| Action | UTC day | Minute |
|---|---:|---:|
| AI explanation | 100 | 3 |
| Reports | 100 | 5 |
| Event batches | 200 | 10 |
| Aggregate reads | 500 | 30 |
| Erasure | 100 | 10 |

A minute rejection may consume a daily permit. JSON bodies are streamed with a 4 KiB cap; AI has a ten-second timeout and 300-token output cap. Validate fields, enums, time order and same-origin requests. Same-origin checks are not authentication against scripted clients. Missing bindings, quotas or provider/database errors return generic 429/503 responses; local work and published filings remain usable. Shared limits permit denial of optional service and cannot guarantee account-wide free usage. Never enable billing, credits or paid fallback.

## Evidence, testing and release

Primary rules/contacts retain dates, exact sources and caveats. Contact renewal requires matching published values, not HTTP success; unavailable sources become review issues. Publication checks are not deliverability tests. NL-48's 2–6-hour bucket cannot establish three-hour compliance. Missing/inconsistent data remains visible.

Tests cover clocks, citations, ten synthetic deduction fixtures, redaction, calendar boundaries, API validation/quotas, erasure/suppression and data parity. Browser, OCR, offline, Lighthouse and live-provider results must be recorded individually in [QA](qa/REPORT.md).

Project code is AGPL-3.0-only. Mandatory transitive/bundled licenses remain outside the original narrower allowlist; the strict [audit](research/license-assessment.md) still reports 101 exceptions. The user's explicit [deployment approval](research/dependency-release-approval.json) applies only to the current lockfile SHA-256. `npm run licenses:release` fails if it changes, while `npm run licenses` retains its strict result. Source-exact identified runtime [notices](third-party-notices/NOTICE.txt) are served at `/vendor/notices/`; this is not a complete binary provenance certification. Personal D1 and hosting are provisioned. CI deployment is enabled for this personal repository and runs the snapshot gate before migration/deploy. Never commit secrets or third-party PDFs. [README](README.md) gives setup/operations; [RESUME](RESUME.md) records milestones and the personal-account guard.
