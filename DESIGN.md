# ClaimClock design

Updated 16 October 2026. Preserve a user's cashless-request timeline, prepare user-filed representations and explain sourced insurer disclosures. Information, not legal advice. No login is required; M20 adds an optional passkey account whose vault the server can store but never read. No automatic complaint filing, calls or paid fallback. **Live deployment:** [claimclock.ketan952.workers.dev](https://claimclock.ketan952.workers.dev/) with personal Cloudflare hosting and migrated D1. Mode C was started after Mode A and the Index went live. The reviewed dependency snapshot passes the AGPL compatibility gate; upstream license terms and notices remain intact.

## Architecture and consent boundaries

Astro produces static English/Hindi pages and insurer Index pages. Matched Cloudflare assets are served first; `/api/*` routes through Hono. Workbox caches the shell and public datasets. System fonts avoid third-party font requests. PDF/OCR modules and self-hosted English OCR assets load after file selection. Performance targets are an initial route below 150 KB compressed and Lighthouse mobile ≥90; measured results belong in [QA](qa/REPORT.md), not an assumed design claim.

**Mode A:** inputs → browser localStorage → estimated clock/editable timeline → deterministic letter → user-selected copy, share, email or print/export. Hospital submission time is a self-report; the regulatory trigger is insurer receipt. Written acknowledgement can support the record, but the app cannot certify it. Enhancement has no separately verified statutory countdown.

**Mode B:** PDF.js text or Tesseract/preprocessing worker → user-corrected lines → local deterministic classification → letter/calendar. Files and extracted document text stay on the page. English OCR is fallible; manual entry remains available. Policy clause and arithmetic confirmations gate “likely valid”; historical consumable lists cannot establish current entitlement.

**Mode C:** rejection reason/date and insurer → local English/Hindi GRO representation → user-controlled copy/email/print. The page distinguishes a cashless refusal from final repudiation, requests the relevant reasons and review, and explains Bima Bharosa, Ombudsman and Consumer Commission routes. It does not store these entries or file a complaint. This is a basic representation flow, not a complete litigation kit.

**Optional AI:** the user previews/edits redacted ambiguous lines and explicitly consents. Hono accepts at most 800 characters, applies another redaction pass and sends only those lines to the configured provider. Regex redaction cannot guarantee anonymity. No document-upload route, document persistence or request-body logging exists. Provider output is untrusted explanation and cannot change classifications or citations. `/api/config` exposes provider/model before consent. AI requires `DB`, three provider settings and `LLM_FREE_TIER_CONFIRMED=true`; allowed endpoints are Groq, Cerebras and OpenRouter, with `:free` required for OpenRouter. Free-account eligibility requires operator verification; failures never switch providers/models. The user authorized the no-card Groq Free tier; `openai/gpt-oss-120b` is enabled. Ten real-provider synthetic cases, independent explanation review, the actual removed-secret fallback and live D1 caps are recorded in QA. The prompt treats insurer statements as reported assertions and never changes local classifications.

**Optional research:** separate purpose notice, unchecked consent and preview precede submission. The API requires adult self-declaration, consent and the current consent version. Optional usage counts have a separate browser consent choice and only five fixed event names. Infrastructure/provider processing of network metadata remains outside the no-application-logging claim.

## Storage and public patient cohorts

[JSON contracts](data/schemas.json), [Drizzle schema](worker/schema.ts) and [SQL migration](migrations/0001_initial.sql) document structures. Runtime queries use parameterized D1 statements. Browser timelines contain insurer/TPA, optional hospital/city, request type/times and user events. Deduction records contain description, amount, category/status, policy confirmation and citation IDs. NL-48 rows preserve source PDF/page, period, units and published buckets.

D1 stores:

- `reports`: random ID, erasure-token hash, insurer/TPA, city, request type, submitted/decided timestamps, outcome, consent version and creation time.
- `aggregates`: insurer, request type, submission month, count, total minutes, beyond-window count and update time.
- `aggregate_suppressions`: permanently excluded insurer/type/month keys after erasure.
- `events`: daily counts of five fixed actions; `quotas`: global action counters and expiry.
- M20 accounts: `users` (random id, creation time); `passkey_credentials` (credential id, COSE public key, algorithm, signature counter, transports, optional PRF-wrapped vault key the server cannot unwrap); `webauthn_challenges` (hash only, five-minute single use); `sessions` (SHA-256 of the cookie token, 30-day expiry); `vaults` (one AES-GCM envelope per account, ≤256 KiB, optimistic version).

No patient name, hospital, policy number, IP, user agent or persistent analytics identifier is stored by the application. City plus precise timestamps may still enable reidentification; these are minimized reports, not proven anonymous data.

[Shared maintenance SQL](worker/aggregate.sql) freezes **closed monthly cohorts after seven days' grace**. Only reports received before that month's cutoff qualify. Publication requires **n≥10** and groups by insurer/request type/month, never city or TPA. `INSERT OR IGNORE` freezes the published cell; late reports do not change it. Enhancement has `beyond_window:null`. Other counts describe self-reported elapsed times, not adjudicated breaches. API reads exclude current/outdated months and suppressed cells.

Submission returns a random 256-bit erasure token; only its SHA-256 hash reaches D1. Successful token-based deletion and a database trigger atomically remove the row, delete its entire public cell and add a suppression marker. Maintenance cannot republish the reduced cell, even if n remains ≥10. Wrong IDs/tokens do not confirm erasure; failures require retry. Already downloaded aggregates cannot be recalled. These measures reduce differencing; they do not provide differential privacy or verify report authenticity.

Scheduled retention targets are reports **365 days**, events **90 days**, and quota keys approximately **two days**. These are not TTL guarantees: failed jobs can exceed targets. Daily Workers Cron and the optional Actions fallback execute identical SQL; monitor failures. Suppression markers persist to prevent republishing. The [privacy runbook](docs/privacy-operations.md) covers deletion, processor review, incident notices without delay and detailed 72-hour reporting where applicable; it is not compliance certification.

## M20 vault and passkey boundary

The vault (profile, family members, policies and attached cases) is validated and stored in plain form in the browser, exactly like cases. Letters keep producing placeholders; `identity.ts` substitutes the vault's name, policy number, claim number and UHID at display time and only for the insurer the letter concerns, so a Star letter never carries an HDFC policy number. The plan catalogue in `data/plans.json` records a published source, date and quoted evidence for every stated rule and `null` for anything unverified; `validate-data.mjs` enforces this. The on-device parser (`policy-parser.ts`) fills blanks only and lists what it could not find.

Accounts use WebAuthn discoverable credentials with user verification; the Worker verifies ES256/RS256 assertions itself (`worker/webauthn.ts`, attestation treated as none), stores only hashes of challenges and session tokens, and never receives a vault key. The browser generates a 256-bit key, encrypts the vault with AES-256-GCM (`vault-crypto.ts`) and uploads ciphertext with an expected version; a mismatch returns 409 and the page asks the user which copy to keep. A new device gets the key from the passkey's PRF output (HKDF-wrapped copy stored per credential) or from a recovery link whose key lives in the URL fragment and is removed before any script loads. Registration needs Turnstile; every account route has its own global quota; sessions are HttpOnly, Secure, SameSite=Strict and scoped to `/api`. Account deletion removes the vault, sessions, credentials and user row together.

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

A minute rejection may consume a daily permit. JSON bodies are streamed with a 4 KiB cap; AI has a ten-second timeout and 600-token completion cap, 1,600-character returned-text cap and 16 KB provider-response cap. Validate fields, enums, time order and same-origin requests. Same-origin checks are not authentication against scripted clients. Missing bindings, quotas or provider/database errors return generic 429/503 responses; local work and published filings remain usable. Shared limits permit denial of optional service and cannot guarantee account-wide free usage. Never enable billing, credits or paid fallback.

## Evidence, testing and release

Primary rules/contacts retain dates, exact sources and caveats. Contact renewal requires matching published values, not HTTP success; unavailable sources become review issues. Publication checks are not deliverability tests. NL-48's 2–6-hour bucket cannot establish three-hour compliance. Missing/inconsistent data remains visible.

Tests cover clocks, citations, fifteen synthetic deduction fixtures, redaction, calendar boundaries, API validation/quotas, erasure/suppression and data parity. Browser, OCR, offline, Lighthouse and live-provider results must be recorded individually in [QA](qa/REPORT.md).

Project code is AGPL-3.0-only. The [one-page compatibility review](docs/licenses.md) covers additional package and identified embedded-component licenses, including the separate native build-tool boundary. `npm run licenses` and `licenses:release` pass only the pinned lockfile, reviewed expressions and intact source-exact runtime notices; changes fail closed. Both CI and deployment enforce the gate. Corresponding running source and build scripts remain public. This is not a reproduced native-binary provenance certification. Personal D1, hosting and deployment are provisioned; never commit secrets or source PDFs. [README](README.md) gives operations and [RESUME](RESUME.md) records milestones.

## M8 disclosure comparison and contact provenance

The Index selects the latest published period before selecting individual discharge rows. With complete per-channel cashless counts, it weights shares by those counts; without them, it shows channel ranges rather than a false insurer average. A missing bucket stays unknown; the >6h column sums only complete published longer buckets. Counts are shown only when every included channel has a disclosed denominator. TPA receipt starts the source clock, and the 2–6 h bucket cannot establish three-hour compliance. Partial-channel coverage is explicit. Every populated insurer contact field links to its own published evidence/date; the IRDAI GRO baseline remains separate. Static 1200×630 PNG cards are generated for all 32 insurer pages and the Index.

## M9 interface and draft boundaries

Selected-language keys drive page chrome, validation, expanded contact/disclosure details and dialog regeneration. Original quoted source passages, official proper names and technical identifiers retain their source spelling. Dates use full month names. Optional reports expose a readable field list and exact outbound JSON before consent, then a copyable erasure receipt; a failed localStorage write is reported honestly. Active clock steps change at halfway and breach. Draft timing always distinguishes hospital-reported time from confirmed insurer receipt. Bima drafts use a 2,000-character application budget, with no silent truncation. The live portal maxlength remains unverified; the separately cited manual states 4,000.
