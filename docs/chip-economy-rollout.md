# Unified chip economy rollout

The canonical balance is an integer number of chips. The wallet boundary uses
`1 GRAM = 100 chips`; decimal GRAM values never enter gameplay or the ledger.
Legacy `availableTickets` and `heldTickets` fields remain read-only projections
for compatibility during the cut-over.

## Before deployment

1. Put gameplay and deposits into a maintenance window. Do not run the opening
   migration while balances or holds can change.
2. Run `npm run backup:production` and retain the resulting encrypted/off-site
   backup according to the existing release procedure.
3. Run `npm run prepare:release` against the exact commit to deploy.
4. Confirm the maximum legacy balance in each available/held bucket is at most
   10,000,000 chips. The migration aborts rather than truncating larger values.

## Cut-over order

1. Apply the existing ticket-accounting migrations listed in `README.md`.
2. Apply `supabase/20260910_unified_chip_ledger.sql` in one transaction.
3. Deploy the server and client from the same revision.
4. Run `npm run verify:chip-economy-production` with the production Supabase URL
   and service-role key. This is read-only and must report zero profile and
   transaction drift.
5. Exercise one deposit, one paid queue join/cancel, one completed match and one
   casino buy-in/cash-out with test accounts. Re-run the production verifier.
6. End the maintenance window only after both reconciliation views are empty.

## Invariants and alerts

- Every transaction has at least two entries whose integer sum is zero.
- User `available` and `held` accounts cannot become negative.
- A blockchain payment hash and deposit intent can be claimed only once.
- Replayed requests reuse the original idempotency key and do not credit twice.
- `casinoChips` and `heldCasinoChips` must equal the ledger projection.
- Any row in either reconciliation view is a release blocker and an operational
  alert; do not repair it with a direct balance update.

## Recovery

If the migration fails, PostgreSQL rolls back the entire transaction. Keep the
application in maintenance, fix the rejected legacy record, and retry from the
unchanged pre-migration state. If verification fails after deployment, restore
the previous application revision but keep writes paused; investigate using the
immutable transaction references and the pre-deployment backup. Never delete or
rewrite ledger entries to force reconciliation.
