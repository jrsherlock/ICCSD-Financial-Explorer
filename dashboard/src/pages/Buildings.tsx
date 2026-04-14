import { useData } from '../lib/data-loader';
import { aggregateBuildings } from '../lib/aggregations';
import { formatCurrency, formatCompactCurrency } from '../lib/formatters';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_COLORS, AXIS_TICK_COLOR } from '../lib/colors';

export function Buildings() {
  const { apLineItems, lookups } = useData();
  const buildings = aggregateBuildings(apLineItems, lookups);
  const chartData = buildings.slice(0, 20).map((b) => ({
    name: b.name.length > 22 ? b.name.slice(0, 22) + '\u2026' : b.name,
    fullName: b.name,
    code: b.code,
    total: b.totalAmount,
  }));

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { value: number; payload: { fullName: string; code: string } }[];
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
        <p className="font-medium">{payload[0].payload.fullName}</p>
        <p className="text-xs text-muted-foreground">
          Code: {payload[0].payload.code}
        </p>
        <p className="text-primary">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-1 h-5 rounded-full bg-blue-500" />
        <h2 className="text-xl font-bold">Building/Site View</h2>
        <span className="text-[10px] font-medium uppercase tracking-wider bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">AP</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6 ml-4">
        Spending by school and facility · Derived from AP account codes
      </p>

      {/* Bar Chart */}
      <div className="bg-card border border-border rounded-lg p-5 mb-8">
        <h3 className="text-sm font-semibold mb-4">
          Top 20 Buildings by Spending
        </h3>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 10, right: 30 }}
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
              width={170}
              tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]}>
              {chartData.map((_, i) => (
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

      {/* Building Cards */}
      <div className="grid grid-cols-3 gap-4">
        {buildings.map((b) => (
          <div
            key={b.code}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold text-sm">{b.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Code: {b.code}
                </p>
              </div>
              <p className="text-primary font-bold text-sm">
                {formatCurrency(b.totalAmount)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {b.lineItemCount} line items
            </p>
            <div className="space-y-1">
              {b.topFunctions.slice(0, 3).map((fn) => (
                <div
                  key={fn.code}
                  className="flex justify-between text-xs"
                >
                  <span className="text-muted-foreground truncate mr-2">
                    {fn.name}
                  </span>
                  <span className="font-mono shrink-0">
                    {formatCompactCurrency(fn.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
