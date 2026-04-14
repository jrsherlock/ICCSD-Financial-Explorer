#!/usr/bin/env python3
"""
ETL script to extract BMO Mastercard transaction data from PDF files.

Parses all BMO Transaction PDFs in the downloads/ directory and outputs
a deduplicated, sorted JSON file to dashboard/src/data/bmo-transactions.json.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import pdfplumber

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = PROJECT_ROOT / "downloads"
OUTPUT_FILE = PROJECT_ROOT / "dashboard" / "src" / "data" / "bmo-transactions.json"

# Regex to match transaction data lines
# Format: M/D/YYYY M/D/YYYY XXXX-XXXX-XXXX-NNNN Supplier Name $ Amount
LINE_RE = re.compile(
    r"^(\d{1,2}/\d{1,2}/\d{4})\s+"      # Posting Date
    r"(\d{1,2}/\d{1,2}/\d{4})\s+"        # Tran Date
    r"XXXX-XXXX-XXXX-(\d{4})\s+"         # Card (last 4 digits)
    r"(.+?)\s+"                           # Supplier name (non-greedy)
    r"\$\s*(.+)$"                         # Amount (everything after $)
)

# Regex to extract period dates from header line
# Format: BMO - Mastercard, [Statement Period] MM/DD/YYYY to MM/DD/YYYY
PERIOD_RE = re.compile(
    r"BMO\s*-\s*Mastercard,\s*(?:Statement\s+Period\s+)?(\d{2}/\d{2}/\d{4})\s+to\s+(\d{2}/\d{2}/\d{4})"
)


def parse_date_mdy(date_str: str) -> str:
    """Convert M/D/YYYY to ISO format YYYY-MM-DD."""
    dt = datetime.strptime(date_str, "%m/%d/%Y")
    return dt.strftime("%Y-%m-%d")


def parse_date_mdy_zero(date_str: str) -> str:
    """Convert MM/DD/YYYY (zero-padded) to ISO format YYYY-MM-DD."""
    dt = datetime.strptime(date_str, "%m/%d/%Y")
    return dt.strftime("%Y-%m-%d")


def parse_amount(raw: str) -> float:
    """
    Parse an amount string, handling:
    - Normal: 499.00
    - Parenthesized negatives: (54.95)
    - Dash negatives: -7.99
    - Erroneous spaces: 7 .99 or 1 7,175.43
    - Thousands separators: 162,396.39
    """
    # Remove all whitespace within the amount
    cleaned = raw.strip()
    # Remove spaces between digits/punctuation (handles "7 .99" and "1 7,175.43")
    cleaned = re.sub(r"\s+", "", cleaned)

    # Check for parenthesized negative: (123.45)
    paren_match = re.match(r"^\((.+)\)$", cleaned)
    if paren_match:
        inner = paren_match.group(1).replace(",", "")
        return -float(inner)

    # Check for dash negative: -123.45
    cleaned = cleaned.replace(",", "")
    return float(cleaned)


def get_bmo_pdfs(downloads_dir: Path) -> list[Path]:
    """Get all BMO Transaction PDF files, excluding the trailing-space duplicate."""
    pdfs = []
    seen_stems = set()
    for f in sorted(downloads_dir.glob("BMO Transactions *.pdf")):
        # Normalize by stripping the stem to detect duplicates
        stem = f.stem.strip()
        if stem in seen_stems:
            print(f"  Skipping duplicate: {f.name!r}")
            continue
        seen_stems.add(stem)
        pdfs.append(f)
    return pdfs


def extract_transactions_from_pdf(pdf_path: Path) -> list[dict]:
    """Extract all transactions from a single BMO Transaction PDF."""
    transactions = []
    filename = pdf_path.name
    period_start = None
    period_end = None

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue  # blank page

            for line in text.split("\n"):
                # Try to extract period dates from header
                if period_start is None:
                    period_match = PERIOD_RE.search(line)
                    if period_match:
                        period_start = parse_date_mdy_zero(period_match.group(1))
                        period_end = parse_date_mdy_zero(period_match.group(2))

                # Skip non-data lines (headers, totals, etc.)
                if "XXXX-XXXX-XXXX-" not in line:
                    continue

                match = LINE_RE.match(line)
                if not match:
                    print(f"  WARNING: Could not parse line in {filename}: {line!r}")
                    continue

                posting_date_raw = match.group(1)
                tran_date_raw = match.group(2)
                card = match.group(3)
                supplier = match.group(4).strip()
                amount_raw = match.group(5)

                try:
                    amount = parse_amount(amount_raw)
                except (ValueError, TypeError) as e:
                    print(f"  WARNING: Bad amount in {filename}: {amount_raw!r} -> {e}")
                    continue

                transactions.append({
                    "postingDate": parse_date_mdy(posting_date_raw),
                    "tranDate": parse_date_mdy(tran_date_raw),
                    "card": card,
                    "supplier": supplier,
                    "amount": amount,
                    "sourceFile": filename,
                    "periodStart": period_start,
                    "periodEnd": period_end,
                })

    return transactions


def dedup_transactions(transactions: list[dict]) -> list[dict]:
    """
    Deduplicate transactions using composite key: tranDate + card + supplier + amount.
    When duplicates exist across files, keep the first occurrence (from the earlier file).
    """
    seen = set()
    deduped = []
    dupes = 0
    for txn in transactions:
        key = (txn["tranDate"], txn["card"], txn["supplier"], txn["amount"])
        if key in seen:
            dupes += 1
            continue
        seen.add(key)
        deduped.append(txn)
    if dupes > 0:
        print(f"  Removed {dupes} duplicate transactions across overlapping periods")
    return deduped


def main():
    print("BMO Transactions ETL")
    print("=" * 60)

    # Find all BMO Transaction PDFs
    pdfs = get_bmo_pdfs(DOWNLOADS_DIR)
    print(f"Found {len(pdfs)} BMO Transaction PDFs")

    if not pdfs:
        print("ERROR: No BMO Transaction PDFs found in downloads/")
        sys.exit(1)

    # Extract transactions from all PDFs
    all_transactions = []
    for pdf_path in pdfs:
        txns = extract_transactions_from_pdf(pdf_path)
        print(f"  {pdf_path.name}: {len(txns)} transactions")
        all_transactions.extend(txns)

    print(f"\nTotal raw transactions: {len(all_transactions)}")

    # Sort by tranDate, then postingDate
    all_transactions.sort(key=lambda t: (t["tranDate"], t["postingDate"]))

    # Deduplicate
    deduped = dedup_transactions(all_transactions)

    # Summary stats
    if deduped:
        dates = [t["tranDate"] for t in deduped]
        min_date = min(dates)
        max_date = max(dates)
        total_amount = sum(t["amount"] for t in deduped)
        unique_cards = len(set(t["card"] for t in deduped))
        unique_suppliers = len(set(t["supplier"] for t in deduped))

        print(f"\n{'Summary':=^60}")
        print(f"  Files processed:      {len(pdfs)}")
        print(f"  Total transactions:   {len(deduped)}")
        print(f"  Date range:           {min_date} to {max_date}")
        print(f"  Total amount:         ${total_amount:,.2f}")
        print(f"  Unique cards:         {unique_cards}")
        print(f"  Unique suppliers:     {unique_suppliers}")

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(deduped, f, indent=2)
    print(f"\nOutput written to: {OUTPUT_FILE}")
    print(f"File size: {OUTPUT_FILE.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
