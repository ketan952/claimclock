# User evidence validation addendum

**Final update:** a [last bounded pass](user-evidence-final.json) added one new cataract-deduction report and corrected existing case-019’s explicit deduction dispute. The [combined reviewed view](user-evidence-combined.json) applies all amendments: **50 retained cases, 49 exact dates in-window, 29 qualifying posts—one short of 30**. Rebuild/check with `python3 scripts/combine-user-evidence.py [--check]`. The original passes below remain an audit trail.

Reviewed 2026-10-10. This bounded follow-up adds **13 unique qualifying top-level posts**. The original 12 plus these 13 gives **25**. Resolving the date on existing case-035 and correcting case-030’s discharge-wait classification gives **27 qualifying posts**, **three short of the requested 30**. The original JSON is unchanged; the additional JSON stores the six explicit amendment recommendations.

The combined projection contains **49 unique top-level posts**, **48 exact publication dates within 2026-04-14 through 2026-10-10**, one outside the window and zero unresolved publication dates. Eligibility uses publication date, not medical-event date. These are public self-reports, not independently adjudicated claim files. No statutory breach is established.

## New cases

| Case | Publication date (UTC) | Insurer / TPA as reported | Short paraphrase |
|---|---|---|---|
| [case-037](https://www.reddit.com/r/InsuranceTroubleIndia/comments/1smd1jz/care_health_delaying_my_childs_claim_asking_for/) | 2026-04-15 | Care Health | Parent reports two days waiting in hospital amid repeated document requests, then switching from Care Health to corporate cover to leave. |
| [case-038](https://www.reddit.com/r/InsuranceTroubleIndia/comments/1w73xui/a_question_on_excess_tarriff_charges/) | 2026-09-04 | Insurer unnamed | Patient reports paying ₹29,000, then finding insurer approval limited patient liability to ₹15,000; disputes the additional ₹14,000 hospital collection. |
| [case-039](https://www.reddit.com/r/LegalAdviceIndia/comments/1uylxkc/star_india_health_insurance_i_need_to_lodge_a/) | 2026-07-17 | Star India health insurance | Caregiver reports a mother’s expected discharge postponed amid medical-claim approval delays and seeks a formal complaint route. |
| [case-040](https://www.reddit.com/r/gurgaon/comments/1vn6n6c/fortis_is_taking_forever_to_discharge/) | 2026-08-13 | Insurer unnamed | Patient reports delayed discharge paperwork and an unsent authorization request while required to remain in a ₹10,000-per-day room. |
| [case-041](https://www.reddit.com/r/india/comments/1tub3dl/we_relocated_to_a_different_city_for_my_mothers/) | 2026-06-02 | Insurer unnamed | Caregiver reports expected morning discharge, hospital bill submission to insurance at 2:30 PM, and eventual transfer admission at 9 PM. |
| [case-042](https://www.reddit.com/r/InsuranceTroubleIndia/comments/1w5wtr1/planning_cataract_surgery_for_your_parents_learn/) | 2026-09-03 | Star Health | Caregiver reports an upfront cashless deposit and a three-to-four-hour final-approval wait; later describes the overall cataract claim process positively. |
| [case-043](https://www.reddit.com/r/indiahealthinsurance/comments/1wqimrh/niva_bupa_kept_our_room_entitlement_ambiguous/) | 2026-09-26 | Niva Bupa | Caregiver reports paying ₹6,214 to discharge a relative despite written room-eligibility assurances, and disputes the accommodation deduction. |
| [case-044](https://www.reddit.com/r/InsuranceTroubleIndia/comments/1t8adn6/star_health_insurance_rejected_my_claim_urgent/) | 2026-05-09 | Star Health | Caregiver disputes ₹54,000 post-hospitalization expenses reduced to about ₹10,500, reporting generic explanations and disputed expense-date exclusions. |
| [case-045](https://www.reddit.com/r/InsuranceTroubleIndia/comments/1tar7gp/icici_lombard_denied_claim/) | 2026-05-12 | ICICI Lombard | Caregiver reports ₹80,000 post-hospitalization expenses reduced to ₹42,000 and disputes a physiotherapy deduction despite submitting prescription and invoice. |
| [case-046](https://www.reddit.com/r/personalfinanceindia/comments/1sntpmc/infosys_corporate_insurance_efhip_my_experience/) | 2026-04-17 | Go Digit / Medi Assist | Caregiver reports document delays and denial under corporate cover, and says two additional hospital-rent days were paid because of insurance delay. |
| [case-047](https://www.reddit.com/r/InsuranceTroubleIndia/comments/1vimd07/corporate_health_insurance_maternity_claim_labour/) | 2026-08-08 | Insurer unnamed | Caregiver disputes maternity labour-suite charges excluded after partial cashless payment and reconsideration, questioning the room-rent and package treatment. |
| [case-048](https://www.reddit.com/r/indiahealthinsurance/comments/1w19wmz/robotic_surgery_cost_rejected_by_hdfc_ergo/) | 2026-08-29 | HDFC ERGO | Caregiver reports robotic knee-surgery charges excluded from a parent’s claim, with the balance paid to obtain discharge despite unclear explanation. |
| [case-049](https://www.reddit.com/r/InsuranceTroubleIndia/comments/1u96hac/care_supreme_health_insurance_partially_rejected/) | 2026-06-18 | Care Health | Caregiver disputes partial payment for a mother’s robotic gallbladder surgery after the insurer questioned its advantage over conventional laparoscopy. |

All 13 dates were checked against public top-level Reddit JSON timestamps. The machine-readable artifact records the numeric timestamp, UTC conversion and direct evidence URL. It retains unknown insurers/TPAs as unknown. The ambiguous label “Star India health insurance” is preserved as reported rather than mapped to Star Health.

## Existing-record corrections

| Existing case | Verified publication date (UTC) | Effect |
|---|---|---|
| [case-032](https://www.reddit.com/r/indiahealthinsurance/comments/1wwxlde/care_health_rejected_my_mothers_19l_claim_because/.json?limit=0) | 2026-10-03 | Exact date resolved; document dispute remains adjacent. |
| [case-033](https://www.reddit.com/r/indiahealthinsurance/comments/1wwmycl/care_health_insurance_happy_to_take_your_premium/.json?limit=0) | 2026-10-03 | Exact date resolved; document dispute remains adjacent. |
| [case-034](https://www.reddit.com/r/indiahealthinsurance/comments/1wwgolq/my_experience_with_hdfc_ergo/.json?limit=0) | 2026-10-03 | Exact date resolved; positive final two-hour discharge experience and planned consumables reimbursement, without a disputed final deduction, remain adjacent. |
| [case-035](https://www.reddit.com/r/indiahealthinsurance/comments/1wjops4/denied_cashless_authorization_by_hdfc_policy/.json?limit=0) | 2026-09-18 | Exact date resolved. Existing core report describes repeated discharge-day wait instructions and conversion to cash payment to leave. |
| [case-036](https://www.reddit.com/r/IndianPersonalFinance/comments/1ue7347/why_is_health_insurance_a_scam_in_india_my_story/.json?limit=0) | 2026-06-24 | Exact date resolved; reimbursement delays remain adjacent. |
| [case-030](https://www.reddit.com/r/indiahealthinsurance/comments/1vojzq8/icici_lombard_rejected_our_claim/.json?limit=0) | 2026-08-14 | Scope correction: author explicitly reports waiting a few hours despite sister being ready for discharge. Medical event was late 2025; publication date is within the established window. |

## Counting and classification safeguards

- Count one top-level case even when the author describes several family claims. Author clarification comments support that same case and add zero to the post count.
- The September cataract case consolidates the August 27 precursor and September 2 cross-post. Its positive overall assessment and refunded deposit are retained; the three-to-four-hour wait alone does not establish a statutory violation.
- The May 9 Star case consolidates its May 10 cross-post. Post-hospitalization partial-payment disputes qualify under the same deduction-dispute rule as existing records; simple reimbursement delays remain excluded.
- Maternity and Care robotic cases have stated insurer reasons that the authors contest. They are labeled deduction disputes, never unexplained deductions or proven improper charges.
- The hospital-paperwork cases distinguish hospital submission delay from insurer decision time. The June 2 transfer account includes unrelated clinical allegations; only the discharge workflow is summarized.
- The [EFHIP author clarification](https://www.reddit.com/r/personalfinanceindia/comments/1sntpmc/comment/ogpdsj7/) supplies Go Digit, Medi Assist and the reported two extra rent days. This supports a paid-extra-stay self-report, not an independent finding of liability.
- Only short researcher paraphrases are retained, each at most 25 words. No names of patients, usernames, claim/policy identifiers or screenshots are stored.

## Remaining gap and stopgap

The strict target remains unmet at 27 after corrections. Searches of public X results and LocalCircles produced no qualifying individual report with both an exact date and direct firsthand experience in this window. [LocalCircles consumables discussion](https://www.localcircles.com/a/public/post/excessive-charging-by-hospitals-for-medical-consumables/6838473cy) requests submissions; it is not itself an individual claim report. Removed posts, comment-only accounts, prospective preauthorization questions and older posts were not promoted to eligible records to reach the quota.

Use 27 as the documented strict total only when applying the explicit amendments; otherwise the two JSON files together contain 25 currently qualifying records. Keep the shortfall visible and collect at least three further unique, exact-dated firsthand top-level posts. The selected problem-oriented sample has no exposure denominator and cannot support failure rates or market rankings. Any cluster heading must say **most reported by users** and retain the sample qualifier.

## Verification

JSON parsing, unique Reddit post IDs against the original 36 records, UTC timestamp-to-date conversion, window membership, snippet length and projected counts passed. Only research/user-evidence-additional.json and this addendum were written. No original data, commits or outreach were made.
