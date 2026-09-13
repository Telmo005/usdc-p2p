import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { TRACKED_PAIRS } from '@/lib/marketAnalysis';
import { fetchP2PSnapshot } from '@/lib/binancePublicP2P';
import { getCounterpartyNicknameMap } from '@/lib/customers';
import { SectionCard } from '@/components/ui/SectionCard';
import { AdsBrowser, type AdBook } from '@/components/AdsBrowser';

const SIDES = ['buy', 'sell'] as const;

export default async function AdsPage() {
  const { user } = await requireUser();
  const counterpartyByNickname = await getCounterpartyNicknameMap(user.id);

  const books: AdBook[] = await Promise.all(
    TRACKED_PAIRS.flatMap(({ asset, fiat }) =>
      SIDES.map(async (side): Promise<AdBook> => {
        try {
          const snapshot = await fetchP2PSnapshot(asset, fiat, side, 20);
          return { asset, fiat, side, ads: snapshot?.ads ?? [], error: null, fetchedAt: Date.now() };
        } catch (err) {
          return { asset, fiat, side, ads: null, error: err instanceof Error ? err.message : 'Falha ao ler o mercado.', fetchedAt: Date.now() };
        }
      })
    )
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Megaphone size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">Anúncios</h1>
          <p className="mt-1 text-sm text-muted">
            O livro de ofertas público do mercado P2P da Binance, em tempo real - os mesmos anúncios que qualquer pessoa vê em
            p2p.binance.com, com anunciante, avaliação, limites e métodos de pagamento.
          </p>
        </div>
      </div>

      <SectionCard title="Mercado agora">
        <AdsBrowser books={books} counterpartyByNickname={counterpartyByNickname} />
      </SectionCard>

      <SectionCard title="Sobre os teus próprios anúncios" icon={Megaphone} muted>
        <p className="text-sm text-muted">
          Isto acima é o mercado público - qualquer anúncio de qualquer pessoa. Gerir ou sequer listar os{' '}
          <strong className="text-foreground">teus próprios</strong> anúncios é diferente: investigámos a fundo e confirmámos
          (testes reais, não suposição) que a API pública da Binance não tem nenhum endpoint oficial para isso - só endpoints
          não-documentados, exclusivos de contas &quot;P2P Merchant&quot; verificadas, que podem mudar sem aviso.
        </p>
        <p className="mt-3 text-sm text-muted">
          A{' '}
          <Link href="/simulation" className="text-accent hover:underline">
            Simulação
          </Link>{' '}
          já usa estes mesmos preços de mercado para te dizer a que valor colocar o teu próprio anúncio para o lucro que
          queres.
        </p>
      </SectionCard>
    </div>
  );
}
