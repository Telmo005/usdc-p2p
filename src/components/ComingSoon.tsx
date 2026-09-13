import type { ReactNode } from 'react';
import { Construction, type LucideIcon } from 'lucide-react';

export function ComingSoon({
  title,
  description,
  planned,
  icon: Icon = Construction,
  action,
}: {
  title: string;
  description: string;
  planned: string[];
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon size={18} />
        </span>
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          Este módulo ainda não foi construído — fica no roteiro seguinte, listado honestamente aqui em vez de uma tela vazia sem
          explicação.
        </p>
        <ul className="mt-4 flex flex-col gap-2.5 text-sm">
          {planned.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {action && <div className="mt-5 border-t border-border pt-4">{action}</div>}
      </div>
    </div>
  );
}
