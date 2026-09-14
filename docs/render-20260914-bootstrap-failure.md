# Render bootstrap failure, 14 September 2026

Verified in the Render Dashboard for `yoapp-backend-legacy`, deploy
`dep-dajpr0vqj5pc73berkfg`, commit `1ca4b98`:

- `npm ci --include=dev && npm run build:server` succeeded.
- `npm run start:production` exited with status 1.
- Bootstrap's chip audit could not find `chip_profile_reconciliation` and
  `chip_transaction_reconciliation` in the public schema cache.

Read-only `to_regclass` checks in the production Supabase project
`rxhnhgtwfwisrnkhtzko` confirmed that `app_state` exists, but all six objects
below are absent, so this is not just a stale API schema cache:

```sql
select name, to_regclass('public.' || name)::text as relation
from unnest(array[
  'chip_accounts', 'chip_transactions', 'chip_ledger_entries',
  'wallet_deposit_claims', 'chip_profile_reconciliation',
  'chip_transaction_reconciliation'
]) as name;
```

The missing schema belongs to `supabase/20260910_unified_chip_ledger.sql`.
That migration also converts existing balances, posts opening ledger entries
and installs balance-writing triggers. It is not a schema-only repair and
must not run while gameplay or deposits can write balances.

Recovery requires an owner-coordinated maintenance window, a verified database
backup, review of legacy available/held balances, then the migration and
read-only `npm run verify:chip-economy-production`. Follow the migration order
in README and the cut-over procedure in `docs/chip-economy-rollout.md`.
The rollout document's `backup:production` command is not present in
package.json; arrange and verify an actual backup before proceeding.
Only then redeploy the backend and verify its health and reconciliation.

No production database data, schema, service configuration or audit guards
were changed during this investigation.
