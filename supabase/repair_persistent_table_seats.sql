-- One-time repair for installations that applied persistent_tables.sql before
-- released seats became reusable. Run this once in Supabase SQL Editor.
begin;

alter table public.casino_table_seats
  drop constraint if exists casino_table_seats_table_id_seat_number_key;
drop index if exists public.casino_table_seats_active_seat_unique_idx;
update public.casino_table_seats
  set seat_number = null
  where state = 'released';
create unique index casino_table_seats_active_seat_unique_idx
  on public.casino_table_seats (table_id, seat_number)
  where state in ('reserved', 'seated', 'afk', 'leaving') and seat_number is not null;

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
  v_seat_number smallint;
  v_result jsonb;
begin
  -- Bound lock waits so a concurrent join/leave returns a retryable error
  -- instead of holding the Mini App in JOINING state.
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '15s', true);
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
      set state = 'seated', presence_expires_at = now() + interval '3 minutes'
      where table_id = p_table_id and user_id = p_user_id;
    v_result := jsonb_build_object('joined', false, 'alreadySeated', true, 'buyInAmount', 0);
    insert into public.casino_chip_ledger (idempotency_key, user_id, table_id, event, request_result)
      values (p_idempotency_key, p_user_id, p_table_id, case when v_mode = 'public' then 'public_buy_in' else 'free_entry' end, v_result);
    return v_result;
  end if;

  select count(*) into v_active_seats from public.casino_table_seats
    where table_id = p_table_id and state in ('reserved', 'seated', 'afk', 'leaving');
  if v_active_seats >= v_table.max_players then raise exception 'Table is full'; end if;
  select slot::smallint into v_seat_number
  from generate_series(1, v_table.max_players) as slot
  where not exists (
    select 1 from public.casino_table_seats
    where table_id = p_table_id and seat_number = slot
      and state in ('reserved', 'seated', 'afk', 'leaving')
  )
  order by slot
  limit 1;
  if v_seat_number is null then raise exception 'Table is full'; end if;

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
    values (p_table_id, p_user_id, v_seat_number, 'seated', p_buy_in, now() + interval '3 minutes')
  on conflict (table_id, user_id) do update set
    seat_number = excluded.seat_number,
    state = 'seated',
    chips = excluded.chips,
    presence_expires_at = excluded.presence_expires_at,
    joined_at = now(),
    updated_at = now();
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
  update public.casino_table_seats
    set state = 'released', seat_number = null, presence_expires_at = null
    where table_id = p_table_id and user_id = p_user_id;
  v_result := jsonb_build_object('released', true, 'chips', case when v_table.mode = 'public' then p_cash_out else 0 end);
  insert into public.casino_chip_ledger (idempotency_key, user_id, table_id, event, chip_delta, request_result)
    values (p_idempotency_key, p_user_id, p_table_id, case when v_table.mode = 'public' then 'public_cash_out' else 'seat_release' end, case when v_table.mode = 'public' then p_cash_out else 0 end, v_result);
  return v_result;
end;
$$;

commit;
