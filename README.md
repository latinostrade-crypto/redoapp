# Redoapp

Stake-based Telegram Mini App card game with:

- offline practice mode
- public ticket PVP matchmaking
- private rooms
- TON wallet integration
- ticket deposits and withdrawal requests
- referrals, referral payout sharing, and Telegram notifications
- server-owned live match state
- SSE realtime updates
- persistent local runtime snapshot

## Stack

- frontend: React + Vite
- backend: Express in `server.ts`
- ticket helpers: `server/tickets.ts`
- Telegram Mini App + TonConnect

## Core modes

### Practice

- offline vs bots
- no wallet required
- no ticket impact

### Public PVP

- wallet-connected ticket matches
- queue-based matchmaking
- starts with `2`, `3`, or `4` players

### Private rooms

- room host selects stake
- room host selects `2`, `3`, or `4` players
- room join works by code and Telegram Mini App link
- supports `0 TKT` free private rooms

## Ticket economy

### Supported stakes

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

### Ledger events

The backend records ticket activity such as:

- deposit confirmed
- stake hold
- stake release
- match payout
- referral match bonus
- withdrawal requested
- withdrawal completed

## Match settlement

Settlement supports variable player counts and validates:

- match exists
- placements count matches real player count
- ranks are unique
- users belong to the active match

### Net prize pool splits

- `2 players`: `70 / 30`
- `3 players`: `60 / 25 / 15`
- `4 players`: `52 / 23 / 15 / 10`

### Referral share

- if a referred player earns a payout in public PVP, `1%` of that player payout is redirected to the inviter
- this `1%` is deducted from the referred player payout, not minted on top
- inviter receives a `referral_bonus` ledger entry
- the UI shows both referral bonus history and total referral earnings

## Wallet flow

### Deposit

1. frontend creates `deposit-intent`
2. user signs TON transfer
3. backend confirms signed transfer
4. tickets are credited

Current behavior:

- any positive amount is allowed
- manual or TON-based verification flow is supported
- deposit intents expire after 15 minutes

### Withdrawal

1. user submits withdrawal request
2. backend stores the request
3. request is later marked complete

Current limitation:

- final automated on-chain withdrawal execution is not finished yet

## Referrals, XP, quests

Implemented:

- XP progression
- daily rewards
- quest progress tracking
- referral activation
- referral revenue sharing from public PVP payouts
- Telegram notification queue

## Important files

- `src/App.tsx`
- `src/components/Web3Dashboard.tsx`
- `src/hooks/useUnoGame.ts`
- `src/types.ts`
- `server.ts`
- `server/tickets.ts`

## Main API areas

- `/api/users/*`
- `/api/me/*`
- `/api/tickets/*`
- `/api/matchmaker/*`
- `/api/private-rooms/*`
- `/api/matches/*`
- `/api/xp/*`

Important ticket endpoints:

- `POST /api/tickets/deposit-intent`
- `POST /api/tickets/deposit-confirm`
- `POST /api/tickets/withdraw-request`
- `POST /api/tickets/withdraw-complete`
- `GET /api/tickets/balance/:userId`
- `GET /api/tickets/ledger/:userId`

## Persistence

Backend runtime state is stored in:

- `data/runtime-state.json`

This survives normal restarts, but is not a replacement for a real external database.

## Local run

1. `npm install`
2. copy `.env.example`
3. run frontend: `npm run dev`
4. run backend: `npm run start`

Validated commands:

```bash
npm run lint
npm run build
```

## Required frontend env

- `VITE_API_BASE_URL`
- `VITE_TELEGRAM_BOT_USERNAME`
- `VITE_TELEGRAM_APP_SHORT_NAME`

## Required backend env

- `MARKETING_WALLET`
- `TICKET_PRICE_TON`
- `ENABLE_CHAIN_VERIFICATION`
- `TON_VERIFICATION_MODE`
- `TON_API_BASE_URL`
- `TON_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_APP_SHORT_NAME`
- `TELEGRAM_INITDATA_MAX_AGE_SEC`

## Telegram setup

BotFather should be configured so that:

- `Main App` is enabled and points to the deployed frontend URL
- a `Direct Link` exists for the configured app route, e.g. `app`

Valid examples:

- `https://t.me/redo_appbot/app?startapp=room_ABC123`
- `https://t.me/redo_appbot/app?startapp=ref_ABC123`

## Render notes

Frontend and backend are separate services.

Frontend should have:

- `VITE_API_BASE_URL=https://your-backend-service.onrender.com`
- `VITE_TELEGRAM_BOT_USERNAME=redo_appbot`
- `VITE_TELEGRAM_APP_SHORT_NAME=app`

Backend should have:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME=redo_appbot`
- `TELEGRAM_APP_SHORT_NAME=app`

## Status

Completed:

- offline gameplay
- public PVP queue
- private rooms
- variable room sizes
- variable player-count settlement
- arbitrary positive deposit amount
- arbitrary positive withdrawal request amount
- Telegram Mini App direct links
- private room auto-join by link
- referral activation, notifications, and referral ticket share
- referral earnings display in UI

Still remaining:

- automated on-chain withdrawal execution
- leave/cancel flows for private rooms before match start
- stronger reconnect recovery
- automated tests for settlement and wallet flows
- bundle size optimization
- backend modularization

## Documentation workflow

- keep `README.md` as the current project overview
- keep release/history notes in `CHANGELOG.md`
- keep personal drafts in ignored local files under `docs/local/`
