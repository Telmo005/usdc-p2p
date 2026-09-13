'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DataTag } from '@/components/DataTag';
import { formatAge } from '@/lib/dataQuality';
import type { Opportunity } from '@/lib/opportunities';

function fmt(n: number, maxFrac = 2) {
  return n.toLocaleString('pt-PT', { maximumFractionDigits: maxFrac });
}

const SCORE_ROWS: Array<{ key: keyof Opportunity['score']; label: string; max: number }> = [
  { key: 'price', label: 'Preço', max: 30 },
  { key: 'liquidity', label: 'Liquidez', max: 25 },
  { key: 'stability', label: 'Estabilidade', max: 20 },
  { key: 'costs', label: 'Custos conhecidos', max: 15 },
  { key: 'dataQuality', label: 'Qualidade dos dados', max: 10 },
];

/** Same expand-in-place convention as AdsBrowser.tsx's ad detail - no
 *  modal, just a local toggle revealing the full breakdown + "why". */
export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-muted">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">{opportunity.market} · Estado: OBSERVADA</div>
            <div className="mt-0.5 text-sm font-medium">{opportunity.headline}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DataTag source="calculated" fetchedAt={opportunity.detectedAt} label={`Score ${opportunity.score.total}/100`} />
        </div>
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted">Detetado</div>
              <div className="font-mono text-sm">{formatAge(opportunity.detectedAt)}</div>
            </div>
            {opportunity.grossResult != null ? (
              <>
                <div>
                  <div className="text-xs text-muted">Resultado bruto</div>
                  <div className="font-mono text-sm">
                    {fmt(opportunity.grossResult)} {opportunity.fiat}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Custos</div>
                  <div className="font-mono text-sm">
                    {fmt(opportunity.costs ?? 0)} {opportunity.fiat}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Resultado líquido estimado</div>
                  <div className="font-mono text-sm font-semibold text-positive">
                    {fmt(opportunity.netResult ?? 0)} {opportunity.fiat}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Valor de referência</div>
                  <div className="font-mono text-sm">
                    {fmt(opportunity.referenceAmount ?? 0)} {opportunity.fiat}
                  </div>
                </div>
              </>
            ) : (
              <div className="col-span-2 text-sm text-muted">Resultado bruto/líquido: não aplicável (ver explicação abaixo).</div>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-muted">Score analítico ({opportunity.score.total}/100)</div>
            <div className="flex flex-col gap-1">
              {SCORE_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="font-mono">
                    {opportunity.score[row.key]}/{row.max}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-muted">Porquê?</div>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              {opportunity.why.map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-accent">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
