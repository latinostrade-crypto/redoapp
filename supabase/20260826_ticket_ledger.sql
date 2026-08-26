-- Canonical ticket accounting. Apply this migration before enabling the
-- transactional ticket ledger in production. Amounts are integer centi-TKT:
-- 100 units = 1.00 TKT. No financial value is stored as float.

create table if not exists public.ticket_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  bucket text not null check (bucket in ('available', 'held', 'treasury', 'burn')),
  -- User funds may never be negative. The single system treasury is the
  -- balancing counterparty and therefore may be negative (liability view).
  balance_units bigint not null default 0 check (balance_units >= 0 or owner_user_id = 'system'),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, bucket)
);

create table if not exists public.ticket_transactions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_type text not null,
  reference_type text not null,
  reference_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_ledger_entries (
  id bigserial primary key,
  transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  account_id uuid not null references public.ticket_accounts(id) on delete restrict,
  amount_units bigint not null check (amount_units <> 0),
  created_at timestamptz not null default now()
);

create index if not exists ticket_ledger_entries_account_created_idx
  on public.ticket_ledger_entries(account_id, created_at, id);
create index if not exists ticket_transactions_reference_idx
  on public.ticket_transactions(reference_type, reference_id, created_at);

drop trigger if exists ticket_accounts_set_updated_at on public.ticket_accounts;
create trigger ticket_accounts_set_updated_at before update on public.ticket_accounts
for each row execute function public.set_updated_at();

alter table public.ticket_accounts enable row level security;
alter table public.ticket_transactions enable row level security;
alter table public.ticket_ledger_entries enable row level security;

drop policy if exists "Service role manages ticket accounts" on public.ticket_accounts;
create policy "Service role manages ticket accounts" on public.ticket_accounts
  for all to service_role using (true) with check (true);
drop policy if exists "Service role manages ticket transactions" on public.ticket_transactions;
create policy "Service role manages ticket transactions" on public.ticket_transactions
  for all to service_role using (true) with check (true);
drop policy if exists "Service role manages ticket ledger entries" on public.ticket_ledger_entries;
create policy "Service role manages ticket ledger entries" on public.ticket_ledger_entries
  for all to service_role using (true) with check (true);

-- Posts a complete double-entry transaction. p_entries is an array of
-- { owner_user_id: text, bucket: text, amount_units: bigint }. Its sum must
-- be zero; each affected account is locked before balance mutation.
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

  select id into v_transaction_id
  from public.ticket_transactions
  where idempotency_key = p_idempotency_key;
  if found then
    return query select v_transaction_id, true;
    return;
  end if;

  select coalesce(sum((value ->> 'amount_units')::bigint), 0) into v_total
  from jsonb_array_elements(p_entries);
  if v_total <> 0 then
    raise exception 'ticket ledger transaction must balance to zero';
  end if;

  -- Ensure accounts exist before ordering their row locks.
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_owner := nullif(v_entry ->> 'owner_user_id', '');
    v_bucket := nullif(v_entry ->> 'bucket', '');
    if v_owner is null or v_bucket not in ('available', 'held', 'treasury', 'burn') then
      raise exception 'invalid ticket ledger account';
    end if;
    insert into public.ticket_accounts(owner_user_id, bucket)
    values (v_owner, v_bucket)
    on conflict (owner_user_id, bucket) do nothing;
  end loop;

  insert into public.ticket_transactions(idempotency_key, event_type, reference_type, reference_id, metadata)
  values (p_idempotency_key, p_event_type, p_reference_type, p_reference_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_transaction_id;

  -- Deterministic locks prevent two concurrent debits from both succeeding.
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
    update public.ticket_accounts
      set balance_units = balance_units + v_amount, version = version + 1
      where id = v_account_id
        and (owner_user_id = 'system' or balance_units + v_amount >= 0);
    if not found then
      raise exception 'insufficient ticket balance in %/%', v_owner, v_bucket;
    end if;
    insert into public.ticket_ledger_entries(transaction_id, account_id, amount_units)
      values (v_transaction_id, v_account_id, v_amount);
  end loop;

  return query select v_transaction_id, false;
end;
$$;

-- The service role is the only caller. Clients receive balances through API.
revoke all on function public.ticket_post_transaction(text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.ticket_post_transaction(text, text, text, text, jsonb, jsonb) to service_role;

-- One-time baseline for the existing JSON envelope. This does not pretend to
-- reconstruct old, truncated history: it records a transparent opening
-- balance for every current user, balanced against system treasury. Run after
-- review in a maintenance window, before routing live writes through the RPC.
do $$
declare
  r record;
  v_available bigint;
  v_held bigint;
  v_total bigint;
  v_tx uuid;
  v_available_account uuid;
  v_held_account uuid;
  v_treasury uuid;
begin
  insert into public.ticket_accounts(owner_user_id, bucket)
  values ('system', 'treasury') on conflict (owner_user_id, bucket) do nothing;
  select id into v_treasury from public.ticket_accounts
    where owner_user_id = 'system' and bucket = 'treasury';

  for r in
    select substring(id from 6) as user_id, payload
    from public.app_state
    where id like 'user:%'
  loop
    v_available := greatest(0, round(coalesce((r.payload ->> 'availableTickets')::numeric, 0) * 100)::bigint);
    v_held := greatest(0, round(coalesce((r.payload ->> 'heldTickets')::numeric, 0) * 100)::bigint);
    v_total := v_available + v_held;
    if v_total = 0 then continue; end if;

    insert into public.ticket_transactions(idempotency_key, event_type, reference_type, reference_id, metadata)
    values (
      'legacy-opening:' || r.user_id,
      'opening_balance', 'legacy_user', r.user_id,
      jsonb_build_object('source', 'app_state', 'migration', '20260826_ticket_ledger')
    ) on conflict (idempotency_key) do nothing returning id into v_tx;
    if v_tx is null then continue; end if;

    insert into public.ticket_accounts(owner_user_id, bucket) values
      (r.user_id, 'available'), (r.user_id, 'held')
    on conflict (owner_user_id, bucket) do nothing;
    select id into v_available_account from public.ticket_accounts where owner_user_id = r.user_id and bucket = 'available';
    select id into v_held_account from public.ticket_accounts where owner_user_id = r.user_id and bucket = 'held';

    update public.ticket_accounts set balance_units = balance_units + v_available, version = version + 1 where id = v_available_account;
    update public.ticket_accounts set balance_units = balance_units + v_held, version = version + 1 where id = v_held_account;
    update public.ticket_accounts set balance_units = balance_units - v_total, version = version + 1 where id = v_treasury;
    if v_available <> 0 then insert into public.ticket_ledger_entries(transaction_id, account_id, amount_units) values (v_tx, v_available_account, v_available); end if;
    if v_held <> 0 then insert into public.ticket_ledger_entries(transaction_id, account_id, amount_units) values (v_tx, v_held_account, v_held); end if;
    insert into public.ticket_ledger_entries(transaction_id, account_id, amount_units) values (v_tx, v_treasury, -v_total);
  end loop;
end $$;

-- Empty result sets are an operational invariant. Alert if either view ever
-- returns a row; do not silently clamp or rewrite a balance to hide it.
create or replace view public.ticket_account_reconciliation as
select
  a.id as account_id,
  a.owner_user_id,
  a.bucket,
  a.balance_units as stored_balance_units,
  coalesce(sum(e.amount_units), 0) as ledger_balance_units,
  a.balance_units - coalesce(sum(e.amount_units), 0) as difference_units
from public.ticket_accounts a
left join public.ticket_ledger_entries e on e.account_id = a.id
group by a.id
having a.balance_units <> coalesce(sum(e.amount_units), 0);

create or replace view public.ticket_transaction_reconciliation as
select t.id as transaction_id, t.idempotency_key, sum(e.amount_units) as difference_units
from public.ticket_transactions t
join public.ticket_ledger_entries e on e.transaction_id = t.id
group by t.id
having sum(e.amount_units) <> 0;
