// Loader for the full ICCSD Ledger dataset (https://iccsd-ledger.vercel.app) —
// 84k+ AP and purchasing-card line items parsed from 280 board documents,
// reconciled to the penny against the district's own report totals.
// Fetched live from the Ledger site (single source of truth — new board
// packets show up here as soon as the Ledger republishes), decoded once
// and cached for the session.

export interface LedgerRow {
  src: 'a' | 'c'; // check run | purchasing card
  date: string;
  month: string; // YYYY-MM
  fy: number; // Iowa fiscal year (Jul–Jun), e.g. 2026
  vendor: string;
  group: string; // normalized merchant group
  desc: string;
  fund: string | null;
  loc: string | null;
  amount: number;
  doc: number; // index into docs[]
  page: number; // 1-based page in the source PDF
}

export interface Ledger {
  rows: LedgerRow[];
  docs: string[];
  meetings: Record<string, number>; // meeting date -> Simbli meeting id
  checkRuns: number;
}

export const LEDGER_SITE = 'https://iccsd-ledger.vercel.app';

export const LEDGER_FUND_NAMES: Record<string, string> = {
  '10': 'General Operating',
  '21': 'Student Activity',
  '22': 'Management Levy',
  '31': 'Capital — GO Bond',
  '33': 'Capital — SAVE (sales tax)',
  '36': 'Phys. Plant & Equipment',
  '40': 'Debt Service',
  '61': 'School Nutrition',
  '71': 'Health Self-Insurance',
  '74': 'Dental Self-Insurance',
  '82': "School Children's Aid",
  '84': 'School-Based Health Clinics',
};

export function pdfHref(ledger: Ledger, r: LedgerRow): string {
  return `${LEDGER_SITE}/docs/${encodeURIComponent(ledger.docs[r.doc])}#page=${r.page}`;
}

export function agendaHref(ledger: Ledger, r: LedgerRow): string {
  const mid = ledger.meetings[ledger.docs[r.doc]?.slice(0, 10)];
  return mid
    ? `https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36031992&MID=${mid}&Tab=Agenda`
    : '';
}

interface RawLedger {
  fields: string[];
  vendors: string[];
  groups: string[];
  docs: string[];
  meetings: Record<string, number>;
  rows: [string, string, number, string, string, number, string, string, number, number][];
}

let cache: Promise<Ledger> | null = null;

export function loadLedger(): Promise<Ledger> {
  if (!cache) {
    cache = fetch(`${LEDGER_SITE}/data/transactions.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ledger data from ${LEDGER_SITE}: ${res.status}`);
        return res.json() as Promise<RawLedger>;
      })
      .then((raw) => {
        const batchDates = new Set<string>();
        const rows: LedgerRow[] = raw.rows.map((r) => {
          const month = r[1].slice(0, 7);
          const acct = r[4] || '';
          const parts = acct ? acct.split(' ') : [];
          if (r[0] === 'a') batchDates.add(r[1]);
          return {
            src: r[0] as 'a' | 'c',
            date: r[1],
            month,
            fy: +month.slice(0, 4) + (+month.slice(5) >= 7 ? 1 : 0),
            vendor: raw.vendors[r[2]],
            group: raw.groups[r[2]],
            desc: r[3] || '',
            fund: parts[0] || null,
            loc: parts.length === 6 ? parts[1] : null,
            amount: r[5],
            doc: r[8],
            page: r[9],
          };
        });
        return { rows, docs: raw.docs, meetings: raw.meetings || {}, checkRuns: batchDates.size };
      });
  }
  return cache;
}

export function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Llc|Inc|Co|Of|And|The)\b/g, (m) => (m === 'Llc' ? 'LLC' : m === 'Inc' ? 'Inc' : m.toLowerCase()))
    .replace(/^./, (c) => c.toUpperCase());
}
