import { requireUser } from '@/lib/auth';
import { ComingSoon } from '@/components/ComingSoon';

export default async function CustomersPage() {
  await requireUser();
  return (
    <ComingSoon
      title="Clientes"
      description="As contrapartes com quem já negociaste."
      planned={[
        'Lista de contrapartes, volume negociado e número de ordens',
        'Identificação de clientes recorrentes',
        'Perfil de cliente: histórico, ticket médio, frequência',
      ]}
    />
  );
}
