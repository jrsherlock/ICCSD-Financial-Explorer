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

// Data-source identity colors
export const AP_COLOR = '#3b82f6';   // blue-500 — Accounts Payable
export const CC_COLOR = '#a855f7';   // purple-500 — Credit Cards

// Recharts theme colors — CSS variable references so they adapt to light/dark mode.
// SVG presentation attributes support var() in modern browsers.
export const AXIS_TICK_COLOR = 'var(--color-muted-foreground)';
export const GRID_STROKE_COLOR = 'var(--color-border)';

export function getFundColor(code: string): string {
  return FUND_COLORS[code] || '#64748b';
}
