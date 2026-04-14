#!/usr/bin/env python3
"""Parse BMO Statement PDFs (card-level statements with tax breakdown)."""

import json
import os
import re
import glob
import pdfplumber

DOWNLOADS = os.path.join(os.path.dirname(__file__), '..', 'downloads')
OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'src', 'data', 'bmo-statements.json')


def parse_amount(s):
    """Parse amount string like '$ 1,234.56' or '$ -7.99'."""
    s = s.replace('$', '').replace(',', '').strip()
    return float(s)


def parse_date_short(mm, dd, year):
    """Convert MM/DD + year context to ISO date."""
    return f"{year}-{int(mm):02d}-{int(dd):02d}"


def extract_statement(pdf_path):
    """Extract all transactions from a BMO Statement PDF."""
    pdf = pdfplumber.open(pdf_path)
    filename = os.path.basename(pdf_path)

    # Extract card number and statement date from first page
    first_text = pdf.pages[0].extract_text()
    card_match = re.search(r'Card Number:\s*xxxx-xxxx-xxxx-(\d{4})', first_text)
    card = card_match.group(1) if card_match else 'unknown'

    date_match = re.search(r'Statement Date.*?:\s*(\d{2}/\d{2}/\d{4})', first_text)
    if date_match:
        parts = date_match.group(1).split('/')
        statement_date = f"{parts[2]}-{parts[0]}-{parts[1]}"
        statement_year = int(parts[2])
    else:
        statement_date = 'unknown'
        statement_year = 2026

    # Extract account name
    acct_match = re.search(r'Account Name:\s*(.+?)(?:\s+Card Number:)', first_text)
    account_name = acct_match.group(1).strip() if acct_match else ''

    # Extract summary totals
    net_match = re.search(r'Net Purchases:\s*\$\s*([\d,.-]+)', first_text)
    net_purchases = parse_amount(f"$ {net_match.group(1)}") if net_match else None

    transactions = []

    # Transaction line pattern:
    # MM/DD MM/DD DESCRIPTION LOCATION $ pre_tax $ tax $ amount
    # Then next line: trans_id auth_num
    txn_re = re.compile(
        r'^(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+'  # trans date, posting date
        r'(.+?)\s+'                              # description
        r'\$\s*([-\d,. ]+?)\s+'                  # pre-tax amount
        r'\$\s*([-\d,. ]+?)\s+'                  # tax
        r'\$\s*([-\d,. ]+?)$'                    # trans amount
    )
    detail_re = re.compile(r'^\s*(\d{6,})\s+(\d{6})\s*$')  # trans_id auth_num

    for page in pdf.pages:
        text = page.extract_text()
        if not text:
            continue

        lines = text.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # Skip non-transaction lines
            if not line or line.startswith('Page ') or 'Statement' in line[:20]:
                i += 1
                continue
            if 'TOTAL CREDITS' in line or 'TOTAL DEBITS' in line:
                i += 1
                continue
            if 'PAYMENT INFORMATION' in line:
                break

            m = txn_re.match(line)
            if m:
                trans_date_raw = m.group(1)  # MM/DD
                posting_date_raw = m.group(2)
                description = m.group(3).strip()
                pre_tax = parse_amount(f"$ {m.group(4)}")
                tax = parse_amount(f"$ {m.group(5)}")
                amount = parse_amount(f"$ {m.group(6)}")

                # Determine year - use statement year, handle Dec/Jan wrap
                td_month = int(trans_date_raw.split('/')[0])
                td_day = int(trans_date_raw.split('/')[1])
                pd_month = int(posting_date_raw.split('/')[0])
                pd_day = int(posting_date_raw.split('/')[1])

                # Statement is dated in the statement_year
                # If trans month > statement month by a lot, it's previous year
                stmt_month = int(statement_date.split('-')[1])
                td_year = statement_year
                pd_year = statement_year
                if td_month > stmt_month + 1:
                    td_year -= 1
                if pd_month > stmt_month + 1:
                    pd_year -= 1

                trans_date = f"{td_year}-{td_month:02d}-{td_day:02d}"
                posting_date = f"{pd_year}-{pd_month:02d}-{pd_day:02d}"

                # Parse description into supplier + location
                # Common pattern: SUPPLIER NAME CITY ST
                # Try to extract location (last 2+ words that look like CITY STATE)
                loc_match = re.search(r'\s+([A-Z][A-Z\s]+?)\s+([A-Z]{2})\s*$', description)
                if loc_match:
                    location = f"{loc_match.group(1).strip()}, {loc_match.group(2)}"
                    supplier_name = description[:loc_match.start()].strip()
                else:
                    location = None
                    supplier_name = description

                # Look for trans_id and auth on next line
                trans_id = None
                auth_num = None
                if i + 1 < len(lines):
                    detail_m = detail_re.match(lines[i + 1].strip())
                    if detail_m:
                        trans_id = detail_m.group(1)
                        auth_num = detail_m.group(2)
                        i += 1  # Skip the detail line

                transactions.append({
                    'tranDate': trans_date,
                    'postingDate': posting_date,
                    'card': card,
                    'supplier': description,
                    'supplierName': supplier_name,
                    'location': location,
                    'preTaxAmount': pre_tax,
                    'tax': tax,
                    'amount': amount,
                    'transId': trans_id,
                    'authNum': auth_num,
                    'statementDate': statement_date,
                    'accountName': account_name,
                    'sourceFile': filename,
                })

            i += 1

    pdf.close()
    return {
        'card': card,
        'accountName': account_name,
        'statementDate': statement_date,
        'netPurchases': net_purchases,
        'transactions': transactions,
    }


def main():
    pdf_files = sorted(glob.glob(os.path.join(DOWNLOADS, 'BMO_Statement_*.pdf')))
    print(f"Found {len(pdf_files)} BMO Statement PDFs")

    all_statements = []
    all_transactions = []

    for pdf_path in pdf_files:
        print(f"\nProcessing: {os.path.basename(pdf_path)}")
        stmt = extract_statement(pdf_path)
        print(f"  Card: {stmt['card']}, Date: {stmt['statementDate']}")
        print(f"  Account: {stmt['accountName']}")
        print(f"  Transactions: {len(stmt['transactions'])}")
        total = sum(t['amount'] for t in stmt['transactions'])
        print(f"  Computed total: ${total:,.2f}")
        if stmt['netPurchases'] is not None:
            print(f"  Statement net purchases: ${stmt['netPurchases']:,.2f}")
            diff = abs(total - stmt['netPurchases'])
            if diff < 0.02:
                print(f"  ✓ Totals match!")
            else:
                print(f"  ✗ Difference: ${diff:,.2f}")

        all_statements.append(stmt)
        all_transactions.extend(stmt['transactions'])

    # Sort all transactions by date
    all_transactions.sort(key=lambda t: (t['tranDate'], t['postingDate']))

    output = {
        'statements': [
            {
                'card': s['card'],
                'accountName': s['accountName'],
                'statementDate': s['statementDate'],
                'netPurchases': s['netPurchases'],
                'transactionCount': len(s['transactions']),
            }
            for s in all_statements
        ],
        'transactions': all_transactions,
    }

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Total statements: {len(all_statements)}")
    print(f"Total transactions: {len(all_transactions)}")
    print(f"Total amount: ${sum(t['amount'] for t in all_transactions):,.2f}")
    print(f"Output: {OUTPUT}")


if __name__ == '__main__':
    main()
