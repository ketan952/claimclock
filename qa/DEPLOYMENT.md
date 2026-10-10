# Public deployment — 10 October 2026

**Live URL:** https://claimclock.ketan952.workers.dev/

Personal repository: https://github.com/ketan952/claimclock

Cloudflare Workers static assets and API, the `claimclock` D1 binding, initial remote migration and the daily `17 2 * * *` UTC cron were deployed with Wrangler. No paid plan or upgrade was created. The D1 database was provisioned in APAC. Application observability is disabled. The deployment serves 41 static pages and self-hosted document/OCR assets, including upstream runtime notices.

The hospital clock and Index were deployed and passed eight public-site browser scenarios before the thin rejection flow was implemented. The subsequent Wrangler version including that flow was `e3d3b19e-c3ff-4406-9e0d-3b34c29f4607`; later GitHub deployments may replace the version while retaining the same URL.

Deployment and D1 migration repository variables are enabled for the personal GitHub Actions workflow. Provider and Cloudflare credentials are stored only in secret storage; a scan of tracked and unignored candidate files found no supplied API-token values.

## Checks

| Check | Result |
|---|---|
| Lint, application/Worker type checks and dataset validation | Pass |
| Unit and security suite | 54/54 pass |
| Approved dependency snapshot gate | Pass; strict allowlist audit still fails as documented below |
| Initial live browser suite | 8/8 pass: ten insurer contacts/citations, clock/letters, English/Hindi, offline Index/clock, ten deduction fixtures, PDF/photo extraction, responsive layout and exports |
| Final live browser suite with rejection flow | 10/10 pass, including delayed-script rejection flow and no-JavaScript native form privacy; [machine summary](live-browser-summary.json) |
| Live API and remote D1 | 14/14 pass; [machine results](live-worker-integration.json) |
| Mobile Lighthouse on the public URL | Performance 99, accessibility 100, best practices 100, SEO 100; FCP 1.5 s, LCP 1.7 s, TBT 0, CLS 0; [measured run](lighthouse-live.json) |
| Independent NL-48 spot-check | 120 cells / five source PDFs / zero differences |

The live API test created one synthetic report, rejected an incorrect erase token, erased with the correct token, and checked repeat erasure. Remote D1 verified that no report, aggregate or suppression marker remained in that previously empty test cohort. No real patient data, health documents or inference requests were sent. Normal minimal quota counters remain.

## Optional AI status

The supplied LLM base URL, key and model were installed as Worker and personal-repository secrets. An initial read-only model check via Python returned HTTP 403, but a repeat using curl returned HTTP 200 and listed the configured model. Provider credentials are usable; the earlier response is not evidence of a bad key. No inference was attempted. The account's no-card free-tier status was not established. `LLM_FREE_TIER_CONFIRMED=false` keeps optional AI disabled. `/api/config` confirms `ai_enabled=false`. All four core flows remain available without it.

## License authorization

The user explicitly approved: “Allow the existing dependencies for this deployment”. The [release approval](../research/dependency-release-approval.json) is tied to the exact package-lock SHA-256. The new `licenses:release` gate fails on a different snapshot. The original `licenses` audit retains 101 metadata locations outside the strict allowlist; the exception is not a claim that they satisfy it. Upstream licenses and notices accompany the runtime files at `/vendor/notices/`. [Assessment](../research/license-assessment.md).

## Remaining limits

Real-provider accuracy and the AI-enabled/secret-removal comparison remain untested. Lighthouse is simulated mobile, not a physical Android on 4G. Independent Hindi comprehension, assistive-technology and native mobile print/WhatsApp checks remain open. Numeric disclosure coverage is 17/32 insurers, with source gaps and partial filings explicitly labelled. Research has 29 qualifying recent cases, one below the requested target. See the full [QA record](REPORT.md), [filing gaps](../research/filing-gaps.md), and [research audit](../research/validation-addendum.md).

Launch posts remain drafts; nothing was posted or sent to third parties.
