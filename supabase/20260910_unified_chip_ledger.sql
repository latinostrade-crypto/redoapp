-- Canonical, integer-only chip accounting.
-- 100 chips represent 1 GRAM at the wallet boundary; GRAM decimals never
-- enter the ledger. Apply after persistent_tables.sql and ticket migrations.
begin;

create table if not exists public.chip_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  bucket text not null check (bucket in ('available', 'held', 'table', 'treasury', 'burn')),
  balance bigint not null default 0 check (balance >= 0 or owner_user_id = 'system'),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, bucket)
);

create table if not exists public.chip_transactions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_type text not null,
  reference_type text not null,
  reference_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.chip_ledger_entries (
  id bigserial primary key,
  transaction_id uuid not null references public.chip_transactions(id) on delete restrict,
  account_id uuid not null references public.chip_accounts(id) on delete restrict,
  amount bigint not null check (amount <> 0),
  created_at timestamptz not null default now()
);

create index if not exists chip_ledger_entries_account_created_idx
  on public.chip_ledger_entries(account_id, created_at, id);
create index if not exists chip_transactions_reference_idx
  on public.chip_transactions(reference_type, reference_id, created_at);

create table if not exists public.wallet_deposit_claims (
  payment_message_hash text primary key,
  intent_id text not null unique,
  user_id text not null,
  chip_amount bigint not null check (chip_amount > 0),
  transaction_id uuid references public.chip_transactions(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.chip_accounts enable row level security;
alter table public.chip_transactions enable row level security;
alter table public.chip_ledger_entries enable row level security;
alter table public.wallet_deposit_claims enable row level security;
drop policy if exists "Service role manages chip accounts" on public.chip_accounts;
create policy "Service role manages chip accounts" on public.chip_accounts for all to service_role using (true) with check (true);
drop policy if exists "Service role manages chip transactions" on public.chip_transactions;
create policy "Service role manages chip transactions" on public.chip_transactions for all to service_role using (true) with check (true);
drop policy if exists "Service role manages chip ledger entries" on public.chip_ledger_entries;
create policy "Service role manages chip ledger entries" on public.chip_ledger_entries for all to service_role using (true) with check (true);
drop policy if exists "Service role manages wallet deposit claims" on public.wallet_deposit_claims;
create policy "Service role manages wallet deposit claims" on public.wallet_deposit_claims for all to service_role using (true) with check (true);

create or replace function public.chip_post_transaction(
  p_idempotency_key text,
  p_event_type text,
  p_reference_type text,
  p_reference_id text,
  p_entries jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns table(transaction_id uuid, replayed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_transaction_id uuid;
  v_total bigint;
  v_entry jsonb;
  v_owner text;
  v_bucket text;
  v_amount bigint;
  v_account_id uuid;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'idempotency key is required'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then raise exception 'at least two entries are required'; end if;
  select coalesce(sum((value ->> 'amount')::bigint), 0) into v_total from jsonb_array_elements(p_entries);
  if v_total <> 0 then raise exception 'chip transaction must balance to zero'; end if;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_owner := nullif(v_entry ->> 'owner_user_id', '');
    v_bucket := nullif(v_entry ->> 'bucket', '');
    v_amount := (v_entry ->> 'amount')::bigint;
    if v_owner is null or v_bucket not in ('available', 'held', 'table', 'treasury', 'burn') then raise exception 'invalid chip account'; end if;
    if v_amount = 0 then raise exception 'zero-value chip entry is not allowed'; end if;
    insert into public.chip_accounts(owner_user_id, bucket) values(v_owner, v_bucket)
      on conflict(owner_user_id, bucket) do nothing;
  end loop;

  perform 1 from public.chip_accounts a where (a.owner_user_id, a.bucket) in (
    select value ->> 'owner_user_id', value ->> 'bucket' from jsonb_array_elements(p_entries)
  ) order by a.owner_user_id, a.bucket for update;

  insert into public.chip_transactions(idempotency_key, event_type, reference_type, reference_id, metadata)
    values(p_idempotency_key, p_event_type, p_reference_type, p_reference_id, coalesce(p_metadata, '{}'::jsonb))
    on conflict(idempotency_key) do nothing
    returning id into v_transaction_id;
  if v_transaction_id is null then
    select id into v_transaction_id from public.chip_transactions where idempotency_key=p_idempotency_key;
    return query select v_transaction_id,true; return;
  end if;

  perform set_config('redoapp.chip_ledger_write', 'on', true);
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_owner := v_entry ->> 'owner_user_id'; v_bucket := v_entry ->> 'bucket'; v_amount := (v_entry ->> 'amount')::bigint;
    select id into v_account_id from public.chip_accounts where owner_user_id = v_owner and bucket = v_bucket;
    update public.chip_accounts set balance = balance + v_amount, version = version + 1, updated_at = now()
      where id = v_account_id and (owner_user_id = 'system' or balance + v_amount >= 0);
    if not found then raise exception 'insufficient chip balance in %/%', v_owner, v_bucket; end if;
    insert into public.chip_ledger_entries(transaction_id, account_id, amount) values(v_transaction_id, v_account_id, v_amount);
  end loop;
  return query select v_transaction_id, false;
end;
$$;

-- Establish one audited opening position from every legacy balance bucket.
-- The migration is intended for a maintenance window after gameplay writes
-- are paused, so available and held values cannot move during classification.
do $$
declare
  v_row record;
  v_available bigint;
  v_held bigint;
begin
  for v_row in select id, payload from public.app_state where id like 'user:%' loop
    v_available := greatest(0, round(coalesce((v_row.payload ->> 'casinoChips')::numeric, 0))::bigint)
      + greatest(0, round(coalesce((v_row.payload ->> 'availableTickets')::numeric, 0) * 100)::bigint);
    v_held := greatest(0, round(coalesce((v_row.payload ->> 'heldTickets')::numeric, 0) * 100)::bigint);
    if v_available > 10000000 or v_held > 10000000 then
      raise exception 'legacy chip balance exceeds the supported per-bucket limit for %', v_row.id;
    end if;
    insert into public.chip_accounts(owner_user_id, bucket) values(substring(v_row.id from 6), 'available')
      on conflict(owner_user_id, bucket) do nothing;
    insert into public.chip_accounts(owner_user_id, bucket) values(substring(v_row.id from 6), 'held')
      on conflict(owner_user_id, bucket) do nothing;
    if v_available > 0 and not exists (
      select 1 from public.chip_transactions where idempotency_key = 'chip-opening:' || substring(v_row.id from 6)
    ) then
      perform public.chip_post_transaction(
        'chip-opening:' || substring(v_row.id from 6), 'opening_balance', 'legacy_profile', substring(v_row.id from 6),
        jsonb_build_array(
          jsonb_build_object('owner_user_id', substring(v_row.id from 6), 'bucket', 'available', 'amount', v_available),
          jsonb_build_object('owner_user_id', 'system', 'bucket', 'treasury', 'amount', -v_available)
        ), jsonb_build_object('sourceFields', jsonb_build_array('casinoChips', 'availableTickets'))
      );
    end if;
    if v_held > 0 and not exists (
      select 1 from public.chip_transactions where idempotency_key = 'chip-opening-held:' || substring(v_row.id from 6)
    ) then
      perform public.chip_post_transaction(
        'chip-opening-held:' || substring(v_row.id from 6), 'opening_hold', 'legacy_profile', substring(v_row.id from 6),
        jsonb_build_array(
          jsonb_build_object('owner_user_id', substring(v_row.id from 6), 'bucket', 'held', 'amount', v_held),
          jsonb_build_object('owner_user_id', 'system', 'bucket', 'treasury', 'amount', -v_held)
        ), jsonb_build_object('sourceField', 'heldTickets')
      );
    end if;
    update public.app_state set payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_row.payload, '{casinoChips}', to_jsonb(v_available)),
          '{heldCasinoChips}', to_jsonb(v_held)
        ), '{availableTickets}', to_jsonb(v_available::numeric / 100)
      ), '{heldTickets}', to_jsonb(v_held::numeric / 100)
    ) || jsonb_build_object('chipEconomyVersion', 1), updated_at = now()
    where id = v_row.id;
  end loop;
end;
$$;

-- Claim the verified TON payment and credit the player in one transaction.
create or replace function public.chip_credit_wallet_deposit(
  p_payment_message_hash text,
  p_intent_id text,
  p_user_id text,
  p_chip_amount bigint,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_claim public.wallet_deposit_claims%rowtype;
  v_tx uuid;
  v_replayed boolean;
  v_balance bigint;
  v_user jsonb;
begin
  if p_payment_message_hash is null or length(trim(p_payment_message_hash)) < 16 then raise exception 'payment hash is required'; end if;
  if p_intent_id is null or p_user_id is null or p_chip_amount <= 0 then raise exception 'invalid deposit credit'; end if;
  select * into v_claim from public.wallet_deposit_claims where payment_message_hash = lower(trim(p_payment_message_hash)) for update;
  if found then
    if v_claim.intent_id <> p_intent_id or v_claim.user_id <> p_user_id or v_claim.chip_amount <> p_chip_amount then
      raise exception 'payment is already claimed by another deposit';
    end if;
    select balance into v_balance from public.chip_accounts where owner_user_id = p_user_id and bucket = 'available';
    return jsonb_build_object('replayed', true, 'transactionId', v_claim.transaction_id, 'availableChips', coalesce(v_balance, 0));
  end if;

  select transaction_id, replayed into v_tx, v_replayed from public.chip_post_transaction(
    'wallet-deposit:' || p_intent_id, 'wallet_deposit', 'deposit_intent', p_intent_id,
    jsonb_build_array(
      jsonb_build_object('owner_user_id', p_user_id, 'bucket', 'available', 'amount', p_chip_amount),
      jsonb_build_object('owner_user_id', 'system', 'bucket', 'treasury', 'amount', -p_chip_amount)
    ), p_metadata
  );
  insert into public.wallet_deposit_claims(payment_message_hash, intent_id, user_id, chip_amount, transaction_id)
    values(lower(trim(p_payment_message_hash)), p_intent_id, p_user_id, p_chip_amount, v_tx);
  select balance into v_balance from public.chip_accounts where owner_user_id = p_user_id and bucket = 'available';
  select payload into v_user from public.app_state where id = 'user:' || p_user_id for update;
  if v_user is null then raise exception 'user profile not found'; end if;
  perform set_config('redoapp.chip_projection_write', 'on', true);
  update public.app_state
    set payload = jsonb_set(v_user, '{casinoChips}', to_jsonb(v_balance)), updated_at = now()
    where id = 'user:' || p_user_id;
  return jsonb_build_object('replayed', v_replayed, 'transactionId', v_tx, 'availableChips', v_balance);
end;
$$;

create or replace function public.chip_persist_user_snapshot(
  p_user_id text,
  p_payload jsonb,
  p_expected_revision bigint,
  p_next_revision bigint
) returns table(available_chips bigint, held_chips bigint, replayed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_existing jsonb;
  v_current_revision bigint;
  v_old_available bigint;
  v_old_held bigint;
  v_new_available bigint;
  v_new_held bigint;
  v_ledger_available bigint;
  v_ledger_held bigint;
  v_entries jsonb := '[]'::jsonb;
  v_net bigint;
  v_payload jsonb;
begin
  if p_user_id is null or p_payload ->> 'userId' is distinct from p_user_id then raise exception 'snapshot user mismatch'; end if;
  if p_expected_revision < 0 or p_next_revision <> p_expected_revision + 1 then raise exception 'invalid snapshot revision'; end if;
  select payload into v_existing from public.app_state where id = 'user:' || p_user_id for update;
  if v_existing is null then
    v_current_revision := 0; v_old_available := 0; v_old_held := 0;
    insert into public.chip_accounts(owner_user_id,bucket) values(p_user_id,'available'),(p_user_id,'held') on conflict do nothing;
  else
    v_current_revision := greatest(0, coalesce((v_existing ->> 'ticketStateRevision')::bigint, 0));
    v_old_available := greatest(0, coalesce((v_existing ->> 'casinoChips')::bigint, 0));
    v_old_held := greatest(0, coalesce((v_existing ->> 'heldCasinoChips')::bigint, 0));
  end if;
  if v_current_revision = p_next_revision then
    return query select v_old_available, v_old_held, true; return;
  end if;
  if v_current_revision <> p_expected_revision then raise exception 'chip snapshot revision conflict'; end if;
  v_new_available := greatest(0, coalesce((p_payload ->> 'casinoChips')::bigint, 0));
  v_new_held := greatest(0, coalesce((p_payload ->> 'heldCasinoChips')::bigint, 0));
  if (p_payload ->> 'casinoChips')::numeric <> v_new_available
      or coalesce((p_payload ->> 'heldCasinoChips')::numeric, 0) <> v_new_held then
    raise exception 'chip snapshot values must be integers';
  end if;
  select coalesce(sum(balance) filter(where bucket='available'),0), coalesce(sum(balance) filter(where bucket='held'),0)
    into v_ledger_available, v_ledger_held from public.chip_accounts where owner_user_id=p_user_id;
  if v_ledger_available <> v_old_available or v_ledger_held <> v_old_held then
    raise exception 'chip profile/ledger mismatch for user %', p_user_id;
  end if;
  if v_new_available <> v_old_available then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('owner_user_id',p_user_id,'bucket','available','amount',v_new_available-v_old_available));
  end if;
  if v_new_held <> v_old_held then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('owner_user_id',p_user_id,'bucket','held','amount',v_new_held-v_old_held));
  end if;
  v_net := (v_new_available-v_old_available)+(v_new_held-v_old_held);
  if v_net <> 0 then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('owner_user_id','system','bucket','treasury','amount',-v_net));
  end if;
  if jsonb_array_length(v_entries) > 0 then
    perform public.chip_post_transaction('chip-snapshot:'||p_user_id||':'||p_next_revision,
      'profile_snapshot','app_state_user',p_user_id,v_entries,jsonb_build_object('revision',p_next_revision));
  end if;
  v_payload := jsonb_set(
    jsonb_set(
      jsonb_set(p_payload,'{availableTickets}',to_jsonb(v_new_available::numeric/100)),
      '{heldTickets}',to_jsonb(v_new_held::numeric/100)
    ), '{ticketStateRevision}',to_jsonb(p_next_revision)
  ) || jsonb_build_object('chipEconomyVersion',1);
  perform set_config('redoapp.chip_projection_write', 'on', true);
  insert into public.app_state(id,payload,updated_at) values('user:'||p_user_id,v_payload,now())
    on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  return query select v_new_available,v_new_held,false;
end;
$$;

create or replace view public.chip_profile_reconciliation as
select substring(s.id from 6) as user_id,
  coalesce((s.payload->>'casinoChips')::bigint,0) as profile_available,
  coalesce(a.balance,0) as ledger_available,
  coalesce((s.payload->>'heldCasinoChips')::bigint,0) as profile_held,
  coalesce(h.balance,0) as ledger_held
from public.app_state s
left join public.chip_accounts a on a.owner_user_id=substring(s.id from 6) and a.bucket='available'
left join public.chip_accounts h on h.owner_user_id=substring(s.id from 6) and h.bucket='held'
where s.id like 'user:%' and (
  coalesce((s.payload->>'casinoChips')::bigint,0) <> coalesce(a.balance,0)
  or coalesce((s.payload->>'heldCasinoChips')::bigint,0) <> coalesce(h.balance,0)
);

create or replace view public.chip_transaction_reconciliation as
select t.id as transaction_id, t.idempotency_key, coalesce(sum(e.amount),0) as net_amount
from public.chip_transactions t left join public.chip_ledger_entries e on e.transaction_id=t.id
group by t.id,t.idempotency_key having coalesce(sum(e.amount),0) <> 0;

create or replace function public.chip_guard_ledger_immutability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then raise exception '% is append-only', tg_table_name; end if;
  return new;
end;
$$;
drop trigger if exists chip_transactions_immutable_guard on public.chip_transactions;
create trigger chip_transactions_immutable_guard before update or delete on public.chip_transactions for each row execute function public.chip_guard_ledger_immutability();
drop trigger if exists chip_ledger_entries_immutable_guard on public.chip_ledger_entries;
create trigger chip_ledger_entries_immutable_guard before update or delete on public.chip_ledger_entries for each row execute function public.chip_guard_ledger_immutability();
drop trigger if exists wallet_deposit_claims_immutable_guard on public.wallet_deposit_claims;
create trigger wallet_deposit_claims_immutable_guard before update or delete on public.wallet_deposit_claims for each row execute function public.chip_guard_ledger_immutability();

create or replace function public.chip_guard_account_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'chip accounts cannot be deleted'; end if;
  if new.balance <> old.balance and current_setting('redoapp.chip_ledger_write', true) is distinct from 'on' then
    raise exception 'chip balances may only change through chip_post_transaction';
  end if;
  return new;
end;
$$;
drop trigger if exists chip_accounts_balance_guard on public.chip_accounts;
create trigger chip_accounts_balance_guard before update or delete on public.chip_accounts for each row execute function public.chip_guard_account_balance();

-- Compatibility safety net: older casino RPCs still update the JSON profile
-- directly. Mirror every such balance delta into the canonical ledger inside
-- the same PostgreSQL transaction. New RPCs set chip_projection_write after
-- posting explicitly, preventing duplicate entries.
create or replace function public.chip_capture_profile_delta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user_id text;
  v_old_available bigint := 0;
  v_old_held bigint := 0;
  v_new_available bigint := 0;
  v_new_held bigint := 0;
  v_entries jsonb := '[]'::jsonb;
  v_net bigint;
begin
  if current_setting('redoapp.chip_projection_write', true) = 'on' then return new; end if;
  if new.id not like 'user:%' then return new; end if;
  v_user_id := substring(new.id from 6);
  if tg_op = 'UPDATE' then
    v_old_available := greatest(0,coalesce((old.payload->>'casinoChips')::bigint,0));
    v_old_held := greatest(0,coalesce((old.payload->>'heldCasinoChips')::bigint,0));
  end if;
  v_new_available := greatest(0,coalesce((new.payload->>'casinoChips')::bigint,0));
  v_new_held := greatest(0,coalesce((new.payload->>'heldCasinoChips')::bigint,0));
  if v_new_available = v_old_available and v_new_held = v_old_held then return new; end if;
  if v_new_available <> v_old_available then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('owner_user_id',v_user_id,'bucket','available','amount',v_new_available-v_old_available));
  end if;
  if v_new_held <> v_old_held then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('owner_user_id',v_user_id,'bucket','held','amount',v_new_held-v_old_held));
  end if;
  v_net := (v_new_available-v_old_available)+(v_new_held-v_old_held);
  if v_net <> 0 then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('owner_user_id','system','bucket','treasury','amount',-v_net));
  end if;
  perform public.chip_post_transaction(
    'profile-delta:'||txid_current()::text||':'||v_user_id,
    'legacy_profile_delta','app_state_user',v_user_id,v_entries,
    jsonb_build_object('source','compatibility_trigger')
  );
  return new;
end;
$$;
drop trigger if exists chip_capture_profile_delta_trigger on public.app_state;
create trigger chip_capture_profile_delta_trigger after insert or update on public.app_state
  for each row execute function public.chip_capture_profile_delta();

revoke all on function public.chip_post_transaction(text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.chip_post_transaction(text,text,text,text,jsonb,jsonb) to service_role;
revoke all on function public.chip_credit_wallet_deposit(text,text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.chip_credit_wallet_deposit(text,text,text,bigint,jsonb) to service_role;
revoke all on function public.chip_persist_user_snapshot(text,jsonb,bigint,bigint) from public, anon, authenticated;
grant execute on function public.chip_persist_user_snapshot(text,jsonb,bigint,bigint) to service_role;
revoke all on function public.chip_guard_ledger_immutability() from public, anon, authenticated;
revoke all on function public.chip_guard_account_balance() from public, anon, authenticated;
revoke all on function public.chip_capture_profile_delta() from public, anon, authenticated;
revoke all on public.chip_profile_reconciliation from public, anon, authenticated;
revoke all on public.chip_transaction_reconciliation from public, anon, authenticated;
grant select on public.chip_profile_reconciliation to service_role;
grant select on public.chip_transaction_reconciliation to service_role;

commit;
