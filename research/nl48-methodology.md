# ClaimClock NL-48 methodology

Snapshot retrieved **10 October 2026**. This release contains **253 distributions from 17 insurers**, with a filing audit for **32 insurers** in the retail-health contact roster. It is a partial research snapshot, not a complete census or a ranking. Sixteen represented insurers have FY2025-26 data; Raheja QBE has FY2024-25, the newest NL-48 located in its archive. Missing data does not mean good or bad performance, or that an insurer failed to publish a required filing.

## Source selection and provenance

We searched current insurer public-disclosure archives and official PDF links, starting with large health insurers and then covering the rest of the roster. The latest annual NL-48 that could be established was preferred over older search snippets and quarterly pages without NL-48. The reporting date inside each included PDF determines `period`; a file's upload date does not. We did not establish a premium-ranked top-15 coverage guarantee.

Each row records the insurer, named service provider, policy category, request category, six bucket values, unit, sample size when disclosed, source URL, one-based PDF page and retrieval date. `source_url` points to an insurer domain. `document_url` points to the precise PDF; Acko and Narayana host their documents on CDNs linked from their official disclosure pages, so their `source_url` is the official page. Most sources have a SHA256 hash in the extraction manifest. ICICI Lombard's PDF was readable through the web PDF reader while direct local requests returned 403; its six included distributions are marked without a local hash.

The row grain is **insurer × reporting period × service provider × individual/group policy × preauth/discharge request**. Current names and shared roster IDs are used for insurers, including Bajaj General and IndusInd General. TPA names mostly retain source wording; only in-house names and a truncated former-name suffix were normalized. TPA spellings across insurers are not guaranteed to identify the same legal entity. Chola reports a consolidated in-house/TPA table and Narayana reports one table for five named TPAs; these are explicitly labeled combined tables, without inventing TPA splits.

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
| `sample_size` | Exact denominator for this cashless distribution, when disclosed; currently null throughout |
| `source_page` | One-based page of the actual PDF, not a page number printed inside an attachment |

Published percentages and rounding are retained, including totals such as 99, 100.02 or 101. We never rescale them to 100. Dashes and `NA`/`NIL` cells become null, not zero. Entire all-zero or all-absent distributions are omitted because the source does not establish a meaningful nonempty cashless population for that column. Zero entries inside a nonempty distribution remain zero. CSV blank cells represent JSON null.

Policy counts, covered lives, reimbursement claim counts and total paid claims are not cashless denominators. We did not substitute any of these for `sample_size`, estimate a denominator, calculate weighted aggregates, or infer missing units. Exact count-based tables may be supported in future; Galaxy's conflicting percentage headers and count-like values were excluded rather than reinterpreted.

The published discharge clock is measured from receipt of the discharge bill by the TPA to sending final discharge authorization/summary to the hospital, as specified in the source footnotes. This differs from a patient's readiness-to-leave time. The **2–6 hour bucket crosses the three-hour regulatory threshold**, so these data cannot reveal the proportion of three-hour breaches. They also cannot establish a mean or median wait from these buckets, particularly with an open-ended final bucket. We do not label insurers as violating a rule or rank them using these data.

## Extraction and reproduction

The review pipeline downloads originals to ignored `.cache/research`, extracts PDF text, reviews table identity, reporting period, units and column positions, and records six-row matrices in [nl48-extraction.json](nl48-extraction.json). Complex tables receive explicit column mappings or reviewed transcription; ambiguous tables remain excluded. The manifest stores source URLs, pages, source hashes, methods and explicit column exclusions. Factual table values are published; copyrighted PDF files and page images are not committed.

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

The [filing audit](../data/filings.json) and [readable gap list](filing-gaps.md) record every insurer searched, source documents acquired, included pages, published row counts, status and follow-up. Eight insurers have reviewed coverage of the located current filing, eight have partial current coverage, and Raheja QBE has an older located annual filing. The other fifteen insurers have no numerical rows in this release: nine current sources were not located, four could not be retrieved, one source set was scanned and one had inconsistent units. These statuses describe this collection pass.

Specific excluded evidence includes Universal Sompo's Vidal page 3 (district names where bucket labels should be), Zuno Park's individual columns (nonzero buckets with blank totals and no individual policies), and Zurich Kotak Medi Assist discharge columns (2% and 98% column totals). National Insurance's 17 downloaded current TPA PDFs had no extractable text. Galaxy's FY26 page 53 used four-digit values under percentage headers. Bajaj TPA files, some New India/ManipalCigna tables, and ICICI pages after page 2 need further reviewed extraction. Star Health, Care, United India and Royal Sundaram were blocked or timed out during collection. Other unresolved archives are listed individually in the audit.

Five insurer PDFs were visually spot-checked across 120 source cells, with **zero transcription differences**, including four source dashes preserved as null. See [the QA report](nl48-qa.md) and [machine-readable answer key](nl48-qa.json). This result applies to those checked tables and does not certify market completeness.

When using the dataset, keep periods, policy categories and service providers visible. Never average percentages across providers without their matching cashless denominators. Show missing data explicitly, and link the source and filing limitations beside any comparison.
