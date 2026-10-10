# ClaimClock QA and release record

**10 October 2026 — deployed to [claimclock.ketan952.workers.dev](https://claimclock.ketan952.workers.dev/).** Worker, static assets and D1 are live. The user approved the existing dependency snapshot for this deployment; the strict allowlist audit remains unchanged. Optional AI stays disabled because no-card free-account status is unconfirmed. The configured key and model passed a read-only provider check. [Deployment details](DEPLOYMENT.md).

## Acceptance results

| Requirement | Executed result | Scope and remaining gap |
|---|---|---|
| Hospital clock for 10 insurers | **10/10** UI contact displays and pre-authorisation citations; unit checks also verify discharge paragraphs | National, New India, United India, HDFC ERGO, ICICI Lombard, Bajaj, Star Health, Care, Niva Bupa and ManipalCigna. Chromium against the public Workers URL; synthetic input only. |
| Published contact verification | **49/49 records; 156/156 populated fields** matched primary sources | 32 insurers and 17 TPAs. Missing fields are null. [Machine report](contact-check.json). No calls, emails or delivery tests. |
| Mode B without AI | **10/10 synthetic fixtures** agree with the reviewed category/status answer key; all eight categories covered | Ten constructed letters are exercised through manual confirmed lines and the browser letter flow. This is neither a real-claim accuracy estimate nor ten OCR accuracy tests. [Answer key](deduction-answer-key.md), [fixtures](../tests/fixtures/settlements.json). |
| Local document extraction | One synthetic text PDF and one synthetic English photo extracted successfully | Network observation confirms the tested OCR flow uses self-hosted assets. Scanned multi-page PDFs, handwriting, degraded real photographs and optional PDF codecs are not comprehensively qualified. |
| Mode B with real AI | **Not run** | Provider secrets configured; read-only model-list check returned 200 and includes the configured model. Inference disabled; free-account status unconfirmed. Mocked tests cover request limits, redaction, consent, errors and no fallback. Do not claim the requested 9/10 provider result. |
| NL-48 transcription | **120 cells across 5 source PDFs; 0 differences** | HDFC ERGO, Bajaj, Go Digit, Universal Sompo and Niva Bupa. [Source review](../research/nl48-qa.md). All 253 output rows reproduce reviewed extraction facts; that is not an independent check of every source cell. |
| Hindi | Translation-key parity and source-meaning review; Hindi browser letters pass | Build-agent review corrected terminology and dates. No external native-speaker usability panel or sixth-grade comprehension test. Original operative source quotes remain in English. |
| Lighthouse mobile ≥90 | **Performance 99; accessibility 100; best practices 100; SEO 100** | Public Workers URL, simulated mobile. FCP 1.5 s, LCP 1.7 s, TBT 0 ms, CLS 0; initial transfer about 63 KiB. [Live measured run](lighthouse-live.json); [earlier local run](lighthouse.json). No physical mid-range Android/live 4G measurement. OCR/model downloads happen later. |
| No-key/optional API failure | Mode A, static Index, offline reload and manual deductions pass with AI disabled; local tests also cover missing DB | Fourteen API/security tests include quota exhaustion and missing bindings. Real local D1 integration adds ten checks. Mode C is browser-only and has a focused bilingual browser check. Removing the real provider secret and comparing AI-enabled behavior remains unexecuted. |
| Timeline export | JSON download preserves entered evidence; print produces one readable A4 page for the synthetic timeline | Printed PDF rendered and visually inspected. Native Android/iOS print and WhatsApp handoff still need device testing. |
| Live public URL | **Deployed and tested** | Personal Worker + D1 + daily cron. [Release record](DEPLOYMENT.md). |

## Executed checks

`npm run lint`, `npm run check`, `npm test`, `npm run data:check`, `npm run build`, and `QA_BASE_URL=http://127.0.0.1:8787 npm run test:browser` pass. The test suite has **54 passing tests** (including five analytics-consent regressions). The build emits **41 static pages**. The final live browser suite has **10 passing scenarios**, including rejection-flow loading and native form privacy regressions (see [live result](DEPLOYMENT.md)), including mobile/desktop layouts, English/Hindi persistence, offline Index and clock, ten insurer displays, ten deduction fixtures, local PDF/OCR and exports. `wrangler deploy` published the service; the earlier dry-run validated packaging only. [Machine check summary](checks.json).

The optional API has **14 security/behavior tests** backed by in-memory SQLite and **10 integration checks against actual local Wrangler/D1**. Coverage includes exact input fields, consent, same origin, streaming body limits, unknown identifiers, atomic quotas, minimum cohort size, monthly freezing, erasure suppression, retention SQL, generic errors and bounded provider requests. [Local D1 report](worker-integration.json). Fourteen additional [live API checks](live-worker-integration.json) validate production origin guards, consent, input minimisation, synthetic report creation and erasure. The synthetic report and its test-only suppression marker were removed and remote D1 confirmed the cohort empty. No real health documents, patient records or provider inference were used.

The strict license audit remains **expected to fail**. The separate `npm run licenses:release` gate passes only for the explicitly user-approved lockfile snapshot; it does not relabel the original audit as passing. Its 101 flagged lockfile locations include duplicates/platform variants; they are not 101 distinct shipped libraries. Some conflicts are embedded in browser assets and absent from package metadata. [Full assessment](../research/license-assessment.md).

## Screenshots

All images use synthetic data. Mobile entry, clock, Hindi draft, desktop and print captures were refreshed from the public deployment; rejection views were also captured live. The rendered PDF image retains the earlier local QA view. No real claim is shown.

| View | Screenshot |
|---|---|
| Mobile entry | [Hospital start](screenshots/mobile-home.png) |
| Active clock and evidence | [Mobile clock](screenshots/mobile-clock.png) |
| Hindi draft | [Hindi letter](screenshots/hindi-letter.png) |
| Static insurer disclosure | [HDFC ERGO Index](screenshots/mobile-index.png) |
| Deduction review | [Mode B](screenshots/mobile-deductions.png) |
| Rejected-claim review | [Mode C](screenshots/mobile-rejection.png), [GRO draft](screenshots/rejection-letter.png) |
| Desktop | [Desktop entry](screenshots/desktop-home.png) |
| Export | [Rendered PDF page](screenshots/print-timeline-pdf.png) |

## Defects found and corrected

- Live Mode C testing caught native form submission before its deferred script loaded. The button now waits until the local handler is ready. A delayed-script regression covers the race, and `form-action 'none'` blocks native submission for all browser-only forms, including when JavaScript is unavailable. The failing test used synthetic text.

- Deduction tests caught an approved room-rent phrase obscuring the actual co-pay and a maternity ceiling being missed. They also caught malformed amount grouping, a repeated name surviving semicolon-separated header redaction, and impossible calendar dates being normalized. The independent expected answers were preserved; all ten cases now pass.
- Actual D1 deletion triggers made `meta.changes` unsuitable for confirming report erasure. `DELETE ... RETURNING id` now confirms the deleted row. Wrong token, valid token and repeat deletion behave correctly.
- Lighthouse found low-contrast text and an accessible-name mismatch; both were corrected and rescored.
- Queued usage counts now recheck consent before transmission; revocation or unavailable storage discards them without replay. Five focused tests cover these cases and network failure.
- Multiple phone numbers in one primary-source field now produce separate telephone links. Timeline event/outcome labels are readable in both languages. Mobile timestamp fields and white-background PDF output were visually refined.

## Known release gaps and choices

1. The user resolved the deployment gates by supplying personal credentials and approving the exact existing dependency snapshot. Future dependency changes require a new license assessment; the exception does not cover them.
2. Mode A and the Index shipped and passed live acceptance before the thin Mode C was added. Mode C prepares a bilingual GRO representation and provides sourced deadlines; it never files a complaint.
3. Confirm the configured provider’s no-card free account and current data-processing settings, then run ten real-provider cases and remove the secret for the live fallback comparison. No paid fallback exists.
4. Numerical NL-48 coverage is **17 of 32 roster insurers**. Fifteen have no publishable numeric rows; several included insurers also have partial filings. See [readable filing-gap list](../research/filing-gaps.md) and [all source notes](../data/filings.json), not a claim of market completeness. No premium-ranked top-15 completeness is established. Published denominators are often absent; no 3-hour compliance rate is inferred from the 2–6-hour bucket.
5. The combined research pass verified **29 strictly qualifying recent cases out of 50 retained records**, one below the requested 30. Exact-date corrections and additional cases are preserved in the [research audit trail](../research/validation-addendum.md); cross-posts are not counted twice. Search-selected experiences are not insurer failure rates.
6. Source correctness required changes to the supplied assumptions: committee approval applies to repudiation, not automatically every deduction; the 2020 room-rent circular was superseded; Ombudsman dates and award-delay penalties have qualifications; the consumer portal is now e-Jagriti. [Primary-source verification](../research/regulatory-verification.md).
7. The clock estimates insurer receipt from what the hospital told the user. Redaction is best effort and requires reviewing the exact outbound text. Public cells use closed monthly cohorts, a seven-day cutoff, n≥10 and permanent suppression after erasure. These safeguards do not prove anonymity or representative sampling.
8. Local timelines and documents remain usable without optional APIs. Privacy operations require successful scheduled retention, a working operator contact and applicable-law review; no DPDP compliance certification is claimed. Human usability, screen-reader and physical-device testing remain useful release work.

Launch posts are [drafts only](../docs/launch-posts.md). Outstanding acceptance requirements stay release work, not v2. Resume from [RESUME.md](../RESUME.md).
