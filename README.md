# ClaimClock

An English/Hindi tool for people waiting for cashless health-insurance authorization in India: record the wait, ask for written timestamps, prepare a grievance and inspect published insurer disclosures. Information, not legal advice; ClaimClock does not file complaints or promise payment.

**Live:** [claimclock.ketan952.workers.dev](https://claimclock.ketan952.workers.dev/), hosted on the personal Cloudflare account with D1 provisioned and migrated. The user explicitly approved the existing dependency snapshot for this deployment. `npm run licenses:release` verifies that exact lockfile; the unchanged strict `npm run licenses` audit still reports 101 exceptions. See the [recorded approval](research/dependency-release-approval.json), [license assessment](research/license-assessment.md) and [runtime notices](third-party-notices/NOTICE.txt). No paid service or workplace account is authorized.

Source: [ketan952/claimclock](https://github.com/ketan952/claimclock). Project code: [AGPL-3.0-only](LICENSE). Source documents and third-party components retain their own licenses; this repository does not relicense insurer PDFs or other research sources.

## What is implemented

| Area | Current state |
|---|---|
| Mode A — hospital clock | Local English/Hindi app, estimated 1-hour/3-hour clocks, editable timeline, written-confirmation and escalation drafts, delay-charge review, death protocol, exports and offline shell. Available on the public deployment. |
| Discharge Delay Index | **470 numerical NL-48 rows from 30 insurers**, with all **32 insurers** covered by a filing audit. Static insurer pages preserve published units, periods and source pages. |
| Mode B — deduction review | Local PDF text extraction, English OCR, manual correction, ten-category deterministic classification, policy-confirmation gates, letters and calendar reminders. **15/15 synthetic classification fixtures** pass after corrections; this is not AI or OCR accuracy. |
| Optional API | Hono/D1 reporting, erasure, privacy-preserving aggregates and event counts are deployed; **14 live API checks** passed. Optional Groq AI is enabled on the explicitly authorized Free tier. Real-provider cases, independent review, secret-removal fallback and production-D1 quota results are recorded in QA. Local review works without AI. |
| Mode C — rejected-claim workflow | Basic English/Hindi GRO representation from a rejection reason, source-linked review requests and escalation guidance at `/rejected/`. Implemented after Mode A and the Index were live, as requested. Entries stay on the page; the user reviews and submits the complaint. This is not a complete case-filing service. |

The contact matrix has **49 records: 32 insurers and 17 TPAs**, including legacy/merged service records where useful to existing policyholders. Missing contacts remain explicit gaps. Research found **29 strictly qualifying recent public cases**, one below the requested 30; adjacent cases and undated reports are not counted toward that target. This convenience sample cannot establish insurer failure rates. See [coverage](research/contacts-coverage.md), [filing audit](data/filings.json), [Index methodology](research/nl48-methodology.md) and [combined user evidence](research/user-evidence-combined.json).

## Run locally

Use **Node.js 22.12 or later** and npm. No credentials are needed for the static app, manual deduction workflow or tests.

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

Open the local URL printed by Astro. `npm run preview` serves a production build for PWA/offline checks. The optional API is not supplied by Astro's development server; use `npx wrangler dev` after a build when testing Worker routes. Missing API bindings must leave local features usable.

On the original macOS workspace, an ignored runtime is available at `.tools/node-v22.23.3-darwin-arm64/bin`; prepend it to `PATH` if Node is not installed elsewhere. That downloaded runtime is not part of the repository.

Useful additional checks:

```sh
npm run data:check
npm run test:browser
npm run licenses         # strict audit: expected failure for this snapshot
npm run licenses:release # approved snapshot gate: must pass
```

The first command requires Python 3. Browser checks require Playwright's Chromium installation (`npx playwright install chromium`). The build contains **41 static pages**. M8 has 105 passing unit/security checks; live acceptance, real-provider review, privacy erasure, screenshots and measured performance are recorded in the [QA report](qa/REPORT.md). The [deduction answer key](qa/deduction-answer-key.md) covers 15 synthetic fixtures; these do not measure real-claim accuracy.

## Where data goes

[DESIGN.md](DESIGN.md) documents the full architecture and contracts. Astro builds static pages; Workbox caches the shell and datasets. Cloudflare serves static assets directly, while `/api/*` invokes the Hono Worker. Heavy PDF/OCR code and self-hosted model assets load after document selection.

| Flow | Browser | Server or external service |
|---|---|---|
| Hospital clock and timeline | Browser storage; user-controlled copy, share, email and print/export | No timeline submission by default. A sharing action transfers content to the app the user chooses. |
| Settlement letter, bill and policy | PDF.js/Tesseract read files locally; extracted text stays on the current page for correction. Manual entry always works. | No document upload endpoint. OCR is English only; images/PDFs are limited to 20 MB and 20 pages per file. |
| Deduction classification | Deterministic rules and source citations run locally | AI cannot change a category, validity status or citation. |
| Optional AI explanation | User reviews and edits the redacted text, then separately consents | At most 800 characters go through Hono to the explicitly configured provider. ClaimClock does not persist document text or log request bodies. Provider processing terms still apply. |
| Optional patient report | Separate purpose notice, unchecked consent, field preview and erasure token | D1 stores insurer/TPA, city, request type, timestamps, outcome and consent version. No name, hospital, policy number, IP or user agent is stored by the application. |
| Optional usage counts | Separate choice; five fixed event names, batched counts | Daily aggregate counters, without a persistent analytics identifier. |

Regex redaction is **best effort**, not guaranteed anonymity. Names, unusual identifiers, medical details and OCR errors can survive. The exact outbound preview is mandatory. Removing local storage does not erase downloaded files, clipboard content or an already shared message. Cloudflare and an enabled AI provider necessarily process network metadata.

Raw reports have a scheduled **365-day retention target**; event counts 90 days; quota records approximately two days. These depend on successful maintenance, not database TTLs. Public patient cells require **at least 10 reports**, a closed month and a seven-day grace period; no city/TPA breakdown or individual timestamps are published. Erasure invalidates and suppresses the affected aggregate cell. These protections do not prove anonymity, authenticity or representative sampling. Read the [privacy operations and incident runbook](docs/privacy-operations.md) before enabling collection: it covers immediate response/notice duties, detailed **72-hour** incident reporting where applicable, processor review and retention/erasure legal-review limits. No DPDP compliance certification is claimed.

## Rules, contacts and source maintenance

[Regulatory verification](research/regulatory-verification.md) supports the dated [rules](data/rules.json). The 1-hour cashless and 3-hour discharge windows run from **insurer receipt**, while a user may know only when the hospital says it sent the request. The UI labels that clock as estimated. No separate enhancement deadline is invented. Full/partial disallowance requires specific policy reasons; committee approval is not asserted for every deduction. Ombudsman reminders distinguish a calendar month from 30 days and retain the award-appeal exception.

The **146 consumable entries** are explicitly [historical reference labels](data/consumables.json), not a current universal payable/nonpayable list. The 2019/2020 circulars were superseded. Coverage depends on the applicable policy, riders and billing arrangement; ambiguous lines need human correction and clarification. A policy clause and calculation must both be confirmed before a co-pay or sub-limit receives “likely valid.”

Every contact includes primary-source evidence and `verified_on`. Verification means **published contact**, not a successful call or email. The weekly [contact workflow](.github/workflows/contacts.yml) checks contact values against the cited page/PDF; HTTP 200 alone cannot renew verification. Blocked or changed sources retain their previous date and create review issues. No contact recipient is emailed or called.

NL-48's **2–6-hour bucket cannot establish 3-hour compliance**. Keep the original denominators, units, periods and unresolved source inconsistencies. The Index reports disclosures, not an adjudicated insurer ranking.

## Free-plan limits and application budgets

Checked against Cloudflare's official documentation on 10 October 2026; shared-account usage and provider terms must be rechecked when changing deployment or enabling a provider.

| Resource | Free ceiling |
|---|---|
| Static assets | [Free, unlimited requests](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/); 20,000 files and 25 MiB per file |
| Worker | [100,000 requests/day/account and 10 ms CPU per invocation](https://developers.cloudflare.com/workers/platform/limits/) |
| D1 reads/writes | [5 million rows read/day; 100,000 rows written/day](https://developers.cloudflare.com/d1/platform/pricing/) |
| D1 storage | [500 MB per database](https://developers.cloudflare.com/d1/platform/limits/); [5 GB total per account](https://developers.cloudflare.com/d1/platform/pricing/) |

Lower global limits in [worker/security.ts](worker/security.ts) are: AI **100/day, 3/minute**; reports **100/day, 5/minute**; event batches **200/day, 10/minute**; aggregate reads **500/day, 30/minute**; erasure **100/day, 10/minute**. AI output is capped at 600 completion tokens and 1600 returned characters with a ten-second timeout. API JSON bodies are capped at 4 KiB. A shared limit can be exhausted by one user; optional services then fail closed while static/local features continue. These budgets do not guarantee an account-wide ₹0 bill on a paid account. Stay on verified free plans; no card, purchased credits, paid fallback or automatic upgrade.

## Provision and deploy

Use the **personal** Cloudflare account and this personal repository. Never use workplace credentials. Keep secrets in ignored `.env` or Worker/GitHub secret storage; never commit them, print them in logs or paste them into chat. `.env.example` lists the configuration names. Creating `.env` does not itself provision Cloudflare or publish Worker secrets.

1. Keep the dependency snapshot within its recorded approval and finish release QA. Make `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` available in the local shell through trusted secret tooling. Restrict the token to this personal deployment and required D1 access. Run `npm run check`, `npm test`, `npm run build` and `npm run licenses:release`; deployment must stop if any release gate fails. `npm run licenses` still documents the strict policy exceptions and must not be described as passing.
2. D1 is already provisioned and bound in [wrangler.jsonc](wrangler.jsonc) for this deployment; do not create it again. For a new personal environment, create D1 once using the [official bootstrap flow](https://developers.cloudflare.com/d1/get-started/):

   ```sh
   npx wrangler d1 create claimclock
   ```

   Add the returned database ID to the existing [wrangler.jsonc](wrangler.jsonc), with this binding; do not replace the existing asset/build/SQL configuration:

   ```json
   "d1_databases": [{
     "binding": "DB",
     "database_name": "claimclock",
     "database_id": "REPLACE_WITH_CREATED_DATABASE_ID",
     "migrations_dir": "migrations"
   }]
   ```

   Apply the supplied schema before enabling the API:

   ```sh
   npx wrangler d1 migrations apply claimclock --remote
   ```

   D1 is optional for static functionality. Publish a working privacy contact and review [operations](docs/privacy-operations.md) before enabling collection. Daily Workers Cron runs [aggregate.sql](worker/aggregate.sql); monitor failures. The GitHub fallback runs the same SQL without a public admin endpoint.
3. AI is optional and disabled unless `DB` and **all four** settings exist: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, **`LLM_FREE_TIER_CONFIRMED=true`**. Store the first three as Worker secrets through the Cloudflare dashboard or interactive `npx wrangler secret put NAME`. Set the confirmation flag only after verifying a free account and model; a provider hostname does not prove free billing. Supported bases are Groq `https://api.groq.com/openai/v1`, Cerebras `https://api.cerebras.ai/v1` and OpenRouter `https://openrouter.ai/api/v1`. OpenRouter requires a `:free` model. Swap providers through these settings and recheck terms/limits; there is no automatic provider/model fallback. Show the configured provider and redacted preview before consent. Provider changes require rerunning the live QA recorded in qa/REPORT.md.
4. Once prerequisites pass, one command builds and deploys the static app and Worker:

   ```sh
   npx wrangler deploy
   ```

The personal deployment and remote D1 migrations have completed at [claimclock.ketan952.workers.dev](https://claimclock.ketan952.workers.dev/). Live smoke tests and the remaining optional-provider limitation are recorded in the [QA report](qa/REPORT.md). Repeat relevant checks after a deployment change.

## CI and resuming work

[CI](.github/workflows/ci.yml) runs source lint, types/data checks, unit tests and the build. Standard GitHub-hosted runners are free for this public repository. [Deployment](.github/workflows/deploy.yml) is enabled for this personal repository through `CLOUDFLARE_DEPLOY_ENABLED=true` and `CLOUDFLARE_D1_ENABLED=true`; it runs the pinned-snapshot release license gate before any migration/deployment and regenerates the unchanged strict audit. Repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured; D1 was provisioned before enabling migrations. `CLOUDFLARE_AGGREGATE_FALLBACK=true` enables the scheduled maintenance fallback when needed. LLM keys belong in Worker secrets, not frontend variables or public artifacts. Weekly contact maintenance uses the repository's scoped Actions token.

To resume, read [RESUME.md](RESUME.md), confirm the personal account and remote, inspect the latest [QA report](qa/REPORT.md), run checks, and continue the next incomplete milestone. Preserve the exact dependency approval, source caveats and remaining acceptance checks; the live-before-Mode-C sequence has now been followed. Proposed future work is in [docs/v2.md](docs/v2.md); prepared [launch posts](docs/launch-posts.md) are drafts, not published announcements.
