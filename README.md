# Redoapp

Redoapp is a Telegram Mini App for social card games. It combines an interactive public story with a game surface for UNO-style matches, Poker, Blackjack, persistent tables, progression, referrals, and TON-connected ticket flows.

> **Status:** active MVP / closed-beta software. Paid public launch must wait for the release gates in [Before paid launch](#before-paid-launch). Do not make payment, payout, scale, or availability promises beyond what is stated in this repository.

## What is in the product

### Public story and routing

Normal web visitors receive a seven-chapter pixel-art comic. It is a separate, lazy-loaded surface from the game, with reversible scroll choreography and a semantic reduced-motion version.

| Entry point | Result |
| --- | --- |
| Normal production web root | Interactive story |
| `?story=1` | Force the story, including visual QA |
| `?play=1` | Open the game directly for local development and QA |
| Telegram Mini App launch | Open the game directly |
| `startapp=room_*` or `startapp=ref_*` | Preserve the room or referral game flow |

Every story CTA opens the canonical referred Mini App:

```text
https://t.me/redo_appbot/app?startapp=ref_KNVPOU
```

The story uses original opaque JPEG compositions from `FOR AI/WEBSITE`; its captions remain HTML, images have defined geometry, and normal-motion image changes use the reusable canvas particle-dust transition. See `AGENTS.md` and the `docs/` story documents before changing it.

### Card games

- **UNO-style card game:** offline practice, public PVP, and private rooms for 2–4 players. Public matches use server-owned state, reconnect handling and SSE state delivery.
- **Poker:** practice plus free and public persistent tables. Public play uses casino chips; realised table cash-out is processed by the backend.
- **Blackjack:** practice plus free and public persistent tables, including standard in-table actions such as hit, stand, double, split, surrender and insurance where the game state allows them.
- **Free casino tables:** use energy for entry. Public casino tables use a chip buy-in; the current catalogue exposes two tables per game and mode.
- **Tournaments:** server-managed tournament registration, brackets and progression are present. Tournament bracelets are a possible Daily Vault reward.

### Economy, progression and social features

- TON Connect wallet flow, ticket deposit intents and withdrawal requests. Withdrawal execution remains operator-assisted; the backend verifies the matching on-chain payment before completing a request.
- Ticket ledger with available and held balances, atomic ticket-accounting bridge and reconciliation tooling.
- Casino-chip exchange at the current server rate of **1 TKT = 100 chips**.
- XP, regenerating energy, daily check-in, daily and weekly quests, and the Daily Vault. The server records a vault claim before returning it, so a lost mobile response cannot produce a second reward.
- Referral links, server-side assignment, activation rewards and L1/L2 referral shares. For public casino tables, referral shares are calculated from positive realised profit at cash-out, rather than minted on top of it.
- Telegram notifications, paginated referral profiles and a short-lived, private referral-list cache when Upstash Redis is configured.

## Architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, TypeScript, Vite and Tailwind CSS |
| Story motion | GSAP + ScrollTrigger; reduced motion has a separate document-flow UI |
| Game UI motion | Motion |
| Backend | Express in `server.ts` |
| Realtime | Server-Sent Events for queues, private rooms and live matches |
| Wallet | TonConnect UI |
| Persistence | Supabase `app_state` plus persistent casino table tables; local JSON fallback is development-only |
| Deployment | Render static frontend and Node web service |

The game and comic are two lazy-loaded application surfaces. Game-only work (backend wake-up, deck preloading and TonConnect) begins only after the game surface is selected.

## Local development

Requires Node.js `22.x`.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set the values appropriate for your environment. Never commit secrets.

3. Start the Vite frontend:

   ```bash
   npm run dev
   ```

4. Start the isolated development backend in another terminal:

   ```bash
   npm run dev:backend
   ```

The local Vite server defaults to `http://localhost:3000`. Open `http://<computer-LAN-IP>:3000/?play=1` from a phone on the same Wi-Fi. Keep both terminals running. Leave `VITE_API_BASE_URL` unset to send browser API requests through Vite's same-origin proxy to port `10000`.

`dev:backend` uses separate test data under `output/lan-dev/data`, disables external database/payment/bot integrations, and creates a temporary session secret. Restarting it requires a fresh game session. Use `npm run start` only when you intentionally want the backend configuration from your environment.

## Database and casino-table setup

Production persistence requires Supabase and a service-role key held only in server-side configuration. Local `data/runtime-state.json` is useful for development but is not durable enough for a production economy.

Apply the Supabase migrations in this order before enabling persistent public casino tables:

1. `supabase/redoapp_init.sql`
2. Ticket-accounting migrations in `supabase/20260826_ticket_*.sql`
3. `supabase/persistent_tables.sql`
4. `supabase/repair_persistent_table_seats.sql`
5. `supabase/20260827_poker_cashout_referrals.sql`
6. `supabase/20260827_casino_cashout_referrals.sql`
7. `supabase/20260906_backend_only_permissions.sql`
8. `supabase/20260906_trigger_permissions.sql`

On the existing production project, the two September permission migrations
were applied separately with owner approval; see `docs/permissions-change-record.md`.
Do not replay historical data migrations blindly. Run permission hardening last
when creating or restoring a database, because older CREATE/GRANT statements
can reintroduce client access to internal functions.

Then set `CASINO_TABLES_DB_MODE=true`, configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and run:

```bash
npm run verify:poker-cashout-production
```

The preflight is read-only: it verifies that the referral-aware cash-out RPC is available without creating a seat or changing a balance. In database mode, the server fails closed if the required cash-out RPC is unavailable.

## Important environment variables

### Client

- `VITE_API_BASE_URL`
- `VITE_TELEGRAM_BOT_USERNAME`
- `VITE_TELEGRAM_APP_SHORT_NAME`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only when needed by the legacy/public frontend integration

### Server

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_APP_SHORT_NAME`
- `APP_SESSION_SECRET`, `ADMIN_API_KEY`, `TELEGRAM_INITDATA_MAX_AGE_SEC`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STATE_TABLE`
- `TON_API_KEY`, `TON_API_BASE_URL`, `ENABLE_CHAIN_VERIFICATION`, `TON_VERIFICATION_MODE`
- `MARKETING_WALLET`, `WITHDRAWAL_SENDER_WALLET`, `WITHDRAWAL_OPERATOR_CHAT_ID`
- `CASINO_TABLES_DB_MODE`
- Optional private referral cache: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REFERRAL_CACHE_TTL_SEC`

Use `.env.example` and `render.yaml` as the canonical configuration templates. Production startup rejects missing or insecure core authentication secrets.

## Preparing a Render release

Run `npm run prepare:release` for the local release gates, then
`npm run check:release -- --schema` to validate the Blueprint against Render's
current schema and refresh the exact file manifest in `output/release/`.
Neither command stages files, commits, pushes, deploys, or runs database migrations.

The backend production build is `npm ci --include=dev && npm run build:server`;
its start command is `npm run start:production`. The development `start` script
still uses TypeScript directly. Existing manually configured Render services
must have their commands checked separately: changing `render.yaml` is not proof
that their live configuration changed.

See [release preparation and measured optimizations](docs/release-preparation.md)
for the commit package, validation evidence, deployment checklist and limitations.

## Validation

Run the baseline checks before every change set:

```bash
npm run lint
npm run build
npm run test:traffic
```

Relevant focused checks include:

```bash
npm run test:ticket-accounting
npm run test:pvp-handoff
npm run test:multiplayer-rooms
npm run test:private-room-client
npm run test:persistent-tables
npm run test:casino-restart
npm run test:poker-resilience
npm run test:poker-side-pots
npm run test:poker-cashout-referrals
npm run test:blackjack-rules
npm run test:daily-vault
npm run test:security-boundaries
npm run test:production-auth
```

For any story change, also test desktop and mobile widths, reverse scrolling, `prefers-reduced-motion`, image responses, console output, `?play=1`, `?story=1`, and the Telegram CTA. The story QA evidence is recorded in `docs/qa-report.md`.

## Before paid launch

The repository deliberately treats the following as release blockers:

1. Require valid, fresh Telegram `initData` and a strong session secret in every production account flow.
2. Replace credentials in stream or bridge query strings with short-lived, single-use tokens, and restrict CORS to the required origins.
3. Publish real Terms of Use, Privacy Policy, support and eligibility information; obtain applicable legal review before offering deposits, withdrawals or stake-based play.
4. Configure durable backups, alerts, log retention, incident response and a tested restore procedure.
5. Complete automated authorization, settlement, deposit, withdrawal, referral and persistence coverage, then run real-device Telegram tests.
6. Keep the backend within its tested operating envelope. Horizontal scale requires shared coordination for queues, matches, timers, rate limits and SSE fan-out, plus load testing with realistic long-lived connections.

## Repository guide

- `AGENTS.md` — product, routing, story, accessibility and performance rules.
- `docs/brief-analysis.md`, `docs/storyboard.md`, `docs/motion-system.md`, `docs/performance-plan.md`, `docs/asset-inventory.md` — source of truth for the public story.
- `docs/poker-production-rollout.md` — production checklist for Poker cash-out and referral migration.
- `CHANGELOG.md` — release history; update it alongside future release notes.
- `SECURITY_REVIEW.md` and `SECURITY_REVIEW_RU.md` — security findings and context.
