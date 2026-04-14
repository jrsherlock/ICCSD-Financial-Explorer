import { createContext, useContext } from 'react';
import type {
  BmoTransaction,
  FundSummary,
  ApInvoice,
  BmoStatements,
  Lookups,
} from './types';

// ── Types ────────────────────────────────────────────────────────────

export interface CardInfo {
  card: string;
  label: string;
  txnCount: number;
  totalSpend: number;
}

export interface AppData {
  bmoTransactions: BmoTransaction[];
  fundSummary: FundSummary;
  apLineItems: ApInvoice[];
  bmoStatements: BmoStatements;
  lookups: Lookups;
  allCards: CardInfo[];
}

// ── Async loader ─────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function loadAllData(): Promise<AppData> {
  const [bmoTransactions, fundSummary, apLineItems, bmoStatements, lookups] =
    await Promise.all([
      fetchJson<BmoTransaction[]>('/data/bmo-transactions.json'),
      fetchJson<FundSummary>('/data/fund-summary.json'),
      fetchJson<ApInvoice[]>('/data/ap-line-items.json'),
      fetchJson<BmoStatements>('/data/bmo-statements.json'),
      fetchJson<Lookups>('/data/lookups.json'),
    ]);

  // Derive allCards from transactions
  const cardMap = new Map<string, { count: number; spend: number }>();
  for (const t of bmoTransactions) {
    const existing = cardMap.get(t.card);
    if (existing) {
      existing.count++;
      if (t.amount > 0) existing.spend += t.amount;
    } else {
      cardMap.set(t.card, { count: 1, spend: t.amount > 0 ? t.amount : 0 });
    }
  }
  const allCards = Array.from(cardMap.entries())
    .map(([card, data]) => ({
      card,
      label: lookups.cards?.[card] || '',
      txnCount: data.count,
      totalSpend: data.spend,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return { bmoTransactions, fundSummary, apLineItems, bmoStatements, lookups, allCards };
}

// ── React context ────────────────────────────────────────────────────

export const DataContext = createContext<AppData | null>(null);

export function useData(): AppData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData() must be used inside <DataProvider>');
  return ctx;
}

// ── Helper functions (accept lookups explicitly) ─────────────────────

export function getBuildingName(lookups: Lookups, code: string): string {
  return lookups.buildings[code] || `Building ${code}`;
}

export function getFunctionName(lookups: Lookups, code: string): string {
  return lookups.functions[code] || `Function ${code}`;
}

export function getObjectName(lookups: Lookups, code: string): string {
  return lookups.objects[code] || `Object ${code}`;
}

export function getFundName(lookups: Lookups, code: string): string {
  return lookups.funds[code] || `Fund ${code}`;
}

export function getCardLabel(lookups: Lookups, card: string): string {
  return lookups.cards?.[card] || '';
}
