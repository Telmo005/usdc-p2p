import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { ComingSoon } from '@/components/ComingSoon';

export default async function AdsPage() {
  await requireUser();
  return (
    <ComingSoon
      icon={Megaphone}
      title="Anúncios"
      description="Gestão dos teus anúncios de compra/venda e análise do mercado."
      planned={[
        'Lista de anúncios ativos, com preço, limites e método de pagamento',
        'Criação de anúncio (tipo, moeda, preço, limites, método)',
        'Ativar/pausar/encerrar anúncios',
        'Comparação com as condições atuais do mercado (melhores preços, spread)',
      ]}
      action={
        <p className="text-sm text-muted">
          Entretanto, os preços de mercado ao vivo já estão no{' '}
          <Link href="/" className="text-accent hover:underline">
            Início
          </Link>{' '}
          e a{' '}
          <Link href="/simulation" className="text-accent hover:underline">
            Simulação
          </Link>
          .
        </p>
      }
    />
  );
}
