# ClaimClock QA and release record

**10 October 2026 — deployed to [claimclock.ketan952.workers.dev](https://claimclock.ketan952.workers.dev/).** Worker, static assets and D1 are live in the personal account. M8 enables the explicitly authorized Groq Free-tier explanation feature. No documents are uploaded, and no paid fallback exists. Current results appear in the milestone sections; the original M6 acceptance record below is historical. [Deployment details](DEPLOYMENT.md).

## M7 — blockers corrected

Deployed 10 October 2026, version `45a8da83-6432-4c6a-b654-1e6c1c2dca10`. [Release evidence](m7-release.json).

- Before: the live Privacy page had one blocked inline script; saved deletion codes were not restored ([browser evidence](m7-privacy-before.json), [screenshot](screenshots/privacy-before-m7.png)). The build audit identified that single affected page.
- After: all 41 generated pages pass the external-script/no-inline-handler CI check. All 41 public pages pass the same browser audit. The Privacy form restores a saved synthetic deletion code, erases the report and clears local storage; the analytics checkbox persists both choices ([screenshot](screenshots/privacy-erased.png)). No real patient data was used.
- All message templates were rewritten as user-to-recipient requests. 28 bilingual snapshots and semantic checks cover identity placeholders, numbered demands, supported operative quotes, short citation links, acknowledgement and 14-day resolution. App coaching, verdict labels and disclaimers are excluded from message bodies. Bima text uses a compact attachments line.
- Both short source URLs return an exact 302 to the primary document; the methodology page displays the primary URLs.
- 87 unit/security tests pass. The live suite has 13 passing scenarios and one failing **Hindi leak baseline** for existing untranslated page text. Those findings are retained for M9, not described as passed ([baseline](m7-hindi-baseline.json)). M7-specific live acceptance passes.

## M8 — deductions, disclosures, contacts, AI and sharing

Deployed 10 October 2026, version `d87a1420-e2dd-41bb-8da1-5793234fedea`. [Release evidence](m8-release.json).

- **Deduction rules: 15/15** synthetic fixtures pass across 10 categories, including four conditional likely-valid lines. Clause applicability and arithmetic confirmations are required; verdict totals are shown. Room-cap differences remain distinct from associated-expense proportions. [Answer key](deduction-answer-key.md).
- **Index:470 rows / 30 insurers**, up from 253/17. All 15 previously missing insurers were retried with real browser navigation. Star, Care, Aditya Birla, SBI, National, United India and Oriental now have numerical rows. Galaxy remains excluded for contradictory units; Prudential HCL's numeric filing was not located. Partial coverage is explicit. [Browser retry register](../research/nl48-browser-retry.json), [filing gaps](../research/filing-gaps.md).
- **930 published cells across 34 PDFs** match reviewed source values, with zero differences; 55 cached PDF hashes verify. National and Oriental scans were reviewed cell by cell for retained channels. This does not certify all market data. [Source review](../research/nl48-m8-qa.md).
- The live [comparison](https://claimclock.ketan952.workers.dev/index/) shows individual discharge buckets, latest period and disclosed cashless counts. It uses disclosed-denominator weights or explicit channel ranges; unknown values stay unknown. Latest-period group-only data does not silently fall back to older individual data. The TPA-receipt clock and 2–6 h caveat stay above the table.
- **32/32 own contact pages** browser-reviewed ; **332/332 populated field assertions** matched. Helplines are sourced for all 32; dedicated claims emails appear for 6 where published, and 85 own-page escalation stages retain their actual role labels. Missing stages/emails remain null. The IRDAI baseline and field-specific sources/dates are visible separately. [Browser evidence](../research/contacts-browser-verification.json), [field checks](../research/contacts-browser-check.json). No calls, emails or complaints were sent.
- All 41 pages have Open Graph/Twitter metadata.34 static 1200×630 PNG cards cover the Index, all 32 insurers and the default card. 192/512 PNG icons, 180 apple-touch icon, favicon, sitemap and robots are generated during build. [Mobile comparison](screenshots/comparison-mobile.png), [desktop comparison](screenshots/comparison-desktop.png).
- **105 unit/API tests and 28 bilingual snapshots pass**; all 41 built pages pass the CSP audit. The public browser suite has **15 passes and one Hindi baseline failure** scheduled for M9, with no skips. The actual synthetic report was erased through the Privacy form. [Hindi baseline](m8-hindi-baseline.json).

### Real-provider QA

AI is enabled on the explicitly authorized Groq Free-tier `openai/gpt-oss-120b` model. The documented free limits are 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD ([Groq limits](https://console.groq.com/docs/rate-limits)); application caps are lower at 3/minute and 100/day. No card, paid fallback or model switching was enabled. Only synthetic, minimal, consented lines were sent; no documents or patient identifiers.

The first ten-case run returned 10 HTTP 200 responses but only 7 explanations passed: unsupported coverage assertions and a reversed settlement-payment meaning were found. Further retained trials caught a clinical interpretation of a billing label and an amount attached to the wrong item. The final prompt explicitly preserves insurer attribution, item/amount binding and payment direction. A real Worker incompatibility with `redirect:error` was repaired with `manual` plus rejection of all redirects; completion output is bounded at 600 tokens and 1,600 returned characters. [Before](provider-before.json), [intermediate v3 and its independent review](provider-intermediate3-review.json), [final raw cases](provider-results.json), [independent review](provider-review.json).

The final uniform v4 run achieved **10/10 independently reviewed explanations**, all HTTP 200 and at most 85 words. This is a ten-case explanation review, not a real-claim classification accuracy estimate.

| Case | Synthetic scenario | HTTP | Explanation review | Words |
|---|---|---:|---|---:|
| S01 | Room-category proportional reduction | 200 | PASS | 60 |
| S02 | Consumable item with unknown rider | 200 | PASS | 53 |
| S03 | Confirmed cataract benefit cap | 200 | PASS | 85 |
| S04 | Confirmed co-payment with calculation base | 200 | PASS | 60 |
| S05 | Reasonable-and-customary reduction | 200 | PASS | 59 |
| S06 | Package inclusion rather than consumable exclusion | 200 | PASS | 50 |
| S07 | Alleged unrelated investigation | 200 | PASS | 60 |
| S08 | Blank deduction explanation | 200 | PASS | 44 |
| S09 | Approved room rent must not override actual co-pay | 200 | PASS | 48 |
| S10 | Exhausted maternity allowance without the word sub-limit | 200 | PASS | 68 |

The production D1 boundary test accepted permit 100, denied 101, and denied the fourth minute permit using isolated synthetic future-date keys. Those keys were erased; current-day counters were preserved. [Quota evidence](provider-quota.json). The real `LLM_API_KEY` secret was deleted, the public config changed to disabled, `/api/explain` returned 503, and a real browser showed the fallback while generating a local letter. The secret was restored and config confirmed enabled. [API proof](provider-fallback.json), [browser proof](provider-fallback-browser.json), [screenshot](screenshots/ai-secret-removed.png).

## Original M6 acceptance record (historical)

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

## Original M6 executed checks (historical)

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

## Original M6 gaps and choices (historical; M7–M9 supersede resolved items)

1. The user resolved the deployment gates by supplying personal credentials and approving the exact existing dependency snapshot. Future dependency changes require a new license assessment; the exception does not cover them.
2. Mode A and the Index shipped and passed live acceptance before the thin Mode C was added. Mode C prepares a bilingual GRO representation and provides sourced deadlines; it never files a complaint.
3. Confirm the configured provider’s no-card free account and current data-processing settings, then run ten real-provider cases and remove the secret for the live fallback comparison. No paid fallback exists.
4. Numerical NL-48 coverage is **17 of 32 roster insurers**. Fifteen have no publishable numeric rows; several included insurers also have partial filings. See [readable filing-gap list](../research/filing-gaps.md) and [all source notes](../data/filings.json), not a claim of market completeness. No premium-ranked top-15 completeness is established. Published denominators are often absent; no 3-hour compliance rate is inferred from the 2–6-hour bucket.
5. The combined research pass verified **29 strictly qualifying recent cases out of 50 retained records**, one below the requested 30. Exact-date corrections and additional cases are preserved in the [research audit trail](../research/validation-addendum.md); cross-posts are not counted twice. Search-selected experiences are not insurer failure rates.
6. Source correctness required changes to the supplied assumptions: committee approval applies to repudiation, not automatically every deduction; the 2020 room-rent circular was superseded; Ombudsman dates and award-delay penalties have qualifications; the consumer portal is now e-Jagriti. [Primary-source verification](../research/regulatory-verification.md).
7. The clock estimates insurer receipt from what the hospital told the user. Redaction is best effort and requires reviewing the exact outbound text. Public cells use closed monthly cohorts, a seven-day cutoff, n≥10 and permanent suppression after erasure. These safeguards do not prove anonymity or representative sampling.
8. Local timelines and documents remain usable without optional APIs. Privacy operations require successful scheduled retention, a working operator contact and applicable-law review; no DPDP compliance certification is claimed. Human usability, screen-reader and physical-device testing remain useful release work.

Launch posts are [drafts only](../docs/launch-posts.md). Outstanding acceptance requirements stay release work, not v2. Resume from [RESUME.md](../RESUME.md).
