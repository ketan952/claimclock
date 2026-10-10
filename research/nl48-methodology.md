# ClaimClock NL-48 methodology

Snapshot retrieved **10 October 2026**. This release contains **470 distributions from 30 insurers**, with a filing audit for **32 insurers** in the retail-health contact roster. It is a partial research snapshot, not a complete census or a ranking. Twenty-nine represented insurers have FY2025-26 data; Raheja QBE has FY2024-25, the newest NL-48 located in its archive. Missing data does not mean good or bad performance, or that an insurer failed to publish a required filing.

## Source selection and provenance

We searched current insurer public-disclosure archives and official PDF links, starting with large health insurers and then covering the rest of the roster. The latest annual NL-48 that could be established was preferred over older search snippets and quarterly pages without NL-48. The reporting date inside each included PDF determines `period`; a file's upload date does not. We did not establish a premium-ranked top-15 coverage guarantee.

Each row records the insurer, named service provider, policy category, request category, six bucket values, unit, sample size when disclosed, source URL, one-based PDF page and retrieval date. `source_url` points to an insurer domain. `document_url` points to the precise PDF where a stable document URL exists. Insurer-linked CDNs retain the official archive as `source_url`. Royal Sundaram serves PDF blobs: its `document_url` opens the exact annual archive, where the reader selects View beside the named TPA; the manifest records the selected TPA and source hash. Liberty's tokenized PDF URL may expire, so its archive and year/quarter navigation remain recorded. Fifty-five included PDF files have SHA256 hashes in the extraction manifest. ICICI Lombard's PDF was readable through the web PDF reader while direct local requests returned 403; its six included distributions remain without a local hash.

The row grain is **insurer × reporting period × service provider × individual/group policy × preauth/discharge request**. Current names and shared roster IDs are used for insurers, including Bajaj General and IndusInd General. TPA names mostly retain source wording; in-house names and a truncated former-name suffix were normalized. TPA spellings across insurers are not guaranteed to identify the same legal entity. Chola, Narayana and Care report combined tables; these are explicitly labelled without inventing TPA splits. Care lists 12 TPAs elsewhere in the source, so its consolidated table is not labelled in-house.

## Normalization rules

| Field | Meaning |
|---|---|
| `lt1h` | Source's under-one-hour bucket |
| `h1_2` | 1–2 hours |
| `h2_6` | 2–6 hours |
| `h6_12` | 6–12 hours |
| `h12_24` | 12–24 hours |
| `gt24h` | Over 24 hours |
| `unit` | `percent` or `count`; all currently published rows are percentages |
| `sample_size` | Exact denominator for this cashless distribution, when disclosed; SBI supplies 22 usable column totals, other rows remain null |
| `source_page` | One-based page of the actual PDF, not a page number printed inside an attachment |

Published percentages and rounding are retained, including totals such as 99, 100.02 or 101. We never rescale them to 100. Dashes and `NA`/`NIL` cells become null, not zero. Entire all-zero or all-absent distributions are omitted because the source does not establish a meaningful nonempty cashless population for that column. Zero entries inside a nonempty distribution remain zero. CSV blank cells represent JSON null.

Policy counts, covered lives, reimbursement claim counts and total paid claims are not cashless denominators. We did not substitute any of these for `sample_size`, estimate a denominator or infer missing units. SBI's sample sizes come from totals printed in the cashless TAT table itself. Its printed bucket counts are retained in the manifest for audit while normalized rows retain the source percentages. One contradictory SBI Volo table is excluded. Negative policy or covered-lives figures elsewhere in Navi and Liberty filings are not used as cashless denominators. Galaxy's conflicting percentage headers and count-like values remain excluded rather than reinterpreted.

The published discharge clock is measured from receipt of the discharge bill by the TPA to sending final discharge authorization/summary to the hospital, as specified in the source footnotes. This differs from a patient's readiness-to-leave time. The **2–6 hour bucket crosses the three-hour regulatory threshold**, so these data cannot reveal the proportion of three-hour breaches. They also cannot establish a mean or median wait from these buckets, particularly with an open-ended final bucket. We do not label insurers as violating a rule or rank them using these data.

## Extraction and reproduction

The review pipeline downloads originals to ignored `.cache/research`, extracts PDF text, reviews table identity, reporting period, units and column positions, and records six-row matrices in [nl48-extraction.json](nl48-extraction.json). Complex tables receive explicit column mappings or reviewed transcription; ambiguous tables remain excluded. The manifest stores source URLs, pages, source hashes, methods and explicit column exclusions. National's continued table records cell-level page provenance. Factual table values are published; copyrighted PDF files and page images are not committed.

The M8 retry pass used fresh, isolated **headed Chrome browsers through Playwright** for all 15 previously missing insurers. Real page navigation, rendered DOM, year/quarter selection, popup/download actions and PDF blobs recovered sources that plain requests missed. Subsequent downloads and PDF parsing followed browser discovery. No existing user tabs or browser profile were read. The [retry register](nl48-browser-retry.json) records each path and outcome. A fresh deep link into Oriental initially sent an empty locale and displayed no data; selecting English on its homepage resolved the archive. This was a collection obstacle, not an absent filing.

The normalized JSON and CSV are rebuilt with Python's standard library:

```sh
python3 scripts/parse-nl48.py
python3 scripts/parse-nl48.py --check
```

Optional source verification checks cached originals against recorded hashes:

```sh
python3 scripts/parse-nl48.py --check --verify-pdfs
```

For future collection, the staging parser can identify ordinary four-column tables:

```sh
python3 scripts/parse-nl48.py --extract-pdf .cache/research/example.pdf
```

This staging operation requires build-time PyMuPDF and prints **unreviewed** candidates. It does not publish rows. A reviewer must inspect the original PDF and add reviewed matrices/metadata to the manifest, retaining nulls and excluding inconsistencies. Obtain source files from the exact `document_url` in [filings.json](../data/filings.json). PDF parsing libraries are not runtime dependencies. Updating a PDF or receiving a successful HTTP response does not itself establish that its contents have been reverified.

## Coverage and gaps

The [filing audit](../data/filings.json) and [readable gap list](filing-gaps.md) record every insurer searched, source documents acquired, included pages, published row counts, status and follow-up. Sixteen insurers have reviewed coverage of the located current filing, thirteen have partial current coverage, and Raheja QBE has an older located annual filing. Galaxy has inconsistent units and Prudential HCL has no located annual NL-48. These statuses describe this collection pass. A represented insurer may have only group data or limited TPA coverage; representation does not establish a comparable insurer-wide individual-discharge figure.

Specific exclusions include Universal Sompo's Vidal page 3 (district names where bucket labels should be), Zuno Park's individual columns (nonzero buckets with blank totals and no individual policies), Zurich Kotak Medi Assist discharge columns (2% and 98% column totals), SBI Volo's conflicting counts/totals, and Galaxy's four-digit values under percentage headers. National has one of 17 scanned TPA filings reviewed; Oriental has two of 17 TPAs reviewed, with its in-house Nil table omitted. Magma and Royal Sundaram each have two TPAs reviewed, with all-zero in-house tables omitted. All 15 United India TPA scans were visually reviewed. Bajaj TPA files, some New India/ManipalCigna tables, and ICICI pages after page 2 still need extraction. Exact remaining gaps are listed in the audit.

The original five-PDF answer key checks 120 cells. M8 adds a 29-PDF answer key covering 810 published bucket cells, including blanks preserved as null: **930 checked cells across 34 source PDFs, with zero transcription differences**. See the [original QA report](nl48-qa.md), [M8 QA report](nl48-m8-qa.md) and both machine-readable answer keys. These checks cover the selected tables and do not certify market completeness or every published table.

When using the dataset, keep periods, policy categories and service providers visible. Never average percentages across providers without their matching cashless denominators. Show missing data explicitly, and link the source and filing limitations beside any comparison.
