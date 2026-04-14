// === BMO Transactions ===
export interface BmoTransaction {
  postingDate: string;
  tranDate: string;
  card: string;
  supplier: string;
  amount: number;
  sourceFile: string;
  periodStart: string;
  periodEnd: string;
  // Normalized fields (added by ETL)
  supplierNormalized?: string;
  supplierCategory?: string;
  supplierLocation?: string;
  supplierRef?: string;
  supplierStore?: string;
}

// === Fund Summary ===
export interface FundDetail {
  reportDate: string;
  amount: number;
}

export interface Fund {
  code: string;
  name: string;
  total: number;
  details: FundDetail[];
}

export interface FundSummary {
  reportDate: string;
  grandTotal: number;
  funds: Fund[];
}

// === AP Line Items (Board Reports) ===
export interface LineItem {
  description: string;
  accountCode: string;
  building: string;
  function: string;
  program: string;
  sub: string;
  object: string;
  amount: number;
}

export interface ApInvoice {
  vendor: string;
  invoice: string;
  invoiceDate: string;
  poNumber: string | null;
  invoiceTotal: number;
  fund: string;
  fundName: string;
  reportDate: string;
  sourceFile: string;
  lineItems: LineItem[];
}

// === BMO Statements ===
export interface BmoStatementTransaction {
  tranDate: string;
  postingDate: string;
  card: string;
  supplier: string;
  supplierName: string;
  location: string | null;
  preTaxAmount: number;
  tax: number;
  amount: number;
  transId: string | null;
  authNum: string | null;
  statementDate: string;
  accountName: string;
  sourceFile: string;
  // Normalized fields
  supplierNormalized?: string;
  supplierCategory?: string;
  supplierLocation?: string;
  supplierRef?: string;
  supplierStore?: string;
}

export interface StatementSummary {
  card: string;
  accountName: string;
  statementDate: string;
  netPurchases: number;
  transactionCount: number;
}

export interface BmoStatements {
  statements: StatementSummary[];
  transactions: BmoStatementTransaction[];
}

// === Lookups ===
export interface Lookups {
  buildings: Record<string, string>;
  functions: Record<string, string>;
  objects: Record<string, string>;
  funds: Record<string, string>;
  cards: Record<string, string>;
}

// === Aggregated views ===
export interface VendorSummary {
  name: string;
  totalAmount: number;
  invoiceCount: number;
  funds: string[];
}

export interface BuildingSummary {
  code: string;
  name: string;
  totalAmount: number;
  lineItemCount: number;
  topFunctions: { code: string; name: string; amount: number }[];
}

export interface MonthlySpend {
  month: string; // YYYY-MM
  amount: number;
  transactionCount: number;
}

// === Filter state ===
export interface FilterState {
  dateRange: { from: string; to: string } | null;
  amountRange: { min: number; max: number } | null;
  funds: string[];
  buildings: string[];
  vendors: string[];
  searchQuery: string;
}
