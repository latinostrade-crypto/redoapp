-- Apply after the existing ticket/casino migrations. Idempotent, no data changes.
-- Explicit grants matter: Supabase grants anon/authenticated separately from PUBLIC.
-- Deliberately do not change project-wide default ACLs or unrelated functions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  signature text;
  target regprocedure;
  view_name text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.casino_take_table_seat(text,text,integer,text)',
    'public.casino_leave_table_seat(text,text,integer,text,jsonb)',
    'public.casino_heartbeat(text,text)',
    'public.casino_checkpoint_runtime(text,jsonb,text)',
    'public.ticket_post_transaction(text,text,text,text,jsonb,jsonb)',
    'public.ticket_persist_user_snapshot(text,jsonb,bigint,bigint)',
    'public.ticket_apply_reconciliation_correction(text,text,text)'
  ] LOOP
    target := signature::regprocedure; -- Fail the whole transaction if missing.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target);
    IF has_function_privilege('anon', target, 'EXECUTE')
      OR has_function_privilege('authenticated', target, 'EXECUTE')
      OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected effective function privileges: %', signature;
    END IF;
  END LOOP;

  FOREACH view_name IN ARRAY ARRAY[
    'ticket_account_reconciliation',
    'ticket_transaction_reconciliation',
    'ticket_profile_reconciliation'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', view_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', view_name);
    -- PostgreSQL 15+: never bypass underlying RLS via a view owner's identity.
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', view_name);
    IF has_table_privilege('anon', 'public.' || view_name, 'SELECT')
      OR has_table_privilege('authenticated', 'public.' || view_name, 'SELECT')
      OR NOT has_table_privilege('service_role', 'public.' || view_name, 'SELECT') THEN
      RAISE EXCEPTION 'Unexpected effective view privileges: %', view_name;
    END IF;
  END LOOP;
END;
$$;

-- Verify backend query permissions, without reading player records or calling RPCs.
SET LOCAL ROLE service_role;
SELECT 1 FROM public.ticket_account_reconciliation LIMIT 0;
SELECT 1 FROM public.ticket_transaction_reconciliation LIMIT 0;
SELECT 1 FROM public.ticket_profile_reconciliation LIMIT 0;
RESET ROLE;
COMMIT;
