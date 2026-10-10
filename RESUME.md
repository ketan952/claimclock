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

## Next

The user supplied the personal credentials location and explicitly approved the existing dependencies for this deployment. Cloudflare deployment and live core acceptance are complete; do not repeat resolved credential or license questions. Worker and GitHub secrets are configured; never print their values.

Optional AI remains disabled: the supplied Groq key passed a read-only model-list check (HTTP 200, configured model listed), but the account's no-card free status is unconfirmed and `LLM_FREE_TIER_CONFIRMED=false`. No real provider inference was sent. Verify free-account status before enabling that optional path. Do not enable paid inference. The four core flows work without it.

Remaining acceptance: ten real-provider cases and secret-removal comparison; physical Android/4G and native WhatsApp/print; independent Hindi/usability review; one additional qualifying recent research case; missing/partial numeric filings. Read qa/REPORT.md for all limitations. Launch posts remain drafts, not external publications.

## License approval and source corrections

- The user explicitly said, “Allow the existing dependencies for this deployment”. `npm run licenses:release` checks approval against the exact lockfile snapshot; changed dependencies fail closed. `npm run licenses` still fails the original strict allowlist at 101 metadata locations. Runtime notices are served at `/vendor/notices/`. No broad future exception is inferred.
- CRC/PMC approval is required for repudiation; specific policy-clause explanations cover both repudiation and partial disallowance. No blanket CRC-approval assertion for every deduction.
- May 2024 circular supersedes 2020 proportionate-deduction circular; use policy-specific review, not an unconditional ban.
- Consumer filing platform is e-Jagriti. Ombudsman timing distinguishes an unsatisfactory reply from one calendar month with no reply; the ₹5,000/day rule has an appeal exception.
- Clock is explicitly estimated from user-reported hospital submission; legal trigger is insurer receipt. Enhancement has no separately verified countdown.
- PDF source files and downloaded runtimes stay ignored. Contacts are verified as published, never call/email tested.

## Environment

macOS arm64; no `node` on default PATH. Isolated runtime under ignored `.tools/node-v22.23.3-darwin-arm64/bin`. Prefix PATH for npm commands. All secrets belong in ignored `.env`/Worker/GitHub secrets only; never print values.
