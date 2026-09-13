'use client';

import { useActionState, useState } from 'react';
import { updateCapitalSettingsAction, type SettingsActionState } from '@/app/actions/settings';
import type { CapitalSettings } from '@/lib/capitalSettings';

function NumField({ label, name, defaultValue, suffix }: { label: string; name: string; defaultValue: number; suffix: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-muted">
        {label} ({suffix})
      </span>
      <input
        name={name}
        type="number"
        step="any"
        min="0"
        defaultValue={defaultValue}
        className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
      />
    </label>
  );
}

export function CapitalSettingsForm({ settings, fiat }: { settings: CapitalSettings; fiat: string }) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(updateCapitalSettingsAction, undefined);
  const [mode, setMode] = useState<'real' | 'manual'>(settings.referenceMode);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-xs text-muted">Capital de referência</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMode('real')}
            className={`rounded-full border px-3 py-1.5 text-xs ${mode === 'real' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
          >
            Usar saldo real
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`rounded-full border px-3 py-1.5 text-xs ${mode === 'manual' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-foreground'}`}
          >
            Valor definido manualmente
          </button>
        </div>
        <input type="hidden" name="capital_reference_mode" value={mode} />
        {mode === 'manual' && (
          <div className="mt-2 max-w-[12rem]">
            <NumField label="Valor de referência" name="capital_reference_amount" defaultValue={settings.referenceAmount} suffix={fiat} />
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-xs text-muted">
          Custos configuráveis - usados no Opportunity Center e na Simulação para calcular resultados líquidos reais
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField label="Taxa/comissão" name="trade_fee_pct" defaultValue={settings.tradeFeePct} suffix="%" />
          <NumField label="Custo de conversão" name="conversion_cost_pct" defaultValue={settings.conversionCostPct} suffix="%" />
          <NumField label="Custo externo" name="external_cost_fixed" defaultValue={settings.externalCostFixed} suffix={fiat} />
          <NumField label="Margem de segurança" name="safety_margin_pct" defaultValue={settings.safetyMarginPct} suffix="%" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60">
          {pending ? 'A guardar...' : 'Guardar'}
        </button>
        {state?.error && <p className="text-sm text-negative">{state.error}</p>}
        {state?.success && <p className="text-sm text-positive">{state.success}</p>}
      </div>
    </form>
  );
}
