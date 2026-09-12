import { requireUser } from '@/lib/auth';
import { ComingSoon } from '@/components/ComingSoon';

export default async function WalletPage() {
  await requireUser();
  return (
    <ComingSoon
      title="Carteira"
      description="Saldo, ativos e evolução do teu capital."
      planned={[
        'Saldo total em USDT e equivalente em moeda local',
        'Depósitos, retiradas e ajustes',
        'Gráfico de evolução do capital (capital inicial vs atual vs lucro acumulado)',
        'Distinção clara entre crescimento de saldo e lucro real',
      ]}
    />
  );
}
