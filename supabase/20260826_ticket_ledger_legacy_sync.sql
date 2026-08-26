-- Keeps the legacy app_state envelope and the canonical double-entry ledger
-- in one PostgreSQL transaction during the rollout. Existing Node handlers
-- may continue their normal upsert path while every balance delta is recorded
-- durably and atomically. Apply after 20260826_ticket_ledger.sql.

create or replace function public.ticket_sync_legacy_user_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_old_available bigint;
  v_old_held bigint;
  v_new_available bigint;
  v_new_held bigint;
  v_available_delta bigint;
  v_held_delta bigint;
  v_total_delta bigint;
begin
  if new.id not like 'user:%' then return new; end if;
  v_user_id := substring(new.id from 6);

  v_old_available := case when tg_op = 'INSERT' then 0 else greatest(0, round(coalesce((old.payload ->> 'availableTickets')::numeric, 0) * 100)::bigint) end;
  v_old_held := case when tg_op = 'INSERT' then 0 else greatest(0, round(coalesce((old.payload ->> 'heldTickets')::numeric, 0) * 100)::bigint) end;
  v_new_available := greatest(0, round(coalesce((new.payload ->> 'availableTickets')::numeric, 0) * 100)::bigint);
  v_new_held := greatest(0, round(coalesce((new.payload ->> 'heldTickets')::numeric, 0) * 100)::bigint);
  v_available_delta := v_new_available - v_old_available;
  v_held_delta := v_new_held - v_old_held;
  v_total_delta := v_available_delta + v_held_delta;
  if v_available_delta = 0 and v_held_delta = 0 then return new; end if;

  perform public.ticket_post_transaction(
    'legacy-sync:' || gen_random_uuid()::text,
    'legacy_balance_sync',
    'app_state_user',
    v_user_id,
    jsonb_build_array(
      jsonb_build_object('owner_user_id', v_user_id, 'bucket', 'available', 'amount_units', v_available_delta),
      jsonb_build_object('owner_user_id', v_user_id, 'bucket', 'held', 'amount_units', v_held_delta),
      jsonb_build_object('owner_user_id', 'system', 'bucket', 'treasury', 'amount_units', -v_total_delta)
    ),
    jsonb_build_object('source', 'app_state_trigger', 'operation', tg_op)
  );
  return new;
end;
$$;

drop trigger if exists ticket_sync_legacy_user_balance on public.app_state;
create trigger ticket_sync_legacy_user_balance
after insert or update of payload on public.app_state
for each row execute function public.ticket_sync_legacy_user_balance();
