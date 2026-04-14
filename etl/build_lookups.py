#!/usr/bin/env python3
"""Build lookup tables from AP line item data.

Derives building codes → names, function codes → descriptions,
object codes → types, and fund codes → names from the parsed data.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'src', 'data')
OUTPUT = os.path.join(DATA_DIR, 'lookups.json')

# Known building codes → school/site names (from ICCSD)
BUILDING_CODES = {
    "0000": "District-Wide",
    "0020": "Educational Services Center",
    "0025": "Special Education",
    "0050": "Stevens Drive / Transportation",
    "0060": "Nutrition Services",
    "0063": "Maintenance",
    "0080": "CFI / Tyler",
    "0109": "City High School",
    "0114": "Liberty High School",
    "0118": "West High School",
    "0134": "Food Service",
    "0136": "Tate High School",
    "0209": "North Central Junior High",
    "0213": "Northwest Junior High",
    "0218": "South East Junior High",
    "0227": "Northwest Junior High (Alt)",
    "0401": "Garner Elementary",
    "0403": "Coralville Central Elementary",
    "0406": "Kirkwood Elementary",
    "0415": "Horn Elementary",
    "0417": "Lemme Elementary",
    "0418": "Lincoln Elementary",
    "0424": "Hoover Elementary",
    "0427": "Longfellow Elementary",
    "0432": "Borlaug Elementary",
    "0436": "Lucas Elementary",
    "0442": "Alexander Elementary",
    "0445": "Longfellow Elementary (Alt)",
    "0447": "Penn Elementary",
    "0463": "Hoover Elementary (Alt)",
    "0468": "Shimek Elementary",
    "0472": "Twain Elementary",
    "0475": "Grant Elementary",
    "0481": "Wood Elementary",
    "0488": "Weber Elementary",
    "0493": "Wickham Elementary",
    "0497": "Van Allen Elementary",
    "1808": "District Administration",
    "2934": "Various / Events",
    "4746": "Purchasing",
    "4783": "Technology",
    "5019": "Fleet / Vehicles",
    "5128": "Facilities",
    "5203": "Summer Programs",
    "5372": "Special Projects",
    "5420": "Food Service Events",
    "5438": "Athletics",
    "9331": "Career & Technical Education",
    "9334": "Curriculum / Science Kits",
    "9410": "Grounds",
    "9473": "Student Activities",
    "9828": "Extended Day",
}

# Function codes → descriptions (from Iowa school accounting)
FUNCTION_CODES = {
    "1100": "Regular Instruction",
    "1200": "Special Instruction",
    "1282": "Special Education Support",
    "1300": "Career & Technical Education",
    "1400": "Summer School",
    "1900": "Student Activities / Co-Curricular",
    "2100": "Student Support Services",
    "2131": "Health Services",
    "2193": "Student Safety",
    "2200": "Instructional Staff Support",
    "2211": "Media/Library Services",
    "2221": "Curriculum Development",
    "2300": "General Administration",
    "2311": "Board of Education",
    "2316": "Board Secretary/Treasurer",
    "2327": "Administrative Technology",
    "2400": "School Administration",
    "2500": "Business/Fiscal Services",
    "2511": "Business Office",
    "2514": "Accounting/Payroll",
    "2571": "Risk Management",
    "2581": "Human Resources",
    "2600": "Plant Operations & Maintenance",
    "2610": "Building Operations",
    "2620": "Utilities",
    "2630": "Grounds Maintenance",
    "2640": "Equipment Maintenance",
    "2650": "Vehicle Operation",
    "2700": "Student Transportation",
    "3100": "Food Services",
    "3110": "Food Preparation",
    "3300": "Community Services",
    "4100": "Site Acquisition & Improvement",
    "4200": "Building Acquisition & Construction",
    "4500": "Equipment Purchase",
    "4700": "Building Improvement",
    "5100": "Debt Service",
    "6300": "Community Services",
}

# Object codes → expense types (from Iowa school accounting)
OBJECT_CODES = {
    "211": "Insurance - Property",
    "213": "Insurance - Liability",
    "320": "Professional Services",
    "345": "Officials/Referees",
    "349": "Other Professional Services",
    "359": "Communication Services",
    "391": "Travel/Mileage",
    "411": "Water/Sewer",
    "421": "Cleaning/Disposal",
    "432": "Repair - Buildings",
    "433": "Repair - Equipment",
    "434": "Repair - Vehicles",
    "442": "Rental - Buildings",
    "450": "Construction/Contractors",
    "532": "Postage",
    "581": "Registration/Conference Fees",
    "582": "Athletic Training",
    "594": "Printing/Advertising",
    "611": "General Supplies/Materials",
    "612": "Instructional Supplies",
    "615": "Custodial Supplies",
    "616": "Uniforms/Equipment",
    "618": "Maintenance Supplies",
    "622": "Electricity",
    "626": "Fuel",
    "631": "Food Supplies",
    "641": "Textbooks",
    "643": "Library Books",
    "682": "Technology Equipment",
    "683": "Software/Subscriptions",
    "684": "Computer Hardware",
    "685": "Networking Equipment",
    "686": "Audio/Visual Equipment",
    "688": "Classroom Furniture",
    "689": "Other Equipment",
    "710": "Property Tax",
    "733": "Equipment Rental/Lease",
    "739": "Other Rentals",
    "811": "Entry Fees/Dues",
    "892": "Transfers/Miscellaneous",
}

# Fund codes → names
FUND_CODES = {
    "10": "General Fund",
    "21": "Student Activities Fund",
    "22": "Management Fund",
    "31": "Capital Projects - GO Bond",
    "33": "Capital Projects - SAVE",
    "36": "Physical Plant & Equipment Levy",
    "40": "Debt Service Fund",
    "61": "Nutrition Fund",
    "71": "Health Insurance Fund",
    "74": "Dental Self Insurance Fund",
    "82": "School Children's Aid",
    "84": "School Based Health Clinics",
}


def build_card_labels():
    """Build card last-4 → label mapping from authoritative sources only.

    Tier 1: Building codes (ICCSD official school/department codes)
    Tier 2: BMO statement account names (from the bank's own records)

    Cards without an authoritative label are left unmapped — the dashboard
    shows them by their last-4 digits.
    """
    stmt_path = os.path.join(DATA_DIR, 'bmo-statements.json')

    labels = {}

    # 1. Cards that match building codes get that name
    for code, name in BUILDING_CODES.items():
        labels[code] = name

    # 2. BMO statement account names (authoritative, from the bank)
    if os.path.exists(stmt_path):
        with open(stmt_path) as f:
            stmts = json.load(f)
        for s in stmts.get('statements', []):
            card = s['card']
            acct = s.get('accountName', '')
            if acct and card not in labels:
                labels[card] = acct.title()

    return labels


def enrich_from_data():
    """Read ap-line-items.json to discover any codes not in our static maps."""
    ap_path = os.path.join(DATA_DIR, 'ap-line-items.json')
    if not os.path.exists(ap_path):
        print("Warning: ap-line-items.json not found, using static lookups only")
        return

    with open(ap_path) as f:
        items = json.load(f)

    # Collect all codes seen in data
    buildings_seen = set()
    functions_seen = set()
    objects_seen = set()
    funds_seen = set()

    for item in items:
        funds_seen.add(item.get('fund', ''))
        for li in item.get('lineItems', []):
            buildings_seen.add(li.get('building', ''))
            functions_seen.add(li.get('function', ''))
            objects_seen.add(li.get('object', ''))

    # Report codes not in our maps
    unknown_buildings = buildings_seen - set(BUILDING_CODES.keys()) - {''}
    unknown_functions = functions_seen - set(FUNCTION_CODES.keys()) - {''}
    unknown_objects = objects_seen - set(OBJECT_CODES.keys()) - {''}
    unknown_funds = funds_seen - set(FUND_CODES.keys()) - {''}

    if unknown_buildings:
        print(f"  Unknown building codes: {sorted(unknown_buildings)}")
    if unknown_functions:
        print(f"  Unknown function codes: {sorted(unknown_functions)}")
    if unknown_objects:
        print(f"  Unknown object codes: {sorted(unknown_objects)}")
    if unknown_funds:
        print(f"  Unknown fund codes: {sorted(unknown_funds)}")


def main():
    print("Building lookup tables...")
    enrich_from_data()

    card_labels = build_card_labels()

    lookups = {
        'buildings': BUILDING_CODES,
        'functions': FUNCTION_CODES,
        'objects': OBJECT_CODES,
        'funds': FUND_CODES,
        'cards': card_labels,
    }

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(lookups, f, indent=2)

    print(f"\nLookup tables written to {OUTPUT}")
    print(f"  Buildings: {len(BUILDING_CODES)} entries")
    print(f"  Functions: {len(FUNCTION_CODES)} entries")
    print(f"  Objects: {len(OBJECT_CODES)} entries")
    print(f"  Funds: {len(FUND_CODES)} entries")
    print(f"  Cards: {len(card_labels)} entries")


if __name__ == '__main__':
    main()
