interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  variant?: 'ap' | 'cc';
}

const VARIANT_STYLES = {
  ap: 'border-l-2 border-l-blue-500',
  cc: 'border-l-2 border-l-purple-500',
} as const;

export function KpiCard({ label, value, subtitle, variant }: KpiCardProps) {
  const variantClass = variant ? VARIANT_STYLES[variant] : '';
  return (
    <div className={`bg-card border border-border rounded-xl p-5 shadow-sm ${variantClass}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}
