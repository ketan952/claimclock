# Resume ClaimClock

Updated: 2026-10-10. Repository: `ketan952/claimclock`, branch `main`.

## Account guard

Before first commit: `gh auth switch --user ketan952`, `gh api user --jq .login`, and `ssh -T git@github.com-personal` all confirmed `ketan952`. Repo email is `ketangautam952@gmail.com`; origin is `git@github.com-personal:ketan952/claimclock.git`. Never access work repositories/accounts.

## Milestones

- M0: committed/pushed as 071be2b. Design preceded application code.
- M1: sourced dataset snapshot ready: 253 NL-48 rows / 17 insurers; all 32 roster insurers audited with explicit gaps; 49 contacts (32 insurers, 17 TPAs); 14 current-rule citations; 146 historical consumable entries labelled non-current. Five-PDF spot-check: 120 cells, zero transcription differences. Research has 12 strictly qualifying recent cases, below requested 30; adjacent cases are not counted.
- M2: static hospital app/PWA local implementation ready; browser checks pass. Deployment remains blocked.
- M3: static Index pages for all32 roster insurers ready,17 with numeric rows. Direct PDF/page links, partial-source flags and unnormalized bucket values verified. Offline/mobile tests pass. Deployment remains blocked.
- M4: local PDF/OCR pipeline and conservative rules engine underway.
- M5: Worker/D1/workflows underway in parallel.
- M6: pending final QA and handoff.

## Next

Finish Mode B, API and integration QA, commit milestones, then deploy only once account credentials and the license blocker are resolved. The user was asked exactly once to put Cloudflare token/account ID and optional Groq key in ignored `.env`; no credentials supplied yet. Do not ask again. Never claim live or complete without evidence.

## Release blockers and corrections

- The mandated stack's transitive dependencies include licenses outside the user's strict MIT/Apache-2.0/AGPL-3.0 allowlist. `npm run licenses` records these and fails; deployment is gated. Do not silently grant a license exception.
- CRC/PMC approval is required for repudiation; specific policy-clause explanations cover both repudiation and partial disallowance. No blanket CRC-approval assertion for every deduction.
- May 2024 circular supersedes 2020 proportionate-deduction circular; use policy-specific review, not an unconditional ban.
- Consumer filing platform is e-Jagriti. Ombudsman timing distinguishes an unsatisfactory reply from one calendar month with no reply; the ₹5,000/day rule has an appeal exception.
- Clock is explicitly estimated from user-reported hospital submission; legal trigger is insurer receipt. Enhancement has no separately verified countdown.
- PDF source files and downloaded runtimes stay ignored. Contacts are verified as published, never call/email tested.

## Environment

macOS arm64; no `node` on default PATH. Isolated runtime under ignored `.tools/node-v22.23.3-darwin-arm64/bin`. Prefix PATH for npm commands. All secrets belong in ignored `.env`/Worker/GitHub secrets only; never print values.
