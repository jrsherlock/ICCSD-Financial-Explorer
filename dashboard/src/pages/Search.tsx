import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useData, getCardLabel } from '../lib/data-loader';
import { formatCurrencyExact, formatDate, formatNumber } from '../lib/formatters';

interface SearchResult {
  type: 'ap' | 'cc';
  vendor: string;
  description: string;
  amount: number;
  date: string;
  fund?: string;
  card?: string;
}

type TypeFilter = 'all' | 'ap' | 'cc';

const PAGE_SIZE = 100;

export function Search() {
  const { apLineItems, bmoTransactions, lookups } = useData();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const allResults = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();

    const matches: SearchResult[] = [];

    // Search AP invoices
    for (const item of apLineItems) {
      const vendorMatch = item.vendor.toLowerCase().includes(q);
      const descMatch = item.lineItems.some((li) =>
        li.description.toLowerCase().includes(q)
      );
      const fundMatch = (lookups.funds[item.fund] || '').toLowerCase().includes(q);

      if (vendorMatch || descMatch || fundMatch) {
        matches.push({
          type: 'ap',
          vendor: item.vendor,
          description: item.lineItems.map((li) => li.description).join('; '),
          amount: item.invoiceTotal,
          date: item.invoiceDate,
          fund: lookups.funds[item.fund] || `Fund ${item.fund}`,
        });
      }
    }

    // Search CC transactions
    for (const t of bmoTransactions) {
      const supplierMatch = t.supplier.toLowerCase().includes(q);
      const normMatch = t.supplierNormalized?.toLowerCase().includes(q);
      const cardLabel = getCardLabel(lookups, t.card).toLowerCase();
      const cardMatch = cardLabel.includes(q) || t.card.includes(q);

      if (supplierMatch || normMatch || cardMatch) {
        matches.push({
          type: 'cc',
          vendor: t.supplierNormalized || t.supplier,
          description: t.supplier,
          amount: t.amount,
          date: t.tranDate,
          card: t.card,
        });
      }
    }

    // Sort by amount descending
    matches.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return matches;
  }, [query, apLineItems, bmoTransactions, lookups]);

  const results = useMemo(() => {
    if (typeFilter === 'all') return allResults;
    return allResults.filter((r) => r.type === typeFilter);
  }, [allResults, typeFilter]);

  const apCount = useMemo(() => allResults.filter((r) => r.type === 'ap').length, [allResults]);
  const ccCount = useMemo(() => allResults.filter((r) => r.type === 'cc').length, [allResults]);

  const totalPages = Math.ceil(results.length / PAGE_SIZE);
  const pageResults = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalAmount = results.reduce((s, r) => s + r.amount, 0);

  const exportCsv = useCallback(() => {
    if (!results.length) return;
    const headers = ['Type', 'Vendor', 'Description', 'Amount', 'Date', 'Fund', 'Card'];
    const rows = results.map((r) => [
      r.type === 'ap' ? 'AP' : 'CC',
      `"${r.vendor}"`,
      `"${r.description}"`,
      r.amount.toFixed(2),
      r.date,
      r.fund || '',
      r.card ? `${r.card}${getCardLabel(lookups, r.card) ? ' - ' + getCardLabel(lookups, r.card) : ''}` : '',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iccsd-search-${query}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, query, lookups]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Search</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Search across AP invoices and credit card transactions
      </p>

      {/* Search Input */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search vendors, suppliers, cards, funds..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          autoFocus
          className="flex-1 bg-card border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
        />
        {results.length > 0 && (
          <button
            onClick={exportCsv}
            className="bg-secondary hover:bg-secondary/80 border border-border rounded-lg px-4 py-2 text-sm text-foreground transition-colors"
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Type Filter Tabs */}
      {query.length >= 2 && allResults.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setTypeFilter('all'); setPage(0); }}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              typeFilter === 'all'
                ? 'bg-primary/10 text-primary font-medium'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({formatNumber(allResults.length)})
          </button>
          <button
            onClick={() => { setTypeFilter('ap'); setPage(0); }}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${
              typeFilter === 'ap'
                ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            AP Invoices ({formatNumber(apCount)})
          </button>
          <button
            onClick={() => { setTypeFilter('cc'); setPage(0); }}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${
              typeFilter === 'cc'
                ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            Credit Cards ({formatNumber(ccCount)})
          </button>
          <span className="text-sm text-muted-foreground ml-2">
            Total: {formatCurrencyExact(totalAmount)}
          </span>
        </div>
      )}

      {/* Results count (no matches or short query) */}
      {query.length >= 2 && allResults.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <p>No results found for "{query}"</p>
          <p className="text-xs mt-1">Try a different search term</p>
        </div>
      )}

      {/* Results */}
      {pageResults.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 bg-secondary/30 border-b border-border">
              <span className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, results.length)} of {formatNumber(results.length)}
              </span>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 rounded bg-secondary text-muted-foreground disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 rounded bg-secondary text-muted-foreground disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2.5 px-4 w-16">Source</th>
                <th className="py-2.5 px-4">Vendor / Supplier</th>
                <th className="py-2.5 px-4">Detail</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Fund / Card</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageResults.map((r, i) => (
                <tr
                  key={`${r.type}-${r.date}-${r.vendor}-${i}`}
                  className={`border-b border-border/50 hover:bg-secondary/20 ${
                    r.type === 'ap'
                      ? 'border-l-2 border-l-blue-500/40'
                      : 'border-l-2 border-l-purple-500/40'
                  }`}
                >
                  <td className="py-2 px-4">
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                        r.type === 'ap'
                          ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400'
                      }`}
                    >
                      {r.type === 'ap' ? 'AP' : 'CC'}
                    </span>
                  </td>
                  <td className="py-2 px-4 font-medium">{r.vendor}</td>
                  <td className="py-2 px-4 text-muted-foreground truncate max-w-xs" title={r.description}>
                    {r.description}
                  </td>
                  <td className="py-2 px-4 text-muted-foreground whitespace-nowrap">
                    {formatDate(r.date)}
                  </td>
                  <td className="py-2 px-4">
                    {r.fund && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">{r.fund}</span>
                    )}
                    {r.card && (
                      <Link
                        to={`/credit-cards?cards=${r.card}`}
                        className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors group"
                        title={`View card ${r.card} in Credit Card Analytics`}
                      >
                        <span className="font-mono group-hover:underline">{r.card}</span>
                        {getCardLabel(lookups, r.card) && (
                          <span className="ml-1 text-purple-500 dark:text-purple-400/60">{getCardLabel(lookups, r.card)}</span>
                        )}
                      </Link>
                    )}
                  </td>
                  <td
                    className={`py-2 px-4 text-right font-mono whitespace-nowrap ${
                      r.amount < 0 ? 'text-green-600 dark:text-green-400' : ''
                    }`}
                  >
                    {formatCurrencyExact(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
