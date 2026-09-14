'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Plain query-param filters for the multi-ad search (lib/multiAdOpportunity.ts)
 * - "só favoritos" and "com/sem taxas." Navigating with new params re-runs
 * the server component's own fetch/search, same convention Research Lab's
 * form already uses, just auto-applied on change instead of a submit
 * button since there are only two simple toggles here.
 */
export function OpportunityFilters({
  favoritesOnly,
  includeFees,
  hasFavorites,
}: {
  favoritesOnly: boolean;
  includeFees: boolean;
  hasFavorites: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setFavoritesOnly = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set('favoritesOnly', '1');
    else params.delete('favoritesOnly');
    router.push(`${pathname}?${params.toString()}`);
  };

  const setIncludeFees = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.delete('fees'); // default is already "include"
    else params.set('fees', '0');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      {hasFavorites && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} className="accent-accent" />
          Só trabalhar com comerciantes favoritos
        </label>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={includeFees} onChange={(e) => setIncludeFees(e.target.checked)} className="accent-accent" />
        Descontar taxa de levantamento M-Pesa/e-Mola (MZN)
      </label>
    </div>
  );
}
