import Fuse from 'fuse.js';
import type { ApInvoice, BmoTransaction } from './types';

export interface SearchResult {
  type: 'vendor' | 'transaction';
  vendor?: string;
  description?: string;
  amount: number;
  date: string;
  fund?: string;
  source: ApInvoice | BmoTransaction;
}

export function buildSearchIndex(
  apItems: ApInvoice[],
  bmoTxns: BmoTransaction[]
): Fuse<SearchResult> {
  const entries: SearchResult[] = [];

  for (const item of apItems) {
    entries.push({
      type: 'vendor',
      vendor: item.vendor,
      description: item.lineItems.map((li) => li.description).join('; '),
      amount: item.invoiceTotal,
      date: item.invoiceDate,
      fund: item.fund,
      source: item,
    });
  }

  for (const txn of bmoTxns) {
    entries.push({
      type: 'transaction',
      vendor: txn.supplierNormalized || txn.supplier,
      description: txn.supplier,
      amount: txn.amount,
      date: txn.tranDate,
      source: txn,
    });
  }

  return new Fuse(entries, {
    keys: [
      { name: 'vendor', weight: 2 },
      { name: 'description', weight: 1 },
    ],
    threshold: 0.3,
    includeScore: true,
  });
}
