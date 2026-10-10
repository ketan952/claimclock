# NL-48 source spot check

Checked 10 October 2026. Five original insurer PDFs were rendered and compared with the normalized dataset. For each selected in-house table, the reviewer checked the period, policy/request column placement, all six timing buckets and all four distributions. The check covers **120 cells across 20 rows, with zero transcription differences**. It does not certify complete market coverage or every table in the dataset.

| Source PDF | PDF page | Cells checked | Differences | Source detail preserved |
|---|---:|---:|---:|---|
| [HDFC ERGO FY26 in-house](https://customer-portal-assets.hdfcergo.com/documents/InhouseFY26-962262549973.pdf) | 2 | 24 | 0 | Group discharge under one hour is 59%. |
| [Universal Sompo FY26](https://www.universalsompo.com/publicdisclosure/assets/files/2025-2026/Q4/NL-48%20-%20DISCLOSURES%20ON%20QUANTITATIVE%20AND%20QUALITATIVE%20PARAMETERS%20OF%20HEALTH%20SERVICES%20RENDERED%20%28ANNUAL%20DISCLOSURE%29.pdf) | 1 | 24 | 0 | Individual discharge 2–6 hours is 43%; its rounded buckets total 99%. |
| [Niva Bupa FY26](https://transactions.nivabupa.com/pages/doc/pub-dis/quarterly-reports/Website-Public-Disclosures-Mar-2026.pdf?v=1.0) | 52 | 24 | 0 | Four dashes in the final bucket remain null. |
| [Bajaj FY26 in-house](https://www.bajajgeneralinsurance.com/download-documents/financialinformation_general/2025-26q4/NL-48.pdf) | 2 | 24 | 0 | Individual discharge first buckets are 53.72%, 36.69%, 8.96%. |
| [Go Digit FY26](https://www.godigit.com/content/dam/godigit/general/financials/public-disclosure/fy-25-26/quarter-4/nl-48-disclosures-on-quantitative-and-qualitative-parameters-of-health-services-rendered.pdf) | 6 | 24 | 0 | Group discharge rounded buckets total 99.9%. |

The machine-readable answer key and compared values are in [nl48-qa.json](nl48-qa.json). Rendered source images and downloaded PDFs remain in ignored `.cache/research/qa/` and `.cache/research/`; they are not republished in the repository. Source hashes are retained in [nl48-extraction.json](nl48-extraction.json).

Additional rendered-page reviews covered IFFCO Tokio in-house, Tata AIG's multi-provider column mapping, New India's Health Insurance TPA of India and Park tables, IndusInd in-house, Acko in-house/FHPL, Narayana's combined table, and the malformed Galaxy and Universal Sompo tables. An extra extracted zero outside IFFCO's table was discarded after visual review. These checks inform extraction decisions but are not added to the five-PDF score above.

Reproducibility checks passed:

```sh
python3 scripts/parse-nl48.py --check
python3 scripts/parse-nl48.py --check --verify-pdfs  # requires locally cached originals
node scripts/validate-data.mjs
```

Known gaps and exclusions are itemized for all 32 insurers in [filings.json](../data/filings.json). Scanned or inconsistent source data was not guessed. The five-PDF spot check does not resolve these gaps.

## M10: unusual distributions and per-row validation

Reverified **10 October 2026**. Fresh downloads from the three official PDF URLs below matched the SHA256 hashes already recorded in the extraction manifest. The six relevant pages were rendered, and the reviewer independently transcribed all six timing buckets in all four policy/request columns: **144 cells across 24 rows, zero transcription differences and zero corrected values**. The answer key, source hashes, exact URLs/pages, and the computed review queue are in [nl48-m10-qa.json](nl48-m10-qa.json). Downloaded PDFs and rendered crops remain in ignored `.cache/m10-nl48/` and `.cache/research/`.

| Requested comparison | Source recheck | Outcome |
|---|---|---|
| ManipalCigna individual discharge, >6 h **0.21–45%** | [FY2025–26 PDF](https://www.manipalcigna.com/documents/20124/0/Public+Disclosure+March-26+-Final.pdf/6578a708-d64f-06fd-0ff5-2abcaa77e533?t=1782738561784), Medi Assist p49 and in-house p59 | Medi Assist publishes 0.21%, 0%, 0% in the three late buckets; in-house publishes 44%, 1%, 0%. The reported channel endpoints are therefore 0.21% and 45%. Retained as published. |
| Raheja QBE individual discharge, 1–2 h **19–100%** | [FY2024–25 PDF](https://www.rahejaqbe.com/uploads/images/public-disclosures/pdf/2024-25/quarter4/NL-48-Disclosures-on-Quantitative-and-Qualitative-Parameters-of-Health-Service-New.pdf), Mediassist p1 and Paramount p9 | The values are correctly placed under individual discharge: Mediassist 19%; Paramount 100%. Paramount also publishes 100% for individual preauthorisation. Retained, with a reverified extreme-value flag. The displayed period remains FY2024–25. |
| Universal Sompo individual discharge, 2–6 h **0–43%** | [FY2025–26 PDF](https://www.universalsompo.com/publicdisclosure/assets/files/2025-2026/Q4/NL-48%20-%20DISCLOSURES%20ON%20QUANTITATIVE%20AND%20QUALITATIVE%20PARAMETERS%20OF%20HEALTH%20SERVICES%20RENDERED%20%28ANNUAL%20DISCLOSURE%29.pdf), in-house p1 and HealthIndia p4 | HealthIndia publishes 0% and in-house 43%. The in-house individual-discharge buckets are 29%, 27%, 43%, 0%, 0%, 0%, summing to 99% despite the printed total of 100%. Original rounding is preserved; no renormalisation. Other channels tied at 0% are also named by the Index. |

These six tables do not disclose the denominators of their cashless timing distributions. Counts in adjacent payment/repudiation or lives tables are different measures and are not substituted. Raheja Paramount's individual lives/policy entries are blank, while its timing table explicitly gives the individual percentages; that surrounding blank is not treated as a cashless denominator or as proof that the timing population is empty. The source clock caveats remain visible. Reverification confirms faithful transcription, not the insurer's underlying records, the size of a cohort, or legal compliance.

The parser, data validator and Index now check each complete percentage row against **100±1 percentage points**, accepting 99 through 101 inclusively and rejecting invalid, negative, nonfinite or >100 cells. Unknown cells remain null: an incomplete row cannot be certified as a complete total, even when the known subtotal is 100. A known subtotal above 101 fails. All **456 complete rows pass**, and **14 rows remain incomplete**; none fails. Values and source rounding are unchanged.

A row is flagged for manual re-verification if its three >6-hour buckets total **more than 10%**, or if **any individual bucket equals 100%**. If a late component is unknown but the known late subtotal already exceeds 10%, the flag still applies; the combined >6-hour value remains unknown. The current dataset triggers **76 row flags: 7 reverified by this M10 check and 69 pending M10 re-verification**. Pending does not mean the original extraction was unreviewed or wrong. Thresholds are review triggers, not exclusions. The previously reviewed source values remain visible with pending/verified status; no extreme value is suppressed.

The main comparison identifies every channel tied at each range endpoint through its “Channel endpoints” disclosure; source-row checks identify each included channel, its total check and any review flag. Insurer detail pages show the same check on each underlying row, with the original source-page link. English and Hindi labels preserve proper channel names. A reverified badge is valid only while the row's ID, six cells, unit, denominator, document URL and source page still match the recorded answer key; changing these clears that status. The answer-key hash must also match the extraction manifest during parser checks.

Validation: `npm run check`, the targeted Index comparison tests, and `python3 scripts/parse-nl48.py --check --verify-pdfs` pass. The latter verifies all 55 cached source hashes and the original, M8 and M10 answer keys. The 144 M10 cells are a targeted recheck, partly overlapping earlier checks; do not add them as newly unique market coverage.
