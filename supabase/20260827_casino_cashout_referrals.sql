-- Generalise the durable cash-out referral ledger from Poker-only to every
-- public casino game. The application supplies shares only for verified,
-- positive realised profit; this RPC keeps the player cash-out, referral
-- credits and seat release atomic and idempotent.

alter table public.casino_chip_ledger
  drop constraint if exists casino_chip_ledger_event_check;
alter table public.casino_chip_ledger
  add constraint casino_chip_ledger_event_check check (
    event in ('public_buy_in', 'public_cash_out', 'free_entry', 'seat_release', 'poker_referral_cashout', 'casino_referral_cashout')
  );

create or replace function public.casino_leave_table_seat(
  p_table_id text,
  p_user_id text,
  p_cash_out integer,
  p_idempotency_key text,
  p_referral_payouts jsonb default '[]'::jsonb
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
  v_referral jsonb;
  v_recipient_id text;
  v_recipient jsonb;
  v_amount integer;
  v_total_referrals integer := 0;
  v_result jsonb;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '15s', true);
  if p_cash_out < 0 or jsonb_typeof(p_referral_payouts) <> 'array' then
    raise exception 'Invalid cash out or referral payouts';
  end if;
  select * into v_existing from public.casino_chip_ledger where idempotency_key = p_idempotency_key;
  if found then return v_existing.request_result; end if;
  select * into v_table from public.casino_table_catalog where id = p_table_id for update;
  if not found then raise exception 'Table not found'; end if;
  if not exists (
    select 1 from public.casino_table_seats where table_id = p_table_id and user_id = p_user_id
      and state in ('reserved', 'seated', 'afk', 'leaving')
  ) then return jsonb_build_object('released', false, 'chips', 0); end if;

  perform 1 from public.app_state where id = any (array(
    select 'user:' || p_user_id union
    select 'user:' || (value ->> 'recipientUserId') from jsonb_array_elements(p_referral_payouts)
  )) order by id for update;

  if v_table.mode <> 'public' and jsonb_array_length(p_referral_payouts) <> 0 then
    raise exception 'Referral payouts require a public table';
  end if;
  if v_table.mode = 'public' then
    select payload into v_user from public.app_state where id = 'user:' || p_user_id;
    if v_user is null then raise exception 'User profile not found'; end if;
    v_chips := coalesce((v_user ->> 'casinoChips')::integer, 0) + p_cash_out;
    update public.app_state set payload = jsonb_set(v_user, '{casinoChips}', to_jsonb(v_chips)) where id = 'user:' || p_user_id;
    for v_referral in select value from jsonb_array_elements(p_referral_payouts) order by value ->> 'recipientUserId', value ->> 'level' loop
      v_recipient_id := nullif(v_referral ->> 'recipientUserId', '');
      v_amount := coalesce((v_referral ->> 'amount')::integer, -1);
      if v_recipient_id is null or v_recipient_id = p_user_id or v_amount < 0 then raise exception 'Invalid referral payout'; end if;
      if v_amount = 0 then continue; end if;
      select payload into v_recipient from public.app_state where id = 'user:' || v_recipient_id;
      if v_recipient is null then raise exception 'Referral recipient not found'; end if;
      v_chips := coalesce((v_recipient ->> 'casinoChips')::integer, 0) + v_amount;
      update public.app_state set payload = jsonb_set(v_recipient, '{casinoChips}', to_jsonb(v_chips)) where id = 'user:' || v_recipient_id;
      insert into public.casino_chip_ledger (idempotency_key, user_id, table_id, event, chip_delta, request_result)
        values (p_idempotency_key || ':ref:' || coalesce(v_referral ->> 'level', 'x') || ':' || v_recipient_id,
          v_recipient_id, p_table_id, 'casino_referral_cashout', v_amount,
          jsonb_build_object('sourceUserId', p_user_id, 'amount', v_amount));
      v_total_referrals := v_total_referrals + v_amount;
    end loop;
  end if;
  update public.casino_table_seats set state = 'released', seat_number = null, presence_expires_at = null
    where table_id = p_table_id and user_id = p_user_id;
  v_result := jsonb_build_object('released', true, 'chips', case when v_table.mode = 'public' then p_cash_out else 0 end, 'referralChips', v_total_referrals);
  insert into public.casino_chip_ledger (idempotency_key, user_id, table_id, event, chip_delta, request_result)
    values (p_idempotency_key, p_user_id, p_table_id, case when v_table.mode = 'public' then 'public_cash_out' else 'seat_release' end,
      case when v_table.mode = 'public' then p_cash_out else 0 end, v_result);
  return v_result;
end;
$$;

revoke all on function public.casino_leave_table_seat(text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.casino_leave_table_seat(text, text, integer, text, jsonb) to service_role;
