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
- Ticket stake is held before match start and released or settled by backend logic.
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

For legacy users, `totalInvited` is never lower than the stored `referralsActivated` counter, so referrals that were already credited before detailed referral links were repaired still appear in aggregate profile stats.

### Referral Reliability Fixes

The backend now protects referral state with:

- unique referral code generation
- user hydration on load
- persisted rejected referral states
- explicit dirty-user persistence for L1 and L2 referral bonus recipients
- in-memory referral stats rebuilt after local or Supabase state load
- Supabase paginated reads for all granular state rows
- fallback loading from the legacy `runtime-state` row when granular rows do not exist

## XP, Energy, Quests, and Rewards

Implemented:

- XP progression.
- Energy with regeneration.
- Daily XP check-in streak.
- Daily energy reward.
- Daily quests.
- Weekly referral quest.
- Lootbox claim after enough daily quest completion.
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
5. Backend polls finalized TonAPI account transactions and completes the withdrawal only after sender, recipient, amount, and request comment all match. The operator can also trigger the same verification from the signed `Verify on blockchain` link.
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

## Realtime

The backend uses Server-Sent Events for:

- queue status
- private room status
- live match state

Relevant endpoints:

- `GET /api/matchmaker/stream`
- `GET /api/private-rooms/stream/:roomCode`
- `GET /api/matches/stream/:matchId`

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

## Telegram Setup

BotFather should be configured so that:

- Main App is enabled.
- Main App points to the deployed frontend URL.
- Direct Link exists for the configured app short name, currently `app`.

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
- build command: `npm install`
- start command: `npm run start`
- `TELEGRAM_BOT_TOKEN` must be configured
- `APP_SESSION_SECRET` should be configured
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` should be configured for production persistence

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

- Automated on-chain withdrawal execution.
- Stronger reconnect recovery and UX around abandoned rooms.
- Automated tests for settlement, referrals, wallet flows, and persistence load.
- Bundle size optimization.
- Backend modularization beyond `server.ts`.

## Documentation Workflow

- Keep `README.md` as the current project overview.
- Keep release/history notes in `CHANGELOG.md`.
- Keep personal drafts in ignored local files under `docs/local/`.
