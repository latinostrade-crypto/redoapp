-- Persistent Poker / Blackjack table foundation.
-- Apply after redoapp_init.sql. Clients have no direct privileges; the Node
-- game server is the sole writer and uses the service-role key.

create table if not exists public.casino_table_catalog (
  id text primary key,
  game_type text not null check (game_type in ('poker', 'blackjack')),
  mode text not null check (mode in ('public', 'free')),
  table_number smallint not null check (table_number between 1 and 2),
  min_buy_in integer not null check (min_buy_in > 0),
  max_buy_in integer not null check (max_buy_in >= min_buy_in),
  max_players smallint not null check (max_players between 2 and 10),
  rules_version integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_type, mode, table_number)
);

insert into public.casino_table_catalog
  (id, game_type, mode, table_number, min_buy_in, max_buy_in, max_players)
values
  ('table-poker-public-1', 'poker', 'public', 1, 50, 100000, 10),
  ('table-poker-public-2', 'poker', 'public', 2, 50, 100000, 10),
  ('table-poker-free-1', 'poker', 'free', 1, 100, 100, 10),
  ('table-poker-free-2', 'poker', 'free', 2, 100, 100, 10),
  ('table-blackjack-public-1', 'blackjack', 'public', 1, 50, 100000, 4),
  ('table-blackjack-public-2', 'blackjack', 'public', 2, 50, 100000, 4),
  ('table-blackjack-free-1', 'blackjack', 'free', 1, 100, 100, 4),
  ('table-blackjack-free-2', 'blackjack', 'free', 2, 100, 100, 4)
on conflict (id) do update set
  min_buy_in = excluded.min_buy_in,
  max_buy_in = excluded.max_buy_in,
  max_players = excluded.max_players,
  rules_version = excluded.rules_version,
  enabled = true,
  updated_at = now();

create table if not exists public.casino_table_runtime (
  table_id text primary key references public.casino_table_catalog(id) on delete cascade,
  revision bigint not null default 0,
  phase text not null default 'dormant' check (phase in ('dormant', 'active', 'paused')),
  state jsonb not null default '{}'::jsonb,
  lease_owner text,
  lease_expires_at timestamptz,
  last_human_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.casino_table_seats (
  table_id text not null references public.casino_table_catalog(id) on delete cascade,
  user_id text not null,
  seat_number smallint,
  state text not null check (state in ('reserved', 'seated', 'afk', 'leaving', 'released')),
  chips integer not null default 0 check (chips >= 0),
  reservation_expires_at timestamptz,
  presence_expires_at timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (table_id, user_id),
  unique nulls not distinct (table_id, seat_number)
);

create index if not exists casino_table_seats_user_state_idx
  on public.casino_table_seats (user_id, state);
create index if not exists casino_table_seats_presence_idx
  on public.casino_table_seats (table_id, presence_expires_at)
  where state in ('seated', 'afk', 'leaving');

create table if not exists public.casino_chip_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  user_id text not null,
  table_id text not null references public.casino_table_catalog(id) on delete restrict,
  event text not null check (event in ('public_buy_in', 'public_cash_out', 'free_entry', 'seat_release')),
  chip_delta integer not null default 0,
  energy_delta integer not null default 0,
  request_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists casino_chip_ledger_user_created_idx
  on public.casino_chip_ledger (user_id, created_at desc);

drop trigger if exists casino_table_catalog_updated_at on public.casino_table_catalog;
create trigger casino_table_catalog_updated_at before update on public.casino_table_catalog
for each row execute function public.set_updated_at();
drop trigger if exists casino_table_runtime_updated_at on public.casino_table_runtime;
create trigger casino_table_runtime_updated_at before update on public.casino_table_runtime
for each row execute function public.set_updated_at();
drop trigger if exists casino_table_seats_updated_at on public.casino_table_seats;
create trigger casino_table_seats_updated_at before update on public.casino_table_seats
for each row execute function public.set_updated_at();

alter table public.casino_table_catalog enable row level security;
alter table public.casino_table_runtime enable row level security;
alter table public.casino_table_seats enable row level security;
alter table public.casino_chip_ledger enable row level security;

drop policy if exists "Service role manages casino table catalog" on public.casino_table_catalog;
create policy "Service role manages casino table catalog" on public.casino_table_catalog
  for all to service_role using (true) with check (true);
drop policy if exists "Service role manages casino table runtime" on public.casino_table_runtime;
create policy "Service role manages casino table runtime" on public.casino_table_runtime
  for all to service_role using (true) with check (true);
drop policy if exists "Service role manages casino table seats" on public.casino_table_seats;
create policy "Service role manages casino table seats" on public.casino_table_seats
  for all to service_role using (true) with check (true);
drop policy if exists "Service role manages casino chip ledger" on public.casino_chip_ledger;
create policy "Service role manages casino chip ledger" on public.casino_chip_ledger
  for all to service_role using (true) with check (true);

-- Atomically reserve a human seat and debit the legacy user JSON envelope.
-- The app can migrate users into a normalized wallet later without changing
-- the API contract: all money movement is already inside this transaction.
create or replace function public.casino_take_table_seat(
  p_table_id text,
  p_user_id text,
  p_buy_in integer,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.casino_table_catalog%rowtype;
  v_user jsonb;
  v_existing public.casino_chip_ledger%rowtype;
  v_active_seats integer;
  v_mode text;
  v_chips integer;
  v_energy integer;
  v_result jsonb;
begin
  select * into v_existing from public.casino_chip_ledger where idempotency_key = p_idempotency_key;
  if found then return v_existing.request_result; end if;

  select * into v_table from public.casino_table_catalog where id = p_table_id and enabled for update;
  if not found then raise exception 'Table not found'; end if;
  v_mode := v_table.mode;

  select payload into v_user from public.app_state where id = 'user:' || p_user_id for update;
  if v_user is null then raise exception 'User profile not found'; end if;

  if exists (
    select 1 from public.casino_table_seats
    where table_id = p_table_id and user_id = p_user_id and state in ('reserved', 'seated', 'afk', 'leaving')
  ) then
    update public.casino_table_seats
      set state = 'seated', presence_expires_at = now() + interval '60 seconds'
      where table_id = p_table_id and user_id = p_user_id;
    v_result := jsonb_build_object('joined', false, 'alreadySeated', true, 'buyInAmount', 0);
    insert into public.casino_chip_ledger (idempotency_key, user_id, table_id, event, request_result)
      values (p_idempotency_key, p_user_id, p_table_id, case when v_mode = 'public' then 'public_buy_in' else 'free_entry' end, v_result);
    return v_result;
  end if;

  select count(*) into v_active_seats from public.casino_table_seats
    where table_id = p_table_id and state in ('reserved', 'seated', 'afk', 'leaving');
  if v_active_seats >= v_table.max_players then raise exception 'Table is full'; end if;

  if v_mode = 'public' then
    if p_buy_in < v_table.min_buy_in or p_buy_in > v_table.max_buy_in then raise exception 'Invalid public buy-in'; end if;
    v_chips := coalesce((v_user ->> 'casinoChips')::integer, 0);
    if v_chips < p_buy_in then raise exception 'Not enough casino chips'; end if;
    v_user := jsonb_set(v_user, '{casinoChips}', to_jsonb(v_chips - p_buy_in));
  else
    if p_buy_in <> 100 then raise exception 'Free table bankroll is fixed at 100 chips'; end if;
    v_energy := coalesce((v_user ->> 'energy')::integer, 0);
    if v_energy < 2 then raise exception 'Not enough energy'; end if;
    v_user := jsonb_set(v_user, '{energy}', to_jsonb(v_energy - 2));
  end if;

  update public.app_state set payload = v_user where id = 'user:' || p_user_id;
  insert into public.casino_table_seats (table_id, user_id, seat_number, state, chips, presence_expires_at)
    values (p_table_id, p_user_id, v_active_seats + 1, 'seated', p_buy_in, now() + interval '60 seconds');
  v_result := jsonb_build_object('joined', true, 'alreadySeated', false, 'buyInAmount', p_buy_in);
  insert into public.casino_chip_ledger (idempotency_key, user_id, table_id, event, chip_delta, energy_delta, request_result)
    values (
      p_idempotency_key, p_user_id, p_table_id,
      case when v_mode = 'public' then 'public_buy_in' else 'free_entry' end,
      case when v_mode = 'public' then -p_buy_in else 0 end,
      case when v_mode = 'free' then -2 else 0 end,
      v_result
    );
  return v_result;
end;
$$;

create or replace function public.casino_heartbeat(
  p_table_id text,
  p_user_id text
) returns timestamptz
language sql
security definer
set search_path = public
as $$
  update public.casino_table_seats
  set state = 'seated', presence_expires_at = now() + interval '60 seconds'
  where table_id = p_table_id and user_id = p_user_id
    and state in ('reserved', 'seated', 'afk', 'leaving')
  returning presence_expires_at;
$$;

-- A single compact JSON checkpoint is enough for an idle table. The function
-- increments the revision inside Postgres, so a restart cannot overwrite a
-- newer snapshot merely because a Node process held an old counter.
create or replace function public.casino_checkpoint_runtime(
  p_table_id text,
  p_state jsonb,
  p_phase text default 'active'
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
begin
  insert into public.casino_table_runtime (table_id, state, phase, revision, last_human_activity_at)
  values (p_table_id, p_state, p_phase, 1, now())
  on conflict (table_id) do update set
    state = excluded.state,
    phase = excluded.phase,
    revision = public.casino_table_runtime.revision + 1,
    last_human_activity_at = excluded.last_human_activity_at,
    updated_at = now()
  returning revision into v_revision;
  return v_revision;
end;
$$;

create or replace function public.casino_leave_table_seat(
  p_table_id text,
  p_user_id text,
  p_cash_out integer,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.casino_table_catalog%rowtype;
  v_user jsonb;
  v_existing public.casino_chip_ledger%rowtype;
  v_chips integer;
  v_result jsonb;
begin
  if p_cash_out < 0 then raise exception 'Invalid cash out'; end if;
  select * into v_existing from public.casino_chip_ledger where idempotency_key = p_idempotency_key;
  if found then return v_existing.request_result; end if;
  select * into v_table from public.casino_table_catalog where id = p_table_id for update;
  if not found then raise exception 'Table not found'; end if;
  if not exists (select 1 from public.casino_table_seats where table_id = p_table_id and user_id = p_user_id and state in ('reserved', 'seated', 'afk', 'leaving')) then
    return jsonb_build_object('released', false, 'chips', 0);
  end if;
  if v_table.mode = 'public' then
    select payload into v_user from public.app_state where id = 'user:' || p_user_id for update;
    if v_user is null then raise exception 'User profile not found'; end if;
    v_chips := coalesce((v_user ->> 'casinoChips')::integer, 0) + p_cash_out;
    update public.app_state set payload = jsonb_set(v_user, '{casinoChips}', to_jsonb(v_chips)) where id = 'user:' || p_user_id;
  end if;
  update public.casino_table_seats set state = 'released', presence_expires_at = null where table_id = p_table_id and user_id = p_user_id;
  v_result := jsonb_build_object('released', true, 'chips', case when v_table.mode = 'public' then p_cash_out else 0 end);
  insert into public.casino_chip_ledger (idempotency_key, user_id, table_id, event, chip_delta, request_result)
    values (p_idempotency_key, p_user_id, p_table_id, case when v_table.mode = 'public' then 'public_cash_out' else 'seat_release' end, case when v_table.mode = 'public' then p_cash_out else 0 end, v_result);
  return v_result;
end;
$$;
