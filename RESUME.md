# Resume ClaimClock

Updated: 2026-10-10. Repository: `ketan952/claimclock`, branch `main`.

## Account guard

Before first commit: `gh auth switch --user ketan952`, `gh api user --jq .login`, and `ssh -T git@github.com-personal` all confirmed `ketan952`. Repo email is `ketangautam952@gmail.com`; origin is `git@github.com-personal:ketan952/claimclock.git`. Never access work repositories/accounts.

## Live release

[ClaimClock](https://claimclock.ketan952.workers.dev/) is deployed to the personal Cloudflare account with D1 and a daily `17 2 * * *` cron. Mode A and the Index shipped and passed live acceptance before the thin Mode C was built. [Deployment record](qa/DEPLOYMENT.md).

## Milestones

- M0: committed/pushed as 071be2b. Design preceded application code.
- M1: sourced dataset snapshot ready: 253 NL-48 rows / 17 insurers; all 32 roster insurers audited with explicit gaps; 49 contacts (32 insurers, 17 TPAs); 14 current-rule citations; 146 historical consumable entries labelled non-current. Five-PDF spot-check: 120 cells, zero transcription differences. Combined research has 29 strictly qualifying recent cases out of 50 retained records, one below requested 30; amendments and original passes remain auditable.
- M2: hospital app/PWA deployed; live browser checks pass.
- M3: static Index pages for all 32 roster insurers ready, 17 with numeric rows. Direct PDF/page links, partial-source flags and unnormalized bucket values verified. Live offline/mobile tests pass; deployed.
- M4: live PDF/OCR/manual pipeline ready. 10/10 independent synthetic deduction cases pass after five fixes; eight browser scenarios pass including on-device text PDF, photo OCR and no-AI fallback. No real-provider QA.
- M5: committed/pushed as 65f6a70; optional Worker/D1 implementation ready: consent-gated reports and erasure, frozen monthly aggregates, bounded optional AI proxy, daily cron and weekly source-value contact workflow. Fourteen API/security tests plus ten actual local Wrangler/D1 integration checks pass. Production Worker/D1 are provisioned; 14 live API checks pass. Provider inference remains untested and disabled.
- M6: local QA/handoff snapshot committed/pushed as 1553747; launch-draft/roadmap follow-up accompanies it. 54 unit/API tests and ten local D1 checks pass. Live browser results are recorded in qa/DEPLOYMENT.md. Live Lighthouse scores 99 performance and 100 for accessibility, best practices and SEO. Screenshots, source gap list, launch drafts and v2 priorities recorded. Live core acceptance passed. Physical-device and real-provider acceptance remain pending. Thin Mode C was implemented after Mode A and the Index shipped: bilingual, browser-only GRO drafts and sourced escalation guidance.

## M7 revision

M7 is deployed and live-verified: external scripts forced; all 41 HTML pages audited; Privacy erasure and analytics controls repaired; 28 bilingual letter snapshots;302 short source links.87 unit/security tests pass. Live 13/14 scenarios pass, with the intentionally newly exposed Hindi leak failure assigned to M9. See qa/m7-release.json andqa/REPORT.md. The historical synthetic Prudential 2025-11 preauth report was erased through theUI; its suppression marker remains to preserve erasure semantics.

## M8 revision

M8 is deployed as `d87a1420-e2dd-41bb-8da1-5793234fedea`. 105 unit/API tests and 28 bilingual snapshots pass; the live suite has 15 passes and the expected Hindi baseline for M9. See [release evidence](qa/m8-release.json).

M8 expands the reviewed disclosure dataset to 470 rows across 30 insurers, including Star, Care, Aditya Birla, SBI, National, United India and Oriental. The sortable individual-discharge Index preserves channel ranges and missing counts. All32 insurer contact pages were browser-reviewed; 332 populated field assertions match their sources, with the IRDAI baseline shown separately. Fifteen deterministic deduction fixtures pass, including four likely-valid cases and all 10 categories. Static sharing cards and install icons are generated during build.

Groq AI is explicitly authorized and enabled on the no-card Free tier. Ten synthetic real-provider cases, independent review, actual secret-removal fallback and production-D1 quota boundaries are recorded in qa/REPORT.md. Documents remain browser-only; only user-previewed, consented lines can be sent. No paid fallback exists.

## Next

Complete and separately deploy M9: selected-language UI/dialogs, human-readable opt-in, clock steps/active hero, Bima character budget and compatible-license gate. M9 implementation is prepared in an isolated worktree; merge after the M8 release. The live Bima portal currently times out in repeated read-only browser attempts; an IRDAI-branded manual describes 4,000 characters, but the current live maxlength is unverified. Do not claim otherwise.

The user supplied the personal credentials location and approved the existing dependencies and AI enablement. Never repeat resolved credential or license questions, and never print secrets. Remaining historical acceptance gaps are physical Android/4G and native WhatsApp/print, independent Hindi/usability review, one additional qualifying recent research case and partial/missing insurer filings. Launch posts remain drafts.

## License approval and source corrections

- The user explicitly said, “Allow the existing dependencies for this deployment”. `npm run licenses:release` checks approval against the exact lockfile snapshot; changed dependencies fail closed. `npm run licenses` still fails the original strict allowlist at 101 metadata locations. Runtime notices are served at `/vendor/notices/`. No broad future exception is inferred.
- CRC/PMC approval is required for repudiation; specific policy-clause explanations cover both repudiation and partial disallowance. No blanket CRC-approval assertion for every deduction.
- May 2024 circular supersedes 2020 proportionate-deduction circular; use policy-specific review, not an unconditional ban.
- Consumer filing platform is e-Jagriti. Ombudsman timing distinguishes an unsatisfactory reply from one calendar month with no reply; the ₹5,000/day rule has an appeal exception.
- Clock is explicitly estimated from user-reported hospital submission; legal trigger is insurer receipt. Enhancement has no separately verified countdown.
- PDF source files and downloaded runtimes stay ignored. Contacts are verified as published, never call/email tested.

## Environment

macOS arm64; no `node` on default PATH. Isolated runtime under ignored `.tools/node-v22.23.3-darwin-arm64/bin`. Prefix PATH for npm commands. All secrets belong in ignored `.env`/Worker/GitHub secrets only; never print values.
