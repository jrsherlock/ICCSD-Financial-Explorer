import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { KpiCard } from '../components/ui/KpiCard';
import { useTheme } from '../lib/theme';
import { useData } from '../lib/data-loader';
import { topSuppliersBmo } from '../lib/aggregations';
import {
  formatCurrency,
  formatNumber,
  formatMonth,
  formatCompactCurrency,
  formatCurrencyExact,
  formatDate,
} from '../lib/formatters';
import { CHART_COLORS, AXIS_TICK_COLOR, GRID_STROKE_COLOR } from '../lib/colors';

export function CreditCards() {
  const { bmoTransactions, allCards, lookups } = useData();
  const cardLabel = (card: string) => lookups.cards?.[card] || '';

  // Compute the full date range
  const [DATA_MIN, DATA_MAX] = useMemo(() => {
    const dates = bmoTransactions.map((t) => t.tranDate).sort();
    return [dates[0] || '2023-07-01', dates[dates.length - 1] || '2026-04-30'];
  }, [bmoTransactions]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCards, setSelectedCards] = useState<Set<string>>(() => {
    const param = searchParams.get('cards');
    return param ? new Set(param.split(',').filter(Boolean)) : new Set<string>();
  });

  // Sync URL params when selectedCards changes
  useEffect(() => {
    if (selectedCards.size > 0) {
      setSearchParams({ cards: Array.from(selectedCards).join(',') }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [selectedCards, setSearchParams]);
  const [threshold, setThreshold] = useState(1000);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [showTable, setShowTable] = useState(false);
  const [inspectCard, setInspectCard] = useState<string | null>(null);
  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const [chartMode, setChartMode] = useState<'aggregated' | 'by-card'>('aggregated');
  const [chartType, setChartType] = useState<'line' | 'stacked'>('line');
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(new Set());
  const { theme } = useTheme();

  // Card picker: filter the full list by search
  const visibleCards = useMemo(() => {
    if (!cardSearch) return allCards;
    const q = cardSearch.toLowerCase();
    return allCards.filter(
      (c) =>
        c.card.includes(q) ||
        c.label.toLowerCase().includes(q)
    );
  }, [cardSearch]);

  const toggleCard = (card: string) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(card)) {
        next.delete(card);
      } else {
        next.add(card);
      }
      return next;
    });
  };

  // Filter transactions by selected cards + date range + supplier
  const filteredTxns = useMemo(() => {
    let txns = bmoTransactions;
    if (selectedCards.size > 0) {
      txns = txns.filter((t) => selectedCards.has(t.card));
    }
    if (dateFrom) {
      txns = txns.filter((t) => t.tranDate >= dateFrom);
    }
    if (dateTo) {
      txns = txns.filter((t) => t.tranDate <= dateTo);
    }
    if (supplierFilter) {
      const q = supplierFilter.toLowerCase();
      txns = txns.filter(
        (t) =>
          t.supplier.toLowerCase().includes(q) ||
          (t.supplierNormalized && t.supplierNormalized.toLowerCase().includes(q))
      );
    }
    return txns;
  }, [bmoTransactions, selectedCards, dateFrom, dateTo, supplierFilter]);

  // Separate debits (purchases) from credits (returns/payments) per month
  const monthlyData = useMemo(() => {
    const map = new Map<string, { spend: number; credits: number; count: number }>();
    for (const t of filteredTxns) {
      const month = t.tranDate.slice(0, 7);
      const existing = map.get(month) || { spend: 0, credits: 0, count: 0 };
      if (t.amount >= 0) {
        existing.spend += t.amount;
      } else {
        existing.credits += t.amount;
      }
      existing.count += 1;
      map.set(month, existing);
    }
    return Array.from(map.entries())
      .map(([month, d]) => ({
        month,
        spend: Math.round(d.spend * 100) / 100,
        credits: Math.round(Math.abs(d.credits) * 100) / 100,
        count: d.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredTxns]);

  // Per-card monthly data for multi-line chart (when 2–10 cards selected)
  const perCardMonthly = useMemo(() => {
    if (selectedCards.size < 2 || selectedCards.size > 10) return null;
    const cards = Array.from(selectedCards);
    // Build map: month → { card1: spend, card2: spend, ... }
    const map = new Map<string, Record<string, number>>();
    for (const t of filteredTxns) {
      if (t.amount < 0) continue; // purchases only
      const month = t.tranDate.slice(0, 7);
      if (!map.has(month)) map.set(month, {});
      const row = map.get(month)!;
      row[t.card] = (row[t.card] || 0) + t.amount;
    }
    // Convert to sorted array with all card keys present (0 for missing months)
    return Array.from(map.entries())
      .map(([month, row]) => {
        const point: Record<string, number | string> = { month };
        for (const card of cards) {
          point[card] = Math.round((row[card] || 0) * 100) / 100;
        }
        return point;
      })
      .sort((a, b) => (a.month as string).localeCompare(b.month as string));
  }, [filteredTxns, selectedCards]);

  const cardChartColors = [
    '#a855f7', '#ec4899', '#06b6d4', '#22c55e', '#eab308',
    '#f97316', '#ef4444', '#6366f1', '#14b8a6', '#d946ef',
  ];

  const topSuppliers = topSuppliersBmo(filteredTxns, 15);

  // Separate debits/credits for meaningful KPIs
  const { totalPurchases, totalCredits, debitCount } = useMemo(() => {
    let purchases = 0;
    let credits = 0;
    let debits = 0;
    for (const t of filteredTxns) {
      if (t.amount >= 0) {
        purchases += t.amount;
        debits++;
      } else {
        credits += t.amount;
      }
    }
    return { totalPurchases: purchases, totalCredits: credits, debitCount: debits };
  }, [filteredTxns]);

  // Card profile for the inspected card
  const cardProfile = useMemo(() => {
    if (!inspectCard) return null;
    const txns = bmoTransactions.filter((t) => t.card === inspectCard);
    if (!txns.length) return null;

    const dates = txns.map((t) => t.tranDate).sort();
    const suppliers = new Map<string, { count: number; total: number }>();
    let purchases = 0;
    let credits = 0;

    for (const t of txns) {
      const name = t.supplierNormalized || t.supplier;
      const existing = suppliers.get(name) || { count: 0, total: 0 };
      existing.count++;
      if (t.amount > 0) {
        existing.total += t.amount;
        purchases += t.amount;
      } else {
        credits += t.amount;
      }
      suppliers.set(name, existing);
    }

    const topSuppliers = Array.from(suppliers.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const matchesBuilding = lookups.buildings[inspectCard];
    const label = cardLabel(inspectCard);

    return {
      card: inspectCard,
      label,
      matchesBuilding,
      totalTxns: txns.length,
      purchases,
      credits: Math.abs(credits),
      dateRange: `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`,
      topSuppliers,
      uniqueSuppliers: suppliers.size,
    };
  }, [inspectCard, bmoTransactions, lookups]);

  // Large purchases only (exclude payments/credits)
  const anomalies = filteredTxns
    .filter((t) => t.amount >= threshold)
    .sort((a, b) => b.amount - a.amount);

  // Active date range label
  const activeDateRange = useMemo(() => {
    if (!filteredTxns.length) return 'No transactions';
    const sorted = filteredTxns.map((t) => t.tranDate).sort();
    return `${formatDate(sorted[0])} – ${formatDate(sorted[sorted.length - 1])}`;
  }, [filteredTxns]);

  const hasFilters = !!(dateFrom || dateTo || supplierFilter || selectedCards.size > 0);

  const clearFilters = () => {
    setSelectedCards(new Set());
    setCardSearch('');
    setDateFrom('');
    setDateTo('');
    setSupplierFilter('');
  };

  // CSV export for filtered results
  const exportCsv = useCallback(() => {
    const headers = ['Date', 'Posting Date', 'Card', 'Card Label', 'Supplier', 'Normalized', 'Amount'];
    const rows = filteredTxns.map((t) => [
      t.tranDate,
      t.postingDate,
      t.card,
      `"${cardLabel(t.card)}"`,
      `"${t.supplier}"`,
      `"${t.supplierNormalized || ''}"`,
      t.amount.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = [
      dateFrom && `from-${dateFrom}`,
      dateTo && `to-${dateTo}`,
      selectedCards.size > 0 && `cards-${Array.from(selectedCards).join('+')}`,
      supplierFilter && `supplier-${supplierFilter}`,
    ]
      .filter(Boolean)
      .join('_') || 'all';
    a.download = `iccsd-cc-transactions-${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredTxns, dateFrom, dateTo, selectedCards, supplierFilter, lookups]);

  // Paginated table
  const PAGE_SIZE = 100;
  const [tablePage, setTablePage] = useState(0);
  const sortedForTable = useMemo(
    () => [...filteredTxns].sort((a, b) => b.tranDate.localeCompare(a.tranDate)),
    [filteredTxns]
  );
  const tableSlice = sortedForTable.slice(
    tablePage * PAGE_SIZE,
    (tablePage + 1) * PAGE_SIZE
  );
  const totalPages = Math.ceil(sortedForTable.length / PAGE_SIZE);

  // Format card display string
  const cardDisplay = (card: string) => {
    const label = cardLabel(card);
    return label ? `${card} — ${label}` : card;
  };

  const selectedCardsSummary = selectedCards.size === 0
    ? 'All cards'
    : selectedCards.size === 1
      ? `Card ****${Array.from(selectedCards)[0]}`
      : `${selectedCards.size} cards selected`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-1 h-5 rounded-full bg-purple-500" />
        <h2 className="text-xl font-bold">Credit Card Analytics</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4 ml-4">{activeDateRange} · BMO Mastercard transactions</p>

      {/* ── Filters ── */}
      <div className="bg-secondary/40 border border-border border-t-2 border-t-purple-500/60 rounded-lg p-4 mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-3">Filters</p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              min={DATA_MIN}
              max={DATA_MAX}
              onChange={(e) => { setDateFrom(e.target.value); setTablePage(0); }}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              min={DATA_MIN}
              max={DATA_MAX}
              onChange={(e) => { setDateTo(e.target.value); setTablePage(0); }}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Supplier
            </label>
            <input
              type="text"
              placeholder="Filter by supplier..."
              value={supplierFilter}
              onChange={(e) => { setSupplierFilter(e.target.value); setTablePage(0); }}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-purple-500/50 w-48"
            />
          </div>
          <div className="flex gap-2">
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="bg-card hover:bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear All
              </button>
            )}
            <button
              onClick={() => { setShowTable(!showTable); setTablePage(0); }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                showTable
                  ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30'
                  : hasFilters && !showTable
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-200 dark:shadow-purple-500/25 hover:bg-purple-600 border border-purple-500'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
              }`}
            >
              {showTable ? 'Hide Transactions' : hasFilters ? `Show ${formatNumber(filteredTxns.length)} Transactions` : 'Show Transactions'}
            </button>
            <button
              onClick={exportCsv}
              className="bg-card hover:bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Card multi-select picker */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cards</span>
            <button
              onClick={() => setCardPickerOpen(!cardPickerOpen)}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${
                cardPickerOpen
                  ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {cardPickerOpen ? 'Close picker' : 'Select cards...'}
            </button>
            <span className="text-xs text-muted-foreground">{selectedCardsSummary}</span>
            {selectedCards.size > 0 && (
              <button
                onClick={() => setSelectedCards(new Set())}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline"
              >
                clear
              </button>
            )}
          </div>

          {/* Selected card chips */}
          {selectedCards.size > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {Array.from(selectedCards).map((card) => (
                <button
                  key={card}
                  onClick={() => toggleCard(card)}
                  className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs px-2 py-1 rounded-md hover:bg-purple-500/30 transition-colors"
                >
                  <span className="font-mono font-medium">{card}</span>
                  {cardLabel(card) && (
                    <span className="text-purple-500 dark:text-purple-400/70">{cardLabel(card)}</span>
                  )}
                  <span className="ml-0.5 opacity-60">x</span>
                </button>
              ))}
            </div>
          )}

          {/* Expandable card picker */}
          {cardPickerOpen && (
            <div className="bg-card border border-border rounded-lg p-3 mt-2">
              <input
                type="text"
                placeholder="Search by card number or department name..."
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                autoFocus
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-purple-500/50 mb-3"
              />
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {visibleCards.map((c) => {
                  const isSelected = selectedCards.has(c.card);
                  return (
                    <button
                      key={c.card}
                      onClick={() => toggleCard(c.card)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors ${
                        isSelected
                          ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                          : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-purple-500 border-purple-500'
                          : 'border-border'
                      }`}>
                        {isSelected && <span className="text-white text-[9px]">&#10003;</span>}
                      </span>
                      <span className="font-mono font-medium w-12 shrink-0">{c.card}</span>
                      <span className="text-muted-foreground truncate flex-1">
                        {c.label || '—'}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {formatNumber(c.txnCount)} txns
                      </span>
                      <span className="text-xs font-mono shrink-0 tabular-nums w-20 text-right">
                        {formatCompactCurrency(c.totalSpend)}
                      </span>
                    </button>
                  );
                })}
                {visibleCards.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    No cards match "{cardSearch}"
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <span>{visibleCards.length} cards shown · {selectedCards.size} selected</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedCards(new Set(visibleCards.map((c) => c.card)));
                    }}
                    className="hover:text-foreground transition-colors"
                  >
                    Select visible
                  </button>
                  <button
                    onClick={() => setSelectedCards(new Set())}
                    className="hover:text-foreground transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {hasFilters && (
          <p className="text-xs text-muted-foreground mt-2">
            Showing {formatNumber(filteredTxns.length)} of{' '}
            {formatNumber(bmoTransactions.length)} transactions
          </p>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total Purchases"
          value={formatCurrency(totalPurchases)}
          subtitle={selectedCardsSummary}
          variant="cc"
        />
        <KpiCard
          label="Credits / Returns"
          value={formatCurrency(Math.abs(totalCredits))}
          subtitle={`${filteredTxns.length - debitCount} transactions`}
          variant="cc"
        />
        <KpiCard
          label="Transactions"
          value={formatNumber(filteredTxns.length)}
          subtitle={`${formatNumber(debitCount)} purchases`}
          variant="cc"
        />
        <KpiCard
          label="Avg Purchase"
          value={formatCurrency(debitCount > 0 ? totalPurchases / debitCount : 0)}
          variant="cc"
        />
      </div>

      {/* Transaction Table (toggled) */}
      {showTable && (
        <div className="bg-card border border-border rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              Transactions ({formatNumber(sortedForTable.length)})
            </h3>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setTablePage(Math.max(0, tablePage - 1))}
                  disabled={tablePage === 0}
                  className="px-2 py-1 rounded bg-secondary text-muted-foreground disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="text-muted-foreground">
                  Page {tablePage + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setTablePage(Math.min(totalPages - 1, tablePage + 1))}
                  disabled={tablePage >= totalPages - 1}
                  className="px-2 py-1 rounded bg-secondary text-muted-foreground disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Card</th>
                  <th className="py-2 pr-3">Supplier (Raw)</th>
                  <th className="py-2 pr-3">Supplier (Normalized)</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {tableSlice.map((t, i) => (
                  <tr
                    key={`${t.tranDate}-${t.card}-${t.supplier}-${i}`}
                    className="border-b border-border/50 hover:bg-secondary/30"
                  >
                    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(t.tranDate)}
                    </td>
                    <td className="py-1.5 pr-3 group/card">
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setInspectCard(inspectCard === t.card ? null : t.card)}
                          className="text-left hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                          title="Inspect card profile"
                        >
                          <span className="font-mono text-xs">
                            {t.card}
                          </span>
                          {cardLabel(t.card) && (
                            <span className="text-muted-foreground text-[10px] ml-1.5">
                              {cardLabel(t.card)}
                            </span>
                          )}
                        </button>
                        {!selectedCards.has(t.card) && (
                          <button
                            onClick={() => toggleCard(t.card)}
                            title="Add card to filter"
                            className="text-[9px] text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 opacity-0 group-hover/card:opacity-100 transition-all ml-1 bg-secondary/80 hover:bg-purple-50 dark:hover:bg-purple-500/15 rounded px-1 py-0.5"
                          >
                            +filter
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 max-w-xs truncate" title={t.supplier}>
                      {t.supplier}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {t.supplierNormalized || '—'}
                    </td>
                    <td
                      className={`py-1.5 text-right font-mono whitespace-nowrap ${
                        t.amount < 0 ? 'text-green-600 dark:text-green-400' : ''
                      }`}
                    >
                      {formatCurrencyExact(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Card Inspect Panel */}
      {cardProfile && (
        <div className="bg-card border-2 border-purple-200 dark:border-purple-500/30 rounded-lg p-5 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                Card Profile: <span className="font-mono">{cardProfile.card}</span>
                <button
                  onClick={() => setInspectCard(null)}
                  className="text-muted-foreground hover:text-foreground text-xs ml-2"
                >
                  dismiss
                </button>
              </h3>
              {cardProfile.label ? (
                <p className="text-lg font-bold mt-1">{cardProfile.label}</p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">No department label on file</p>
              )}
              {cardProfile.matchesBuilding && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                  ICCSD building/dept code: {cardProfile.matchesBuilding}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedCards(new Set([cardProfile.card]));
                setInspectCard(null);
              }}
              className="bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs px-3 py-1.5 rounded-md transition-colors"
            >
              Filter to this card
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-secondary/50 rounded-md px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase">Purchases</p>
              <p className="text-sm font-bold">{formatCurrency(cardProfile.purchases)}</p>
            </div>
            <div className="bg-secondary/50 rounded-md px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase">Credits</p>
              <p className="text-sm font-bold">{formatCurrency(cardProfile.credits)}</p>
            </div>
            <div className="bg-secondary/50 rounded-md px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase">Transactions</p>
              <p className="text-sm font-bold">{formatNumber(cardProfile.totalTxns)}</p>
            </div>
            <div className="bg-secondary/50 rounded-md px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase">Active</p>
              <p className="text-sm font-bold text-muted-foreground">{cardProfile.dateRange}</p>
            </div>
          </div>

          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Top {cardProfile.topSuppliers.length} of {cardProfile.uniqueSuppliers} suppliers
          </h4>
          <div className="space-y-1.5">
            {cardProfile.topSuppliers.map((s) => {
              const pct = cardProfile.purchases > 0 ? (s.total / cardProfile.purchases) * 100 : 0;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm truncate mr-2">{s.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatCurrency(s.total)} ({s.count} txns)
                      </span>
                    </div>
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500/60 rounded-full"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-9 text-right shrink-0">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time Series */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Monthly Spending (Purchases Only)</h3>
          {perCardMonthly && (
            <div className="flex items-center gap-2">
              {/* Aggregated vs By Card */}
              <div className="flex items-center bg-secondary/60 rounded-md p-0.5 text-xs">
                <button
                  onClick={() => setChartMode('aggregated')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    chartMode === 'aggregated'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Aggregated
                </button>
                <button
                  onClick={() => setChartMode('by-card')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    chartMode === 'by-card'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  By Card
                </button>
              </div>
              {/* Line vs Stacked (only in by-card mode) */}
              {chartMode === 'by-card' && (
                <div className="flex items-center bg-secondary/60 rounded-md p-0.5 text-xs">
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      chartType === 'line'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Lines
                  </button>
                  <button
                    onClick={() => setChartType('stacked')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      chartType === 'stacked'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Stacked
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          {chartMode === 'by-card' && perCardMonthly
            ? `Comparing ${selectedCards.size - hiddenCards.size} of ${selectedCards.size} cards`
            : 'Credits and returns excluded to show true purchasing activity'}
        </p>

        {/* Interactive card legend (by-card mode) */}
        {chartMode === 'by-card' && perCardMonthly && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {Array.from(selectedCards).map((card, i) => {
              const isHidden = hiddenCards.has(card);
              const color = cardChartColors[i % cardChartColors.length];
              const label = cardLabel(card);
              return (
                <button
                  key={card}
                  onClick={() => {
                    setHiddenCards((prev) => {
                      const next = new Set(prev);
                      if (next.has(card)) {
                        next.delete(card);
                      } else {
                        if (next.size < selectedCards.size - 1) {
                          next.add(card);
                        }
                      }
                      return next;
                    });
                  }}
                  className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-all ${
                    isHidden
                      ? 'border-border/50 text-muted-foreground/40 opacity-40'
                      : 'border-border text-foreground'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: isHidden ? (theme === 'dark' ? '#555' : '#d1d5db') : color }}
                  />
                  <span className="font-mono font-medium">{card}</span>
                  {label && <span className="text-muted-foreground text-[10px]">{label}</span>}
                </button>
              );
            })}
            {hiddenCards.size > 0 && (
              <button
                onClick={() => setHiddenCards(new Set())}
                className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1 transition-colors"
              >
                show all
              </button>
            )}
          </div>
        )}

        {/* Aggregated area chart (default, or when <2 or >10 cards) */}
        {(chartMode === 'aggregated' || !perCardMonthly) && (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={theme === 'dark' ? 0.3 : 0.12} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE_COLOR} />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => formatMonth(m)}
                tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium">{label ? formatMonth(String(label)) : ''}</p>
                      <p className="text-purple-600 dark:text-purple-400">{formatCurrency(d.spend)} purchases</p>
                      {d.credits > 0 && (
                        <p className="text-green-600 dark:text-green-400">-{formatCurrency(d.credits)} credits</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{d.count} transactions</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#colorSpend)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Per-card line chart */}
        {chartMode === 'by-card' && perCardMonthly && chartType === 'line' && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={perCardMonthly} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE_COLOR} />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => formatMonth(String(m))}
                tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium mb-1">{label ? formatMonth(String(label)) : ''}</p>
                      {/* eslint-disable @typescript-eslint/no-explicit-any */}
                      {([...payload] as any[])
                        .sort((a: any, b: any) => Number(b.value ?? 0) - Number(a.value ?? 0))
                        .map((entry: any) => (
                        <div key={entry.dataKey as string} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="font-mono text-xs">{entry.dataKey as string}</span>
                            {cardLabel(entry.dataKey as string) && (
                              <span className="text-muted-foreground text-[10px]">
                                {cardLabel(entry.dataKey as string)}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-xs">{formatCurrency(entry.value as number)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {Array.from(selectedCards).map((card, i) => (
                <Line
                  key={card}
                  type="monotone"
                  dataKey={card}
                  stroke={cardChartColors[i % cardChartColors.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  hide={hiddenCards.has(card)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Per-card stacked bar chart */}
        {chartMode === 'by-card' && perCardMonthly && chartType === 'stacked' && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perCardMonthly} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE_COLOR} />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => formatMonth(String(m))}
                tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const total = (payload as any[])
                    .filter((e: any) => !hiddenCards.has(e.dataKey as string))
                    .reduce((s: number, e: any) => s + Number(e.value ?? 0), 0);
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium mb-1">{label ? formatMonth(String(label)) : ''}</p>
                      {/* eslint-disable @typescript-eslint/no-explicit-any */}
                      {([...payload] as any[])
                        .sort((a: any, b: any) => Number(b.value ?? 0) - Number(a.value ?? 0))
                        .map((entry: any) => (
                        <div key={entry.dataKey as string} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-sm inline-block"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="font-mono text-xs">{entry.dataKey as string}</span>
                            {cardLabel(entry.dataKey as string) && (
                              <span className="text-muted-foreground text-[10px]">
                                {cardLabel(entry.dataKey as string)}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-xs">{formatCurrency(entry.value as number)}</span>
                        </div>
                      ))}
                      <div className="border-t border-border/50 mt-1 pt-1 flex justify-between text-xs font-medium">
                        <span>Total</span>
                        <span className="font-mono">{formatCurrency(total)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              {Array.from(selectedCards).map((card, i) => (
                <Bar
                  key={card}
                  dataKey={card}
                  stackId="cards"
                  fill={cardChartColors[i % cardChartColors.length]}
                  fillOpacity={0.85}
                  hide={hiddenCards.has(card)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Top Suppliers */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">Top Suppliers</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={topSuppliers.map((s) => ({
                name:
                  s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name,
                fullName: s.name,
                total: s.total,
              }))}
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
                width={130}
                tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
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
                      <p className="text-purple-600 dark:text-purple-400">
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
                    {formatDate(t.tranDate)} · Card {t.card}
                    {cardLabel(t.card) ? ` (${cardLabel(t.card)})` : ''}
                  </p>
                </div>
                <span className="font-mono text-sm shrink-0">
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
