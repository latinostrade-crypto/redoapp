# Poker cash-out and referral rollout

The poker game can run with the legacy durable `app_state` fallback during a
rolling deployment, but public-table money operations must use the database
mode before announcing cash poker or poker referral rewards.

1. Apply the existing `supabase/persistent_tables.sql` and
   `supabase/repair_persistent_table_seats.sql` migrations if they are not
   already present.
2. Apply `supabase/20260827_poker_cashout_referrals.sql`.
3. Set `CASINO_TABLES_DB_MODE=true` together with the existing production
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server secrets.
4. Before switching traffic, run:

   ```bash
   npm run verify:poker-cashout-production
   ```

   The preflight only reads the poker catalogue and calls the cash-out RPC
   with an impossible table id. It does not create a seat or change a user
   balance. It confirms that the five-argument, referral-aware RPC is live.
5. Perform a two-account acceptance check on a public poker table: invite the
   player with an L1 referral link, have that player realise a profit and
   leave the table, then verify the cash-out, L1 (+2%) and L2 (+1%) chip
   ledger entries and both profile balances. Retry the same leave request id
   to confirm it is idempotent.

The server fails closed in database mode if the new RPC is unavailable, so a
stale schema cannot silently perform a non-atomic cash-out.
