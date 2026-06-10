import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceArea,
  Legend,
} from 'recharts';
import { KpiCard } from '../components/ui/KpiCard';
import {
  loadLedger,
  pdfHref,
  agendaHref,
  toTitle,
  LEDGER_FUND_NAMES,
  LEDGER_SITE,
  type Ledger,
  type LedgerRow,
} from '../lib/ledger';
import {
  formatCurrency,
  formatCurrencyExact,
  formatNumber,
  formatCompactCurrency,
  formatMonth,
} from '../lib/formatters';
import { getFundColor, AXIS_TICK_COLOR } from '../lib/colors';

const OTHER_COLOR = '#64748b';
const CAP_FUNDS = ['31', '33', '36'];
const FY_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const MONTH_NAMES = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

type Drill =
  | { kind: 'month-fund'; month: string; fund: string | null; label: string }
  | { kind: 'group'; group: string; label: string }
  | null;

const fundLabel = (code: string) => LEDGER_FUND_NAMES[code] || (code === 'uncoded' ? 'Card — not yet coded' : `Fund ${code}`);

function StackTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{formatMonth(String(label))}</p>
      {[...payload].reverse().map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {fundLabel(String(p.dataKey))}: {formatCurrency(p.value || 0)}
        </p>
      ))}
      <p className="mt-1 pt-1 border-t border-border font-medium">
        Month total {formatCurrency(total)} — click to see payments
      </p>
    </div>
  );
}

export function Insights() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yoyScope, setYoyScope] = useState<'all' | 'gen' | 'cap' | 'rest'>('all');
  const [fy, setFy] = useState<number | 'all'>('all');
  const [drill, setDrill] = useState<Drill>(null);

  useEffect(() => {
    loadLedger().then(setLedger).catch((e) => setError(e.message));
  }, []);

  const fiscalYears = useMemo(() => {
    if (!ledger) return [];
    return [...new Set(ledger.rows.map((r) => r.fy))].sort((a, b) => a - b);
  }, [ledger]);

  const agg = useMemo(() => {
    if (!ledger) return null;
    const rows = fy === 'all' ? ledger.rows : ledger.rows.filter((r) => r.fy === fy);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const checkRunDates = new Set(rows.filter((r) => r.src === 'a').map((r) => r.date));

    const fundTotals = new Map<string, number>();
    const monthFund = new Map<string, Map<string, number>>();
    const groupTotals = new Map<string, { total: number; n: number }>();
    for (const r of rows) {
      const fk = r.fund || 'uncoded';
      fundTotals.set(fk, (fundTotals.get(fk) || 0) + r.amount);
      let mf = monthFund.get(r.month);
      if (!mf) monthFund.set(r.month, (mf = new Map()));
      mf.set(fk, (mf.get(fk) || 0) + r.amount);
      const g = groupTotals.get(r.group) || { total: 0, n: 0 };
      g.total += r.amount;
      g.n++;
      groupTotals.set(r.group, g);
    }
    const months = [...monthFund.keys()].sort();
    const topFunds = [...fundTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
    const monthly = months.map((m) => {
      const mf = monthFund.get(m)!;
      const row: Record<string, number | string> = { month: m };
      let other = 0;
      for (const [fk, v] of mf) {
        if (topFunds.includes(fk)) row[fk] = Math.max(0, v);
        else other += Math.max(0, v);
      }
      row.__other = other;
      return row;
    });
    const topGroups = [...groupTotals.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 12)
      .map(([name, g]) => ({ name, short: toTitle(name).slice(0, 28), ...g }));
    return { total, n: rows.length, months, topFunds, monthly, topGroups, vendorCount: groupTotals.size, checkRunDates: checkRunDates.size };
  }, [ledger, fy]);

  const yoy = useMemo(() => {
    if (!ledger) return [];
    const pred =
      yoyScope === 'gen'
        ? (r: LedgerRow) => r.fund === '10'
        : yoyScope === 'cap'
          ? (r: LedgerRow) => CAP_FUNDS.includes(r.fund || '')
          : yoyScope === 'rest'
            ? (r: LedgerRow) => r.fund !== '10' && !CAP_FUNDS.includes(r.fund || '')
            : () => true;
    const sums = new Map<string, number>();
    for (const r of ledger.rows) {
      if (r.fy !== 2025 && r.fy !== 2026) continue;
      if (!pred(r)) continue;
      const k = `${r.fy}-${+r.month.slice(5)}`;
      sums.set(k, (sums.get(k) || 0) + r.amount);
    }
    return FY_ORDER.map((m, i) => ({
      name: MONTH_NAMES[i],
      m,
      fy25: Math.max(0, sums.get(`2025-${m}`) || 0),
      fy26: Math.max(0, sums.get(`2026-${m}`) || 0),
    }));
  }, [ledger, yoyScope]);

  const drillRows = useMemo(() => {
    if (!ledger || !agg || !drill) return null;
    let match: (r: LedgerRow) => boolean;
    if (drill.kind === 'group') {
      // vendor drill respects the page-level fiscal-year filter; month drills
      // already pin a single month so the year is implied
      match = (r) => r.group === drill.group && (fy === 'all' || r.fy === fy);
    } else {
      const { month, fund } = drill;
      match = (r) =>
        r.month === month &&
        (fund === null
          ? true
          : fund === '__other'
            ? !agg.topFunds.includes(r.fund || 'uncoded')
            : (r.fund || 'uncoded') === fund);
    }
    const rows = ledger.rows.filter(match);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return { rows: rows.slice(0, 100), count: rows.length, total };
  }, [ledger, agg, drill, fy]);

  if (error)
    return <p className="text-sm text-red-500">Failed to load the ledger dataset: {error}</p>;
  if (!ledger || !agg)
    return (
      <div className="flex flex-col items-center pt-32 gap-3 text-muted-foreground">
        <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Loading 84,883 line items…</p>
      </div>
    );

  const SCOPES = [
    { key: 'all' as const, label: 'All spending' },
    { key: 'gen' as const, label: 'General fund' },
    { key: 'cap' as const, label: 'Capital (construction)' },
    { key: 'rest' as const, label: 'Everything else' },
  ];

  const fyRangeNote = fy === 'all' ? 'Jul 2023 – Jun 2026' : `FY${fy} · Jul ${fy - 1} – Jun ${fy}`;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold mb-1">Insights</h2>
          <p className="text-sm text-muted-foreground">
            Two years of district spending in one view. Every chart clicks through to the underlying
            payments, and every payment links to the page of the source PDF it was parsed from.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="insights-fy" className="text-xs text-muted-foreground">Fiscal year</label>
          <select
            id="insights-fy"
            value={String(fy)}
            onChange={(e) => { setFy(e.target.value === 'all' ? 'all' : Number(e.target.value)); setDrill(null); }}
            className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="all">All fiscal years</option>
            {fiscalYears.map((y) => (
              <option key={y} value={y}>FY{y} (Jul {y - 1}–Jun {y})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg px-4 py-3 mb-6 text-xs text-muted-foreground">
        Dataset: 84,883 AP and purchasing-card line items parsed from 280 documents published with
        ICCSD board agendas (Jul 2023 – Jun 2026). Parsed check batches reconcile to the penny
        against the totals printed on the district's own reports.{' '}
        <a href={LEDGER_SITE} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          Full explorer &amp; methodology →
        </a>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total tracked" value={formatCurrency(agg.total)} subtitle={fyRangeNote} />
        <KpiCard label="Line items" value={formatNumber(agg.n)} subtitle="checks + card swipes" />
        <KpiCard label="Check-run dates" value={String(agg.checkRunDates)} subtitle={fy === 'all' ? '102 board-approved batches' : 'board-approved batches'} />
        <KpiCard label="Vendors" value={formatNumber(agg.vendorCount)} subtitle="normalized payees" />
      </div>

      {/* monthly stacked by fund */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold">Monthly spending, stacked by fund</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Click any segment to see its payments.{fy === 'all' ? ' The shaded region holds purchasing-card data only — check-run reports begin May 2024.' : ` Showing FY${fy} only.`}
        </p>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={agg.monthly} margin={{ left: 10, right: 10, top: 4, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
              tickFormatter={(m: string) => (m.slice(5) === '01' || m.slice(5) === '07' ? formatMonth(m) : '')}
              interval={0}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatCompactCurrency}
              tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<StackTooltip />} />
            {fy === 'all' && <ReferenceArea x1="2023-07" x2="2024-04" fill={OTHER_COLOR} fillOpacity={0.08} />}
            {[...agg.topFunds, '__other'].map((fk) => (
              <Bar
                key={fk}
                dataKey={fk}
                stackId="m"
                fill={fk === '__other' ? OTHER_COLOR : getFundColor(fk)}
                fillOpacity={0.85}
                cursor="pointer"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={(data: any) =>
                  setDrill({
                    kind: 'month-fund',
                    month: data.month,
                    fund: fk,
                    label: `${fk === '__other' ? 'All other funds' : fundLabel(fk)} · ${formatMonth(data.month)}`,
                  })
                }
              />
            ))}
            <Legend
              formatter={(v: string) => (
                <span className="text-xs">{v === '__other' ? 'All other funds' : fundLabel(v)}</span>
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* FY25 vs FY26 */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold">FY25 vs FY26, month by month</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Iowa fiscal years run July–June. June 2026 covers only the first days of the month.
            </p>
          </div>
          <div className="flex gap-1.5 mb-2">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onClick={() => setYoyScope(s.key)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  yoyScope === s.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={yoy} margin={{ left: 10, right: 10, top: 4, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={formatCompactCurrency}
              tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v, name) => [formatCurrency(Number(v) || 0), name === 'fy25' ? 'FY25' : 'FY26']}
              contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12 }}
            />
            <Bar
              dataKey="fy25"
              fill="#3b82f6"
              fillOpacity={0.85}
              radius={[2, 2, 0, 0]}
              cursor="pointer"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(d: any) =>
                setDrill({
                  kind: 'month-fund',
                  month: `${d.m >= 7 ? 2024 : 2025}-${String(d.m).padStart(2, '0')}`,
                  fund: null,
                  label: `All payments · ${d.name} FY25`,
                })
              }
            />
            <Bar
              dataKey="fy26"
              fill="#eab308"
              fillOpacity={0.85}
              radius={[2, 2, 0, 0]}
              cursor="pointer"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(d: any) =>
                setDrill({
                  kind: 'month-fund',
                  month: `${d.m >= 7 ? 2025 : 2026}-${String(d.m).padStart(2, '0')}`,
                  fund: null,
                  label: `All payments · ${d.name} FY26`,
                })
              }
            />
            <Legend formatter={(v: string) => <span className="text-xs">{v === 'fy25' ? "FY25 (Jul '24–Jun '25)" : "FY26 (Jul '25–Jun '26)"}</span>} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* top vendors */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold">Where the money goes</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Top payees across checks and cards, with card storefronts grouped (every Amazon storefront counts as one). Click to drill in.
        </p>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={agg.topGroups} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
            <XAxis
              type="number"
              tickFormatter={formatCompactCurrency}
              tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="short" width={190} tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v) => [formatCurrency(Number(v) || 0), 'Total']}
              contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12 }}
            />
            <Bar
              dataKey="total"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(d: any) => setDrill({ kind: 'group', group: d.name, label: toTitle(d.name) })}
            >
              {agg.topGroups.map((g) => (
                <Cell key={g.name} fill="#14b8a6" fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* drill-down */}
      {drill && drillRows && (
        <div className="bg-card border border-primary/40 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">{drill.label}</h3>
            <button
              onClick={() => setDrill(null)}
              className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              Clear ×
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {formatNumber(drillRows.count)} line items totaling {formatCurrencyExact(drillRows.total)}
            {drillRows.count > 100 ? ' — showing the 100 largest' : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium">Vendor</th>
                  <th className="py-1.5 pr-3 font-medium">Description</th>
                  <th className="py-1.5 pr-3 font-medium">Fund</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Amount</th>
                  <th className="py-1.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {drillRows.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 whitespace-nowrap font-mono">{r.date}</td>
                    <td className="py-1.5 pr-3 font-medium">{toTitle(r.vendor)}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground max-w-[320px] truncate" title={r.desc}>
                      {r.desc || '—'}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{r.fund ? fundLabel(r.fund) : 'Card'}</td>
                    <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">{formatCurrencyExact(r.amount)}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      <a
                        href={pdfHref(ledger, r)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline mr-2"
                        title={`${ledger.docs[r.doc]}, page ${r.page}`}
                      >
                        PDF p.{r.page}
                      </a>
                      {agendaHref(ledger, r) && (
                        <a href={agendaHref(ledger, r)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline">
                          agenda
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
