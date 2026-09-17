import { NextRequest, NextResponse } from 'next/server';
import { getApiUser } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { fetchAllC2COrders, type BinanceC2COrder } from '@/lib/binancePrivateClient';
import { ORDER_STATUS_CONFIG } from '@/lib/orderStatus';

// Status transitions worth an automatic ORDERS notification (spec section
// 13) - not every change (e.g. pending -> awaiting_confirmation is routine
// progress, not something worth interrupting the user for).
const NOTIFIABLE_STATUSES = new Set(['completed', 'cancelled', 'disputed']);

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
  // DISTRIBUTING = funds being released to the buyer, after payment but
  // before fully closed - closest existing meaning is "in progress", same
  // as TRADING; not a new status value.
  if (s === 'TRADING' || s === 'DISTRIBUTING') return 'awaiting_confirmation';
  // Binance's real documented value is IN_APPEAL, not APPEAL - this used to
  // silently fall through to 'pending' below.
  if (s === 'IN_APPEAL') return 'disputed';
  return 'pending';
}

export async function POST(req: NextRequest) {
  const user = await getApiUser(req);

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
    // SYSTEM notification, not just the Settings error banner - visible in
    // the bell/Alert Center even if the user never opens Configurações.
    await query(
      `insert into p2p_manager.notifications (user_id, type, title, body) values ($1, 'sync_failed', $2, $3)`,
      [user.id, 'Sincronização de ordens falhou', message]
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let inserted = 0;
  let updated = 0;

  for (const o of orders) {
    const status = mapStatus(o.orderStatus);

    const [existing] = await query<{ status: string }>(
      `select status from p2p_manager.orders where user_id = $1 and platform = 'binance' and external_order_id = $2`,
      [user.id, o.orderNumber]
    );
    const oldStatus = existing?.status ?? null;

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

    // Binance's C2C history never gives a real completion/cancellation
    // timestamp (only createTime - confirmed against the official docs) -
    // completed_at/cancelled_at are stamped with THIS sync's own now() the
    // first time that status is observed, and never moved again
    // (coalesce on conflict). An honest "we first noticed this at X," not
    // the fabricated duplicate-of-created_at this used to be.
    const rows = await query<{ inserted: boolean }>(
      `insert into p2p_manager.orders (
         user_id, platform, external_order_id, counterparty_id, side, asset, fiat, quantity, price, total_value, fee,
         payment_method, status, raw, created_at, completed_at, cancelled_at
       ) values (
         $1, 'binance', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, to_timestamp($14 / 1000.0),
         case when $12::text = 'completed' then now() else null end,
         case when $12::text = 'cancelled' then now() else null end
       )
       on conflict (user_id, platform, external_order_id) do update set
         counterparty_id = excluded.counterparty_id,
         quantity = excluded.quantity,
         price = excluded.price,
         total_value = excluded.total_value,
         fee = excluded.fee,
         payment_method = excluded.payment_method,
         status = excluded.status,
         completed_at = coalesce(p2p_manager.orders.completed_at, excluded.completed_at),
         cancelled_at = coalesce(p2p_manager.orders.cancelled_at, excluded.cancelled_at),
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

    // ORDERS notification (spec section 13) - only for a real transition
    // this sync just observed, never on first insert (that's not a
    // "change", it's the order simply appearing for the first time).
    if (oldStatus != null && oldStatus !== status && NOTIFIABLE_STATUSES.has(status)) {
      const label = ORDER_STATUS_CONFIG[status]?.label ?? status;
      await query(
        `insert into p2p_manager.notifications (user_id, type, title, body) values ($1, 'order_status', $2, $3)`,
        [user.id, `Ordem ${o.orderNumber}: ${label}`, `${o.tradeType === 'BUY' ? 'Compra' : 'Venda'} de ${o.amount} ${o.asset} - estado mudou para "${label}".`]
      );
    }
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
