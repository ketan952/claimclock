# Resume ClaimClock

Updated: 2026-10-10. Repository: `ketan952/claimclock`, branch `main`.

## Account guard

Before first commit: `gh auth switch --user ketan952`, `gh api user --jq .login`, and `ssh -T git@github.com-personal` all confirmed `ketan952`. Repo email is `ketangautam952@gmail.com`; origin is `git@github.com-personal:ketan952/claimclock.git`. Never access work repositories/accounts.

## Live release

[ClaimClock](https://claimclock.ketan952.workers.dev/) is deployed to the personal Cloudflare account with D1 and a daily `17 2 * * *` cron. Mode A and the Index shipped and passed live acceptance before the thin Mode C was built. [Deployment record](qa/DEPLOYMENT.md).

## Milestones

M0–M6 describe earlier snapshots; the current M9 state appears below.

- M0: committed/pushed as 071be2b. Design preceded application code.
- M1: sourced dataset snapshot ready: 253 NL-48 rows / 17 insurers; all 32 roster insurers audited with explicit gaps; 49 contacts (32 insurers, 17 TPAs); 14 current-rule citations; 146 historical consumable entries labelled non-current. Five-PDF spot-check: 120 cells, zero transcription differences. Combined research has 29 strictly qualifying recent cases out of 50 retained records, one below requested 30; amendments and original passes remain auditable.
- M2: hospital app/PWA deployed; live browser checks pass.
- M3: static Index pages for all 32 roster insurers ready, 17 with numeric rows. Direct PDF/page links, partial-source flags and unnormalized bucket values verified. Live offline/mobile tests pass; deployed.
- M4: live PDF/OCR/manual pipeline ready. 10/10 independent synthetic deduction cases pass after five fixes; eight browser scenarios pass including on-device text PDF, photo OCR and no-AI fallback. No real-provider QA.
- M5: committed/pushed as 65f6a70; optional Worker/D1 implementation ready: consent-gated reports and erasure, frozen monthly aggregates, bounded optional AI proxy, daily cron and weekly source-value contact workflow. Fourteen API/security tests plus ten actual local Wrangler/D1 integration checks pass. Production Worker/D1 are provisioned; 14 live API checks pass. Provider inference remains untested and disabled.
- M6: local QA/handoff snapshot committed/pushed as 1553747; launch-draft/roadmap follow-up accompanies it. 54 unit/API tests and ten local D1 checks pass. Live browser results are recorded in qa/DEPLOYMENT.md. Live Lighthouse scores 99 performance and 100 for accessibility, best practices and SEO. Screenshots, source gap list, launch drafts and v2 priorities recorded. Live core acceptance passed. Physical-device and real-provider acceptance remain pending. Thin Mode C was implemented after Mode A and the Index shipped: bilingual, browser-only GRO drafts and sourced escalation guidance.

## M7 revision

M7 is deployed and live-verified: external scripts forced; all 41 HTML pages audited; Privacy erasure and analytics controls repaired; 28 bilingual letter snapshots; 302 short source links. 87 unit/security tests pass. Live 13/14 scenarios pass, with the intentionally newly exposed Hindi leak failure assigned to M9. See qa/m7-release.json and qa/REPORT.md. The historical synthetic Prudential 2025-11 preauth report was erased through the UI; its suppression marker remains to preserve erasure semantics.

## M8 revision

M8 is deployed as `d87a1420-e2dd-41bb-8da1-5793234fedea`. 105 unit/API tests and 28 bilingual snapshots pass; the live suite has 15 passes and the expected Hindi baseline for M9. See [release evidence](qa/m8-release.json).

M8 was committed/pushed as `b2f0898`; both GitHub Check and Deploy passed.

M8 expands the reviewed disclosure dataset to 470 rows across 30 insurers, including Star, Care, Aditya Birla, SBI, National, United India and Oriental. The sortable individual-discharge Index preserves channel ranges and missing counts. All 32 insurer contact pages were browser-reviewed; 332 populated field assertions match their sources, with the IRDAI baseline shown separately. Fifteen deterministic deduction fixtures pass, including four likely-valid cases and all 10 categories. Static sharing cards and install icons are generated during build.

Groq AI is explicitly authorized and enabled on the no-card Free tier. Ten synthetic real-provider cases, independent review, actual secret-removal fallback and production-D1 quota boundaries are recorded in qa/REPORT.md. Documents remain browser-only; only user-previewed, consented lines can be sent. No paid fallback exists.

## M9 revision

Deployed version `7d273670-8f23-440d-ae34-1a4bf4712891`. All 22 public browser scenarios pass, including real report erasure and the failed-script regression. All 41 Hindi routes have zero detected leaks; 108 unit/API/license checks and 28 bilingual snapshots pass. [Final release evidence](qa/m9-release.json).

M9 completes selected-language UI across all 41 routes, including expanded source/contact details, errors and dialogs. Hindi dates use full month names. Active clocks hide the hero and show steps that change at 50% and breach; GRO/Bima drafts state excess time against the hospital-reported receipt estimate. Opt-in shows a human-readable field list, expandable exact payload and a copyable deletion receipt with truthful device-storage status.

Bima drafts use a tested 2,000-character application budget; the generator stays under it, and overlong edited/generated text is never silently truncated. The current live portal limit remains the one external acceptance blocker: browser attempts timed out. An IRDAI-branded manual states 4,000 characters, but is not a current-live-form verification. See research/bima-description-limit.md.

Both license commands now pass the reviewed compatibility policy, checking the exact lockfile, all 11 additional expressions and 28 runtime notice hashes. docs/licenses.md explains each license and the separate native-build-tool boundary. CI and deployment use this gate; changed dependencies fail closed.

Final v5 provider review passes 10/10 English cases plus one Hindi smoke case; Lighthouse scores 98/100/100/100 with 100 KiB measured initial transfer. Four synthetic sample letters (GRO/reconsideration, English/Hindi), the provider table, release versions, screenshots and final checks are in [QA](qa/REPORT.md), [samples](qa/letter-samples.md) and [provider QA](qa/provider-qa.md). AI remains enabled. Remaining historical research/device gaps are documented, not described as passed. Launch posts remain unpublished drafts. Never repeat resolved credential/license questions or print secrets.

## License approval and source corrections

- M9 fulfills the user-requested compatibility assessment. `npm run licenses` and `npm run licenses:release` pass the reviewed snapshot and notice inventory; `licenses:strict` preserves the historical narrow-policy inventory command. See docs/licenses.md. Running corresponding source remains public under AGPL-3.0-only.
- CRC/PMC approval is required for repudiation; specific policy-clause explanations cover both repudiation and partial disallowance. No blanket CRC-approval assertion for every deduction.
- May 2024 circular supersedes 2020 proportionate-deduction circular; use policy-specific review, not an unconditional ban.
- Consumer filing platform is e-Jagriti. Ombudsman timing distinguishes an unsatisfactory reply from one calendar month with no reply; the ₹5,000/day rule has an appeal exception.
- Clock is explicitly estimated from user-reported hospital submission; legal trigger is insurer receipt. Enhancement has no separately verified countdown.
- PDF source files and downloaded runtimes stay ignored. Contacts are verified as published, never call/email tested.

## Environment

macOS arm64; no `node` on default PATH. Isolated runtime under ignored `.tools/node-v22.23.3-darwin-arm64/bin`. Prefix PATH for npm commands. All secrets belong in ignored `.env`/Worker/GitHub secrets only; never print values.
