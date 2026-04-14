import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { fundSummary, bmoTransactions } from '../lib/data-loader';
import { aggregateMonthlyBmoSpend } from '../lib/aggregations';
import {
  formatCurrency,
  formatMonth,
  formatCompactCurrency,
  formatDate,
} from '../lib/formatters';

export function Timeline() {
  const monthlyCC = aggregateMonthlyBmoSpend(bmoTransactions);

  // AP by report date
  const apByDate = new Map<string, number>();
  for (const fund of fundSummary.funds) {
    for (const d of fund.details) {
      apByDate.set(d.reportDate, (apByDate.get(d.reportDate) || 0) + d.amount);
    }
  }
  const apDates = Array.from(apByDate.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Scatter data: individual CC transactions by amount/date
  const scatterData = bmoTransactions
    .filter((t) => t.amount > 0)
    .map((t) => ({
      date: new Date(t.tranDate + 'T00:00:00').getTime(),
      amount: t.amount,
      supplier: t.supplierNormalized || t.supplier,
    }));

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Timeline</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Spending patterns over time
      </p>

      {/* Monthly CC spend area chart */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold mb-4">
          Monthly Credit Card Spending
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart
            data={monthlyCC}
            margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
          >
            <defs>
              <linearGradient id="ccGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
                    <p className="font-medium">{formatMonth(label as string)}</p>
                    <p className="text-accent">
                      {formatCurrency(payload[0].value as number)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.transactionCount} transactions
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#ccGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Transaction Scatter */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold mb-4">
          Individual Transactions (by amount)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis
              dataKey="date"
              type="number"
              domain={['auto', 'auto']}
              tickFormatter={(ts) => {
                const d = new Date(ts);
                return d.toLocaleDateString('en-US', {
                  month: 'short',
                  year: '2-digit',
                });
              }}
              tick={{ fill: '#a0a0b4', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="amount"
              tickFormatter={formatCompactCurrency}
              tick={{ fill: '#a0a0b4', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ZAxis range={[15, 15]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
                    <p className="font-medium">{d.supplier}</p>
                    <p className="text-primary">
                      {formatCurrency(d.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(
                        new Date(d.date).toISOString().slice(0, 10)
                      )}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.4} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* AP Report Dates */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4">AP Report Dates</h3>
        <div className="flex gap-3 flex-wrap">
          {apDates.map((d) => (
            <div
              key={d.date}
              className="bg-secondary/50 border border-border/50 rounded-md px-4 py-3"
            >
              <p className="text-xs text-muted-foreground">
                {formatDate(d.date)}
              </p>
              <p className="text-sm font-bold">{formatCurrency(d.amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
