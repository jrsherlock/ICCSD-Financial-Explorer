import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { KpiCard } from '../components/ui/KpiCard';
import { fundSummary, bmoTransactions } from '../lib/data-loader';
import {
  formatCurrency,
  formatMonth,
  formatCompactCurrency,
  formatDate,
  formatNumber,
  formatCurrencyExact,
} from '../lib/formatters';
import { CHART_COLORS } from '../lib/colors';

export function Timeline() {
  // Monthly CC spend — debits only (exclude credits/payments which distort the chart)
  const monthlyData = useMemo(() => {
    const map = new Map<
      string,
      { debits: number; credits: number; count: number }
    >();

    for (const t of bmoTransactions) {
      const month = t.tranDate.slice(0, 7);
      const existing = map.get(month) || { debits: 0, credits: 0, count: 0 };
      if (t.amount >= 0) {
        existing.debits += t.amount;
      } else {
        existing.credits += t.amount;
      }
      existing.count += 1;
      map.set(month, existing);
    }

    return Array.from(map.entries())
      .map(([month, data]) => ({
        month,
        spend: Math.round(data.debits * 100) / 100,
        credits: Math.round(Math.abs(data.credits) * 100) / 100,
        net: Math.round((data.debits + data.credits) * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, []);

  // Large purchases only (exclude payments/credits)
  const largeTransactions = useMemo(
    () =>
      bmoTransactions
        .filter((t) => t.amount >= 2000)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 30),
    []
  );

  // Monthly transaction count for a secondary chart
  const monthlyVolume = useMemo(
    () =>
      monthlyData.map((m) => ({
        month: m.month,
        count: m.count,
      })),
    [monthlyData]
  );

  // AP by report date
  const apByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const fund of fundSummary.funds) {
      for (const d of fund.details) {
        map.set(d.reportDate, (map.get(d.reportDate) || 0) + d.amount);
      }
    }
    return Array.from(map.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, []);

  // Summary stats
  const totalSpend = monthlyData.reduce((s, m) => s + m.spend, 0);
  const totalCredits = monthlyData.reduce((s, m) => s + m.credits, 0);
  const avgMonthly = monthlyData.length > 0 ? totalSpend / monthlyData.length : 0;

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Timeline</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Spending patterns over time — AP invoices &amp; credit card transactions
      </p>

      {/* ═══════════════════ CREDIT CARDS SECTION ═══════════════════ */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-purple-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-400">
            Credit Card Trends
          </h3>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="Total CC Purchases"
            value={formatCurrency(totalSpend)}
            subtitle={`${monthlyData.length} months`}
            variant="cc"
          />
          <KpiCard
            label="Total Credits/Returns"
            value={formatCurrency(totalCredits)}
            variant="cc"
          />
          <KpiCard
            label="Avg Monthly CC Spend"
            value={formatCurrency(avgMonthly)}
            variant="cc"
          />
        </div>

        {/* Monthly CC spend area chart — debits only */}
        <div className="bg-card border border-border rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold mb-1">
            Monthly Credit Card Spending (Purchases Only)
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Credits and returns excluded to show true purchasing activity
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart
              data={monthlyData}
              margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
            >
              <defs>
                <linearGradient id="ccGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tick={{ fill: '#a0a0b4', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fill: '#a0a0b4', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium">
                        {formatMonth(label as string)}
                      </p>
                      <p className="text-purple-400">
                        {formatCurrency(d.spend)} purchases
                      </p>
                      {d.credits > 0 && (
                        <p className="text-green-400">
                          -{formatCurrency(d.credits)} credits
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {d.count} transactions
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#ccGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Transaction Volume bar chart */}
        <div className="bg-card border border-border rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4">
            Monthly CC Transaction Volume
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={monthlyVolume}
              margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tick={{ fill: '#a0a0b4', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fill: '#a0a0b4', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium">
                        {formatMonth(label as string)}
                      </p>
                      <p className="text-purple-400">
                        {formatNumber(payload[0].value as number)} transactions
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {monthlyVolume.map((_, i) => (
                  <Cell
                    key={i}
                    fill="#a855f7"
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Large CC Transactions */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">
            Largest CC Transactions (&ge; $2,000)
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {largeTransactions.map((t, i) => (
              <div
                key={`${t.tranDate}-${t.card}-${i}`}
                className="flex justify-between items-center py-1.5 px-3 rounded bg-secondary/30 text-sm"
              >
                <div className="min-w-0 mr-3">
                  <p className="font-medium truncate">
                    {t.supplierNormalized || t.supplier}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(t.tranDate)} ·{' '}
                    <Link
                      to={`/credit-cards?cards=${t.card}`}
                      className="text-purple-400/70 hover:text-purple-300 hover:underline transition-colors"
                    >
                      Card {t.card}
                    </Link>
                  </p>
                </div>
                <span
                  className={`font-mono text-sm shrink-0 ${
                    t.amount < 0 ? 'text-green-400' : ''
                  }`}
                >
                  {formatCurrencyExact(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════ ACCOUNTS PAYABLE SECTION ═══════════════════ */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-blue-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-400">
            Accounts Payable Timeline
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <KpiCard
            label="AP Grand Total"
            value={formatCurrency(fundSummary.grandTotal)}
            subtitle={fundSummary.reportDate}
            variant="ap"
          />
          <KpiCard
            label="Report Dates"
            value={String(apByDate.length)}
            subtitle="Board report batches"
            variant="ap"
          />
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">AP Amounts by Report Date</h3>
          <div className="space-y-3">
            {apByDate.map((d) => (
              <div
                key={d.date}
                className="flex justify-between items-center py-2 px-3 bg-secondary/30 rounded"
              >
                <span className="text-sm text-muted-foreground">
                  {formatDate(d.date)}
                </span>
                <span className="text-sm font-bold">
                  {formatCurrency(d.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
