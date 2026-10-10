# NL-48 M8 source checks

Checked **10 October 2026**. The M8 answer key covers **810 published bucket cells in 29 source PDFs**, with zero differences against the reviewed source values. Combined with the original 120-cell / five-PDF key, the reproducible check covers **930 cells across 34 PDFs**. It is a source-transcription check, not a market-completeness certification.

| Insurer | Published cells in answer key | Scope |
|---|---:|---|
| Aditya Birla Health | 24 | Selected source table visually checked with identity, period, policy/request headers and six buckets. |
| Care Health Insurance (Formely Religare Health Insurance Co. Ltd.) | 24 | Selected source table visually checked with identity, period, policy/request headers and six buckets. |
| Generali Central | 24 | Selected source table visually checked with identity, period, policy/request headers and six buckets. |
| Liberty General Insurance | 192 | All in-house and 14 TPA cashless tables reviewed. |
| Magma General Insurance Limited | 12 | Selected source table visually checked with identity, period, policy/request headers and six buckets. |
| National Insurance | 24 | Every Medi Assist cashless bucket across pages 2-3; blank >24h cells retained as null. |
| Navi General Insurance | 18 | All three source tables reviewed; only nonzero distributions appear in the answer key. |
| The Oriental Insurance | 48 | Medi Assist and MDIndia cashless tables; in-house Nil table excluded. |
| Royal Sundaram General Insurance Co.Limited | 36 | Medi Assist and MDIndia cashless tables. |
| SBI General | 24 | Selected source table visually checked with identity, period, policy/request headers and six buckets. |
| Shriram General | 12 | Selected source table visually checked with identity, period, policy/request headers and six buckets. |
| Star Health and Allied | 24 | Selected source table visually checked with identity, period, policy/request headers and six buckets. |
| United India Insurance | 348 | All 15 TPA cashless tables reviewed; 348 published cells plus 12 omitted all-zero LINK-K individual cells visually checked. |

Scanned National, Oriental, Magma, Royal Sundaram and United India values were visually checked; OCR text served only as a staging aid. MDIndia Oriental page 8 was rotated upright for review. Blank cells were not converted into zeros. No denominator was taken from policy counts, covered lives or payment tables.

SBI cashless denominators are the totals printed with each retained TAT column. Its Volo table is excluded because counts, percentages and a printed total conflict. Galaxy's annual source was re-downloaded from its browser archive and had the same SHA256 as the earlier PDF; its percentage-header/count-like-cell conflict persists. No unit conversion was inferred.

The [machine-readable M8 answer key](nl48-m8-qa.json), [extraction manifest](nl48-extraction.json), [browser retry register](nl48-browser-retry.json) and [filing audit](../data/filings.json) preserve source references. Downloaded PDFs, browser snapshots and rendered pages remain ignored local research artifacts.

```sh
python3 scripts/parse-nl48.py
python3 scripts/parse-nl48.py --check
python3 scripts/parse-nl48.py --check --verify-pdfs
```

The parser checks both answer keys and the JSON/CSV rebuild; the optional source check verifies 55 included local PDF hashes. ICICI Lombard remains explicitly marked as a web-reader source without a local hash. CSV uses LF line endings.
