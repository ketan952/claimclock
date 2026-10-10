# Resume ClaimClock

Updated: 2026-10-10. Repository: `ketan952/claimclock`, branch `main`.

## Account guard

Before first commit: `gh auth switch --user ketan952`, `gh api user --jq .login`, and `ssh -T git@github.com-personal` all confirmed `ketan952`. Repo email is `ketangautam952@gmail.com`; origin is `git@github.com-personal:ketan952/claimclock.git`. Never access work repositories/accounts.

## Milestones

- M0: committed/pushed as 071be2b. Design preceded application code.
- M1: sourced dataset snapshot ready: 253 NL-48 rows / 17 insurers; all 32 roster insurers audited with explicit gaps; 49 contacts (32 insurers, 17 TPAs); 14 current-rule citations; 146 historical consumable entries labelled non-current. Five-PDF spot-check: 120 cells, zero transcription differences. Combined research has 29 strictly qualifying recent cases out of 50 retained records, one below requested 30; amendments and original passes remain auditable.
- M2: static hospital app/PWA local implementation ready; browser checks pass. Deployment remains blocked.
- M3: static Index pages for all 32 roster insurers ready, 17 with numeric rows. Direct PDF/page links, partial-source flags and unnormalized bucket values verified. Offline/mobile tests pass. Deployment remains blocked.
- M4: local PDF/OCR/manual pipeline ready. 10/10 independent synthetic deduction cases pass after five fixes; eight browser scenarios pass including on-device text PDF, photo OCR and no-AI fallback. No real-provider QA.
- M5: committed/pushed as 65f6a70; optional Worker/D1 implementation ready: consent-gated reports and erasure, frozen monthly aggregates, bounded optional AI proxy, daily cron and weekly source-value contact workflow. Fourteen API/security tests plus ten actual local Wrangler/D1 integration checks pass. Production provisioning and provider tests remain pending.
- M6: local QA/handoff snapshot committed/pushed as 1553747; launch-draft/roadmap follow-up accompanies it. 52 unit/API tests, eight browser scenarios and ten local D1 checks pass. Lighthouse local mobile scores 100 across all four categories. Screenshots, source gap list, launch drafts and v2 priorities recorded. Live, physical-device and real-provider acceptance remain pending. Mode C is deliberately deferred.

## Next

Resolve the mandated-stack/license conflict and provide personal Cloudflare credentials through the previously requested path. Deploy Mode A and Index only after gates pass; run live acceptance, then implement thin Mode C. Run real-provider/no-secret QA if a free key is configured. The 30-post research target is still short by one. Read qa/REPORT.md for every remaining check. The user was asked exactly once to put Cloudflare token/account ID and optional Groq key in ignored `.env`; no credentials supplied yet. Do not ask again. Never claim live or complete without evidence.

## Release blockers and corrections

- The mandated stack's transitive dependencies include licenses outside the user's strict MIT/Apache-2.0/AGPL-3.0 allowlist. `npm run licenses` records these and fails; deployment is gated. Do not silently grant a license exception.
- CRC/PMC approval is required for repudiation; specific policy-clause explanations cover both repudiation and partial disallowance. No blanket CRC-approval assertion for every deduction.
- May 2024 circular supersedes 2020 proportionate-deduction circular; use policy-specific review, not an unconditional ban.
- Consumer filing platform is e-Jagriti. Ombudsman timing distinguishes an unsatisfactory reply from one calendar month with no reply; the ₹5,000/day rule has an appeal exception.
- Clock is explicitly estimated from user-reported hospital submission; legal trigger is insurer receipt. Enhancement has no separately verified countdown.
- PDF source files and downloaded runtimes stay ignored. Contacts are verified as published, never call/email tested.

## Environment

macOS arm64; no `node` on default PATH. Isolated runtime under ignored `.tools/node-v22.23.3-darwin-arm64/bin`. Prefix PATH for npm commands. All secrets belong in ignored `.env`/Worker/GitHub secrets only; never print values.
