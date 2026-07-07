# Security Review

## Scope

Obsolete note:

- All legacy pre-`redoapp` Render domains should be treated as deprecated.
- The canonical production frontend is `https://redoapp.onrender.com`.
- The current production backend should use `https://redoapp-backend.onrender.com`.

- Static review of the repository, backend, frontend, deployment config, and DB schema file.
- Live verification of the deployed frontend domain and configured backend URL where possible.
- Inventory of obsolete or likely obsolete files and assets.

## Executive Summary

The project currently has multiple critical authorization and business-logic flaws in the backend. Most sensitive operations trust a client-supplied `userId` or match payload without binding requests to an authenticated server-side identity. In practice, this means an attacker can read other users' balances and ledger data, join or inspect other users' sessions, and directly settle matches with attacker-controlled placements.

The deployment state is also inconsistent. The canonical frontend at `https://redoapp.onrender.com` and the current backend at `https://redoapp-backend.onrender.com` must stay aligned. Any drift between the deployed frontend bundle, Render environment variables, and backend routing will break production behavior.

The database layer is thin and currently used as a single JSONB state dump. That avoids direct SQL injection risk, but it creates a large blast radius: once application-layer identity is bypassed, all users' runtime state can be read or mutated indirectly through the server.

## Findings

### Critical

1. **Missing authorization across almost all sensitive backend routes**
   - Evidence:
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:659) `resolveCanonicalUserId` falls back to arbitrary `body.userId`.
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1329) `GET /api/me/:userId`
     - [server/tickets.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server/tickets.ts:354) `GET /api/tickets/balance/:userId`
     - [server/tickets.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server/tickets.ts:363) `GET /api/tickets/ledger/:userId`
     - [server/tickets.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server/tickets.ts:368) `GET /api/tickets/pending/:userId`
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1659) `GET /api/matches/state/:matchId/:userId`
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1672) `GET /api/matches/stream/:matchId/:userId`
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1427) `GET /api/matchmaker/stream/:userId`
   - Impact:
     - Any caller can act as any user by guessing or supplying their `userId`.
     - Sensitive state, balances, referrals, quest data, and transaction history are exposed.
   - Required fix:
     - Introduce server-side auth middleware and derive identity only from verified Telegram init data or another signed auth mechanism.
     - Remove `userId` from path/body as an authority source for protected endpoints.

2. **Client-controlled match settlement allows direct prize manipulation**
   - Evidence:
     - [src/App.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/App.tsx:216) sends `/api/matches/settle` from the client after game over.
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1757) `POST /api/matches/settle` accepts client-supplied `placements`.
   - Impact:
     - A modified client can submit arbitrary ranks and redirect payouts.
     - This is a direct fraud vector affecting tickets and referral bonuses.
   - Required fix:
     - Settlement must be computed server-side from authoritative match state.
     - The client should only send a minimal action or completion signal, never final rankings or payout inputs.

3. **Match actions are only bound to a claimed `userId`, not authenticated identity**
   - Evidence:
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1693) `POST /api/matches/action`
   - Impact:
     - Anyone who knows a `matchId` and participant `userId` can play cards, draw, or pass on that user's behalf.
   - Required fix:
     - Authenticate the caller and map request identity to the match participant on the server.

4. **Withdrawal completion endpoint has no admin authorization**
   - Evidence:
     - [server/tickets.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server/tickets.ts:459) `POST /api/tickets/withdraw-complete`
   - Impact:
     - Any caller can mark a withdrawal request as completed.
     - This breaks financial auditability and can be chained with other ledger abuse.
   - Required fix:
     - Restrict this route to an authenticated admin/operator path or remove it from the public API entirely.

### High

5. **CORS is fully open on the backend**
   - Evidence:
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:44) `app.use(cors())`
   - Impact:
     - Any website can call the API from a victim browser.
     - This is especially dangerous because the API has no real auth boundary.
   - Required fix:
     - Allow only expected origins and reject unknown origins.

6. **Health endpoint leaks internal configuration state**
   - Evidence:
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1257) exposes wallet config, verification mode, Supabase status, and table name.
   - Impact:
     - Attackers get environment intelligence for targeting payment and persistence paths.
   - Required fix:
     - Return only a minimal health signal in production.

7. **Telegram auth replay window is very large**
   - Evidence:
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:25) default `86400`
     - [render.yaml](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/render.yaml:39) sets `86400`
   - Impact:
     - A captured `telegramInitData` remains valid for 24 hours.
   - Required fix:
     - Reduce the replay window sharply and add nonce/session binding.

8. **Payment verification can be disabled or left in manual mode**
   - Evidence:
     - [render.yaml](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/render.yaml:27) `ENABLE_CHAIN_VERIFICATION=false`
     - [render.yaml](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/render.yaml:29) `TON_VERIFICATION_MODE=manual`
     - [server/tickets.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server/tickets.ts:170) manual mode returns success after message-hash normalization.
   - Impact:
     - Payment confirmation logic is weaker than expected for a ticket economy.
   - Required fix:
     - Enforce chain verification in production and treat manual mode as non-production only.

9. **Single global persisted runtime state creates large blast radius**
   - Evidence:
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:191) `PersistedState`
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:277) `buildPersistedState`
     - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:298) whole snapshot stored in one row
   - Impact:
     - Any app-layer compromise affects all users.
     - No real per-user isolation, audit trail, or concurrency control.
   - Required fix:
     - Normalize state into proper per-entity tables with explicit ownership and RLS-ready structure.

10. **Live deployment mismatch and broken API routing**
    - Evidence:
    - [render.yaml](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/render.yaml:9) frontend configured to call `https://redoapp-backend.onrender.com`
      - [src/App.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/App.tsx:28), [src/components/Web3Dashboard.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/components/Web3Dashboard.tsx:22), and [src/hooks/useUnoGame.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/hooks/useUnoGame.ts:21) all fall back to `''` when `VITE_API_BASE_URL` is missing.
      - [public/tonconnect-manifest.json](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/public/tonconnect-manifest.json:2) points to `https://redoapp.onrender.com`
      - Live checks on `2026-07-04`:
        - `https://redoapp.onrender.com` returned `200`
        - `https://redoapp.onrender.com/api/health` returned `404`
        - `https://redoapp.onrender.com/api/me/test-user` returned `404`
        - `https://redoapp-backend.onrender.com/api/health` returned `404`
        - `https://redoapp-backend.onrender.com/api/me/test-user` returned `404`
        - The live JS bundle must contain `https://redoapp-backend.onrender.com` as the baked frontend API base URL, otherwise the frontend is still deployed with stale environment values.
    - Impact:
      - Production frontend appears unable to reach the intended backend.
      - Environment/domain drift increases incident risk and makes security posture unverifiable.
    - Required fix:
      - Align deployed domains, frontend API base URL, wallet manifest URLs, and backend routing before any launch.

### Medium

11. **Guest identity fallback is predictable and weak**
    - Evidence:
      - [src/components/Web3Dashboard.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/components/Web3Dashboard.tsx:215) `currentUserId = profile?.userId || rawAddress || guest:${userName.toLowerCase()}`
    - Impact:
      - Username collisions and impersonation are trivial for unauthenticated flows.
    - Required fix:
      - Do not use user-controlled display names as identity.

12. **Referral and room codes use non-cryptographic randomness**
    - Evidence:
      - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:400)
      - [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1473)
    - Impact:
      - Codes are easier to predict or brute force than they should be.
    - Required fix:
      - Use `crypto.randomBytes` or `crypto.randomUUID`.

13. **Supabase client has mock fallback values in production bundle source**
    - Evidence:
      - [src/utils/supabaseClient.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/utils/supabaseClient.ts:3)
      - [src/utils/supabaseClient.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/utils/supabaseClient.ts:4)
    - Impact:
      - Misconfiguration can fail open into fake-looking values and hide deployment mistakes.
    - Required fix:
      - Fail fast if required env vars are missing.

14. **No visible request throttling or abuse controls**
    - Evidence:
      - No rate limiter, bot protection, or action throttling is present in [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:1) or [server/tickets.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server/tickets.ts:1).
    - Impact:
      - Brute force, queue spam, settlement spam, room probing, and referral abuse are all easier.
    - Required fix:
      - Add per-IP and per-identity rate limiting on sensitive routes.

### Low

15. **Type safety is weak around core client state**
   - Evidence:
     - [src/App.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/App.tsx:70)
     - [src/hooks/useUnoGame.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/hooks/useUnoGame.ts:90)
     - [src/hooks/useUnoGame.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/hooks/useUnoGame.ts:99)
   - Impact:
     - Increases the chance of client-side logic bugs in security-sensitive flows.
   - Required fix:
     - Replace `any` with explicit DTOs for profile, ledger, leaderboard, and match data.

## Database Review

### Confirmed

- The repository contains only one schema file: [supabase/redoapp_init.sql](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/supabase/redoapp_init.sql:1).
- It creates one table, `public.app_state`, used as a global JSONB container.
- The backend writes to Supabase using `SUPABASE_SERVICE_ROLE_KEY` through [server.ts](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/server.ts:216).

### Risks

- No RLS or ownership model is defined in the repository schema.
- The application state is not normalized, so auditability and row-level isolation are effectively absent.
- Without actual Supabase credentials in the current workspace, live DB policy verification was not possible.

## Deployment Review

### Confirmed live state on 2026-07-04

- `https://redoapp.onrender.com` served the current app HTML and bundle.
- `https://redoapp.onrender.com/tonconnect-manifest.json` matched the repository manifest.
- `https://redoapp.onrender.com/api/health` returned `404`.
- `https://redoapp.onrender.com/api/me/test-user` returned `404`.
- `https://redoapp-backend.onrender.com/api/health` returned `404`.
- `https://redoapp-backend.onrender.com/api/me/test-user` returned `404`.
- The live frontend bundle did not expose a Supabase hostname or the configured backend hostname, which strongly suggests the deployed frontend is not using a working injected API base URL.

### Interpretation

- The frontend should be treated as canonical only on `redoapp.onrender.com`.
- The backend routing or deployed backend service does not match the repository config.
- Publicly observable evidence suggests the production frontend is falling back to relative `/api/...` paths because no working `VITE_API_BASE_URL` was baked into the deployed bundle.
- The current production topology should be treated as inconsistent until the domain mapping is corrected.

## Private Dashboard Findings

### Render

- The backend Render service URL should resolve on `https://redoapp-backend.onrender.com`.
  - Evidence: live Render dashboard and production environment update.
- The actual frontend Render static site URL is `https://redoapp.onrender.com`.
  - Evidence: Render frontend dashboard for service `srv-d92ann19rddc738b3f1g`.
- The frontend environment variable `VITE_API_BASE_URL` must be set in Render to `https://redoapp-backend.onrender.com`.
- The backend environment currently has:
  - `ENABLE_CHAIN_VERIFICATION=true`
  - `TON_VERIFICATION_MODE=tonapi`
  - `SUPABASE_URL=https://pbyugwyloxplrwtnphwe.supabase.co`
- Render logs show the backend is starting, but it repeatedly fails to read or persist runtime state to Supabase.
  - Evidence from Render logs:
    - `Failed to load runtime state from Supabase`
    - `TypeError: fetch failed`
    - `getaddrinfo ENOTFOUND pbyugwyloxplrwtnphwe.supabase.co`
    - repeated `Failed to persist runtime state`
- Interpretation:
  - The backend is configured to use a Supabase host that currently does not resolve from Render.
  - As a result, persistence is broken in production and the service is operating without durable runtime state.

### Supabase

- The currently open active Supabase project in the dashboard is `rxhnhgtwfwisrnkhtzko` (`redoapp`), but the backend Render service is configured to use a different project ref: `pbyugwyloxplrwtnphwe`.
  - This is a confirmed environment mismatch.
- The `pbyugwyloxplrwtnphwe` Supabase project exists in the account as `YOapp`, and the dashboard reports:
  - `The project "YOapp" is currently paused`
- The active `redoapp` Supabase project (`rxhnhgtwfwisrnkhtzko`) contains:
  - one table in `public`: `app_state`
  - RLS enabled on `app_state`
  - no RLS policies on `app_state`
  - Security Advisor: `0 errors`, `0 warnings`, `1 info`
- Legacy Supabase JWT-based API keys are still enabled on the `redoapp` project.
  - The dashboard shows active legacy `anon` and `service_role` keys and offers `Disable JWT-based API keys`.
  - This increases blast radius if any legacy key leaks or is reused outside current intended flows.
- Authentication settings on the `redoapp` project show:
  - user signups enabled
  - email confirmation enabled
  - only Email auth enabled
  - no third-party or custom providers configured

### Impact of the private findings

- The production backend is pointed at the wrong or unavailable Supabase project.
- Even if the application code were fixed, current production persistence would remain broken until the Render `SUPABASE_URL` and corresponding credentials are corrected.
- The open `redoapp` Supabase dashboard project is not the same project that the backend is trying to use.
- The paused `YOapp` project strongly suggests environment drift or an abandoned/legacy project reference left in production config.

## Obsolete and Unused Inventory

### Safe to delete after quick manual confirmation

- `dist/`
  - Build output is committed even though [.gitignore](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/.gitignore:3) ignores `dist/`.
  - The folder currently contains 81 tracked/generated files.
- `FOR AI/`
  - Contains 80 image/scratch artifacts and is not referenced by code.
- `README_walletsuccess.md`
  - Present in repo root and not referenced anywhere in code.
- `metadata.json`
  - Tracked in git and not referenced anywhere in code or build.
- `public/face.png`
  - Not referenced by code; current card back uses [src/components/UnoCard.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/components/UnoCard.tsx:262) `face-20260701.png`.

### Verify before delete

- Non-`v2` card assets in `public/cards/`
  - Code currently references `plus2_*_v2` and `plus4_*_v2` in [src/components/UnoCard.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/components/UnoCard.tsx:55) and [src/components/UnoCard.tsx](/C:/Users/MSI/antigravity/UNO-Cartoon-Card-Game-2026-06-25-17240/src/components/UnoCard.tsx:76).
  - Older `plus2_*` and `plus4_*` variants look stale, but should be deleted only after visual confirmation.
- `public/banner.png`
  - In active use by the app and manifest.
- `public/face-20260701.png`
  - In active use by the card back.

## Recommended Remediation Order

1. Remove all public trust in client-supplied `userId`.
2. Rebuild match settlement and match actions to be server-authoritative.
3. Lock down withdrawal/admin actions.
4. Restrict CORS and add rate limiting.
5. Align frontend/backend deployment domains and production routing.
6. Replace the single-row JSONB state model with proper tables.
7. Shorten Telegram replay window and add stronger session binding.
8. Clean the repository by removing committed build output and AI scratch artifacts.

## Verification Performed

- `npm run lint` passed.
- `npm run build` passed.
- Build output warns about a large JS bundle, but there were no blocking type or build errors.
