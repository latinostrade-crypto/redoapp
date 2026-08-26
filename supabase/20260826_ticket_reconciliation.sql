-- Per-user forensic reconciliation workflow. Apply after the ticket ledger
-- and legacy sync migrations. This never overwrites a balance: every repair
-- is a named, reviewed, double-entry compensating transaction.

create table if not exists public.ticket_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  case_key text not null unique,
  observed_units bigint not null,
  expected_units bigint,
  difference_units bigint,
  status text not null default 'open' check (status in ('open', 'evidence_ready', 'applied', 'rejected')),
  evidence jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  applied_transaction_id uuid references public.ticket_transactions(id),
  unique (user_id, status) deferrable initially immediate
);

create index if not exists ticket_reconciliation_cases_user_created_idx
  on public.ticket_reconciliation_cases(user_id, created_at desc);

alter table public.ticket_reconciliation_cases enable row level security;
drop policy if exists "Service role manages ticket reconciliation cases" on public.ticket_reconciliation_cases;
create policy "Service role manages ticket reconciliation cases" on public.ticket_reconciliation_cases
  for all to service_role using (true) with check (true);

-- Update the existing bridge trigger so the correction RPC can update the
-- legacy display envelope without producing a second ledger transaction.
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
  if current_setting('redoapp.ticket_ledger_skip_legacy_sync', true) = 'on' then return new; end if;
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
    'legacy-sync:' || gen_random_uuid()::text, 'legacy_balance_sync', 'app_state_user', v_user_id,
    jsonb_build_array(
      jsonb_build_object('owner_user_id', v_user_id, 'bucket', 'available', 'amount_units', v_available_delta),
      jsonb_build_object('owner_user_id', v_user_id, 'bucket', 'held', 'amount_units', v_held_delta),
      jsonb_build_object('owner_user_id', 'system', 'bucket', 'treasury', 'amount_units', -v_total_delta)
    ), jsonb_build_object('source', 'app_state_trigger', 'operation', tg_op)
  );
  return new;
end;
$$;

-- Applies one reviewed correction and updates the legacy profile balance in
-- the same database transaction. The function refuses guesses, duplicate
-- corrections, negative final balances, and unresolved cases.
create or replace function public.ticket_apply_reconciliation_correction(
  p_case_key text,
  p_actor text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.ticket_reconciliation_cases%rowtype;
  v_tx uuid;
  v_payload jsonb;
  v_current_available bigint;
  v_new_available bigint;
begin
  select * into v_case from public.ticket_reconciliation_cases
    where case_key = p_case_key for update;
  if not found then raise exception 'Reconciliation case not found'; end if;
  if v_case.status <> 'evidence_ready' then raise exception 'Case must be evidence_ready before application'; end if;
  if v_case.expected_units is null or v_case.difference_units is null then raise exception 'Expected balance is required'; end if;
  if v_case.difference_units = 0 then raise exception 'Zero-difference case needs no correction'; end if;
  if coalesce(array_length(v_case.evidence, 1), 0) = 0 then raise exception 'At least one evidence item is required'; end if;

  select payload into v_payload from public.app_state
    where id = 'user:' || v_case.user_id for update;
  if v_payload is null then raise exception 'User profile not found'; end if;
  v_current_available := greatest(0, round(coalesce((v_payload ->> 'availableTickets')::numeric, 0) * 100)::bigint);
  v_new_available := v_current_available + v_case.difference_units;
  if v_new_available < 0 then raise exception 'Correction would make available balance negative'; end if;

  select transaction_id into v_tx from public.ticket_post_transaction(
    'reconciliation:' || v_case.case_key,
    'balance_reconciliation', 'reconciliation_case', v_case.case_key,
    jsonb_build_array(
      jsonb_build_object('owner_user_id', v_case.user_id, 'bucket', 'available', 'amount_units', v_case.difference_units),
      jsonb_build_object('owner_user_id', 'system', 'bucket', 'treasury', 'amount_units', -v_case.difference_units)
    ),
    jsonb_build_object('case_key', v_case.case_key, 'actor', p_actor, 'reason', p_reason, 'evidence', v_case.evidence)
  );

  perform set_config('redoapp.ticket_ledger_skip_legacy_sync', 'on', true);
  update public.app_state
    set payload = jsonb_set(v_payload, '{availableTickets}', to_jsonb((v_new_available::numeric / 100)))
    where id = 'user:' || v_case.user_id;

  update public.ticket_reconciliation_cases
    set status = 'applied', reviewed_by = p_actor, reviewed_at = now(), applied_transaction_id = v_tx,
        note = case when p_reason <> '' then p_reason else note end
    where id = v_case.id;
  return v_tx;
end;
$$;

revoke all on function public.ticket_apply_reconciliation_correction(text, text, text) from public;
grant execute on function public.ticket_apply_reconciliation_correction(text, text, text) to service_role;
