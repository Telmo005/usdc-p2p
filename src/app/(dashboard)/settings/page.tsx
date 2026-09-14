import Link from 'next/link';
import { UserCircle, Link2, BellRing, Coins, Settings } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { fromProfile } from '@/lib/capitalSettings';
import { SectionCard } from '@/components/ui/SectionCard';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { CapitalSettingsForm } from '@/components/CapitalSettingsForm';

export default async function SettingsPage() {
  const { user, profile } = await requireUser();

  const [syncRow] = await query<{ last_synced_at: string | null; last_error: string | null }>(
    `select last_synced_at, last_error from p2p_manager.sync_state where user_id = $1 and platform = 'binance' and resource = 'orders'`,
    [user.id]
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Settings size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">Configurações</h1>
          <p className="mt-1 text-sm text-muted">Conta, ligação com a Binance e capital.</p>
        </div>
      </div>

      <SectionCard title="Conta" icon={UserCircle}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-muted">Nome</dt>
          <dd>{profile?.full_name ?? '—'}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="truncate">{user.email}</dd>
          <dt className="text-muted">Perfil</dt>
          <dd className="capitalize">{profile?.role ?? 'trader'}</dd>
          <dt className="text-muted">Moeda de referência</dt>
          <dd>{profile?.reference_currency ?? 'MZN'}</dd>
        </dl>
      </SectionCard>

      <SectionCard title="Sincronização com a Binance" icon={Link2}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-muted">Última sincronização</dt>
          <dd>{syncRow?.last_synced_at ? new Date(syncRow.last_synced_at).toLocaleString('pt-PT') : 'Nunca'}</dd>
          <dt className="text-muted">Estado</dt>
          <dd className={syncRow?.last_error ? 'text-negative' : 'text-positive'}>{syncRow?.last_error ? 'Erro' : 'OK'}</dd>
        </dl>
        {syncRow?.last_error && (
          <div className="mt-3">
            <ErrorBanner message={syncRow.last_error} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Configuração de Capital"
        icon={Coins}
        subtitle="Custos reais e capital de referência - usados para calcular resultados líquidos honestos no Opportunity Center e na Simulação. Deixados em zero, nada muda em relação ao comportamento atual."
      >
        <CapitalSettingsForm settings={fromProfile(profile)} fiat={profile?.reference_currency ?? 'MZN'} />
      </SectionCard>

      <SectionCard title="Alertas" icon={BellRing} muted>
        <p className="text-sm text-muted">
          Alertas de mercado/conta e avisos automáticos de sistema/ordens mudaram-se para um espaço próprio.
        </p>
        <Link href="/alerts" className="mt-2 inline-block text-sm text-accent hover:underline">
          Ir para o Centro de Alertas →
        </Link>
      </SectionCard>
    </div>
  );
}
