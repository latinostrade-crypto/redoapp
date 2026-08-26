-- Ticket hardening phase 1. Apply after the ledger, legacy-sync and
-- reconciliation migrations. User snapshots are now persisted through one
-- optimistic, atomic RPC: the profile projection and double-entry balance
-- cannot be committed independently.

create or replace function public.ticket_post_transaction(
  p_idempotency_key text,
  p_event_type text,
  p_reference_type text,
  p_reference_id text,
  p_entries jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns table(transaction_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_total bigint;
  v_entry jsonb;
  v_owner text;
  v_bucket text;
  v_amount bigint;
  v_account_id uuid;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key is required';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'a transaction needs at least two entries';
  end if;

  select id into v_transaction_id from public.ticket_transactions
    where idempotency_key = p_idempotency_key;
  if found then
    return query select v_transaction_id, true;
    return;
  end if;

  select coalesce(sum((value ->> 'amount_units')::bigint), 0) into v_total
    from jsonb_array_elements(p_entries);
  if v_total <> 0 then raise exception 'ticket ledger transaction must balance to zero'; end if;

  perform set_config('redoapp.ticket_ledger_write', 'on', true);
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_owner := nullif(v_entry ->> 'owner_user_id', '');
    v_bucket := nullif(v_entry ->> 'bucket', '');
    if v_owner is null or v_bucket not in ('available', 'held', 'treasury', 'burn') then
      raise exception 'invalid ticket ledger account';
    end if;
    insert into public.ticket_accounts(owner_user_id, bucket)
      values (v_owner, v_bucket) on conflict (owner_user_id, bucket) do nothing;
  end loop;

  insert into public.ticket_transactions(idempotency_key, event_type, reference_type, reference_id, metadata)
    values (p_idempotency_key, p_event_type, p_reference_type, p_reference_id, coalesce(p_metadata, '{}'::jsonb))
    returning id into v_transaction_id;

  perform 1 from public.ticket_accounts a
    where (a.owner_user_id, a.bucket) in (
      select value ->> 'owner_user_id', value ->> 'bucket' from jsonb_array_elements(p_entries)
    ) order by a.owner_user_id, a.bucket for update;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_owner := v_entry ->> 'owner_user_id';
    v_bucket := v_entry ->> 'bucket';
    v_amount := (v_entry ->> 'amount_units')::bigint;
    if v_amount = 0 then continue; end if;
    select id into v_account_id from public.ticket_accounts
      where owner_user_id = v_owner and bucket = v_bucket;
    update public.ticket_accounts set balance_units = balance_units + v_amount, version = version + 1
      where id = v_account_id and (owner_user_id = 'system' or balance_units + v_amount >= 0);
    if not found then raise exception 'insufficient ticket balance in %/%', v_owner, v_bucket; end if;
    insert into public.ticket_ledger_entries(transaction_id, account_id, amount_units)
      values (v_transaction_id, v_account_id, v_amount);
  end loop;
  return query select v_transaction_id, false;
end;
$$;

create or replace function public.ticket_persist_user_snapshot(
  p_user_id text,
  p_payload jsonb,
  p_expected_revision bigint,
  p_next_revision bigint
) returns table(available_units bigint, held_units bigint, replayed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_current_revision bigint;
  v_old_available bigint := 0;
  v_old_held bigint := 0;
  v_new_available bigint;
  v_new_held bigint;
  v_ledger_available bigint;
  v_ledger_held bigint;
  v_payload jsonb;
  v_tx uuid;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then raise exception 'user id is required'; end if;
  if p_payload is null or p_payload ->> 'userId' is distinct from p_user_id then raise exception 'snapshot user id mismatch'; end if;
  if p_expected_revision < 0 or p_next_revision <> p_expected_revision + 1 then raise exception 'invalid snapshot revision'; end if;

  select payload into v_existing from public.app_state where id = 'user:' || p_user_id for update;
  if found then
    v_current_revision := greatest(0, coalesce((v_existing ->> 'ticketStateRevision')::bigint, 0));
    v_old_available := greatest(0, round(coalesce((v_existing ->> 'availableTickets')::numeric, 0) * 100)::bigint);
    v_old_held := greatest(0, round(coalesce((v_existing ->> 'heldTickets')::numeric, 0) * 100)::bigint);
  else
    v_current_revision := 0;
  end if;

  if v_current_revision = p_next_revision then
    return query select v_old_available, v_old_held, true;
    return;
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception 'ticket snapshot revision conflict for user % (expected %, found %)', p_user_id, p_expected_revision, v_current_revision;
  end if;

  v_new_available := greatest(0, round(coalesce((p_payload ->> 'availableTickets')::numeric, 0) * 100)::bigint);
  v_new_held := greatest(0, round(coalesce((p_payload ->> 'heldTickets')::numeric, 0) * 100)::bigint);
  select coalesce(sum(balance_units) filter (where bucket = 'available'), 0),
         coalesce(sum(balance_units) filter (where bucket = 'held'), 0)
    into v_ledger_available, v_ledger_held
    from public.ticket_accounts where owner_user_id = p_user_id;
  if v_ledger_available <> v_old_available or v_ledger_held <> v_old_held then
    raise exception 'profile/ledger mismatch for user %; reconciliation is required', p_user_id;
  end if;

  if v_new_available <> v_old_available or v_new_held <> v_old_held then
    select transaction_id into v_tx from public.ticket_post_transaction(
      'snapshot:' || p_user_id || ':' || p_next_revision::text,
      'profile_snapshot', 'app_state_user', p_user_id,
      jsonb_build_array(
        jsonb_build_object('owner_user_id', p_user_id, 'bucket', 'available', 'amount_units', v_new_available - v_old_available),
        jsonb_build_object('owner_user_id', p_user_id, 'bucket', 'held', 'amount_units', v_new_held - v_old_held),
        jsonb_build_object('owner_user_id', 'system', 'bucket', 'treasury', 'amount_units', -(v_new_available - v_old_available + v_new_held - v_old_held))
      ),
      jsonb_build_object('source', 'atomic_profile_snapshot', 'revision', p_next_revision)
    );
  end if;

  v_payload := jsonb_set(p_payload, '{ticketStateRevision}', to_jsonb(p_next_revision));
  perform set_config('redoapp.ticket_ledger_skip_legacy_sync', 'on', true);
  insert into public.app_state(id, payload, updated_at)
    values ('user:' || p_user_id, v_payload, now())
    on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at;
  return query select v_new_available, v_new_held, false;
end;
$$;

revoke all on function public.ticket_persist_user_snapshot(text, jsonb, bigint, bigint) from public;
grant execute on function public.ticket_persist_user_snapshot(text, jsonb, bigint, bigint) to service_role;

-- Direct writes to the immutable ledger are blocked unless made inside the
-- posting RPC. This catches accidental dashboard/service-code mutations.
create or replace function public.ticket_guard_ledger_immutability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name in ('ticket_transactions', 'ticket_ledger_entries') and tg_op in ('UPDATE', 'DELETE') then
    raise exception '% is append-only', tg_table_name;
  end if;
  if tg_table_name = 'ticket_accounts' and tg_op = 'DELETE' then raise exception 'ticket accounts cannot be deleted'; end if;
  if tg_table_name = 'ticket_accounts' and tg_op = 'UPDATE'
     and current_setting('redoapp.ticket_ledger_write', true) is distinct from 'on' then
    raise exception 'ticket account balances may only change through ticket_post_transaction';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists aaa_ticket_accounts_guard on public.ticket_accounts;
create trigger aaa_ticket_accounts_guard before update or delete on public.ticket_accounts
  for each row execute function public.ticket_guard_ledger_immutability();
drop trigger if exists ticket_transactions_immutable_guard on public.ticket_transactions;
create trigger ticket_transactions_immutable_guard before update or delete on public.ticket_transactions
  for each row execute function public.ticket_guard_ledger_immutability();
drop trigger if exists ticket_ledger_entries_immutable_guard on public.ticket_ledger_entries;
create trigger ticket_ledger_entries_immutable_guard before update or delete on public.ticket_ledger_entries
  for each row execute function public.ticket_guard_ledger_immutability();

create or replace function public.ticket_prevent_user_profile_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.id like 'user:%' then raise exception 'ticket-bearing user profiles cannot be deleted'; end if;
  return old;
end;
$$;
drop trigger if exists ticket_prevent_user_profile_delete on public.app_state;
create trigger ticket_prevent_user_profile_delete before delete on public.app_state
  for each row execute function public.ticket_prevent_user_profile_delete();

-- This is the operational alert invariant: an empty view means the profile
-- projection agrees with the authoritative double-entry accounts.
create or replace view public.ticket_profile_reconciliation as
with profiles as (
  select substring(id from 6) as user_id,
    greatest(0, round(coalesce((payload ->> 'availableTickets')::numeric, 0) * 100)::bigint) as available_units,
    greatest(0, round(coalesce((payload ->> 'heldTickets')::numeric, 0) * 100)::bigint) as held_units
  from public.app_state where id like 'user:%'
), accounts as (
  select owner_user_id as user_id,
    coalesce(sum(balance_units) filter (where bucket = 'available'), 0) as available_units,
    coalesce(sum(balance_units) filter (where bucket = 'held'), 0) as held_units
  from public.ticket_accounts where owner_user_id <> 'system' group by owner_user_id
)
select coalesce(p.user_id, a.user_id) as user_id,
  coalesce(p.available_units, 0) as profile_available_units,
  coalesce(a.available_units, 0) as ledger_available_units,
  coalesce(p.held_units, 0) as profile_held_units,
  coalesce(a.held_units, 0) as ledger_held_units
from profiles p full outer join accounts a using (user_id)
where coalesce(p.available_units, 0) <> coalesce(a.available_units, 0)
   or coalesce(p.held_units, 0) <> coalesce(a.held_units, 0);
