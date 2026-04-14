#!/usr/bin/env python3
"""Orchestrator: run all ETL scripts in order and validate outputs."""

import json
import os
import subprocess
import sys

ETL_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ETL_DIR, '..', 'dashboard', 'src', 'data')

SCRIPTS = [
    ('BMO Transactions', 'extract_bmo_transactions.py'),
    ('AP Summary', 'extract_ap_summary.py'),
    ('Board Reports', 'extract_board_reports.py'),
    ('BMO Statements', 'extract_bmo_statements.py'),
    ('Supplier Normalization', 'normalize_suppliers.py'),
    ('Lookup Tables', 'build_lookups.py'),
]


def run_script(name, script):
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")
    path = os.path.join(ETL_DIR, script)
    result = subprocess.run(
        [sys.executable, path],
        capture_output=True, text=True
    )
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    if result.returncode != 0:
        print(f"ERROR: {name} failed with exit code {result.returncode}")
        return False
    return True


def validate():
    """Cross-check ETL outputs."""
    print(f"\n{'='*60}")
    print(f"  VALIDATION")
    print(f"{'='*60}")

    errors = []

    # Check all expected files exist
    expected_files = [
        'bmo-transactions.json',
        'fund-summary.json',
        'ap-line-items.json',
        'bmo-statements.json',
        'lookups.json',
    ]
    for f in expected_files:
        path = os.path.join(DATA_DIR, f)
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"  ✓ {f} ({size:,} bytes)")
        else:
            print(f"  ✗ {f} MISSING")
            errors.append(f"{f} not found")

    # Cross-check: AP line item fund totals vs fund summary
    ap_path = os.path.join(DATA_DIR, 'ap-line-items.json')
    summary_path = os.path.join(DATA_DIR, 'fund-summary.json')

    if os.path.exists(ap_path) and os.path.exists(summary_path):
        with open(ap_path) as f:
            ap_items = json.load(f)
        with open(summary_path) as f:
            fund_summary = json.load(f)

        # Sum AP items by fund
        ap_fund_totals = {}
        for item in ap_items:
            fund = item.get('fund', 'unknown')
            ap_fund_totals[fund] = ap_fund_totals.get(fund, 0) + item.get('invoiceTotal', 0)

        # Compare with summary
        print(f"\n  Fund total cross-check:")
        for fund_info in fund_summary.get('funds', []):
            code = fund_info['code']
            summary_total = fund_info['total']
            ap_total = ap_fund_totals.get(code, 0)
            diff = abs(summary_total - ap_total)
            if diff < 0.02:
                print(f"    ✓ Fund {code}: ${summary_total:,.2f}")
            else:
                print(f"    ✗ Fund {code}: Summary=${summary_total:,.2f} vs AP=${ap_total:,.2f} (diff=${diff:,.2f})")
                errors.append(f"Fund {code} mismatch: {diff:.2f}")

        # Grand total check
        summary_grand = fund_summary.get('grandTotal', 0)
        ap_grand = sum(ap_fund_totals.values())
        diff = abs(summary_grand - ap_grand)
        if diff < 0.02:
            print(f"    ✓ Grand total: ${summary_grand:,.2f}")
        else:
            print(f"    ✗ Grand total: Summary=${summary_grand:,.2f} vs AP=${ap_grand:,.2f}")
            errors.append(f"Grand total mismatch: {diff:.2f}")

    if errors:
        print(f"\n  {len(errors)} validation error(s) found!")
        for e in errors:
            print(f"    - {e}")
    else:
        print(f"\n  All validations passed!")

    return len(errors) == 0


def main():
    print("ICCSD Financial Explorer — ETL Pipeline")
    print(f"Output directory: {DATA_DIR}")

    os.makedirs(DATA_DIR, exist_ok=True)

    all_ok = True
    for name, script in SCRIPTS:
        if not run_script(name, script):
            all_ok = False

    valid = validate()

    if all_ok and valid:
        print(f"\n{'='*60}")
        print("  ETL COMPLETE — all data extracted and validated")
        print(f"{'='*60}")
    else:
        print(f"\n{'='*60}")
        print("  ETL COMPLETE — with warnings/errors (see above)")
        print(f"{'='*60}")
        sys.exit(1)


if __name__ == '__main__':
    main()
