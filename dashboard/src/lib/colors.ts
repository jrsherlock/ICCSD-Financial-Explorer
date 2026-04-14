export const FUND_COLORS: Record<string, string> = {
  '10': '#6366f1',
  '21': '#8b5cf6',
  '22': '#a78bfa',
  '31': '#06b6d4',
  '33': '#14b8a6',
  '36': '#22c55e',
  '40': '#eab308',
  '61': '#f97316',
  '71': '#ef4444',
  '74': '#ec4899',
  '82': '#f43f5e',
  '84': '#d946ef',
};

export const CHART_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#06b6d4',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#d946ef',
  '#a78bfa',
  '#f43f5e',
];

export function getFundColor(code: string): string {
  return FUND_COLORS[code] || '#64748b';
}
