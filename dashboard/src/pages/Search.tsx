import { useState, useMemo, useCallback } from 'react';
import { apLineItems, bmoTransactions } from '../lib/data-loader';
import { buildSearchIndex, type SearchResult } from '../lib/search';
import { formatCurrency, formatCurrencyExact, formatDate } from '../lib/formatters';

export function Search() {
  const [query, setQuery] = useState('');
  const searchIndex = useMemo(
    () => buildSearchIndex(apLineItems, bmoTransactions),
    []
  );

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    return searchIndex
      .search(query, { limit: 100 })
      .map((r) => r.item);
  }, [query, searchIndex]);

  const exportCsv = useCallback(() => {
    if (!results.length) return;
    const headers = ['Type', 'Vendor', 'Description', 'Amount', 'Date', 'Fund'];
    const rows = results.map((r) => [
      r.type,
      r.vendor || '',
      r.description || '',
      r.amount.toFixed(2),
      r.date,
      r.fund || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iccsd-search-${query}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, query]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Search</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Search across all vendors, transactions, and descriptions
      </p>

      {/* Search Input */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search vendors, suppliers, descriptions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      {/* Results count */}
      {query.length >= 2 && (
        <p className="text-sm text-muted-foreground mb-4">
          {results.length} results for "{query}"
        </p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-secondary/30">
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Vendor / Supplier</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Fund</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-secondary/20"
                >
                  <td className="py-2 px-4">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        r.type === 'vendor'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-accent/15 text-accent'
                      }`}
                    >
                      {r.type === 'vendor' ? 'AP' : 'CC'}
                    </span>
                  </td>
                  <td className="py-2 px-4 font-medium">{r.vendor}</td>
                  <td className="py-2 px-4 text-muted-foreground truncate max-w-xs">
                    {r.description}
                  </td>
                  <td className="py-2 px-4 text-muted-foreground">
                    {formatDate(r.date)}
                  </td>
                  <td className="py-2 px-4">{r.fund || '—'}</td>
                  <td className="py-2 px-4 text-right font-mono">
                    {formatCurrencyExact(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <p>No results found for "{query}"</p>
          <p className="text-xs mt-1">Try a different search term</p>
        </div>
      )}
    </div>
  );
}
