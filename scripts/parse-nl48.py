#!/usr/bin/env python3
"""Rebuild reviewed NL-48 facts without a network connection or third-party packages.

Optional PDF text staging needs PyMuPDF (build time only). Staged candidates are
never published automatically: table identity, period, units and columns need review.
"""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
BUCKETS = ("lt1h", "h1_2", "h2_6", "h6_12", "h12_24", "gt24h")
FIELDS = ("id", "insurer_id", "insurer", "tpa", "period", "request_type",
          "policy_type", *BUCKETS, "unit", "sample_size", "source_url",
          "source_page", "retrieved_on", "document_url")


def normalize(tables):
    rows, exclusions = [], []
    for table in tables:
        columns = table.get("columns") or [
            {"tpa": table["tpa"], "policy_type": policy, "request_type": request}
            for policy in ("individual", "group")
            for request in ("preauth", "discharge")
        ]
        assert len(table["values"]) == 6, table["table_id"]
        assert all(len(v) == len(columns) for v in table["values"]), table["table_id"]
        for index, column in enumerate(columns):
            values = [row[index] for row in table["values"]]
            reason = table.get("excluded_columns", {}).get(str(index))
            # All-zero/absent columns do not describe a nonempty claim population.
            if reason or not any(v for v in values if v is not None):
                exclusions.append({"table_id": table["table_id"], "column": index,
                                   "reason": reason or "All buckets zero or absent; no usable distribution."})
                continue
            assert table["unit"] in ("percent", "count")
            assert all(v is None or isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v >= 0 for v in values)
            if table["unit"] == "percent":
                assert all(v is None or v <= 100 for v in values), table["table_id"]
                # Preserve rounding and unknowns. Only complete rows can pass a
                # 100 +/- 1 check; an incomplete subtotal is not a full total.
                total = sum(v for v in values if v is not None)
                assert total <= 101 + 1e-9, table["table_id"]
                if all(v is not None for v in values):
                    assert total >= 99 - 1e-9, table["table_id"]
            tpa = column["tpa"].strip()
            slug = re.sub(r"[^a-z0-9]+", "-", tpa.lower()).strip("-")
            if ("in-house" in slug or "inhouse" in slug) and "consolidated" not in slug:
                tpa, slug = "In-house", "inhouse"
            rows.append({
                "id": f"{table['insurer_id']}-{table['period'].lower()}-{slug}-{column['policy_type']}-{column['request_type']}",
                "insurer_id": table["insurer_id"], "insurer": table["insurer"],
                "tpa": tpa, "period": table["period"], **{k: column[k] for k in ("request_type", "policy_type")},
                **dict(zip(BUCKETS, values)), "unit": table["unit"],
                "sample_size": column.get("sample_size"), "source_url": table["source_url"],
                "source_page": table["page"], "retrieved_on": table["retrieved_on"],
                "document_url": table.get("document_url", table["source_url"]),
            })
    rows.sort(key=lambda row: (row["insurer_id"], row["tpa"], row["policy_type"], row["request_type"]))
    assert len({row["id"] for row in rows}) == len(rows), "Duplicate row identity"
    return rows, exclusions


def extract_candidates(pdf):
    try:
        import fitz
    except ImportError as exc:
        raise SystemExit("PDF staging needs the build-time PyMuPDF package; normal rebuilds do not.") from exc
    patterns = (r"Within\s*<\s*1\s*hour", r"Within\s*1\s*[-–]\s*2\s*hours",
                r"Within\s*2\s*[-–]\s*6\s*hours", r"Within\s*6\s*[-–]\s*12\s*hours",
                r"Within\s*12\s*[-–]\s*24\s*hours", r">\s*24\s*hours")
    candidates = []
    for number, page in enumerate(fitz.open(pdf), start=1):
        text = page.get_text(sort=True)
        cells = []
        for pattern in patterns:
            match = re.search(pattern + r"([^\n]*)", text, re.I)
            values = match.group(1).split() if match else []
            if len(values) != 4 or not all(re.fullmatch(r"(?:\d+(?:\.\d+)?%?|[-–]|NIL|NA)", v) for v in values):
                break
            cells.append([None if v in ("-", "–", "NIL", "NA") else float(v.rstrip("%")) for v in values])
        if len(cells) == 6:
            candidates.append({"page": number, "values": cells, "review_status": "UNREVIEWED"})
    print(json.dumps(candidates, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify checked-in JSON and CSV match reviewed facts")
    parser.add_argument("--verify-pdfs", action="store_true", help="Verify cached PDFs against recorded SHA256 hashes")
    parser.add_argument("--extract-pdf", type=Path, help="Print unreviewed four-column PDF candidates; never publish")
    args = parser.parse_args()
    if args.extract_pdf:
        extract_candidates(args.extract_pdf)
        return
    tables = json.loads((ROOT / "research/nl48-extraction.json").read_text())
    if args.verify_pdfs:
        files = {t["file"]: t["sha256"] for t in tables if t.get("sha256")}
        for name, expected in files.items():
            path = ROOT / ".cache/research" / f"{name}.pdf"
            assert path.exists(), f"Missing cached source: {path}"
            assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Source changed: {name}"
        print(f"Verified {len(files)} cached source hashes; unhashed web-reader sources are explicitly marked.")
    rows, exclusions = normalize(tables)
    if args.check:
        by_id = {row["id"]: row for row in rows}
        for qa_path in sorted((ROOT / "research").glob("nl48*qa.json")):
            qa = json.loads(qa_path.read_text())
            checked = 0
            for check in qa["checks"]:
                if check.get("sha256"):
                    assert any(t.get("file") == check["file"] and t["page"] == check["source_page"] and t.get("sha256") == check["sha256"] for t in tables), f"Stale QA source hash: {check['file']}"
                for column in check["columns"]:
                    actual = [by_id[column["row_id"]][key] for key in BUCKETS]
                    assert actual == column["expected_buckets"], f"Source spot-check mismatch: {column['row_id']}"
                    for key in ("unit", "sample_size", "document_url", "source_page"):
                        if key in column:
                            assert by_id[column["row_id"]][key] == column[key], f"Stale source review: {column['row_id']} {key}"
                    checked += len(BUCKETS)
            assert checked == qa["cells_checked"], f"Stale QA cell count: {qa_path.name}"
            print(f"{qa_path.name}: source spot-check answer key matches {checked} cells.")
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    artifacts = {"data/nl48.json": json.dumps(rows, indent=2) + "\n", "data/nl48.csv": output.getvalue()}
    for name, value in artifacts.items():
        path = ROOT / name
        if args.check:
            assert path.read_bytes() == value.encode(), f"Stale artifact: {name}"
        else:
            path.write_bytes(value.encode())
    print(f"{'Checked' if args.check else 'Built'} {len(rows)} rows from {len({r['insurer_id'] for r in rows})} insurers; {len(exclusions)} absent/inconsistent columns omitted.")


if __name__ == "__main__":
    main()
