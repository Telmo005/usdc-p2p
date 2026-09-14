'use client';

/**
 * Generic tab strip - purely presentational, the caller owns which tab is
 * active and what renders for it. Built for Simulação's restructuring
 * (too many stacked tools on one endless scroll) but written to be reused
 * anywhere else a page needs the same "one screen, several views" pattern
 * instead of a new bespoke tab bar per page.
 */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
            active === t.id ? 'border-accent font-medium text-accent' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
