import { useParams, Link } from 'react-router-dom';
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
import { fundSummary, apLineItems, lookups } from '../lib/data-loader';
import { formatCurrency, formatCurrencyExact, formatDate, formatCompactCurrency } from '../lib/formatters';
import { CHART_COLORS } from '../lib/colors';

export function FundDetail() {
  const { code } = useParams<{ code: string }>();
  const fund = fundSummary.funds.find((f) => f.code === code);
  const items = apLineItems.filter((i) => i.fund === code);

  if (!fund) {
    return (
      <div>
        <Link to="/" className="text-primary text-sm hover:underline">
          ← Back to Overview
        </Link>
        <p className="mt-4 text-muted-foreground">Fund not found.</p>
      </div>
    );
  }

  // Vendor breakdown
  const vendorMap = new Map<string, number>();
  for (const item of items) {
    vendorMap.set(
      item.vendor,
      (vendorMap.get(item.vendor) || 0) + item.invoiceTotal
    );
  }
  const vendorData = Array.from(vendorMap.entries())
    .map(([name, total]) => ({
      name: name.length > 30 ? name.slice(0, 30) + '…' : name,
      fullName: name,
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // Building breakdown
  const buildingMap = new Map<string, number>();
  for (const item of items) {
    for (const li of item.lineItems) {
      buildingMap.set(
        li.building,
        (buildingMap.get(li.building) || 0) + li.amount
      );
    }
  }
  const buildingData = Array.from(buildingMap.entries())
    .map(([bCode, total]) => ({
      code: bCode,
      name: lookups.buildings[bCode] || `Building ${bCode}`,
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { value: number; payload: { name?: string; fullName?: string } }[];
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
        <p className="font-medium">
          {payload[0].payload.fullName || payload[0].payload.name}
        </p>
        <p className="text-primary">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  };

  return (
    <div>
      <Link to="/" className="text-primary text-sm hover:underline">
        ← Back to Overview
      </Link>
      <div className="flex items-center gap-3 mt-3 mb-1">
        <div className="w-1 h-5 rounded-full bg-blue-500" />
        <h2 className="text-xl font-bold">
          Fund {fund.code}: {lookups.funds[fund.code] || fund.name}
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wider bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded">AP</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6 ml-4">
        Detailed breakdown of accounts payable
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KpiCard label="Fund Total" value={formatCurrency(fund.total)} variant="ap" />
        <KpiCard
          label="Vendors"
          value={String(vendorMap.size)}
          subtitle="unique vendors"
          variant="ap"
        />
        <KpiCard
          label="Invoices"
          value={String(items.length)}
          subtitle="total invoices"
          variant="ap"
        />
      </div>

      {/* Report dates */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3">AP by Report Date</h3>
        <div className="flex gap-4">
          {fund.details.map((d) => (
            <div
              key={d.reportDate}
              className="bg-secondary/50 rounded-md px-4 py-3 border border-border/50"
            >
              <p className="text-xs text-muted-foreground">
                {formatDate(d.reportDate)}
              </p>
              <p className="text-sm font-bold">{formatCurrency(d.amount)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Vendor Chart */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">
            Top Vendors (Fund {fund.code})
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={vendorData}
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
                width={180}
                tick={{ fill: '#a0a0b4', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                {vendorData.map((_, i) => (
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

        {/* Building Chart */}
        {buildingData.length > 1 && (
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-4">
              Building/Site Distribution
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={buildingData}
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
                  width={160}
                  tick={{ fill: '#a0a0b4', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} fill="#14b8a6" fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Invoice Table */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4">All Invoices</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Invoice</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Report Date</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items
                .sort((a, b) => b.invoiceTotal - a.invoiceTotal)
                .map((item, i) => (
                  <tr
                    key={`${item.invoice}-${i}`}
                    className="border-b border-border/50 hover:bg-secondary/30"
                  >
                    <td className="py-2 pr-4 font-medium">{item.vendor}</td>
                    <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                      {item.invoice}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {formatDate(item.invoiceDate)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {formatDate(item.reportDate)}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {formatCurrencyExact(item.invoiceTotal)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
