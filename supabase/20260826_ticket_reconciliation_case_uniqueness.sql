-- A user may have more than one historical correction over time, but never
-- more than one unresolved case. The original table constraint also blocked a
-- second applied case for the same user, which is too restrictive for an
-- append-only audit trail.

alter table public.ticket_reconciliation_cases
  drop constraint if exists ticket_reconciliation_cases_user_id_status_key;

create unique index if not exists ticket_reconciliation_cases_one_active_per_user_idx
  on public.ticket_reconciliation_cases(user_id)
  where status in ('open', 'evidence_ready');
