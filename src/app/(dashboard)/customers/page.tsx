import Link from 'next/link';
import { Users } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { ComingSoon } from '@/components/ComingSoon';

export default async function CustomersPage() {
  await requireUser();
  return (
    <ComingSoon
      icon={Users}
      title="Clientes"
      description="As contrapartes com quem já negociaste."
      planned={[
        'Lista de contrapartes, volume negociado e número de ordens',
        'Identificação de clientes recorrentes',
        'Perfil de cliente: histórico, ticket médio, frequência',
      ]}
      action={
        <p className="text-sm text-muted">
          Entretanto, cada ordem sincronizada já mostra o essencial em{' '}
          <Link href="/orders" className="text-accent hover:underline">
            Ordens
          </Link>
          .
        </p>
      }
    />
  );
}
