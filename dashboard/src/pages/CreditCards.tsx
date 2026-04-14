import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { KpiCard } from '../components/ui/KpiCard';
import { bmoTransactions } from '../lib/data-loader';
import {
  aggregateMonthlyBmoSpend,
  topSuppliersBmo,
} from '../lib/aggregations';
import {
  formatCurrency,
  formatNumber,
  formatMonth,
  formatCompactCurrency,
  formatCurrencyExact,
  formatDate,
} from '../lib/formatters';
import { CHART_COLORS } from '../lib/colors';

export function CreditCards() {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(1000);

  const filteredTxns = useMemo(
    () =>
      selectedCard
        ? bmoTransactions.filter((t) => t.card === selectedCard)
        : bmoTransactions,
    [selectedCard]
  );

  const monthlyData = aggregateMonthlyBmoSpend(filteredTxns);
  const topSuppliers = topSuppliersBmo(filteredTxns, 15);
  const totalSpend = filteredTxns.reduce((s, t) => s + t.amount, 0);

  // Card breakdown
  const cards = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const t of bmoTransactions) {
      const existing = map.get(t.card);
      if (existing) {
        existing.count++;
        existing.total += t.amount;
      } else {
        map.set(t.card, { count: 1, total: t.amount });
      }
    }
    return Array.from(map.entries())
      .map(([card, data]) => ({ card, ...data }))
      .sort((a, b) => b.total - a.total);
  }, []);

  // Anomalies
  const anomalies = filteredTxns
    .filter((t) => Math.abs(t.amount) >= threshold)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  // Date range
  const dates = filteredTxns.map((t) => t.tranDate).sort();
  const dateRange =
    dates.length > 0
      ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`
      : 'N/A';

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
        <p className="font-medium">{label ? formatMonth(label) : ''}</p>
        <p className="text-primary">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Credit Card Analytics</h2>
      <p className="text-sm text-muted-foreground mb-6">{dateRange}</p>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total CC Spend"
          value={formatCurrency(totalSpend)}
          subtitle={selectedCard ? `Card ****${selectedCard}` : 'All cards'}
        />
        <KpiCard
          label="Transactions"
          value={formatNumber(filteredTxns.length)}
        />
        <KpiCard
          label="Avg Transaction"
          value={formatCurrency(
            filteredTxns.length > 0 ? totalSpend / filteredTxns.length : 0
          )}
        />
        <KpiCard
          label="Active Cards"
          value={String(cards.length)}
          subtitle="Unique card numbers"
        />
      </div>

      {/* Card filter buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSelectedCard(null)}
          className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
            !selectedCard
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          All Cards
        </button>
        {cards.map((c) => (
          <button
            key={c.card}
            onClick={() => setSelectedCard(c.card)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              selectedCard === c.card
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            ****{c.card}{' '}
            <span className="text-xs opacity-75">
              ({formatCompactCurrency(c.total)})
            </span>
          </button>
        ))}
      </div>

      {/* Time Series */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold mb-4">Monthly Spending</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis
              dataKey="month"
              tickFormatter={(m) => formatMonth(m)}
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
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#colorSpend)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Top Suppliers */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">Top Suppliers</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={topSuppliers.map((s) => ({
                name:
                  s.name.length > 20 ? s.name.slice(0, 20) + '…' : s.name,
                fullName: s.name,
                total: s.total,
              }))}
              layout="vertical"
              margin={{ left: 10, right: 30 }}
            >
              <XAxis
                type="number"
                tickFormatter={formatCompactCurrency}
                tick={{ fill: '#a0a0b4', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fill: '#a0a0b4', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium">{p.fullName}</p>
                      <p className="text-primary">
                        {formatCurrency(payload[0].value as number)}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                {topSuppliers.map((_, i) => (
                  <Cell
                    key={i}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Anomalies */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">
              Large Transactions (&ge; {formatCurrency(threshold)})
            </h3>
            <select
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
            >
              <option value={500}>$500+</option>
              <option value={1000}>$1,000+</option>
              <option value={2500}>$2,500+</option>
              <option value={5000}>$5,000+</option>
            </select>
          </div>
          <div className="space-y-2 max-h-[380px] overflow-y-auto">
            {anomalies.slice(0, 50).map((t, i) => (
              <div
                key={`${t.tranDate}-${t.supplier}-${i}`}
                className="flex justify-between items-center py-1.5 px-2 rounded bg-secondary/30 text-sm"
              >
                <div className="min-w-0 mr-3">
                  <p className="font-medium truncate">
                    {t.supplierNormalized || t.supplier}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(t.tranDate)} · Card ****{t.card}
                  </p>
                </div>
                <span
                  className={`font-mono text-sm shrink-0 ${t.amount < 0 ? 'text-green-400' : 'text-foreground'}`}
                >
                  {formatCurrencyExact(t.amount)}
                </span>
              </div>
            ))}
            {anomalies.length === 0 && (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No transactions above threshold
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
