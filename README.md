# Redoapp

Redoapp is a stake-based Telegram Mini App UNO-style card game. The app combines practice play, public ticket PVP, private rooms, TON wallet flows, ticket accounting, quests, XP progression, referrals, Telegram notifications, and server-owned live match state.

## Current Product Surface

- Telegram Mini App launch through BotFather direct links.
- Offline practice mode against bots.
- Public PVP matchmaking with ticket stakes.
- Private rooms with shareable Telegram Mini App links.
- TON Connect wallet integration.
- Ticket deposits, pending-deposit recovery, and withdrawal requests.
- Server-side ticket ledger for deposits, holds, releases, payouts, referral bonuses, and withdrawals.
- XP, energy, daily check-in streaks, quests, and lootbox rewards.
- Referral activation rewards and referral match revenue sharing.
- Scalable referral profile responses that return aggregate counts instead of huge invite lists.
- Telegram notification queue for referral and match-bonus events.
- SSE streams for queue, private rooms, and live matches.
- Persistent runtime state through Supabase `app_state` or local JSON fallback.

## Stack

- Frontend: React 19 + Vite.
- Backend: Express in `server.ts`.
- Ticket helpers: `server/tickets.ts`.
- Game state: `src/hooks/useUnoGame.ts` plus server-authoritative PVP/private match state.
- Wallet: TonConnect UI.
- Persistence: Supabase service-role JSON state rows, with local `data/runtime-state.json` fallback.
- Deployment target: Render static frontend plus Render web backend.

## Production Status and Operating Envelope

The current build is a strong MVP: practice, private rooms, public PVP, wallet
flows, referrals, and live match recovery are implemented. `npm run lint` and
`npm run build` pass in this repository.

The deployed topology is currently:

- frontend: `https://redoapp.onrender.com`
- backend: `https://yoapp-backend.onrender.com`
- TON Connect manifest: `https://redoapp.onrender.com/tonconnect-manifest.json`

The app is ready for a small, monitored closed beta after the launch gates
below are completed. It is **not yet ready to scale horizontally**: active
queues, SSE subscribers, match timers, withdrawal-action tokens, and rate-limit
counters live in the Node process. Run one non-sleeping backend instance while
this is true. Before adding a second instance, move this coordination state to
a shared durable store and add pub/sub for realtime events.

`1,000 users` should be planned as a staged target, not as a switch. A single
well-instrumented instance can support a small beta and 1,000 registered users
if concurrent play is modest; it must be load-tested with realistic concurrent
matches before making any promise about 1,000 simultaneous users.

## Core Modes

### Practice

- Offline game against bots.
- No wallet required.
- No ticket stake or ticket payout.
- Used as the first low-friction entry path before wallet connection.

### Public PVP

- Authenticated, server-owned match flow.
- Supports `2`, `3`, or `4` players.
- Queue is grouped by stake and mode.
- Queue entry is idempotent and does not spend tickets or energy.
- Mobile queue-to-table delivery uses a finite server-side wait response in
  addition to SSE and polling, so Telegram/iMe WebViews do not need a manual
  page reload when the backend has already created the match.
- After matchmaking, players get a 60-second connection lobby on the table.
- Ticket stake and energy are committed atomically when everyone connects, or when the lobby timer expires with at least one connected player.
- If nobody connects before the lobby timer expires, the match is cancelled without charging either player.
- Missing players are handed to auto-play only when the table's 60-second connection timer expires. Players who disconnect later receive the same 60-second grace period.
- Free public queue uses energy; ticket-stake public queue uses reduced energy.

### Private Rooms

- Host selects stake and target player count: `2`, `3`, or `4`.
- Supports free `0 TKT` rooms.
- Join works by room code and Telegram Mini App direct link.
- Room creation uses direct API, status recovery, and iframe bridge fallback for difficult WebView/network cases.
- Backend streams room status through SSE.

## Ticket Economy

### Supported Stakes

- `0`
- `0.3`
- `0.5`
- `1`
- `5`
- `10`
- `30`

### Balances

Each user has:

- `availableTickets`
- `heldTickets`

`availableTickets` can be spent. `heldTickets` are locked for active stakes.

### Ledger Events

The backend records ticket activity such as:

- deposit intent created and confirmed
- stake hold
- stake release
- PVP match payout
- private match payout
- L1 referral match bonus
- L2 referral match bonus
- withdrawal requested
- withdrawal completed
- XP and energy reward entries

## Match Settlement

Settlement is backend-authoritative and validates:

- match exists
- requester belongs to the match
- game is over
- winner exists
- player placements match real participants
- ranks are unique
- stake holds are released exactly once

### Net Prize Pool

The backend currently reserves:

- `2%` season fund
- `2%` burn fund

The remaining net prize pool is split by player count:

- `2 players`: `90 / 10`
- `3 players`: `65 / 25 / 10`
- `4 players`: `55 / 25 / 10 / 10`

### Referral Match Share

If a referred player earns a public PVP payout:

- Level 1 inviter receives `2%` of that referred player payout.
- Level 2 inviter receives `1%` when the Level 1 inviter was also referred.
- Referral bonuses are deducted from the referred player's gross payout.
- Referral bonuses are not minted on top of the prize pool.
- Bonus recipients receive `referral_bonus` ledger entries.
- Telegram notifications are queued for bonus recipients when chat IDs are available.

## Referrals

### Invite Links

Each synced user receives:

- `referralCode`
- `referralLink`

Example:

```text
https://t.me/redo_appbot/app?startapp=ref_ABC123
```

### Assignment

- Telegram `startapp=ref_CODE` is parsed from launch params.
- Referral assignment is server-side.
- Self-referrals are rejected.
- Invalid referral codes are rejected and persisted.
- Referral assignment is ignored once a user already has `referredByUserId`.

### Activation

A referral activates when the referred user completes a qualifying match settlement.

Activation rewards:

- inviter: `+3` energy and `+100` XP
- referred user: `+2` energy and `+50` XP
- inviter quest progress for `invite_referral`
- Telegram notification queue entries for both sides when possible

### Scalable Referral Profile Data

The profile API no longer returns the full invited-user list by default. This is intentional because some users can have a very large referral tree.

`GET /api/me` returns aggregate referral counters:

- `referrals.referralsActivated`
- `referrals.totalInvited`
- `referrals.pendingInvited`
- `referrals.rejectedInvited`
- `referrals.invitedUsers: []` for backward-compatible shape only

The frontend profile card displays the aggregate counts instead of rendering usernames. This keeps profile sync fast for high-volume inviters.

`GET /api/referrals?limit=20&cursor=…` returns the inviter's own detailed referral list in pages. The profile opens this list on demand, so individual invitees remain visible without making every profile request large.

### Referral Read Cache

When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, only the authenticated `GET /api/referrals` page is cached in Upstash Redis for 30 seconds by default. Cache keys hash the inviter and cursor, responses are marked `Cache-Control: private, no-store`, and a per-inviter version is incremented immediately when a referral is assigned, activated, rejected, or its Telegram display data changes. This keeps profile reads fast without caching balances, payouts, matches, or any write operation. If Redis is unavailable, the endpoint automatically serves the live in-memory state and never fails the request because of the cache.

### Reliable L1/L2 Payouts and Export

Public paid-PVP settlement calculates referral shares server-side from the final payout: L1 receives 2.00% and L2 receives 1.00%. Both shares are deducted from the referred player's gross payout, so they never mint additional tickets. Each share has a deterministic idempotency key (`match + level + recipient`) and a permanent `referral-payout:*` Supabase record. If Render restarts during settlement, the same record and ledger key let the server safely finish a partial payout without crediting it twice.

Referral activation XP and energy are permanently bound to the first qualifying match ID. This is deliberately independent from the profile's 50-row transaction display, so later history rotation cannot issue the activation reward again. Every referral activation, referral payout, and operator withdrawal notice also has a durable outbox deduplication key. The server commits a notice as `sending` before calling Telegram and treats an interrupted request as `unknown` rather than automatically resending it: the Bot API returns a `Message` on success but does not accept a caller idempotency key, so this at-most-once policy prevents duplicate financial notices while balances remain fully auditable in Supabase.

An administrator can export the audit trail as a spreadsheet-safe CSV:

```bash
curl -H "x-admin-api-key: $ADMIN_API_KEY" \
  "https://yoapp-backend.onrender.com/api/admin/referrals/payouts.csv" \
  -o referral-payouts.csv
```

Optional `from` and `to` query parameters are Unix milliseconds; `status=credited` exports only completed payouts. The CSV includes payout ID, match ID, L1/L2 level, source and beneficiary, gross payout, rate, amount, and UTC timestamps.

For legacy users, `totalInvited` is never lower than the stored `referralsActivated` counter, so referrals that were already credited before detailed referral links were repaired still appear in aggregate profile stats.

### Referral Reliability Fixes

The backend now protects referral state with:

- unique referral code generation
- user hydration on load
- persisted rejected referral states
- explicit dirty-user persistence for L1 and L2 referral bonus recipients
- in-memory referral stats rebuilt after local or Supabase state load
- Supabase paginated reads for all granular state rows
- legacy `runtime-state` is merged with granular rows on every startup, then legacy-only users are migrated to `user:*` rows
- Supabase write errors keep their dirty records queued for retry instead of being treated as a successful save
- production refuses to start without Supabase, because Render's local disk is not durable enough for balances or referrals

### One-Time Referral Reset (2026-07-14)

The production release includes an idempotent Supabase-backed migration named `referrals-reset-2026-07-14`. It clears historical inviter relationships, referral statuses, activation counters and the weekly referral-quest progress for every existing user, allowing them to be invited again. Referral codes remain stable. Wallets, ticket balances, XP, energy and the immutable transaction ledger are deliberately preserved; old financial records are not deleted. Supabase stores a completion marker, so the reset runs exactly once rather than on every restart.

## XP, Energy, Quests, and Rewards

Implemented:

- XP progression.
- Energy with regeneration.
- Daily XP check-in streak.
- Daily energy reward.
- Daily quests.
- Weekly referral quest.
- Lootbox claim only after every current-day daily quest is complete.
- Quest rewards credited through server-side user state and ledger entries.

Quest metrics:

- `play_online`
- `play_private`
- `win_any`
- `spend_energy`
- `invite_referral`

## Wallet Flow

### Deposit

1. Frontend creates a deposit intent.
2. User signs TON transfer through TonConnect.
3. Backend verifies or manually confirms the signed transfer depending on env configuration.
4. Tickets are credited.
5. Ledger and pending-deposit state are refreshed.

Current behavior:

- any positive ticket amount is accepted
- deposit intents expire after 15 minutes
- pending deposits can be retried and rechecked in the background
- manual verification mode is supported
- TonAPI verification mode is configurable

### Withdrawal

1. User submits a withdrawal request.
2. Backend validates the authenticated user, saved wallet, available balance, duplicate pending requests, held funds, active matches, queues, and private rooms.
3. Backend stores the request, reserves the requested tickets, and reliably queues a private Telegram message for the configured operator.
4. The operator opens the inline Tonkeeper transfer button and sends the TON payout from the configured marketing wallet.
5. Backend polls finalized TonAPI transactions for the recipient wallet and completes the withdrawal only after recipient, amount, unique request comment, and message hash all match. This remains reliable when Tonkeeper uses another operator-owned source wallet. The operator can also trigger the same verification from the signed `Check payment` link.
6. The Mini App polls withdrawal status and updates activity automatically after the on-chain payment is found.
5. If the payout should not be sent, the operator can tap `Reject & refund` to return tickets to the user balance.

Current limitation:

- final automated on-chain withdrawal execution is not implemented yet; payouts are operator-assisted

## Authentication

Authenticated flows use:

- Telegram Mini App `initData` validation on the backend
- session tokens issued after valid Telegram sync
- guest fallback only for local/dev-compatible flows

Important security rule:

- user identifiers from the client are not trusted when Telegram `initData` or session auth can determine the canonical user.

Production requirements:

- Require valid Telegram `initData` for every production account bootstrap;
  retain guest identities only for local development.
- Set a dedicated, high-entropy `APP_SESSION_SECRET`. The backend must refuse
  to start in production when it is absent.
- Set `TELEGRAM_INITDATA_MAX_AGE_SEC` to a short replay window (recommendation:
  5–15 minutes), then rely on the two-hour signed session for an open game.
- Keep bearer/session credentials out of URLs. The current SSE and iframe
  recovery paths use query parameters because Telegram WebViews can block
  preflighted requests; replace them with short-lived, single-use stream/bridge
  tokens and redact the legacy parameter names in every proxy and application
  log until then.

## Realtime

The backend uses Server-Sent Events for:

- queue status
- private room status
- live match state

Relevant endpoints:

- `GET /api/matchmaker/stream`
- `GET /api/private-rooms/stream/:roomCode`
- `GET /api/matches/stream/:matchId`

### Traffic Budget

Realtime delivery is event-driven:

- queue, private-room, and match snapshots are sent only when state changes
- a 15-second SSE heartbeat keeps Telegram WebViews connected without sending
  a complete game snapshot
- public matchmaking uses one SSE stream plus one finite server wait; stale
  status recovery is sequential and no faster than every 12 seconds
- private-room polling runs only when its SSE stream has been silent
- live-match full-state recovery runs only when both state events and
  heartbeats are stale
- remote match snapshots send deck/discard/hidden-hand counts instead of
  serializing every invisible card
- pending deposit and withdrawal polling only runs while work is pending
- TonAPI withdrawal reconciliation is limited to 20 recent transactions and
  no more than once per minute in the background

Run `npm run test:traffic` with the normal lint/build release checks. The guard
fails if the high-frequency fan-out transports or full hidden-card snapshots
are accidentally reintroduced.

## Persistence

### Supabase Mode

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured, runtime state is stored in the configured `SUPABASE_STATE_TABLE` as granular rows:

- `user:<userId>`
- `match:<matchId>`
- `room:<roomCode>`
- `deposit:<depositId>`
- `withdrawal:<withdrawalId>`
- `global-state`

The backend reads these rows with pagination, so it does not silently lose users after Supabase response limits.

### Legacy Snapshot Fallback

If granular `user:*` rows are absent, the backend can load the legacy row:

- `runtime-state`

The row id can be configured with:

- `SUPABASE_STATE_ROW_ID`

### Local Fallback

Without Supabase, backend runtime state is stored in:

```text
data/runtime-state.json
```

This survives normal restarts, but it is not a replacement for a managed external database in production.

### Production Data Rules

- Production must use the active Supabase project and a service-role key stored
  only in Render secrets; never put it in frontend variables or a committed
  file.
- Take automated daily backups and rehearse a restore to a separate project
  before admitting paid users. Keep a dated export of the ticket ledger and
  referral-payout audit.
- `app_state` is currently a JSONB persistence envelope, not a normalized
  transactional ledger. For the next scale step, migrate balances, ledger
  entries, matches, deposits, withdrawals, referrals, and notification outbox
  records to separate tables with unique constraints and explicit ownership.
- Do not use the local JSON fallback for production balances, tickets, or
  payouts.

## Important Files

- `src/App.tsx`: top-level app, local game screen, settlement recovery.
- `src/components/Web3Dashboard.tsx`: Telegram/wallet/profile/rooms/tickets UI.
- `src/hooks/useUnoGame.ts`: local game state, remote match stream integration.
- `src/types.ts`: shared frontend data types.
- `src/utils/api.ts`: API base URL, auth headers, session token handling.
- `src/utils/rewardEconomy.ts`: frontend payout display helper.
- `server.ts`: backend auth, profile, referrals, rooms, queue, matches, settlement, persistence.
- `server/tickets.ts`: ticket deposit, withdrawal, balance, ledger, pending deposit routes.
- `supabase/redoapp_init.sql`: Supabase `app_state` bootstrap.
- `render.yaml`: Render static frontend and backend service config.

## Main API Areas

- `GET /api/health` public liveness check; it intentionally returns only basic service status
- `GET /api/admin/health` full operational status; requires the existing admin credential
- `POST /api/users/sync`
- `GET /api/me`
- `POST /api/xp/daily-checkin`
- `POST /api/quests/claim-lootbox`
- `POST /api/tickets/deposit-intent`
- `POST /api/tickets/deposit-confirm`
- `GET /api/tickets/pending`
- `POST /api/tickets/recheck`
- `POST /api/tickets/withdraw-request`
- `GET /api/tickets/withdraw-pending`
- `POST /api/tickets/withdraw-cancel`
- `POST /api/tickets/withdraw-complete`
- `GET /api/admin/withdrawals/:requestId/complete`
- `GET /api/admin/withdrawals/:requestId/reject`
- `GET /api/tickets/balance`
- `GET /api/tickets/ledger`
- `POST /api/matchmaker/join`
- `POST /api/matchmaker/leave`
- `POST /api/private-rooms/create`
- `POST /api/private-rooms/join`
- `GET /api/private-rooms/status/:roomCode`
- `GET /api/matches/state/:matchId`
- `POST /api/matches/action`
- `POST /api/matches/settle`

## Environment Variables

### Frontend

- `VITE_API_BASE_URL`
- `VITE_TELEGRAM_BOT_USERNAME`
- `VITE_TELEGRAM_APP_SHORT_NAME`
- `VITE_SUPABASE_URL` optional legacy/public frontend value
- `VITE_SUPABASE_ANON_KEY` optional legacy/public frontend value

### Backend

- `PORT`
- `BACKEND_PUBLIC_URL`
- `MARKETING_WALLET`
- `WITHDRAWAL_SENDER_WALLET` (must be an active, deployed wallet controlled by the payout operator)
- `TICKET_PRICE_TON`
- `ENABLE_CHAIN_VERIFICATION`
- `TON_VERIFICATION_MODE`
- `TON_API_BASE_URL`
- `TON_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_APP_SHORT_NAME`
- `WITHDRAWAL_OPERATOR_CHAT_ID`
- `WITHDRAWAL_OPERATOR_USERNAME`
- `TELEGRAM_INITDATA_MAX_AGE_SEC`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET`
- `ADMIN_API_KEY`
- `SUPABASE_STATE_TABLE`
- `SUPABASE_STATE_ROW_ID`
- `UPSTASH_REDIS_REST_URL` optional private referral-list cache
- `UPSTASH_REDIS_REST_TOKEN` optional private referral-list cache credential
- `REFERRAL_CACHE_TTL_SEC` optional, default `30` (range: 5-300)
- `REDIS_CACHE_NAMESPACE` optional, default `redoapp:v1`

### Required Production Configuration

Before enabling deposits, withdrawals, or ticket-stake PVP, verify all of the
following in the deployed Render environment (not only in `.env.example`):

- `NODE_ENV=production`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` point
  to the same active Supabase project.
- `APP_SESSION_SECRET`, `ADMIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TON_API_KEY`
  are present, unique secrets managed by Render.
- `ENABLE_CHAIN_VERIFICATION=true` and `TON_VERIFICATION_MODE=tonapi`. The app
  must fail closed if TON verification is unavailable; never credit tickets
  from a client-supplied signed BOC alone.
- `MARKETING_WALLET` and `WITHDRAWAL_SENDER_WALLET` are reviewed, funded,
  operator-controlled wallets on the intended network.
- `BACKEND_PUBLIC_URL`, `VITE_API_BASE_URL`, BotFather Main App URL, and the
  TonConnect manifest use the canonical production URLs above.
- The service is non-sleeping and has enough memory/CPU for the tested load;
  free-tier cold starts are not suitable for paid live matches.
- A shared, expiring production rate-limit store is configured before running
  more than one backend instance. The current in-process limiter does not
  coordinate instances.

## Telegram Setup

BotFather should be configured so that:

- Main App is enabled.
- Main App points to the deployed frontend URL.
- Direct Link exists for the configured app short name, currently `app`.
- The production domain, terms of use, and privacy-policy URLs are real public
  pages. The TonConnect manifest currently points both legal links at the app
  root; replace those placeholders before public launch.

Valid examples:

```text
https://t.me/redo_appbot/app?startapp=room_ABC123
https://t.me/redo_appbot/app?startapp=ref_ABC123
```

## Render Deployment Notes

Frontend service:

- type: static
- build command: `npm run build`
- publish path: `dist`
- `VITE_API_BASE_URL=https://yoapp-backend.onrender.com`
- `VITE_TELEGRAM_BOT_USERNAME=redo_appbot`
- `VITE_TELEGRAM_APP_SHORT_NAME=app`

Backend service:

- type: web
- runtime: Node
- build command: `npm ci`
- start command: `npm run start`
- health-check path: `/api/health`
- `TELEGRAM_BOT_TOKEN` must be configured
- `APP_SESSION_SECRET` should be configured
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` should be configured for production persistence

Operational notes:

- The backend must remain a single non-sleeping instance until live state,
  timers, queues, and SSE fan-out are externalized.
- Authenticated match and private-room actions are rate-limited per player,
  not by a shared mobile or Render-edge IP. Expired in-process rate-limit keys
  are pruned periodically.
- Configure production log retention, error alerts, uptime checks, and a
  rollback path to the immediately preceding successful deploy.
- Keep a separate staging environment with its own bot, wallets, Supabase
  project, and secrets. Do not test deposits or withdrawals against production
  balances.

Canonical production frontend URL:

```text
https://redoapp.onrender.com
```

Current production backend URL:

```text
https://yoapp-backend.onrender.com
```

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Copy and fill environment values:

```bash
cp .env.example .env
```

3. Run frontend:

```bash
npm run dev
```

4. Run backend:

```bash
npm run start
```

## Validation

Use these checks before shipping:

```bash
npm run lint
npm run build
```

Current known build note:

- Vite warns that the main JS chunk is larger than `500 kB`; this is a bundle optimization task, not a functional failure.

### Release Gate

Run the automated checks on every release:

```bash
npm run lint
npm run build
```

Before deploying a paid-production release, run the same environment through:

```bash
npm run check:production-config
```

The command never prints secret values. It verifies the required production
secrets, HTTPS endpoints, strict TON verification, and a 1–15 minute Telegram
`initData` replay window.

Then run a manual Telegram acceptance test on Android and iOS using real launch
links:

1. Main app opens, respects the Telegram viewport, and has no obscured buttons.
2. Fresh Telegram account syncs once and receives the correct referral or room
   `startapp` parameter.
3. Practice works without wallet or backend dependency.
4. Two, three, and four-player public and private matches survive a reload,
   reconnect, and an abandoned player; tickets and energy are charged once.
5. A real deposit is credited only after its matching TON transaction is
   finalized; a duplicate BOC/transaction is rejected.
6. A withdrawal is visible to the operator, its on-chain payment is verified,
   and cancellation/refund is idempotent.
7. An account cannot read another account's profile, ledger, room, queue, or
   match state by changing a URL, body field, or stream parameter.
8. Supabase persistence is verified after a controlled backend restart.

Automate these flows before opening the beta beyond trusted testers. Prioritize
server tests for ticket ledger invariants, deposit uniqueness, settlement,
referral payout, withdrawal state transitions, and auth/authorization; add a
small Telegram-browser E2E smoke suite for launch, wallet return, room links,
and reconnect.

## Completed

- Offline gameplay.
- Public PVP queue.
- Private rooms.
- Variable private room sizes.
- Variable player-count settlement.
- Arbitrary positive deposit amount.
- Arbitrary positive withdrawal request amount.
- Telegram Mini App direct links.
- Private room auto-join by link.
- Referral activation rewards.
- Referral L1/L2 ticket share.
- Referral earnings display in UI.
- Aggregate referral stats for high-volume inviters.
- Supabase granular persistence.
- Supabase paginated state loading.
- Legacy runtime-state fallback.
- Server-owned live match state and SSE recovery.

## Still Remaining

### Block paid public launch until these are closed

1. Enforce a short Telegram `initData` replay window and fail startup without a
   dedicated session secret.
2. Remove long-lived bearer credentials from query strings; use expiring,
   single-use stream/bridge tokens instead.
3. Restrict CORS to the production frontend and the specifically required
   Telegram WebView cases. It currently reflects arbitrary request origins.
4. Move withdrawal operator-action tokens out of process or replace them with
   an authenticated operator workflow. In-memory tokens disappear on a backend
   restart; operator links must be short-lived, one-time, and auditable.
5. Publish real Terms of Use, Privacy Policy, support contact, and age/market
   eligibility information. Obtain legal review for every jurisdiction in
   which stake-based play, deposits, or withdrawals will be offered.
6. Add alerting, durable backups plus a tested restore procedure, and a
   documented incident/rollback runbook.
7. Complete automated authorization, settlement, deposit, withdrawal,
   referral, and persistence tests.

### Required before horizontal scale or high concurrency

- Replace process-local matches, queues, timers, rate limits, SSE subscriber
  tracking, and operator tokens with shared infrastructure (for example Redis
  plus a durable job/outbox system), then add pub/sub for cross-instance SSE.
- Normalize financial and game entities from JSONB state rows into transactional
  tables with idempotency keys, unique constraints, and auditable state
  transitions.
- Load-test the production-sized backend with realistic long-lived SSE
  connections, reconnects, and concurrent game actions. Record p50/p95 latency,
  error rate, memory, CPU, and Supabase/TON API failure behaviour.
- Split the large client bundle and measure first playable time on mid-range
  Android Telegram clients.

### Recommended rollout to the first 1,000 users

| Phase | Audience | What must be true to advance |
| --- | --- | --- |
| Internal | 10–20 trusted accounts | Every money and reconnect case is manually reconciled; no unresolved ledger discrepancy. |
| Closed beta | 50–100 invited accounts | Daily monitoring, support channel, backups, and rollback have been exercised. Paid flows stay capped. |
| Public beta | 250–300 accounts | Automated critical-path tests, alerts, and a successful load test are in place. Review abuse, support volume, and retention weekly. |
| First 1,000 | Gradual invitations | Shared-state/concurrency plan is proven or traffic is held to the tested single-instance envelope; operational owner is on call for payments and incidents. |

Keep kill switches for deposits, withdrawals, paid PVP, referrals, and new-room
creation so a problem can be contained without taking practice mode offline.

## Documentation Workflow

- Keep `README.md` as the current project overview.
- Keep release/history notes in `CHANGELOG.md`.
- Keep personal drafts in ignored local files under `docs/local/`.
