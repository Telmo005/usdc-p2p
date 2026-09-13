export const ORDER_STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  pending: { label: 'Pendente', dot: 'bg-info' },
  awaiting_payment: { label: 'Aguarda pagamento', dot: 'bg-accent' },
  payment_received: { label: 'Pagamento recebido', dot: 'bg-accent' },
  awaiting_confirmation: { label: 'Aguarda confirmação', dot: 'bg-accent' },
  completed: { label: 'Concluída', dot: 'bg-positive' },
  cancelled: { label: 'Cancelada', dot: 'bg-negative' },
  expired: { label: 'Expirada', dot: 'bg-muted' },
  disputed: { label: 'Disputa', dot: 'bg-negative' },
};

export const ORDER_STATUSES = ['all', ...Object.keys(ORDER_STATUS_CONFIG)] as const;
