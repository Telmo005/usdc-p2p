import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { ComingSoon } from '@/components/ComingSoon';

export default async function AnalyticsPage() {
  await requireUser();
  return (
    <ComingSoon
      icon={BarChart3}
      title="Análise & Relatórios"
      description="Desempenho, margem, tendências e relatórios exportáveis."
      planned={[
        'KPIs: volume, lucro bruto/líquido, margem, preço médio de compra/venda',
        'Gráficos de volume, lucro, margem e saldo por período',
        'Top clientes e top anúncios',
        'Geração e exportação de relatórios por período',
      ]}
      action={
        <p className="text-sm text-muted">
          Entretanto, os totais e o lucro bruto já estão no{' '}
          <Link href="/" className="text-accent hover:underline">
            Início
          </Link>{' '}
          e o histórico completo em{' '}
          <Link href="/orders" className="text-accent hover:underline">
            Ordens
          </Link>
          .
        </p>
      }
    />
  );
}
