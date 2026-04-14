#!/usr/bin/env python3
"""Two-layer supplier normalization: pattern extraction + fuzzy clustering.

Adds normalized supplier fields to BMO transaction data:
  - supplierNormalized: grouped name (e.g. "Amazon")
  - supplierCategory: sub-type (e.g. "Marketplace")
  - supplierLocation: extracted location (e.g. "Seattle, WA")
  - supplierRef: unique order/ref ID (e.g. "BE48Q9NS0")
"""

import json
import os
import re

try:
    from Levenshtein import ratio as lev_ratio
except ImportError:
    from difflib import SequenceMatcher
    def lev_ratio(a, b):
        return SequenceMatcher(None, a, b).ratio()

OVERRIDES_PATH = os.path.join(os.path.dirname(__file__), 'supplier_overrides.json')
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'src', 'data')


def load_overrides():
    with open(OVERRIDES_PATH) as f:
        data = json.load(f)
    # Remove comment keys
    return {k: v for k, v in data.items() if not k.startswith('_')}


def extract_ref(supplier):
    """Extract reference/order ID from supplier string."""
    # Amazon-style: AMAZON MKTPL BE48Q9NS0 or AMZN MKTP US Xe4jk30e3
    m = re.search(r'\b([A-Z0-9]{7,12})\b', supplier)
    if m:
        candidate = m.group(1)
        # Must have mix of letters and numbers to be a ref
        if re.search(r'[A-Z]', candidate) and re.search(r'[0-9]', candidate):
            # Exclude things that look like store numbers or zip codes
            if len(candidate) >= 8:
                return candidate
    return None


def extract_store_number(supplier):
    """Extract store/location number like #1288 or 70378."""
    m = re.search(r'#?\s*(\d{3,6})\s*$', supplier.split('  ')[0] if '  ' in supplier else supplier)
    if m:
        return m.group(1)
    return None


def extract_location(supplier):
    """Extract city/state from end of supplier string."""
    # Pattern: CITY ST or CITY, ST at end
    m = re.search(r'\s+([A-Z][a-zA-Z\s]+?)\s+([A-Z]{2})\s*$', supplier)
    if m:
        city = m.group(1).strip()
        state = m.group(2)
        # Don't extract if it's clearly part of the name
        if len(city) >= 3 and city.upper() not in ['THE', 'AND', 'INC', 'LLC', 'NET']:
            return f"{city}, {state}"
    return None


def normalize_supplier(raw_supplier, overrides):
    """Normalize a single supplier name using pattern matching + overrides.

    Returns dict with: normalized, category, location, ref
    """
    supplier_upper = raw_supplier.upper().strip()

    # Try override map (longest match first for specificity)
    best_match = None
    best_len = 0
    for pattern, info in overrides.items():
        if pattern.upper() in supplier_upper and len(pattern) > best_len:
            best_match = info
            best_len = len(pattern)

    if best_match:
        normalized = best_match['normalized']
        category = best_match.get('category', None)
    else:
        # Clean up: title case, strip trailing numbers/codes
        cleaned = raw_supplier.strip()
        # Remove location from end
        loc = extract_location(cleaned)
        if loc:
            # Remove the location part
            cleaned = re.sub(r'\s+[A-Z][a-zA-Z\s]+?\s+[A-Z]{2}\s*$', '', cleaned)
        # Remove trailing store numbers
        cleaned = re.sub(r'\s+#?\d{3,6}\s*$', '', cleaned)
        # Remove trailing reference codes
        cleaned = re.sub(r'\s+[A-Z0-9]{8,}\s*$', '', cleaned)
        # Title case
        normalized = cleaned.strip().title() if cleaned.strip() else raw_supplier.strip()
        category = None

    ref = extract_ref(raw_supplier)
    location = extract_location(raw_supplier)
    store = extract_store_number(raw_supplier)

    return {
        'supplierNormalized': normalized,
        'supplierCategory': category,
        'supplierLocation': location,
        'supplierRef': ref,
        'supplierStore': store,
    }


def fuzzy_cluster(names, threshold=0.85):
    """Cluster similar normalized names using Levenshtein distance."""
    clusters = {}  # canonical -> list of variants
    canonical_map = {}  # variant -> canonical

    sorted_names = sorted(names, key=lambda x: -names[x])  # Most frequent first

    for name in sorted_names:
        if name in canonical_map:
            continue

        # Check against existing canonicals
        best_canonical = None
        best_score = 0
        for canonical in clusters:
            score = lev_ratio(name.lower(), canonical.lower())
            if score > best_score:
                best_score = score
                best_canonical = canonical

        if best_score >= threshold and best_canonical:
            clusters[best_canonical].append(name)
            canonical_map[name] = best_canonical
        else:
            clusters[name] = [name]
            canonical_map[name] = name

    return canonical_map


def process_bmo_transactions():
    """Add normalized supplier fields to BMO transactions."""
    txn_path = os.path.join(DATA_DIR, 'bmo-transactions.json')
    if not os.path.exists(txn_path):
        print(f"Warning: {txn_path} not found, skipping BMO transactions")
        return []

    with open(txn_path) as f:
        transactions = json.load(f)

    overrides = load_overrides()

    # Normalize all suppliers
    for txn in transactions:
        info = normalize_supplier(txn['supplier'], overrides)
        txn.update(info)

    # Fuzzy cluster the normalized names
    name_counts = {}
    for txn in transactions:
        n = txn['supplierNormalized']
        name_counts[n] = name_counts.get(n, 0) + 1

    cluster_map = fuzzy_cluster(name_counts)

    # Apply clustering
    for txn in transactions:
        canonical = cluster_map.get(txn['supplierNormalized'], txn['supplierNormalized'])
        if canonical != txn['supplierNormalized']:
            txn['supplierNormalized'] = canonical

    # Write back
    with open(txn_path, 'w') as f:
        json.dump(transactions, f, indent=2)

    return transactions


def process_bmo_statements():
    """Add normalized supplier fields to BMO statement transactions."""
    stmt_path = os.path.join(DATA_DIR, 'bmo-statements.json')
    if not os.path.exists(stmt_path):
        print(f"Warning: {stmt_path} not found, skipping BMO statements")
        return []

    with open(stmt_path) as f:
        data = json.load(f)

    overrides = load_overrides()

    for txn in data['transactions']:
        info = normalize_supplier(txn['supplier'], overrides)
        txn.update(info)

    # Write back
    with open(stmt_path, 'w') as f:
        json.dump(data, f, indent=2)

    return data['transactions']


def main():
    overrides = load_overrides()
    print(f"Loaded {len(overrides)} override patterns")

    txns = process_bmo_transactions()
    stmts = process_bmo_statements()

    all_txns = txns + stmts

    if not all_txns:
        print("No transactions to normalize. Run extraction scripts first.")
        return

    # Print summary
    normalized_counts = {}
    for t in all_txns:
        n = t['supplierNormalized']
        normalized_counts[n] = normalized_counts.get(n, 0) + 1

    print(f"\nNormalized {len(all_txns)} transactions into {len(normalized_counts)} supplier groups")
    print(f"\nTop 20 suppliers by transaction count:")
    for name, count in sorted(normalized_counts.items(), key=lambda x: -x[1])[:20]:
        total = sum(t['amount'] for t in all_txns if t['supplierNormalized'] == name)
        print(f"  {name}: {count} txns, ${total:,.2f}")


if __name__ == '__main__':
    main()
