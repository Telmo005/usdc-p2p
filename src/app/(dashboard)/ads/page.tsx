import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { SectionCard } from '@/components/ui/SectionCard';

export default async function AdsPage() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Megaphone size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">Anúncios</h1>
          <p className="mt-1 text-sm text-muted">Gestão dos teus anúncios de compra/venda P2P.</p>
        </div>
      </div>

      <SectionCard title="Porque é que isto não está ligado à Binance" icon={Megaphone}>
        <p className="text-sm text-muted">
          Investigámos a fundo: a API pública e documentada da Binance <strong className="text-foreground">não oferece nenhum
          endpoint oficial</strong> para listar ou gerir anúncios P2P próprios - só disponibiliza o histórico de ordens (o que já
          sincronizamos). Existem endpoints não-documentados usados internamente pela Binance, mas exigem uma conta verificada
          como &quot;P2P Merchant&quot; e podem mudar ou deixar de funcionar sem aviso, a qualquer momento.
        </p>
        <p className="mt-3 text-sm text-muted">
          Por isso, em vez de construir algo frágil em cima de API não suportada, este módulo fica por agora sem gestão de
          anúncios integrada. Se um dia fores verificado como merchant e quiseres arriscar essa integração, ou preferires um
          registo manual dos teus anúncios (sem ligação à API), diz-nos e construímos.
        </p>
      </SectionCard>

      <SectionCard title="O que já tens disponível" muted>
        <p className="text-sm text-muted">
          Os preços de mercado ao vivo (compra/venda, tendências, spread) já estão no{' '}
          <Link href="/" className="text-accent hover:underline">
            Início
          </Link>
          , e a{' '}
          <Link href="/simulation" className="text-accent hover:underline">
            Simulação
          </Link>{' '}
          usa esses mesmos preços para te dizer a que valor vender/comprar para o lucro que queres - o mesmo raciocínio que um
          anúncio bem colocado precisa.
        </p>
      </SectionCard>
    </div>
  );
}
