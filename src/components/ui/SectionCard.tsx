import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  muted = false,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  muted?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border p-5 ${muted ? 'bg-background' : 'bg-surface'} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {Icon && (
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon size={15} />
            </span>
          )}
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
