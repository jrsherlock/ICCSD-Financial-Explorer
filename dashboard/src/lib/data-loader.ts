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
