#!/usr/bin/env python3
"""
ETL parser for ICCSD Board Report PDFs (Board Report-10003).

Uses a state machine to parse vendor invoices, line items, and account codes
from fixed-width monospace PDF output extracted via pdfplumber.

Outputs: dashboard/src/data/ap-line-items.json
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DOWNLOADS_DIR = Path(__file__).resolve().parent.parent / "downloads"
OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "dashboard"
    / "src"
    / "data"
    / "ap-line-items.json"
)

PDF_FILES = [
    "3-24-2026 BoardReport10003.pdf",
    "3-31-2026 BoardReport10003.pdf",
    "4-7-2026 BoardReport10003.pdf",
]

# Expected fund totals for validation
EXPECTED_FUND_TOTALS = {
    "3-24-2026 BoardReport10003.pdf": {
        "10": 48457.75,
        "21": 17595.37,
        "33": 14816.21,
        "36": 268.00,
    },
    "3-31-2026 BoardReport10003.pdf": {
        "10": 115293.98,
        "21": 26425.83,
        "33": 8652.02,
        "71": 2365.34,
    },
    "4-7-2026 BoardReport10003.pdf": {
        "10": 461283.85,
        "21": 33189.29,
        "22": 201.39,
        "31": 10961.00,
        "33": 900576.23,
        "36": 253096.63,
        "61": 175269.82,
        "71": 2500.00,
        "74": 78540.27,
        "82": 72.22,
        "84": 103.75,
    },
}

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Account code: 6 segments  NN NNNN NNNN NNN NNNN NNN  followed by amount
# Some entries have shortened segments (e.g. 3-digit building/function codes)
# so we also match a 5-segment variant: NN NNN NNN NNNN NNN
RE_ACCOUNT_LINE_6 = re.compile(
    r"(\d{2}\s+\d{4}\s+\d{4}\s+\d{3}\s+\d{4}\s+\d{3})\s+([\d,]+\.\d{2}|\([\d,]+\.\d{2}\))\s*$"
)
RE_ACCOUNT_LINE_5 = re.compile(
    r"(\d{2}\s+\d{3}\s+\d{3}\s+\d{4}\s+\d{3})\s+([\d,]+\.\d{2}|\([\d,]+\.\d{2}\))\s*$"
)

def match_account_line(line: str):
    """Try to match an account code line, handling both 5 and 6 segment variants."""
    m = RE_ACCOUNT_LINE_6.search(line)
    if m:
        return m, 6
    m = RE_ACCOUNT_LINE_5.search(line)
    if m:
        return m, 5
    return None, 0

# Vendor header: has a date MM/DD/YYYY and amount at end
# The vendor name, invoice, date, optional PO, and amount
RE_VENDOR_HEADER = re.compile(
    r"^(.+?)\s+(\S+)\s+(\d{2}/\d{2}/\d{4})\s+(?:(\S+)\s+)?([\d,]+\.\d{2}|\([\d,]+\.\d{2}\))\s*$"
)

# Fund line: "Checking N Fund: NN FUND NAME" or just "Fund: NN NAME" within a line
RE_FUND_LINE = re.compile(r"Fund:\s+(\d+)\s+(.*)")

# Totals
RE_VENDOR_TOTAL = re.compile(r"Vendor Total:\s+([\d,]+\.\d{2}|\([\d,]+\.\d{2}\))")
RE_FUND_TOTAL = re.compile(r"Fund Total:\s+([\d,]+\.\d{2}|\([\d,]+\.\d{2}\))")
RE_CHECKING_TOTAL = re.compile(r"Checking Account Total:")

# Page header lines
RE_PAGE_HEADER = re.compile(r"^IOWA CITY COMMUNITY SCHOOL Board Report")
RE_DATE_HEADER = re.compile(r"^\d{2}/\d{2}/\d{4}\s+\d+:\d+\s+(AM|PM)")
RE_COLUMN_HEADER1 = re.compile(r"^Vendor Name\s+Invoice")
RE_COLUMN_HEADER2 = re.compile(r"^Description\s+Account Number")

# Garbled header line (OCR bleed-through)
RE_GARBLED = re.compile(
    r"^[A-Za-z]{2,}[A-Z][a-z]+[A-Z].*Account\s*N"
)

# Checking line without Fund
RE_CHECKING_LINE = re.compile(r"^Checking\s+\d+\s*$")


def parse_amount(s: str) -> float:
    """Parse an amount string, handling parenthesized negatives and commas."""
    s = s.strip()
    if s.startswith("(") and s.endswith(")"):
        return -float(s[1:-1].replace(",", ""))
    return float(s.replace(",", ""))


def extract_report_date(filename: str) -> str:
    """Extract report date from filename like '3-24-2026' -> '2026-03-24'."""
    m = re.match(r"(\d+)-(\d+)-(\d{4})", filename)
    if m:
        month, day, year = m.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return ""


def is_header_line(line: str) -> bool:
    """Check if a line is part of the page header (should be skipped)."""
    return bool(
        RE_PAGE_HEADER.match(line)
        or RE_DATE_HEADER.match(line)
        or RE_COLUMN_HEADER1.match(line)
        or RE_COLUMN_HEADER2.match(line)
    )


def is_garbled_line(line: str) -> bool:
    """Detect OCR garbled lines (header bleed-through)."""
    # The garbled text pattern: mixed case jumble with Account Number embedded
    if RE_GARBLED.match(line):
        return True
    # Detect alternating-case gibberish (e.g. "IDOeWsAc rHiIpGtHi")
    # combined with "Account" keyword - this is a header bleed-through
    if "Account" in line and re.search(r"[A-Z][a-z][A-Z][a-z][A-Z]", line):
        return True
    return False


def parse_pdf(filepath: str, filename: str) -> tuple[list[dict], dict[str, float]]:
    """
    Parse a single Board Report PDF using a state machine.

    Returns:
        (invoices, fund_totals) where invoices is a list of invoice dicts
        and fund_totals maps fund code -> total amount from Fund Total lines.
    """
    report_date = extract_report_date(filename)

    # State
    current_fund = ""
    current_fund_name = ""
    current_vendor = ""
    current_invoice = ""
    current_invoice_date = ""
    current_po = None
    current_invoice_total = 0.0
    current_line_items: list[dict] = []

    all_invoices: list[dict] = []
    fund_totals: dict[str, float] = {}

    # Track computed fund totals from invoice totals
    computed_fund_totals: dict[str, float] = {}

    def flush_invoice():
        """Save the current invoice if we have one in progress."""
        nonlocal current_vendor, current_invoice, current_invoice_date
        nonlocal current_po, current_invoice_total, current_line_items
        if current_vendor and current_invoice:
            all_invoices.append(
                {
                    "vendor": current_vendor,
                    "invoice": current_invoice,
                    "invoiceDate": current_invoice_date,
                    "poNumber": current_po,
                    "invoiceTotal": current_invoice_total,
                    "fund": current_fund,
                    "fundName": current_fund_name,
                    "reportDate": report_date,
                    "sourceFile": filename,
                    "lineItems": list(current_line_items),
                }
            )
            # Accumulate computed fund total
            computed_fund_totals[current_fund] = (
                computed_fund_totals.get(current_fund, 0.0) + current_invoice_total
            )
        current_line_items = []

    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue

            lines = text.split("\n")
            i = 0
            while i < len(lines):
                line = lines[i].rstrip()

                # Skip empty lines
                if not line.strip():
                    i += 1
                    continue

                # Skip page headers
                if is_header_line(line):
                    i += 1
                    continue

                # Skip garbled lines
                if is_garbled_line(line):
                    i += 1
                    continue

                # Check for Checking Account Total (skip)
                if RE_CHECKING_TOTAL.search(line):
                    i += 1
                    continue

                # Check for Fund Total
                m_ft = RE_FUND_TOTAL.search(line)
                if m_ft:
                    flush_invoice()
                    current_vendor = ""
                    current_invoice = ""
                    amount = parse_amount(m_ft.group(1))
                    fund_totals[current_fund] = (
                        fund_totals.get(current_fund, 0.0) + amount
                    )
                    i += 1
                    continue

                # Check for Vendor Total
                m_vt = RE_VENDOR_TOTAL.search(line)
                if m_vt:
                    # Flush current invoice before processing vendor total
                    flush_invoice()
                    current_vendor = ""
                    current_invoice = ""
                    i += 1
                    continue

                # Check for Fund line (Checking N Fund: NN NAME)
                m_fund = RE_FUND_LINE.search(line)
                if m_fund:
                    flush_invoice()
                    current_vendor = ""
                    current_invoice = ""
                    current_fund = m_fund.group(1)
                    current_fund_name = m_fund.group(2).strip()
                    i += 1
                    continue

                # Check for plain Checking line (no Fund info)
                if RE_CHECKING_LINE.match(line):
                    i += 1
                    continue

                # Check for account code line (description + account + amount)
                m_acct, seg_count = match_account_line(line)
                if m_acct:
                    account_code = m_acct.group(1)
                    amount = parse_amount(m_acct.group(2))
                    # Description is everything before the account code
                    desc_end = line.index(account_code)
                    description = line[:desc_end].strip()

                    # Check if next line(s) are description continuations
                    # (no account code, no date, not a recognized line type)
                    while i + 1 < len(lines):
                        next_line = lines[i + 1].rstrip()
                        if not next_line.strip():
                            break
                        # If next line is a continuation of the description
                        # (wrapped text), it won't match any pattern
                        if (
                            not match_account_line(next_line)[0]
                            and not RE_VENDOR_HEADER.match(next_line)
                            and not RE_VENDOR_TOTAL.search(next_line)
                            and not RE_FUND_TOTAL.search(next_line)
                            and not RE_CHECKING_TOTAL.search(next_line)
                            and not RE_FUND_LINE.search(next_line)
                            and not is_header_line(next_line)
                            and not is_garbled_line(next_line)
                            and not RE_CHECKING_LINE.match(next_line)
                            and not re.search(r"\d{2}/\d{2}/\d{4}", next_line)
                        ):
                            # This is a wrapped description line - append to description
                            description = description + " " + next_line.strip() if description else next_line.strip()
                            i += 1
                        else:
                            break

                    # Parse account code segments - normalize 5-segment to 6-segment
                    parts = account_code.split()
                    if seg_count == 6:
                        building = parts[1]
                        function = parts[2]
                        program = parts[3]
                        sub = parts[4]
                        obj = parts[5]
                    else:
                        # 5-segment: NN NNN NNN NNNN NNN
                        # This appears to be a shortened format with missing
                        # leading zeros on building and function, and the
                        # program field omitted (implied 000).
                        building = parts[1].zfill(4)
                        function = parts[2].zfill(4)
                        program = "000"
                        sub = parts[3]
                        obj = parts[4]
                        # Reconstruct normalized account code
                        account_code = f"{parts[0]} {building} {function} {program} {sub} {obj}"

                    current_line_items.append(
                        {
                            "description": description,
                            "accountCode": account_code,
                            "building": building,
                            "function": function,
                            "program": program,
                            "sub": sub,
                            "object": obj,
                            "amount": amount,
                        }
                    )
                    i += 1
                    continue

                # Check for vendor header line
                m_vh = RE_VENDOR_HEADER.match(line)
                if m_vh:
                    # Save any prior invoice
                    flush_invoice()

                    vendor_name = m_vh.group(1).strip()
                    invoice_num = m_vh.group(2).strip()
                    date_str = m_vh.group(3)
                    po_number = m_vh.group(4)
                    inv_total = parse_amount(m_vh.group(5))

                    # Convert date from MM/DD/YYYY to YYYY-MM-DD
                    date_parts = date_str.split("/")
                    invoice_date = f"{date_parts[2]}-{date_parts[0]}-{date_parts[1]}"

                    # Check if next line(s) are invoice number continuations
                    # (wrapped invoice number or vendor name continuation)
                    while i + 1 < len(lines):
                        next_line = lines[i + 1].rstrip()
                        if not next_line.strip():
                            break
                        # A continuation line for vendor/invoice won't have
                        # an account code, date, or be a recognized type
                        if (
                            not match_account_line(next_line)[0]
                            and not RE_VENDOR_HEADER.match(next_line)
                            and not RE_VENDOR_TOTAL.search(next_line)
                            and not RE_FUND_TOTAL.search(next_line)
                            and not RE_CHECKING_TOTAL.search(next_line)
                            and not RE_FUND_LINE.search(next_line)
                            and not is_header_line(next_line)
                            and not is_garbled_line(next_line)
                            and not RE_CHECKING_LINE.match(next_line)
                            and not re.search(r"\d{2}/\d{2}/\d{4}", next_line)
                        ):
                            # This is a wrapped vendor name or invoice number
                            # Just skip it (the important data is already captured)
                            i += 1
                        else:
                            break

                    current_vendor = vendor_name
                    current_invoice = invoice_num
                    current_invoice_date = invoice_date
                    current_po = po_number
                    current_invoice_total = inv_total
                    current_line_items = []
                    i += 1
                    continue

                # If we get here, this line didn't match any pattern.
                # It might be a continuation of a previous description or
                # a line we should skip. Just move on.
                i += 1

        # Flush any remaining invoice at end of file
        flush_invoice()

    return all_invoices, fund_totals


def main():
    all_records = []
    all_pass = True

    for filename in PDF_FILES:
        filepath = DOWNLOADS_DIR / filename
        if not filepath.exists():
            print(f"ERROR: File not found: {filepath}")
            sys.exit(1)

        print(f"\nParsing: {filename}")
        invoices, fund_totals = parse_pdf(str(filepath), filename)
        all_records.extend(invoices)

        print(f"  Invoices extracted: {len(invoices)}")
        print(f"  Funds found: {list(fund_totals.keys())}")

        # Validate fund totals
        expected = EXPECTED_FUND_TOTALS.get(filename, {})
        for fund_code in sorted(set(list(fund_totals.keys()) + list(expected.keys()))):
            actual = fund_totals.get(fund_code, 0.0)
            exp = expected.get(fund_code, 0.0)
            match = abs(actual - exp) < 0.01
            status = "PASS" if match else "FAIL"
            if not match:
                all_pass = False
            print(
                f"  Fund {fund_code}: actual=${actual:,.2f} expected=${exp:,.2f} [{status}]"
            )

    # Write output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(all_records, f, indent=2)

    print(f"\nTotal records: {len(all_records)}")
    print(f"Output written to: {OUTPUT_PATH}")

    if all_pass:
        print("\nAll fund totals match expected values.")
    else:
        print("\nWARNING: Some fund totals do not match expected values!")
        sys.exit(1)


if __name__ == "__main__":
    main()
