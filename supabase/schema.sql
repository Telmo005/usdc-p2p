-- P2P Manager — core schema
-- Lives entirely in its own `p2p_manager` schema - this Supabase project is
-- shared with other real, active systems (payments gateway in public/payments,
-- p2p_arbitrage, metical_edge), so nothing here ever touches those.
-- Applied via scripts/apply-schema.mjs against DATABASE_URL. Every statement
-- is idempotent, safe to re-run as the schema grows in later phases.

create schema if not exists p2p_manager;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users, holds role + preferences
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'trader' check (role in ('admin', 'trader', 'viewer')),
  reference_currency text not null default 'MZN',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user signs up. Fully qualified
-- names + fixed search_path throughout (security definer best practice) -
-- never relies on the caller's search_path.
create or replace function p2p_manager.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = p2p_manager, pg_temp
as $$
begin
  insert into p2p_manager.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function p2p_manager.handle_new_user();

-- Helper used by RLS policies: is the current user an admin?
create or replace function p2p_manager.is_admin()
returns boolean
language sql
security definer set search_path = p2p_manager, pg_temp
stable
as $$
  select exists (select 1 from p2p_manager.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- payment_methods
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- counterparties: the other side of a trade, per platform
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.counterparties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  external_id text not null,
  nickname text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);

-- ---------------------------------------------------------------------------
-- ads: the user's own P2P listings
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.ads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  external_ad_id text not null,
  side text not null check (side in ('buy', 'sell')),
  asset text not null,
  fiat text not null,
  price numeric not null,
  min_amount numeric,
  max_amount numeric,
  quantity_available numeric,
  status text not null default 'active' check (status in ('active', 'inactive', 'paused', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, external_ad_id)
);

-- ---------------------------------------------------------------------------
-- orders: the heart of the system - every P2P trade, synced or manual
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  external_order_id text not null,
  ad_id uuid references p2p_manager.ads(id) on delete set null,
  counterparty_id uuid references p2p_manager.counterparties(id) on delete set null,
  side text not null check (side in ('buy', 'sell')),
  asset text not null,
  fiat text not null,
  quantity numeric not null,
  price numeric not null,
  total_value numeric not null,
  fee numeric not null default 0,
  payment_method text,
  status text not null default 'pending' check (
    status in ('pending', 'awaiting_payment', 'payment_received', 'awaiting_confirmation', 'completed', 'cancelled', 'expired', 'disputed')
  ),
  cancel_reason text,
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  released_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  unique (user_id, platform, external_order_id)
);

create index if not exists orders_user_created_idx on p2p_manager.orders (user_id, created_at desc);
create index if not exists orders_user_status_idx on p2p_manager.orders (user_id, status);

-- ---------------------------------------------------------------------------
-- order_events: the timeline shown on an order's detail page
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references p2p_manager.orders(id) on delete cascade,
  event_type text not null,
  event_time timestamptz not null default now(),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on p2p_manager.order_events (order_id, event_time);

-- ---------------------------------------------------------------------------
-- wallet_movements: every change to the user's tracked balance
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.wallet_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal', 'trade_in', 'trade_out', 'adjustment')),
  asset text not null,
  amount numeric not null,
  balance_after numeric,
  related_order_id uuid references p2p_manager.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_movements_user_idx on p2p_manager.wallet_movements (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- alerts: user-configured conditions to watch
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  condition jsonb not null,
  active boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx on p2p_manager.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- audit_log: who changed what, and when - never deleted by regular users
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sync_state: idempotency + status per user/platform/resource
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  resource text not null,
  cursor text,
  last_synced_at timestamptz,
  last_error text,
  unique (user_id, platform, resource)
);

-- ---------------------------------------------------------------------------
-- exchange_rates: small shared reference cache, not user-scoped
-- ---------------------------------------------------------------------------
create table if not exists p2p_manager.exchange_rates (
  base text not null,
  quote text not null,
  rate numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (base, quote)
);

-- ---------------------------------------------------------------------------
-- Row Level Security. Note on how this app actually connects: the Next.js
-- server talks to Postgres directly via DATABASE_URL (the pooler/postgres
-- role), not through PostgREST - that role bypasses RLS like any Postgres
-- superuser-tier role does. So RLS here is real defense-in-depth (protects
-- this data the moment `p2p_manager` is ever exposed through Supabase's
-- PostgREST API with the anon/authenticated roles, e.g. if someone later
-- adds it to the project's exposed-schemas list), but it is NOT the primary
-- access control for THIS app's current code path - every query in the
-- application layer must still explicitly filter by user_id itself. See
-- lib/db.ts.
-- ---------------------------------------------------------------------------
alter table p2p_manager.profiles enable row level security;
alter table p2p_manager.payment_methods enable row level security;
alter table p2p_manager.counterparties enable row level security;
alter table p2p_manager.ads enable row level security;
alter table p2p_manager.orders enable row level security;
alter table p2p_manager.order_events enable row level security;
alter table p2p_manager.wallet_movements enable row level security;
alter table p2p_manager.alerts enable row level security;
alter table p2p_manager.notifications enable row level security;
alter table p2p_manager.audit_log enable row level security;
alter table p2p_manager.sync_state enable row level security;
alter table p2p_manager.exchange_rates enable row level security;

drop policy if exists profiles_select on p2p_manager.profiles;
create policy profiles_select on p2p_manager.profiles for select using (id = auth.uid() or p2p_manager.is_admin());
drop policy if exists profiles_update on p2p_manager.profiles;
create policy profiles_update on p2p_manager.profiles for update using (id = auth.uid() or p2p_manager.is_admin());

drop policy if exists payment_methods_all on p2p_manager.payment_methods;
create policy payment_methods_all on p2p_manager.payment_methods for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists counterparties_all on p2p_manager.counterparties;
create policy counterparties_all on p2p_manager.counterparties for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists ads_all on p2p_manager.ads;
create policy ads_all on p2p_manager.ads for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists orders_all on p2p_manager.orders;
create policy orders_all on p2p_manager.orders for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists order_events_all on p2p_manager.order_events;
create policy order_events_all on p2p_manager.order_events for all using (
  exists (select 1 from p2p_manager.orders o where o.id = order_events.order_id and (o.user_id = auth.uid() or p2p_manager.is_admin()))
);

drop policy if exists wallet_movements_all on p2p_manager.wallet_movements;
create policy wallet_movements_all on p2p_manager.wallet_movements for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists alerts_all on p2p_manager.alerts;
create policy alerts_all on p2p_manager.alerts for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists notifications_all on p2p_manager.notifications;
create policy notifications_all on p2p_manager.notifications for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists audit_log_select on p2p_manager.audit_log;
create policy audit_log_select on p2p_manager.audit_log for select using (user_id = auth.uid() or p2p_manager.is_admin());

drop policy if exists sync_state_all on p2p_manager.sync_state;
create policy sync_state_all on p2p_manager.sync_state for all using (user_id = auth.uid() or p2p_manager.is_admin()) with check (user_id = auth.uid());

drop policy if exists exchange_rates_select on p2p_manager.exchange_rates;
create policy exchange_rates_select on p2p_manager.exchange_rates for select using (true);
