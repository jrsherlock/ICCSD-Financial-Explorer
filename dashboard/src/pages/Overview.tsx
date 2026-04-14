import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { KpiCard } from '../components/ui/KpiCard';
import { useData } from '../lib/data-loader';
import {
  aggregateVendors,
  aggregateByFund,
  topSuppliersBmo,
} from '../lib/aggregations';
import {
  formatCurrency,
  formatNumber,
  formatCompactCurrency,
} from '../lib/formatters';
import { getFundColor, CHART_COLORS, AXIS_TICK_COLOR } from '../lib/colors';

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: { name: string } }[];
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
      <p className="font-medium">{payload[0].payload.name}</p>
      <p className="text-primary">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export function Overview() {
  const navigate = useNavigate();
  const { fundSummary, apLineItems, bmoTransactions, lookups } = useData();
  const vendors = aggregateVendors(apLineItems);
  const fundData = aggregateByFund(apLineItems);
  const topBmoSuppliers = topSuppliersBmo(bmoTransactions, 10);

  const ccPurchases = bmoTransactions
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  const ccCredits = bmoTransactions
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + t.amount, 0);

  const fundChartData = fundSummary.funds
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((f) => ({
      code: f.code,
      name: lookups.funds[f.code] || f.name,
      shortName: (lookups.funds[f.code] || f.name).replace(
        /Fund|Capital Projects - /g,
        ''
      ).trim(),
      total: f.total,
    }));

  const topVendors = vendors.slice(0, 10).map((v, i) => ({
    name: v.name.length > 25 ? v.name.slice(0, 25) + '...' : v.name,
    fullName: v.name,
    total: v.totalAmount,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Financial Overview</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Iowa City Community School District — Accounts Payable &amp; Credit Card Summary
      </p>

      {/* ═══════════════════ ACCOUNTS PAYABLE SECTION ═══════════════════ */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-blue-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Accounts Payable
          </h3>
          <span className="text-xs text-muted-foreground">
            Board-approved invoices with fund &amp; account coding
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="AP Grand Total"
            value={formatCurrency(fundSummary.grandTotal)}
            subtitle={`Report date: ${fundSummary.reportDate}`}
            variant="ap"
          />
          <KpiCard
            label="AP Vendors"
            value={formatNumber(vendors.length)}
            subtitle="Unique vendors"
            variant="ap"
          />
          <KpiCard
            label="Active Funds"
            value={String(fundData.length)}
            subtitle={`of ${fundSummary.funds.length} total funds`}
            variant="ap"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Fund Bar Chart */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">Spending by Fund</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={fundChartData}
                layout="vertical"
                margin={{ left: 10, right: 30, top: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  width={140}
                  tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="total"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(data: any) => navigate(`/fund/${data.code}`)}
                >
                  {fundChartData.map((entry) => (
                    <Cell
                      key={entry.code}
                      fill={getFundColor(entry.code)}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top AP Vendors */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">Top AP Vendors</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={topVendors}
                layout="vertical"
                margin={{ left: 10, right: 30, top: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {topVendors.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══════════════════ CREDIT CARDS SECTION ═══════════════════ */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-purple-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
            Credit Cards
          </h3>
          <span className="text-xs text-muted-foreground">
            BMO Mastercard transactions by card &amp; supplier
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="CC Total Purchases"
            value={formatCurrency(ccPurchases)}
            subtitle={`${formatNumber(bmoTransactions.filter((t) => t.amount > 0).length)} transactions`}
            variant="cc"
          />
          <KpiCard
            label="CC Credits / Returns"
            value={formatCurrency(Math.abs(ccCredits))}
            subtitle={`${formatNumber(bmoTransactions.filter((t) => t.amount < 0).length)} transactions`}
            variant="cc"
          />
          <KpiCard
            label="CC Net Spend"
            value={formatCurrency(ccPurchases + ccCredits)}
            subtitle={`${formatNumber(bmoTransactions.length)} total transactions`}
            variant="cc"
          />
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">
            Top Credit Card Suppliers (Normalized)
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {topBmoSuppliers.map((s, i) => (
              <div
                key={s.name}
                className="bg-secondary/50 rounded-md p-3 border border-border/50"
              >
                <p className="text-xs text-muted-foreground">#{i + 1}</p>
                <p className="font-medium text-sm truncate" title={s.name}>
                  {s.name}
                </p>
                <p className="text-purple-600 dark:text-purple-400 text-sm font-bold">
                  {formatCurrency(s.total)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {s.count} transactions
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
