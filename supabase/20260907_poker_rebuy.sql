-- Server-only rebuy: debit, receipt and funded runtime commit together.
-- Apply after the existing casino migrations, before deploying rebuy support.
begin;
create or replace function public.casino_poker_rebuy(
  p_table_id text, p_user_id text, p_chips integer, p_key text, p_state jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table public.casino_table_catalog%rowtype;
  v_user jsonb;
  v_runtime jsonb;
  v_previous public.casino_chip_ledger%rowtype;
  v_player jsonb;
  v_old_player jsonb;
  v_receipt jsonb;
  v_balance integer;
begin
  perform set_config('lock_timeout', '5s', true);
  select * into v_table from public.casino_table_catalog where id = p_table_id and enabled for update;
  if not found or v_table.game_type <> 'poker' then raise exception 'Table not found'; end if;
  select * into v_previous from public.casino_chip_ledger where idempotency_key = p_key;
  if found then
    if v_previous.user_id <> p_user_id or v_previous.table_id <> p_table_id then
      raise exception 'Rebuy request mismatch';
    end if;
    return v_previous.request_result || jsonb_build_object('replayed', true);
  end if;
  if not exists(select 1 from public.casino_table_seats where table_id = p_table_id
      and user_id = p_user_id and state in ('reserved', 'seated', 'afk')) then
    raise exception 'Active seat required';
  end if;
  select payload into v_user from public.app_state where id = 'user:' || p_user_id for update;
  if v_user is null then raise exception 'User profile not found'; end if;
  select state into v_runtime from public.casino_table_runtime where table_id = p_table_id for update;
  if v_runtime is null or v_runtime ->> 'id' is distinct from p_table_id then
    raise exception 'Current table state not found';
  end if;
  select value into v_old_player from jsonb_array_elements(v_runtime -> 'players')
    where value ->> 'userId' = p_user_id;
  if v_old_player is null or coalesce((v_old_player ->> 'chips')::integer, -1) <> 0
      or not ((v_runtime ->> 'stage') in ('idle', 'ended')
        or coalesce((v_old_player ->> 'eliminated')::boolean, false)) then
    raise exception 'Rebuy is not available';
  end if;
  -- p_state is built and validated by the authenticated game server, never the browser.
  select value into v_player from jsonb_array_elements(p_state -> 'players')
    where value ->> 'userId' = p_user_id;
  if p_state ->> 'id' is distinct from p_table_id or v_player is null
      or (v_player ->> 'chips')::integer is distinct from p_chips
      or (v_player ->> 'rebuyPending')::boolean is distinct from true then
    raise exception 'Invalid rebuy snapshot';
  end if;
  if p_chips is null or p_chips < v_table.min_buy_in or p_chips > v_table.max_buy_in then
    raise exception 'Invalid buy-in';
  end if;
  if v_table.mode = 'free' then
    if p_chips <> 100 then raise exception 'Free rebuy is 100 chips'; end if;
    v_balance := coalesce((v_user ->> 'energy')::integer, 0);
    if v_balance < 2 then raise exception 'Not enough energy'; end if;
    v_user := jsonb_set(v_user, '{energy}', to_jsonb(v_balance - 2));
  else
    v_balance := coalesce((v_user ->> 'casinoChips')::integer, 0);
    if v_balance < p_chips then raise exception 'Not enough casino chips'; end if;
    v_user := jsonb_set(v_user, '{casinoChips}', to_jsonb(v_balance - p_chips));
  end if;
  v_receipt := jsonb_build_object('tableId', p_table_id, 'chips', p_chips,
    'energyCost', case when v_table.mode = 'free' then 2 else 0 end,
    'casinoChips', coalesce((v_user ->> 'casinoChips')::integer, 0),
    'energy', coalesce((v_user ->> 'energy')::integer, 0), 'replayed', false);
  update public.app_state set payload = v_user where id = 'user:' || p_user_id;
  update public.casino_table_seats set chips = p_chips, state = 'seated',
    presence_expires_at = now() + interval '3 minutes', updated_at = now()
    where table_id = p_table_id and user_id = p_user_id;
  perform public.casino_checkpoint_runtime(p_table_id, p_state, 'active');
  insert into public.casino_chip_ledger(idempotency_key, user_id, table_id, event,
    chip_delta, energy_delta, request_result)
    values(p_key, p_user_id, p_table_id,
      case when v_table.mode = 'free' then 'free_entry' else 'public_buy_in' end,
      case when v_table.mode = 'free' then 0 else -p_chips end,
      case when v_table.mode = 'free' then -2 else 0 end, v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.casino_poker_rebuy(text,text,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.casino_poker_rebuy(text,text,integer,text,jsonb) to service_role;
commit;
