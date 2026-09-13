import { ORDER_STATUS_CONFIG } from '@/lib/orderStatus';

export function StatusBadge({ status }: { status: string }) {
  const config = ORDER_STATUS_CONFIG[status] ?? { label: status, dot: 'bg-muted' };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
