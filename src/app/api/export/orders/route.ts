import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { query } from '@/lib/db';

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Real export of this user's own completed orders, filtered by the same
 *  period the Análise page shows - no aggregation, one row per order, so
 *  it can be dropped straight into a spreadsheet. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const daysParam = req.nextUrl.searchParams.get('days');
  const days = daysParam ? Number(daysParam) : null;

  const rows = await query<{
    external_order_id: string;
    side: string;
    asset: string;
    fiat: string;
    quantity: string;
    price: string;
    total_value: string;
    fee: string;
    payment_method: string | null;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>(
    days
      ? `select external_order_id, side, asset, fiat, quantity, price, total_value, fee, payment_method, status, completed_at, created_at
         from p2p_manager.orders
         where user_id = $1 and status = 'completed' and completed_at > now() - ($2 || ' days')::interval
         order by completed_at asc`
      : `select external_order_id, side, asset, fiat, quantity, price, total_value, fee, payment_method, status, completed_at, created_at
         from p2p_manager.orders
         where user_id = $1 and status = 'completed'
         order by completed_at asc`,
    days ? [user.id, days] : [user.id]
  );

  const header = ['id_ordem', 'tipo', 'ativo', 'fiat', 'quantidade', 'preco', 'total', 'taxa', 'metodo_pagamento', 'estado', 'concluida_em'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.external_order_id,
        r.side === 'buy' ? 'compra' : 'venda',
        r.asset,
        r.fiat,
        r.quantity,
        r.price,
        r.total_value,
        r.fee,
        r.payment_method ?? '',
        r.status,
        r.completed_at ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  const csv = '﻿' + lines.join('\r\n');
  const filename = `ordens_${days ?? 'tudo'}dias_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
