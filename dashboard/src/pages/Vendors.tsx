import { useState } from 'react';
import { apLineItems, lookups } from '../lib/data-loader';
import { aggregateVendors } from '../lib/aggregations';
import { formatCurrency, formatCurrencyExact, formatDate } from '../lib/formatters';

export function Vendors() {
  const vendors = aggregateVendors(apLineItems);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = search
    ? vendors.filter((v) =>
        v.name.toLowerCase().includes(search.toLowerCase())
      )
    : vendors;

  const selectedItems = selected
    ? apLineItems.filter((i) => i.vendor === selected)
    : [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-1 h-5 rounded-full bg-blue-500" />
        <h2 className="text-xl font-bold">Vendor Explorer</h2>
        <span className="text-[10px] font-medium uppercase tracking-wider bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded">AP</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6 ml-4">
        {vendors.length} vendors across all funds · Board-approved invoices only
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* Vendor List */}
        <div className="col-span-1 bg-card border border-border rounded-lg p-4">
          <input
            type="text"
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground mb-3 outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="space-y-1 max-h-[70vh] overflow-y-auto">
            {filtered.map((v) => (
              <button
                key={v.name}
                onClick={() => setSelected(v.name)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selected === v.name
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-secondary text-foreground'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="truncate mr-2">{v.name}</span>
                  <span className="text-xs font-mono shrink-0">
                    {formatCurrency(v.totalAmount)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {v.invoiceCount} invoices · Fund{v.funds.length > 1 ? 's' : ''}{' '}
                  {v.funds.join(', ')}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Vendor Detail */}
        <div className="col-span-2">
          {selected ? (
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="text-lg font-bold mb-1">{selected}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedItems.length} invoices · Total:{' '}
                {formatCurrency(
                  selectedItems.reduce((s, i) => s + i.invoiceTotal, 0)
                )}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Invoice</th>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Fund</th>
                      <th className="py-2 pr-3">Description</th>
                      <th className="py-2 pr-3">Account Code</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.flatMap((item) =>
                      item.lineItems.map((li, idx) => (
                        <tr
                          key={`${item.invoice}-${idx}`}
                          className="border-b border-border/50 hover:bg-secondary/30"
                        >
                          {idx === 0 ? (
                            <>
                              <td
                                className="py-2 pr-3 font-mono text-xs"
                                rowSpan={item.lineItems.length}
                              >
                                {item.invoice}
                              </td>
                              <td
                                className="py-2 pr-3 text-muted-foreground"
                                rowSpan={item.lineItems.length}
                              >
                                {formatDate(item.invoiceDate)}
                              </td>
                              <td
                                className="py-2 pr-3"
                                rowSpan={item.lineItems.length}
                              >
                                <span className="text-xs bg-secondary px-2 py-0.5 rounded">
                                  {lookups.funds[item.fund] || item.fund}
                                </span>
                              </td>
                            </>
                          ) : null}
                          <td className="py-2 pr-3">{li.description}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                            {li.accountCode}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatCurrencyExact(li.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
              <p>Select a vendor to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
