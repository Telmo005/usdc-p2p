import { requireUser } from '@/lib/auth';
import { ComingSoon } from '@/components/ComingSoon';

export default async function AdsPage() {
  await requireUser();
  return (
    <ComingSoon
      title="Anúncios"
      description="Gestão dos teus anúncios de compra/venda e análise do mercado."
      planned={[
        'Lista de anúncios ativos, com preço, limites e método de pagamento',
        'Criação de anúncio (tipo, moeda, preço, limites, método)',
        'Ativar/pausar/encerrar anúncios',
        'Comparação com as condições atuais do mercado (melhores preços, spread)',
      ]}
    />
  );
}
