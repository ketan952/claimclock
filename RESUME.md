# Resume ClaimClock

Updated: 2026-10-10. Repository: `ketan952/claimclock`, branch `main`.

## Account guard

Before first commit: `gh auth switch --user ketan952`, `gh api user --jq .login`, and `ssh -T git@github.com-personal` all confirmed `ketan952`. Repo email is `ketangautam952@gmail.com`; origin is `git@github.com-personal:ketan952/claimclock.git`. Never access work repositories/accounts.

## Milestones

- M0: design/scaffold in progress. No application code written before design.
- M1: primary-source rules, contact matrix, NL-48 and market research collecting in parallel.
- M2–M6: pending.

## Next

Commit M0, install isolated Node runtime, implement static Mode A and Index from verified research, and provision personal Cloudflare once credentials are supplied. Preserve honest missing-source/QA coverage. Do not claim deployed or complete without evidence.

## Environment

macOS arm64; no `node` on default PATH. Isolated runtime under ignored `.tools/node-v22.23.3-darwin-arm64/bin`. Prefix PATH for npm commands. All secrets belong in ignored `.env`/Worker/GitHub secrets only; never print values.
