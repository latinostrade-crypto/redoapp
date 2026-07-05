# Redoapp

Stake-based Telegram Mini App card game with:

- offline practice mode
- public ticket PVP matchmaking
- private rooms
- TON wallet integration
- ticket deposit and withdrawal request flows
- referral links, referral income sharing, and Telegram notifications
- server-owned live match state
- SSE realtime updates
- local persistent backend snapshot storage

## Product overview

Frontend is built with React + Vite.  
Backend is currently centered in `server.ts` with ticket helpers in `server/tickets.ts`.

The app currently supports:

- playing offline against bots
- joining public stake-based PVP queue
- creating and joining private rooms
- starting real ticket matches with variable player count
- holding tickets before match start
- settling matches and distributing rewards
- depositing arbitrary positive ticket amounts
- requesting withdrawal of arbitrary positive ticket amounts

## Core gameplay modes

### Practice mode

- local/offline game
- human vs AI bots
- no wallet required
- no ticket impact
- reduced XP progression

### Public PVP

- wallet-connected ticket matches
- queue-based matchmaking
- match can start with `2`, `3`, or `4` players
- immediate start at `4` players
- delayed start after timeout if at least `2` players are queued

### Private rooms

- host creates a room with stake amount
- host selects room size: `2`, `3`, or `4` players
- room starts when selected target player count is reached
- players join by invite code or Telegram Mini App link

## Ticket economy

### Supported stakes

All ticket matches use:

- `0.3`
- `0.5`
- `1`
- `5`
- `10`
- `30`

Private rooms additionally support:

- `0` for free private matches

### Ticket balance model

Each user has:

- `availableTickets`
- `heldTickets`

Usage:

- `availableTickets` are free to spend
- `heldTickets` are temporarily locked while queued or inside pre-settlement flow

### Ticket ledger events

The backend records ticket activity through ledger entries such as:

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

### Payout splits

For net prize pool:

- `2 players`: `70 / 30`
- `3 players`: `60 / 25 / 15`
- `4 players`: `52 / 23 / 15 / 10`

### Referral share on public matches

- if a player was invited through a referral and completes a real public PVP match, referral activation is handled by backend logic
- if that referred player receives a public-match payout, `1%` of that player payout is redirected to the inviter
- this `1%` is deducted from the referred player payout, not minted on top
- inviter receives a `referral_bonus` ledger entry
- the frontend activity log and referral earnings widget read these ledger entries directly

## Wallet flow

### Deposit

Deposit flow:

1. frontend creates `deposit-intent`
2. user signs TON transfer
3. backend confirms the signed transfer
4. ticket balance is credited

Current behavior:

- any positive ticket amount is allowed
- backend supports manual or TON-based verification flow
- deposit intents expire after 15 minutes
- each signed blockchain payment can be used only once

### Withdrawal

Withdrawal flow:

1. user submits withdrawal request
2. backend reserves the request in system state
3. request later gets marked complete

Current state:

- any positive ticket amount is allowed
- request flow exists and is persisted
- final automated on-chain payout processor is still not fully implemented

## Referrals, XP, quests

The project already includes:

- XP progression
- daily rewards
- quest definitions and progress tracking
- referral activation and rewards
- referral ticket revenue sharing from public PVP payouts
- Telegram-related notification queueing

## Frontend structure

Important frontend files:

- `src/App.tsx`
- `src/components/Web3Dashboard.tsx`
- `src/hooks/useUnoGame.ts`
- `src/types.ts`

Frontend responsibilities include:

- wallet connect
- profile and ticket dashboard
- queue and room UX
- game board rendering
- match stream subscription
- local stats and progression display

## Backend structure

Main backend files:

- `server.ts`
- `server/tickets.ts`

Backend handles:

- user sync
- ticket balances
- ledger
- deposit intent and confirmation
- withdrawal requests
- matchmaking queue
- private rooms
- active matches
- settlement
- referral and quest state
- persistence snapshot

## API areas

Main API groups:

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

This protects state across normal process restarts, but it is not a replacement for a real external database on ephemeral hosting.

## Local run

1. Install dependencies
   - `npm install`
2. Copy env template
   - use [.env.example](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/.env.example)
3. Run frontend
   - `npm run dev`
4. Run backend
   - `npm run start`

Useful commands already validated:

```bash
npm run lint
npm run build
```

## Required frontend env

- `VITE_API_BASE_URL`
  - must point to the backend service URL in production
- `VITE_TELEGRAM_BOT_USERNAME`
  - Telegram bot username used for generated Mini App links
- `VITE_TELEGRAM_APP_SHORT_NAME`
  - direct-link app route configured in BotFather, e.g. `app`

## Required backend env

- `MARKETING_WALLET`
  - default wallet is already set to the current production wallet
- `TICKET_PRICE_TON`
- `ENABLE_CHAIN_VERIFICATION`
  - `false` keeps manual confirmation flow
  - `true` requires `signedBoc` on deposit confirm
- `TON_VERIFICATION_MODE`
  - `manual` bypasses on-chain confirmation
  - `tonapi` verifies the signed wallet message in TON
- `TON_API_BASE_URL`
- `TON_API_KEY`
- `TELEGRAM_BOT_TOKEN`
  - required for Telegram notification delivery
- `TELEGRAM_BOT_USERNAME`
  - bot username used for generated referral/private-room links
- `TELEGRAM_APP_SHORT_NAME`
  - direct-link app route configured in BotFather, e.g. `app`
- `TELEGRAM_INITDATA_MAX_AGE_SEC`
  - max accepted age of Telegram Mini App auth payload

## Current production behavior

- deposits create an intent and request a wallet transfer to the marketing wallet
- backend confirmation credits tickets
- if `ENABLE_CHAIN_VERIFICATION=true`, `signedBoc` becomes mandatory on confirm
- if `TON_VERIFICATION_MODE=tonapi`, backend:
  - derives the normalized external-in message hash from the signed wallet BOC
  - polls TonAPI for the blockchain transaction bound to that message
  - verifies the outgoing transfer matches the marketing wallet and expected TON amount
  - credits tickets only after the transaction is visible on-chain
- withdrawals are request-based and still require final payout processing
- private-room invite links are generated as Telegram Mini App direct links using `startapp=room_<CODE>`
- users opening a private-room deep link auto-join that room instead of only seeing the code
- referral links are generated as Telegram Mini App direct links using `startapp=ref_<CODE>`
- referral assignment is captured on user sync from Telegram launch params or URL fallback
- referral activation happens after the invited user completes a real match
- Telegram notifications are queued on referral activation and referral payout bonus events

## Telegram setup

BotFather must be configured so that:

- `Main App` is enabled and points to the deployed frontend URL
- a `Direct Link` exists for the configured app route, e.g. `app`

With that setup, valid links look like:

- `https://t.me/redo_appbot/app?startapp=room_ABC123`
- `https://t.me/redo_appbot/app?startapp=ref_ABC123`

## Render notes

Frontend and backend are separate services.

The frontend must have:

- `VITE_API_BASE_URL=https://your-backend-service.onrender.com`
- `VITE_TELEGRAM_BOT_USERNAME=redo_appbot`
- `VITE_TELEGRAM_APP_SHORT_NAME=app`

Without this, frontend requests will go to the static site origin instead of the backend service.

The backend must have:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME=redo_appbot`
- `TELEGRAM_APP_SHORT_NAME=app`

## Done / Next

### Completed areas

- offline UNO gameplay
- public PVP queue
- private rooms
- variable room sizes for private rooms
- variable player count settlement
- arbitrary positive deposit amount
- arbitrary positive withdrawal request amount
- wallet-linked ticket economy
- ticket ledger and held balance model
- server-side active match state
- Telegram Mini App direct links
- private room auto-join by link
- referral activation, notifications, and referral ticket share
- referral earnings display in UI

### Remaining areas

- implement true automated on-chain withdrawal execution
- add leave/cancel flows for private rooms before match start
- add stronger recovery for disconnect/reconnect edge cases
- add explicit automated tests for settlement and wallet flows
- improve queue and room waiting-state UX
- break up oversized frontend bundle
- split backend service into clearer modules

## Change log

### Version 1

Initial documented state:

- offline mode
- public PVP
- private rooms
- wallet-linked ticket economy
- queue, room, and settlement logic

### Version 2

Production integration phase:

- Telegram Mini App launch
- direct links for referrals and rooms
- persistent runtime state
- Render deployment notes
- TON verification and wallet flow documentation

### Version 3

Recent live updates:

- private room deep-link auto-join
- referral activation and Telegram notifications
- game-over UI improvements and menu return flow
- XP sync fixes
- PVP rewards UI cleanup
- 1% referral share from referred public-match payouts
- referral bonus history entries
- total referral earnings widget
