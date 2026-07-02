# Redoapp

Stake-based card game frontend + backend with:

- TON wallet ticket deposits
- ticket balances, holds, payout settlement
- public queue and private rooms
- server-owned live match state
- SSE realtime updates
- local persistent backend snapshot storage

## Local run

1. Install dependencies
   - `npm install`

2. Copy env template
   - use [.env.example](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/.env.example)

3. Run frontend
   - `npm run dev`

4. Run backend
   - `npm run start`

## Required frontend env

- `VITE_API_BASE_URL`
  - must point to the backend service URL in production

## Required backend env

- `MARKETING_WALLET`
  - default wallet is already set to the current production wallet
- `TICKET_PRICE_TON`
- `ENABLE_CHAIN_VERIFICATION`
  - `false` keeps manual confirmation flow
  - `true` requires `txHash` on deposit confirm
- `TON_VERIFICATION_MODE`
  - currently `manual`
- `TON_API_BASE_URL`
- `TON_API_KEY`

## Current production behavior

- deposits create an intent and request a wallet transfer to the marketing wallet
- backend confirmation credits tickets
- if `ENABLE_CHAIN_VERIFICATION=true`, `txHash` becomes mandatory on confirm
- if `TON_VERIFICATION_MODE` is not `manual`, backend calls the configured TON verification endpoint with:
  - `txHash`
  - expected destination wallet
  - expected TON amount
  - expected sender wallet
- withdrawals are request-based and still require final payout processing

## Persistence

Backend runtime state is stored in:

- `data/runtime-state.json`

This protects state across normal process restarts, but it is not a replacement for a real external database on ephemeral hosting.

## Render notes

Frontend and backend are separate services.

The frontend must have:

- `VITE_API_BASE_URL=https://your-backend-service.onrender.com`

Without this, frontend requests will go to the static site origin instead of the backend service.
