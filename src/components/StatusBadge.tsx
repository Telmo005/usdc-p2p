const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  pending: { label: 'Pendente', dot: 'bg-info' },
  awaiting_payment: { label: 'Aguarda pagamento', dot: 'bg-accent' },
  payment_received: { label: 'Pagamento recebido', dot: 'bg-accent' },
  awaiting_confirmation: { label: 'Aguarda confirmação', dot: 'bg-accent' },
  completed: { label: 'Concluída', dot: 'bg-positive' },
  cancelled: { label: 'Cancelada', dot: 'bg-negative' },
  expired: { label: 'Expirada', dot: 'bg-muted' },
  disputed: { label: 'Disputa', dot: 'bg-negative' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, dot: 'bg-muted' };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
