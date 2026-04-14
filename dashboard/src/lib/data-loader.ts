import type {
  BmoTransaction,
  FundSummary,
  ApInvoice,
  BmoStatements,
  Lookups,
} from './types';

import bmoTransactionsRaw from '../data/bmo-transactions.json';
import fundSummaryRaw from '../data/fund-summary.json';
import apLineItemsRaw from '../data/ap-line-items.json';
import bmoStatementsRaw from '../data/bmo-statements.json';
import lookupsRaw from '../data/lookups.json';

export const bmoTransactions = bmoTransactionsRaw as BmoTransaction[];
export const fundSummary = fundSummaryRaw as FundSummary;
export const apLineItems = apLineItemsRaw as ApInvoice[];
export const bmoStatements = bmoStatementsRaw as unknown as BmoStatements;
export const lookups = lookupsRaw as Lookups;

// Derived data
export function getBuildingName(code: string): string {
  return lookups.buildings[code] || `Building ${code}`;
}

export function getFunctionName(code: string): string {
  return lookups.functions[code] || `Function ${code}`;
}

export function getObjectName(code: string): string {
  return lookups.objects[code] || `Object ${code}`;
}

export function getFundName(code: string): string {
  return lookups.funds[code] || `Fund ${code}`;
}

export function getCardLabel(card: string): string {
  return lookups.cards?.[card] || '';
}

/** All unique card numbers from transaction data, sorted by total spend descending. */
export const allCards: { card: string; label: string; txnCount: number; totalSpend: number }[] = (() => {
  const map = new Map<string, { count: number; spend: number }>();
  for (const t of bmoTransactions) {
    const existing = map.get(t.card);
    if (existing) {
      existing.count++;
      if (t.amount > 0) existing.spend += t.amount;
    } else {
      map.set(t.card, { count: 1, spend: t.amount > 0 ? t.amount : 0 });
    }
  }
  return Array.from(map.entries())
    .map(([card, data]) => ({
      card,
      label: lookups.cards?.[card] || '',
      txnCount: data.count,
      totalSpend: data.spend,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
})();
