import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { query } from '@/lib/db';
import { fetchAllC2COrders, type BinanceC2COrder } from '@/lib/binancePrivateClient';

/**
 * Manual "Sincronizar agora" - pulls the real Binance C2C order history and
 * upserts it into p2p_manager.orders, idempotent by (user_id, platform,
 * external_order_id). Read-only against Binance: never places/cancels
 * anything there.
 */
function mapStatus(binanceStatus: string): string {
  const s = binanceStatus.toUpperCase();
  if (s === 'COMPLETED') return 'completed';
  if (s === 'CANCELLED' || s === 'CANCELLED_BY_SYSTEM') return 'cancelled';
  if (s === 'PENDING') return 'pending';
  if (s === 'BUYER_PAYED') return 'payment_received';
  if (s === 'TRADING') return 'awaiting_confirmation';
  if (s === 'APPEAL') return 'disputed';
  return 'pending';
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let orders: BinanceC2COrder[];
  try {
    orders = await fetchAllC2COrders();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha desconhecida ao contactar a Binance.';
    await query(
      `insert into p2p_manager.sync_state (user_id, platform, resource, last_synced_at, last_error)
       values ($1, 'binance', 'orders', now(), $2)
       on conflict (user_id, platform, resource) do update set last_error = excluded.last_error, last_synced_at = excluded.last_synced_at`,
      [user.id, message]
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let inserted = 0;
  let updated = 0;

  for (const o of orders) {
    const status = mapStatus(o.orderStatus);

    // Binance's C2C history only gives a nickname for the other side, no
    // stable counterparty id - the nickname itself is the best identity key
    // this endpoint offers, so it doubles as external_id here.
    let counterpartyId: string | null = null;
    if (o.counterPartNickName) {
      const [cp] = await query<{ id: string }>(
        `insert into p2p_manager.counterparties (user_id, platform, external_id, nickname, last_seen_at)
         values ($1, 'binance', $2, $2, now())
         on conflict (user_id, platform, external_id) do update set nickname = excluded.nickname, last_seen_at = now()
         returning id`,
        [user.id, o.counterPartNickName]
      );
      counterpartyId = cp?.id ?? null;
    }

    const rows = await query<{ inserted: boolean }>(
      `insert into p2p_manager.orders (
         user_id, platform, external_order_id, counterparty_id, side, asset, fiat, quantity, price, total_value, fee,
         payment_method, status, raw, created_at, completed_at
       ) values ($1, 'binance', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, to_timestamp($14 / 1000.0), case when $12::text = 'completed' then to_timestamp($14 / 1000.0) else null end)
       on conflict (user_id, platform, external_order_id) do update set
         counterparty_id = excluded.counterparty_id,
         quantity = excluded.quantity,
         price = excluded.price,
         total_value = excluded.total_value,
         fee = excluded.fee,
         payment_method = excluded.payment_method,
         status = excluded.status,
         completed_at = excluded.completed_at,
         raw = excluded.raw
       returning (xmax = 0) as inserted`,
      [
        user.id,
        o.orderNumber,
        counterpartyId,
        o.tradeType.toLowerCase(),
        o.asset,
        o.fiat,
        o.amount,
        o.unitPrice,
        o.totalPrice,
        o.commission ?? 0,
        o.payType ?? null,
        status,
        JSON.stringify(o),
        o.createTime,
      ]
    );
    if (rows[0]?.inserted) inserted += 1;
    else updated += 1;
  }

  await query(
    `insert into p2p_manager.sync_state (user_id, platform, resource, last_synced_at, last_error)
     values ($1, 'binance', 'orders', now(), null)
     on conflict (user_id, platform, resource) do update set last_error = null, last_synced_at = now()`,
    [user.id]
  );

  await query(
    `insert into p2p_manager.audit_log (user_id, action, entity_type, after)
     values ($1, 'sync', 'orders', $2)`,
    [user.id, JSON.stringify({ inserted, updated, total: orders.length })]
  );

  return NextResponse.json({ inserted, updated, total: orders.length });
}
