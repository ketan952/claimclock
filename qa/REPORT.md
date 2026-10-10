# ClaimClock QA and release record

**10 October 2026 — local implementation tested; release blocked.** There is no live `workers.dev` URL, production D1 database or configured AI provider. Cloudflare credentials were requested once and have not been supplied. The [dependency-license audit](../research/license-assessment.md) fails the user's strict allowlist, including embedded browser OCR code. No exception has been granted. Neither successful tests nor the AGPL project license resolves that conflict.

## Acceptance results

| Requirement | Executed result | Scope and remaining gap |
|---|---|---|
| Hospital clock for 10 insurers | **10/10** UI contact displays and pre-authorisation citations; unit checks also verify discharge paragraphs | National, New India, United India, HDFC ERGO, ICICI Lombard, Bajaj, Star Health, Care, Niva Bupa and ManipalCigna. Local Chromium through Wrangler; not the live-site run requested. |
| Published contact verification | **49/49 records; 156/156 populated fields** matched primary sources | 32 insurers and 17 TPAs. Missing fields are null. [Machine report](contact-check.json). No calls, emails or delivery tests. |
| Mode B without AI | **10/10 synthetic fixtures** agree with the reviewed category/status answer key; all eight categories covered | Ten constructed letters are exercised through manual confirmed lines and the browser letter flow. This is neither a real-claim accuracy estimate nor ten OCR accuracy tests. [Answer key](deduction-answer-key.md), [fixtures](../tests/fixtures/settlements.json). |
| Local document extraction | One synthetic text PDF and one synthetic English photo extracted successfully | Network observation confirms the tested OCR flow uses self-hosted assets. Scanned multi-page PDFs, handwriting, degraded real photographs and optional PDF codecs are not comprehensively qualified. |
| Mode B with real AI | **Not run** | No provider key. Mocked tests cover request limits, redaction, consent, errors and no fallback. Do not claim the requested 9/10 provider result. |
| NL-48 transcription | **120 cells across 5 source PDFs; 0 differences** | HDFC ERGO, Bajaj, Go Digit, Universal Sompo and Niva Bupa. [Source review](../research/nl48-qa.md). All 253 output rows reproduce reviewed extraction facts; that is not an independent check of every source cell. |
| Hindi | Translation-key parity and source-meaning review; Hindi browser letters pass | Build-agent review corrected terminology and dates. No external native-speaker usability panel or sixth-grade comprehension test. Original operative source quotes remain in English. |
| Lighthouse mobile ≥90 | **Performance 100; accessibility 100; best practices 100; SEO 100** | Local Wrangler, simulated mobile. FCP 1.1 s, LCP 1.4 s, TBT 0 ms, CLS 0; initial transfer about 57 KiB. [Measured run](lighthouse.json). No physical mid-range Android/live 4G measurement. OCR/model downloads happen later. |
| No-key/optional API failure | Mode A, static Index, offline reload and manual deductions pass with no provider or DB configured | Fourteen API/security tests include quota exhaustion and missing bindings. Real local D1 integration adds ten checks. Mode C remains unimplemented, so its requested quota check is pending. |
| Timeline export | JSON download preserves entered evidence; print produces one readable A4 page for the synthetic timeline | Printed PDF rendered and visually inspected. Native Android/iOS print and WhatsApp handoff still need device testing. |
| Live public URL | **Blocked** | No deployment attempted with a remote Cloudflare account. Local dry-run bundles successfully. |

## Executed checks

`npm run lint`, `npm run check`, `npm test`, `npm run data:check`, `npm run build`, and `QA_BASE_URL=http://127.0.0.1:8787 npm run test:browser` pass. The test suite has **52 passing tests** (including five analytics-consent regressions). The build emits **40 static pages**. Browser QA has **8 scenarios**, including mobile/desktop layouts, English/Hindi persistence, offline Index and clock, ten insurer displays, ten deduction fixtures, local PDF/OCR and exports. `wrangler deploy --dry-run` validates local packaging only. [Machine check summary](checks.json).

The optional API has **14 security/behavior tests** backed by in-memory SQLite and **10 integration checks against actual local Wrangler/D1**. Coverage includes exact input fields, consent, same origin, streaming body limits, unknown identifiers, atomic quotas, minimum cohort size, monthly freezing, erasure suppression, retention SQL, generic errors and bounded provider requests. [Local D1 report](worker-integration.json). No real health documents, provider secrets or production patient reports were used.

The license check is an **expected failing release gate**, not a passing test. Its 101 flagged lockfile locations include duplicates/platform variants; they are not 101 distinct shipped libraries. Some conflicts are embedded in browser assets and absent from package metadata. [Full assessment](../research/license-assessment.md).

## Screenshots

All images show synthetic local test data, not a deployed service or a real claim.

| View | Screenshot |
|---|---|
| Mobile entry | [Hospital start](screenshots/mobile-home.png) |
| Active clock and evidence | [Mobile clock](screenshots/mobile-clock.png) |
| Hindi draft | [Hindi letter](screenshots/hindi-letter.png) |
| Static insurer disclosure | [HDFC ERGO Index](screenshots/mobile-index.png) |
| Deduction review | [Mode B](screenshots/mobile-deductions.png) |
| Desktop | [Desktop entry](screenshots/desktop-home.png) |
| Export | [Rendered PDF page](screenshots/print-timeline-pdf.png) |

## Defects found and corrected

- Deduction tests caught an approved room-rent phrase obscuring the actual co-pay and a maternity ceiling being missed. They also caught malformed amount grouping, a repeated name surviving semicolon-separated header redaction, and impossible calendar dates being normalized. The independent expected answers were preserved; all ten cases now pass.
- Actual D1 deletion triggers made `meta.changes` unsuitable for confirming report erasure. `DELETE ... RETURNING id` now confirms the deleted row. Wrong token, valid token and repeat deletion behave correctly.
- Lighthouse found low-contrast text and an accessible-name mismatch; both were corrected and rescored.
- Queued usage counts now recheck consent before transmission; revocation or unavailable storage discards them without replay. Five focused tests cover these cases and network failure.
- Multiple phone numbers in one primary-source field now produce separate telephone links. Timeline event/outcome labels are readable in both languages. Mobile timestamp fields and white-background PDF output were visually refined.

## Known release gaps and choices

1. Resolve the mutually conflicting mandated stack and strict license list, then supply personal Cloudflare credentials through the previously requested secret path. Deployment remains gated; no license-policy change is inferred.
2. Deploy Mode A and the Index, record the actual URL and run the requested live acceptance checks. Only then implement the thin Mode C workflow, following the user's explicit sequencing. The About page's escalation information is not a completed Mode C.
3. Configure only a verified no-card free provider if wanted, inspect its current data-processing settings, run ten real-provider cases and remove the secret for the live fallback check. No paid fallback exists.
4. Numerical NL-48 coverage is **17 of 32 roster insurers**. Fifteen have no publishable numeric rows; several included insurers also have partial filings. See [readable filing-gap list](../research/filing-gaps.md) and [all source notes](../data/filings.json), not a claim of market completeness. No premium-ranked top-15 completeness is established. Published denominators are often absent; no 3-hour compliance rate is inferred from the 2–6-hour bucket.
5. The combined research pass verified **29 strictly qualifying recent cases out of 50 retained records**, one below the requested 30. Exact-date corrections and additional cases are preserved in the [research audit trail](../research/validation-addendum.md); cross-posts are not counted twice. Search-selected experiences are not insurer failure rates.
6. Source correctness required changes to the supplied assumptions: committee approval applies to repudiation, not automatically every deduction; the 2020 room-rent circular was superseded; Ombudsman dates and award-delay penalties have qualifications; the consumer portal is now e-Jagriti. [Primary-source verification](../research/regulatory-verification.md).
7. The clock estimates insurer receipt from what the hospital told the user. Redaction is best effort and requires reviewing the exact outbound text. Public cells use closed monthly cohorts, a seven-day cutoff, n≥10 and permanent suppression after erasure. These safeguards do not prove anonymity or representative sampling.
8. Local timelines and documents remain usable without optional APIs. Privacy operations require successful scheduled retention, a working operator contact and applicable-law review; no DPDP compliance certification is claimed. Human usability, screen-reader and physical-device testing remain useful release work.

Launch posts are [drafts only](../docs/launch-posts.md). Outstanding acceptance requirements stay release work, not v2. Resume from [RESUME.md](../RESUME.md).
