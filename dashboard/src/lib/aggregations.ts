import type {
  ApInvoice,
  BmoTransaction,
  VendorSummary,
  BuildingSummary,
  MonthlySpend,
} from './types';
import { lookups } from './data-loader';

export function aggregateVendors(items: ApInvoice[]): VendorSummary[] {
  const map = new Map<string, VendorSummary>();

  for (const item of items) {
    const existing = map.get(item.vendor);
    if (existing) {
      existing.totalAmount += item.invoiceTotal;
      existing.invoiceCount += 1;
      if (!existing.funds.includes(item.fund)) {
        existing.funds.push(item.fund);
      }
    } else {
      map.set(item.vendor, {
        name: item.vendor,
        totalAmount: item.invoiceTotal,
        invoiceCount: 1,
        funds: [item.fund],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

export function aggregateBuildings(items: ApInvoice[]): BuildingSummary[] {
  const map = new Map<string, {
    total: number;
    count: number;
    functions: Map<string, number>;
  }>();

  for (const item of items) {
    for (const li of item.lineItems) {
      const key = li.building;
      const existing = map.get(key);
      if (existing) {
        existing.total += li.amount;
        existing.count += 1;
        existing.functions.set(
          li.function,
          (existing.functions.get(li.function) || 0) + li.amount
        );
      } else {
        const fns = new Map<string, number>();
        fns.set(li.function, li.amount);
        map.set(key, { total: li.amount, count: 1, functions: fns });
      }
    }
  }

  return Array.from(map.entries())
    .map(([code, data]) => ({
      code,
      name: lookups.buildings[code] || `Building ${code}`,
      totalAmount: data.total,
      lineItemCount: data.count,
      topFunctions: Array.from(data.functions.entries())
        .map(([fc, amount]) => ({
          code: fc,
          name: lookups.functions[fc] || `Function ${fc}`,
          amount,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export function aggregateMonthlyBmoSpend(
  transactions: BmoTransaction[]
): MonthlySpend[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const t of transactions) {
    const month = t.tranDate.slice(0, 7); // YYYY-MM
    const existing = map.get(month);
    if (existing) {
      existing.amount += t.amount;
      existing.count += 1;
    } else {
      map.set(month, { amount: t.amount, count: 1 });
    }
  }

  return Array.from(map.entries())
    .map(([month, data]) => ({
      month,
      amount: data.amount,
      transactionCount: data.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function aggregateByFund(items: ApInvoice[]): {
  code: string;
  name: string;
  total: number;
  vendorCount: number;
}[] {
  const map = new Map<string, { name: string; total: number; vendors: Set<string> }>();

  for (const item of items) {
    const existing = map.get(item.fund);
    if (existing) {
      existing.total += item.invoiceTotal;
      existing.vendors.add(item.vendor);
    } else {
      map.set(item.fund, {
        name: item.fundName,
        total: item.invoiceTotal,
        vendors: new Set([item.vendor]),
      });
    }
  }

  return Array.from(map.entries())
    .map(([code, data]) => ({
      code,
      name: data.name,
      total: data.total,
      vendorCount: data.vendors.size,
    }))
    .sort((a, b) => b.total - a.total);
}

export function topSuppliersBmo(
  transactions: BmoTransaction[],
  limit = 10
): { name: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();

  for (const t of transactions) {
    const name = t.supplierNormalized || t.supplier;
    const existing = map.get(name);
    if (existing) {
      existing.total += t.amount;
      existing.count += 1;
    } else {
      map.set(name, { total: t.amount, count: 1 });
    }
  }

  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
