#!/usr/bin/env python3
"""
Extract AP Summary data from the ICCSD Accounts Payable Summary PDF
and output structured JSON to dashboard/src/data/fund-summary.json.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import pdfplumber

# Paths (relative to project root)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = PROJECT_ROOT / "downloads" / "Accounts Payable Summaries 20260414.pdf"
OUTPUT_PATH = PROJECT_ROOT / "dashboard" / "src" / "data" / "fund-summary.json"

# --- Regex patterns ---

# Report header date: "April 14, 2026"
HEADER_DATE_RE = re.compile(
    r"^(January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},\s+\d{4}$"
)

# Fund header: "General Fund (Fund 10):" or "School Based Health Clinics (Fund 84):"
FUND_HEADER_RE = re.compile(
    r"^(.+?)\s+\(Fund\s+(\d+)\)\s*:$"
)

# Detail line with parens: "Detailed Account Payable: March 24, 2026 ($ 48,457.75)"
DETAIL_PARENS_RE = re.compile(
    r"^Detailed Account Payable:\s+"
    r"((?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},\s+\d{4})\s+"
    r"\(\$\s+([\d,]+\.\d{2})\)$"
)

# Detail line without parens: "Detailed Account Payable: March 17, 2026 251.49"
DETAIL_BARE_RE = re.compile(
    r"^Detailed Account Payable:\s+"
    r"((?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2},\s+\d{4})\s+"
    r"([\d,]+\.\d{2})$"
)

# Subtotal line: "($ 625,035.58)" or "($ - )"
SUBTOTAL_RE = re.compile(
    r"^\(\$\s+([\d,]+\.\d{2}|-\s*)\)$"
)

# Grand total: "Total Accounts Payable ($ 2,149,920.44)"
GRAND_TOTAL_RE = re.compile(
    r"^Total Accounts Payable\s+\(\$\s+([\d,]+\.\d{2})\)$"
)


def parse_date(date_str: str) -> str:
    """Convert 'March 24, 2026' to '2026-03-24'."""
    dt = datetime.strptime(date_str, "%B %d, %Y")
    return dt.strftime("%Y-%m-%d")


def parse_amount(amount_str: str) -> float:
    """Convert '48,457.75' to 48457.75. Returns 0.0 for '- '."""
    stripped = amount_str.strip()
    if stripped == "-" or stripped == "":
        return 0.0
    return float(stripped.replace(",", ""))


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from the PDF, joining pages."""
    with pdfplumber.open(pdf_path) as pdf:
        pages_text = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
    return "\n".join(pages_text)


def parse_ap_summary(text: str) -> dict:
    """Parse the AP Summary text into structured data."""
    lines = text.split("\n")

    report_date = None
    grand_total = None
    funds = []
    current_fund = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check for report header date (standalone date line near top)
        if report_date is None:
            m = HEADER_DATE_RE.match(line)
            if m:
                report_date = parse_date(line)
                continue

        # Check for grand total
        m = GRAND_TOTAL_RE.match(line)
        if m:
            grand_total = parse_amount(m.group(1))
            continue

        # Check for fund header
        m = FUND_HEADER_RE.match(line)
        if m:
            # Save previous fund if exists
            if current_fund is not None:
                funds.append(current_fund)
            current_fund = {
                "code": m.group(2),
                "name": m.group(1),
                "total": None,
                "details": [],
            }
            continue

        # Check for detail lines (with parens first, then bare)
        m = DETAIL_PARENS_RE.match(line)
        if m and current_fund is not None:
            current_fund["details"].append({
                "reportDate": parse_date(m.group(1)),
                "amount": parse_amount(m.group(2)),
            })
            continue

        m = DETAIL_BARE_RE.match(line)
        if m and current_fund is not None:
            current_fund["details"].append({
                "reportDate": parse_date(m.group(1)),
                "amount": parse_amount(m.group(2)),
            })
            continue

        # Check for subtotal line
        m = SUBTOTAL_RE.match(line)
        if m and current_fund is not None:
            amount = parse_amount(m.group(1))
            # The last subtotal for a fund is the fund total.
            # Some funds (like Debt Service) have two "($ - )" lines:
            # one is effectively a "no details" placeholder and one is the subtotal.
            # We keep overwriting so the last one wins (which is the subtotal).
            current_fund["total"] = amount

    # Don't forget the last fund
    if current_fund is not None:
        funds.append(current_fund)

    return {
        "reportDate": report_date,
        "grandTotal": grand_total,
        "funds": funds,
    }


def validate(data: dict) -> bool:
    """Validate that fund totals sum to grand total."""
    fund_sum = sum(f["total"] for f in data["funds"])
    grand_total = data["grandTotal"]
    ok = abs(fund_sum - grand_total) < 0.01

    print(f"Report Date: {data['reportDate']}")
    print(f"Funds parsed: {len(data['funds'])}")
    print()
    for f in data["funds"]:
        detail_sum = sum(d["amount"] for d in f["details"])
        detail_match = abs(detail_sum - f["total"]) < 0.01 if f["total"] else (len(f["details"]) == 0)
        status = "OK" if detail_match else "MISMATCH"
        print(f"  Fund {f['code']:>2}: {f['name']:<45} total=${f['total']:>12,.2f}  "
              f"(details sum=${detail_sum:>12,.2f})  [{status}]")
    print()
    print(f"Sum of fund totals: ${fund_sum:>12,.2f}")
    print(f"Grand total (PDF):  ${grand_total:>12,.2f}")
    print(f"Validation: {'PASS' if ok else 'FAIL'}")

    return ok


def main():
    if not PDF_PATH.exists():
        print(f"ERROR: PDF not found at {PDF_PATH}", file=sys.stderr)
        sys.exit(1)

    text = extract_text_from_pdf(PDF_PATH)
    data = parse_ap_summary(text)

    if data["reportDate"] is None:
        print("ERROR: Could not parse report date from PDF", file=sys.stderr)
        sys.exit(1)

    if data["grandTotal"] is None:
        print("ERROR: Could not parse grand total from PDF", file=sys.stderr)
        sys.exit(1)

    ok = validate(data)

    # Write JSON output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(data, f, indent=2)
    print(f"\nWrote {OUTPUT_PATH}")

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
