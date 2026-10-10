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
