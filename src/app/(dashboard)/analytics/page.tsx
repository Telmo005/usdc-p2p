import { requireUser } from '@/lib/auth';
import { ComingSoon } from '@/components/ComingSoon';

export default async function AnalyticsPage() {
  await requireUser();
  return (
    <ComingSoon
      title="Análise & Relatórios"
      description="Desempenho, margem, tendências e relatórios exportáveis."
      planned={[
        'KPIs: volume, lucro bruto/líquido, margem, preço médio de compra/venda',
        'Gráficos de volume, lucro, margem e saldo por período',
        'Top clientes e top anúncios',
        'Geração e exportação de relatórios por período',
      ]}
    />
  );
}
