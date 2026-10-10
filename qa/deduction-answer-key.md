# Mode B deduction answer key

**Sixteen synthetic settlement letters, reviewed 10 October 2026.** All names, identifiers, institutions, amounts and policy clauses are fictional. No real claim or patient record is used. M10 adds a distinct unverified-policy verdict; S09, S10 and S14 now use it, and S16 explicitly confirms no applicable clause. The five additional outcomes were specified before the classifier edits and independently reviewed by a second build agent; this is source-informed engineering review, not independent legal-professional review.

The classifier receives a user-reviewed deduction description, amount and explicit policy/calculation confirmations. These tests do not measure OCR accuracy or real-world legal correctness. Provider inference results belong in the separate AI report; fixture metadata remains false until those fixtures are actually evaluated.

The UI distinguishes **Likely valid — check the clause**, **Challengeable — request a review**, **Policy term — verify**, and an additional **No reason given** group when unresolved amounts exist. “Likely valid” requires both an applicable policy clause and confirmed arithmetic; it is conditional. Direct room-charge differences are separate from reductions of associated expenses. The associated-expense category continues to request review even when a clause is recorded. Implant/prosthesis coverage is reviewed against actual terms, not automatically labelled excluded consumables.

## Current answer key

| Fixture | Category | Expected verdict | Deduction | Reasoning |
|---|---|---|---|---|
| S01 — Room-category proportional reduction | `room-rent` | challengeable | ₹8,000 | The description identifies a room-category ratio applied to associated charges. Request the actual clause, affected-item calculation and whether those charges vary by room. Neither the historical 2020 circular nor a ratio alone establishes that the reduction is prohibited. |
| S02 — Consumable item with unknown rider | `consumable` | challengeable | ₹1,500 | Exact items appear in different historical lists: gloves I.56, oxygen mask I.62, admission kit II.27. Those historical labels cannot decide present coverage. Request policy exclusion, consumable rider and any package/room inclusion before concluding recoverability. |
| S03 — Confirmed cataract benefit cap | `sub-limit` | likely valid | ₹4,500 | In this synthetic scenario the user confirms the applicable per-eye cap and the arithmetic: 54,500 minus 50,000 is 4,500. Likely valid is conditional, not an adjudication; policy version, utilization and riders still matter. The linked cataract post is only contextual, not evidence this fictional cap exists. |
| S04 — Confirmed co-payment with calculation base | `co-pay` | likely valid | ₹14,500 | Both clause applicability and calculation are expressly confirmed by the fixture user. The arithmetic 72,500 x 20% = 14,500 supports the conditional status. Public shortfall reports illustrate confusion about partial approval, not proof of co-pay terms. |
| S05 — Reasonable-and-customary reduction | `reasonable-customary` | challengeable | ₹12,000 | The insurer label identifies the category but does not establish an evidence-based comparison, geographic benchmark or policy clause. Seek the reference data and line calculation. Do not characterize every reasonable-and-customary reduction as unlawful. |
| S06 — Package inclusion rather than consumable exclusion | `package` | challengeable | ₹2,400 | The operative reason is alleged package inclusion, despite names of consumable items. Compare agreed package and hospital bill to determine whether this is duplicate billing or an incorrect package assumption. Historical List III labels do not settle the dispute. |
| S07 — Alleged unrelated investigation | `unrelated` | challengeable | ₹3,100 | Timing within an admission neither proves nor disproves medical relation. Request the specific terms and clinical basis and obtain the treating doctor explanation. The app must not independently diagnose or assert medical necessity. |
| S08 — Blank deduction explanation | `unexplained` | no reason given | ₹3,250 | A numeric adjustment and generic terms label do not communicate the full item-specific reason and policy term. The correct next action is to ask for reasons; do not invent a consumables/co-pay/category explanation. |
| S09 — Approved room rent must not override actual co-pay | `co-pay` | policy term — verify | ₹12,500 | The room charge is explicitly approved; the actual deduction is co-pay. Confirming arithmetic without verifying the applicable policy clause cannot make it likely valid. An unenclosed clause remains unknown; it does not establish that no applicable term exists. A first-keyword room-rent match loses the negation and misstates the reason. |
| S10 — Exhausted maternity allowance without the word sub-limit | `sub-limit` | policy term — verify | ₹22,000 | A treatment-specific benefit ceiling is a sub-limit even when the exact label is absent. Verify policy wording, period and prior utilization. The post reference concerns a policy-period dispute and is contextual only; all maternity terms here are synthetic. |
| S11 — Confirmed direct room-rent cap difference | `room-rent-cap` | likely valid | ₹6,000 | This is the direct room charge difference, not a ratio applied to surgeon, OT or other expenses. The fixture user confirms the applicable Rs 5,000 daily cap, absence of a waiver and the arithmetic (7,000 - 5,000) x 3 = 6,000. These confirmations support likely valid, while actual policy version and days remain material. |
| S12 — Confirmed per-claim fixed deductible | `co-pay` | likely valid | ₹10,000 | The policy-dependent deductible is a fixed amount rather than a co-pay percentage, but both share this participation category. The user confirms the applicable once-per-claim Rs 10,000 deductible and Rs 90,000 - Rs 10,000 = Rs 80,000 arithmetic; no second application is present. These facts support the conditional likely-valid verdict. |
| S13 — Implant labelled non-medical despite reported device cover | `implant` | challengeable | ₹25,000 | An implanted knee prosthesis is not established as excluded merely by calling it a non-medical consumable. The reported device coverage makes the blanket rationale a review issue: obtain the policy wording, device invoice and any valid exclusion or sub-limit. This does not establish that every implant is payable or that this fictional claim must be refunded. |
| S14 — Direct room difference without verified policy cap | `room-rent-cap` | policy term — verify | ₹6,000 | The arithmetic of a room difference can be correct while its contractual basis is unverified. A cap omitted from the settlement is not an explicit user report that no applicable cap exists. A confirmed calculation alone does not justify likely valid. Obtain the policy schedule, room-category wording and applicable waiver before accepting the Rs 6,000 deduction. |
| S15 — Same package item deducted twice | `package` | challengeable | ₹4,000 | This explicitly identifies two deductions against the same Rs 2,000 bill entry, not merely a single exclusion because an item is included in a package. Compare package terms and both settlement entries to reconcile the Rs 4,000 deduction with the one billed amount. The evidence request targets apparent duplicate adjustment without independently adjudicating payment. |

| S16 — Explicit user report of no applicable co-pay clause | `co-pay` | challengeable | ₹12,500 | The user checked the policy and expressly reports no applicable clause. This supports review of the policy basis; omission from the settlement alone does not establish that fact. |

## M10 verification

The three policy-dependent categories default to verification. A supplied applicable clause plus checked arithmetic yields likely valid; an explicit user report of no applicable clause yields challengeable. S09/S10/S14 remain unverified because their missing enclosures are not such a report. All four existing likely-valid cases remain. Confirmed lines receive clarification requests in letters, including separate confirmed/review totals in Bima drafts. The 70 targeted unit and snapshot checks pass, including all 16 fixture outcomes, four likely-valid cases, no-clause gates, bilingual clarification wording and prose-duration rounding.

## Current source basis

- **Health Master Circular, 29 May 2024, 17(b):** reasons and specific policy terms for a partial disallowance. This supports requests for evidence and calculation, not a promise of payment.
- **2024 Annexure 1, Customer Information Sheet item 8, PDF page 3:** policy financial limits include room/ICU sub-limits, co-payment and deductibles. The page was extracted from the cached official PDF and visually inspected. It prescribes policy disclosure; it neither creates a universal room cap nor bans all associated-expense reductions.
- **Health Master Circular, Chapter III IV:** supersedes the listed 2020 circulars. The earlier blanket room-rent prohibition asserted in the initial brief remains unsupported as a universal current rule.
- **Historical IRDAI lists:** exact-match consumable entries retain their policy-dependent historical status. A category-level link is shown even when no exact item match is found. Neither a historical List I label nor “non-medical” wording alone proves present exclusion; implants are reviewed separately.

[Current 2024 financial-limit source](https://irdai.gov.in/documents/37343/991022/%E0%A4%B8%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A5%8D%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%B8%E0%A4%BE%E0%A4%AF+%E0%A4%AA%E0%A4%B0+%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A4%B0+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%B0+29052024+%E0%A4%95%E0%A4%BE+%E0%A4%85%E0%A4%A8%E0%A5%81%E0%A4%AC%E0%A4%82%E0%A4%A7+_+Annexure+to+Master+circualr+on+Health+Insurance+Business+29052024.pdf/e65501d8-2731-6f5c-aaed-658f961289e1?version=2.0&t=1717051485494&download=true) · [Health Master Circular](https://irdai.gov.in/document-detail?documentId=4942918) · [Detailed regulatory verification](../research/regulatory-verification.md).

## Independent review of the five added cases

The second build agent agreed with all five proposed outcomes before engine changes. It specifically required that the implant case describe a reviewable conflict with reported coverage, not guaranteed payment, and that S15 explicitly show **two deductions for the same single ₹2,000 tape entry**, rather than a single package-inclusion adjustment. Those distinctions are preserved in the final fixtures.

## Executed M8 checks

- **15/15 category-and-status outcomes agree**, covering ten categories. Four are conditionally likely valid: cataract cap, co-pay, direct room cap and fixed deductible.
- Policy/calculation gate regressions remove each confirmation independently from all four likely-valid inputs; each becomes reviewable.
- Associated room expenses remain distinct from direct room charges. A blanket non-medical label cannot move an implant to the consumable category.
- Verdict totals conserve every deduction and sum currency in cents before presentation; a ₹0.10 + ₹0.20 regression yields ₹0.30.
- Existing identifier redaction, manual amount validation and calendar boundary checks remain. The full local deduction suite has 35 checks. Browser acceptance for the 15-fixture loop and each verdict total runs against the milestone deployment.

Run `node --experimental-strip-types --test tests/deductions.test.ts`. Failing expected outcomes are implementation findings; do not change them solely to match the classifier. Redaction remains best effort and user review of outbound text remains necessary.

## Initial execution — defects reported, engine not changed by QA

Executed with Node **22.23.3** on 10 October 2026: **27 tests, 22 passed, 5 failed**. Category-and-status agreement was **8/10** on the synthetic fixtures. This is the initial baseline, before implementation corrections; a later passing run should be recorded separately.

1. **S09:** the approved room-rent context was treated as the deduction, hiding the actual co-pay.
2. **S10:** the maternity benefit ceiling was classified unexplained instead of sub-limit.
3. **Amount input:** malformed comma grouping (`1,,250`, `12,34`) was silently accepted.
4. **Redaction:** a semicolon-separated header led to capture of name plus UHID as one identifier; a repeated name in the narrative survived.
5. **Calendar input:** `2026-02-30` was normalized into March instead of rejected.

All six valid month/leap/year boundary scenarios, the policy-and-calculation gates, explicit Hindi-name removal, known identifiers across ten letters, and ICS structure checks passed on that run. The implementation agent was informed; source engine files were not edited by this QA task.
