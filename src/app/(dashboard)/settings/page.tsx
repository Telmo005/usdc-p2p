import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';

export default async function SettingsPage() {
  const { user, profile } = await requireUser();

  const [syncRow] = await query<{ last_synced_at: string | null; last_error: string | null }>(
    `select last_synced_at, last_error from p2p_manager.sync_state where user_id = $1 and platform = 'binance' and resource = 'orders'`,
    [user.id]
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Conta e ligação com a Binance.</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Conta</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Nome</dt>
          <dd>{profile?.full_name ?? '—'}</dd>
          <dt className="text-muted">Email</dt>
          <dd>{user.email}</dd>
          <dt className="text-muted">Perfil</dt>
          <dd className="capitalize">{profile?.role ?? 'trader'}</dd>
          <dt className="text-muted">Moeda de referência</dt>
          <dd>{profile?.reference_currency ?? 'MZN'}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Sincronização com a Binance</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Última sincronização</dt>
          <dd>{syncRow?.last_synced_at ? new Date(syncRow.last_synced_at).toLocaleString('pt-PT') : 'Nunca'}</dd>
          <dt className="text-muted">Estado</dt>
          <dd className={syncRow?.last_error ? 'text-negative' : 'text-positive'}>{syncRow?.last_error ? 'Erro' : 'OK'}</dd>
        </dl>
        {syncRow?.last_error && (
          <div className="mt-3 rounded-lg border border-negative/40 bg-negative/10 p-3 text-xs text-negative">{syncRow.last_error}</div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Métodos de pagamento, notificações e alertas personalizados ficam para a próxima fase.
      </section>
    </div>
  );
}
