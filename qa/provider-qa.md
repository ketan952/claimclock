# Real-provider QA — final M9 prompt

Tested 10 October 2026 against [the public deployment](https://claimclock.ketan952.workers.dev/), using Groq Free-tier `openai/gpt-oss-120b`. **10/10 English explanations pass independent review**; all HTTP 200, maximum 71 words. A separate Hindi UI smoke case also passes. AI is left enabled. This measures explanations of synthetic minimal lines, not real-claim classification or OCR accuracy.

| Case | Synthetic scenario | Local answer-key verdict | HTTP | Explanation review | Words |
|---|---|---|---:|---|---:|
| S01 | Room-category proportional reduction | challengeable | 200 | PASS | 49 |
| S02 | Consumable item with unknown rider | challengeable | 200 | PASS | 54 |
| S03 | Confirmed cataract benefit cap | likely valid | 200 | PASS | 71 |
| S04 | Confirmed co-payment with calculation base | likely valid | 200 | PASS | 56 |
| S05 | Reasonable-and-customary reduction | challengeable | 200 | PASS | 45 |
| S06 | Package inclusion rather than consumable exclusion | challengeable | 200 | PASS | 52 |
| S07 | Alleged unrelated investigation | challengeable | 200 | PASS | 55 |
| S08 | Blank deduction explanation | no reason given | 200 | PASS | 44 |
| S09 | Approved room rent must not override actual co-pay | challengeable | 200 | PASS | 56 |
| S10 | Exhausted maternity allowance without the word sub-limit | challengeable | 200 | PASS | 70 |

The deterministic engine separately passes 15/15 fixtures, including four conditional likely-valid cases. Provider output cannot change its classifications. [Answer key](deduction-answer-key.md).

The first ten-case explanation run scored 7/10; later trials exposed amount attribution and a Hindi payment-entitlement error. Those failures are retained. The final prompt preserves insurer attribution, binds each amount to its stated item and discusses payment only when a separate settlement amount is supplied. All final English calls used the same prompt revision and Worker-source hash; one deployment changed only client assets during the run.

- [Final raw English responses](provider-results.json) and [independent hash-bound review](provider-review.json).
- [Final Hindi UI request/response](provider-hindi.json) and [independent review with before/after](provider-hindi-review.json).
- [Original ten cases](provider-before.json), [v3 review](provider-intermediate3-review.json), [v4 English review](provider-v4-english-review.json), [v4 Hindi failure](provider-hindi-before.json).
- [Actual removed-secret API fallback/restoration](provider-fallback.json), [browser fallback](provider-fallback-browser.json), and [production-D1 quota boundary test](provider-quota.json).

The app permits 3 requests/minute and 100/day globally. The real D1 boundary accepted 100 and denied 101; synthetic quota keys were erased. Secret deletion produced AI-disabled config and HTTP 503 while local letters worked; restoration returned AI-enabled config. Only synthetic, previewed lines were sent. No documents, patient identifiers or paid fallback were used.
