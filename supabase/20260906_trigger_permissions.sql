-- Follow-up to backend_only_permissions: internal trigger helpers are not APIs.
-- Preserve trigger bodies, attachments and owner/service_role execution.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.set_updated_at()',
    'public.ticket_guard_ledger_immutability()',
    'public.ticket_prevent_user_profile_delete()',
    'public.ticket_sync_legacy_user_balance()'
  ] LOOP
    target := signature::regprocedure;
    IF (SELECT prorettype FROM pg_proc WHERE oid = target) <> 'trigger'::regtype THEN
      RAISE EXCEPTION 'Expected trigger helper: %', signature;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target);
    IF has_function_privilege('anon', target, 'EXECUTE')
      OR has_function_privilege('authenticated', target, 'EXECUTE')
      OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected trigger helper privileges: %', signature;
    END IF;
  END LOOP;
END;
$$;
-- Verified body only assigns NEW.updated_at = now() and returns NEW.
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;
COMMIT;
