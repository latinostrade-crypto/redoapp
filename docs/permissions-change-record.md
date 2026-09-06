# Supabase permission change — 2026-09-06

Target: project `rxhnhgtwfwisrnkhtzko`, PostgreSQL 17.6, public schema.
Applied through the logged-in SQL Editor with owner approval. Transaction
completed successfully; an independent query confirmed all seven functions and
three views have anon=false, authenticated=false, service_role=true. All three
views have security_invoker=true. Backend LIMIT 0 permission checks passed.
This is an ACL inventory, not a backup of player data. No keys or player records
were exported. All targeted objects were owned by `postgres`.

Before migration:

- `casino_checkpoint_runtime(text,jsonb,text)`, `casino_heartbeat(text,text)`,
  `casino_take_table_seat(text,text,integer,text)`: EXECUTE granted to PUBLIC,
  postgres, anon, authenticated and service_role.
- `casino_leave_table_seat(text,text,integer,text,jsonb)`: EXECUTE granted only
  to postgres and service_role (already correct).
- `ticket_apply_reconciliation_correction(text,text,text)`,
  `ticket_persist_user_snapshot(text,jsonb,bigint,bigint)`,
  `ticket_post_transaction(text,text,text,text,jsonb,jsonb)`: EXECUTE granted to
  postgres, anon, authenticated and service_role; no PUBLIC grant.
- `ticket_account_reconciliation`, `ticket_profile_reconciliation`,
  `ticket_transaction_reconciliation`: ACL `arwdDxtm` for postgres, anon,
  authenticated and service_role; no reloptions (owner-security default).

The scoped migration removes client grants and enables invoker security on
these three views. It preserves service_role and postgres access. It neither
replaces RPC bodies nor changes balances, rows, triggers or RLS policies.
Project-wide default privileges remain unchanged to avoid affecting other
Supabase facilities. Any future CREATE OR REPLACE migration must explicitly
retain these restrictions; run this hardening migration last.

Additional Advisor findings were inspected before applying
`20260906_trigger_permissions.sql`. The zero-argument helpers `set_updated_at`,
`ticket_guard_ledger_immutability`, `ticket_prevent_user_profile_delete`, and
`ticket_sync_legacy_user_balance` all return trigger, are owned by postgres,
and originally granted EXECUTE to PUBLIC/postgres/anon/authenticated/service_role.
The three ticket helpers already had search_path=public. `set_updated_at` had
no proconfig and its live body matched the repository (NEW.updated_at=now();
return NEW). The follow-up revokes client execution on these four helpers and
sets only set_updated_at's search_path to pg_catalog. No trigger is removed,
disabled or replaced. PostgreSQL only allows these functions to run as triggers;
the Advisor warning alone does not prove an exploitable RPC endpoint.
The follow-up transaction succeeded. An independent query confirmed
anon=false, authenticated=false, service_role=true for all four helpers and
search_path=pg_catalog for set_updated_at.
After reloading Security Advisor: 0 errors, 0 warnings, 1 informational
suggestion. This does not replace a full application security review.

Rollback: view behavior alone can be restored with `ALTER VIEW public.<name>
RESET (security_invoker)` for the three named views, without reopening access.
Restoring the original anon/authenticated/PUBLIC grants would reintroduce the
audited vulnerability and requires explicit approval; it is not an automatic
application rollback step. Compatible with the existing deployed backend.
