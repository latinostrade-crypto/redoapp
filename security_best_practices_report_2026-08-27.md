# Security Best Practices Review — 2026-08-27

## Executive summary

The project is a TypeScript React/Vite static site hosted on Render, with an Express API on Render and Supabase used as the durable store. A **critical authentication bypass** allows a remote unauthenticated caller to mint a valid bearer session for any user ID, including the configured Telegram withdrawal operator. This makes the server-side Telegram verification and Supabase RLS ineffective for API authorization.

The review also found a public diagnostic endpoint that exposes user identifiers and recent financial activity, bearer and Telegram credentials accepted in URLs and stored in `localStorage`, overly broad CORS origin matching, and missing visible CSP/framing protections for the Render static site.

## Remediation status

On 2026-08-27, SEC-001 was remediated in the working tree: production now mints a server-generated guest identity instead of signing a client-provided `userId`; local identity fallback is limited to localhost/LAN development; and privileged API routes require the dedicated admin key or freshly verified Telegram `initData` for the configured operator, never a Telegram ID or username from a bearer session. SEC-002 is remediated by requiring the admin key for production debug routes. SEC-005 is remediated with an exact production CORS allowlist. Session persistence was reduced to `sessionStorage`, and baseline Render response headers were added. URL bridge/SSE paths now use a separate signed `bridgeToken` with a 15-minute lifetime; the general bearer and Telegram initData are no longer accepted from query strings. A full, wallet-compatible CSP and one-time per-route bridge tokens remain open work.

## Critical

### SEC-001 — Unauthenticated account/session minting, including withdrawal-operator impersonation

- **Rule ID:** EXPRESS-INPUT-001 / EXPRESS-SESS-002 / REACT-AUTHZ-001
- **Severity:** Critical
- **Location:** `server.ts`:2785-2824 (`resolveCanonicalUserId`); `server.ts`:6483-6507 (`POST /api/users/sync`); `server.ts`:2691-2725 (`requireAuth`); `server.ts`:7633-7647 and subsequent `/api/admin/*` handlers.
- **Evidence:** When Telegram `initData` and an existing session are absent, `resolveCanonicalUserId` returns the client-controlled `body.userId` or `x-user-id`. `/api/users/sync` has no authentication middleware and evaluates `Boolean(resolved.userId)` in `canIssueSessionToken`, which is true for every nonempty submitted ID, then returns `createSessionToken(user.userId)`. `requireAuth` accepts that signed token. Admin handlers also recognize `requesterId === \`tg:${WITHDRAWAL_OPERATOR_CHAT_ID}\`` as an administrator.
- **Impact:** Any internet user can mint a two-hour bearer token for another user (for example `tg:<victim Telegram ID>`), read and act as that user, and mint a token for the configured withdrawal operator to reach operator-authorized endpoints. This is an account-takeover and financial-integrity vulnerability.
- **Fix:** In production, make `/api/users/sync` issue a session only after valid Telegram `initData`, or after an already-valid existing session whose `userId` matches the requested identity. Never derive an authenticated identity from `userId` or `x-user-id`; retain a clearly isolated, test-only guest flow only outside production. Remove the Telegram-ID/operator shortcut from admin authorization; require a dedicated server-side role or `ADMIN_API_KEY`-protected workflow.
- **Mitigation:** Immediately rotate `APP_SESSION_SECRET` after deploying the fix, then invalidate active sessions. Review Render request logs and Supabase audit logs for suspicious `POST /api/users/sync` activity and protected-route access.
- **False-positive notes:** The control flow is source-confirmed and does not depend on a development hostname: this endpoint is reachable before `requireAuth`, and its `canIssueSessionToken` expression accepts any nonempty identity.

## High

No additional high-severity finding was verified independently of SEC-001.

## Medium

### SEC-002 — Public debug endpoint discloses Telegram identifiers and recent transaction data

- **Rule ID:** EXPRESS-INPUT-001 / EXPRESS-AUTH-001
- **Severity:** Medium
- **Location:** `server.ts`:6405-6435 (`GET /api/debug/users`).
- **Evidence:** The route has no `requireAuth` or `requireAdmin` middleware and returns each user's `userId`, `telegramId`, username, name, energy, matchmaking failure data, and `transactions?.slice(0, 3)`.
- **Impact:** Any caller can enumerate player identities and recent transaction metadata. The disclosed `tg:<id>` values also make exploitation of SEC-001 straightforward.
- **Fix:** Remove the route from production, or protect it with `requireAdmin` and make it return the minimum required non-sensitive fields. Ensure debug routes are disabled by default in production.
- **Mitigation:** Put an edge access policy in front of the Render backend until deployed.
- **False-positive notes:** This is publicly reachable in application code; an external Render access policy could reduce exposure but is not visible in the repository.

### SEC-003 — Reusable authentication credentials are accepted in query strings and persisted in browser storage

- **Rule ID:** JS-STORAGE-001 / JS-URL-001 / REACT-AUTH-001
- **Severity:** Medium
- **Location:** `server.ts`:2663-2688 (`extractSessionToken`, `extractTelegramInitData`); `src/utils/api.ts`:74-100 and 133-155 (`setSessionToken`, `buildAuthenticatedUrl`).
- **Evidence:** The server accepts `sessionToken` and `telegramInitData` from `req.query`. The client persists the signed bearer session in `localStorage` and adds both credentials to iframe/SSE-style URLs.
- **Impact:** Tokens can be retained in browser history, Render/proxy logs, monitoring, copied URLs, and accessed by any successful same-origin XSS. A stolen session is valid for two hours.
- **Fix:** Accept normal API credentials only in `Authorization`/dedicated headers and store tokens in memory or a `HttpOnly`, secure, appropriately `SameSite` cookie with CSRF protections. For bridge/SSE constraints, mint a narrowly scoped, short-lived, single-use token via an authenticated header-based request; redact the legacy query names at Render and logging providers during migration.
- **Mitigation:** Rotate `APP_SESSION_SECRET` after SEC-001, configure Render/logging redaction for `sessionToken` and `telegramInitData`, and lower session lifetime while migrating.
- **False-positive notes:** Some embedded WebView bridge paths may need a URL token; that does not justify using the general account bearer token in the URL.

### SEC-004 — Static Render site has no visible CSP or framing policy

- **Rule ID:** REACT-CSP-001 / REACT-HEADERS-001
- **Severity:** Medium
- **Location:** `render.yaml`:21-29; `public/_headers`:1-3; `index.html`:12-14.
- **Evidence:** Render static-site headers define caching only. `public/_headers` sets `X-Content-Type-Options` and legacy `X-XSS-Protection`, but no Content Security Policy, `frame-ancestors`/`X-Frame-Options`, Referrer-Policy, or Permissions-Policy. The page loads Telegram's remote script and stores a bearer token in browser storage.
- **Impact:** A future markup/DOM injection has less browser-level containment and can steal the session token. Framing protections are not demonstrated for the public application.
- **Fix:** Set response headers through Render's `headers` configuration (not only a host-specific `_headers` file): a tested CSP with explicit Telegram, TON Connect, API, image, font, and WebSocket origins; `frame-ancestors` aligned with Telegram embedding requirements; `Referrer-Policy: strict-origin-when-cross-origin`; `X-Content-Type-Options: nosniff`; and a minimal Permissions-Policy. Start CSP in report-only mode if necessary, then enforce.
- **Mitigation:** Confirm production response headers with `curl -I` or browser DevTools after deployment.
- **False-positive notes:** An untracked Render dashboard/edge rule could add headers, but it is not represented in this repository.

## Low

### SEC-005 — CORS origin validation is broader than the intended origin allowlist

- **Rule ID:** EXPRESS-CORS-001
- **Severity:** Low
- **Location:** `server.ts`:120-151.
- **Evidence:** The CORS callback permits any origin containing `localhost`, private-IP-like substrings, any `.onrender.com` subdomain, and arbitrary `.local` names, in addition to the explicit application origins.
- **Impact:** An unrelated Render site or a crafted hostname can obtain CORS approval. The immediate impact is limited because the API uses bearer headers rather than cookies, but this becomes more dangerous if credentials, token-bearing URLs, or permissive API flows are introduced.
- **Fix:** In production, use exact-origin matching only. Keep local/LAN origin logic behind an explicit development-only branch.
- **Mitigation:** Keep `credentials: false` and do not add cookie authentication without reworking CORS and CSRF controls.
- **False-positive notes:** CORS does not itself grant an attacker the victim's bearer token; this is a least-privilege hardening issue.

## Render and Supabase review notes

- `render.yaml` keeps `SUPABASE_SERVICE_ROLE_KEY`, `APP_SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, and `ADMIN_API_KEY` as non-synced server-side environment values; no service-role key was found in Vite-prefixed configuration.
- The reviewed Supabase SQL enables RLS on the state, ticket, and casino tables and revokes sensitive `SECURITY DEFINER` RPCs from public/anon/authenticated roles, granting execution to `service_role` only (for example `supabase/20260826_ticket_ledger.sql`:45-57 and 149-150).
- This is source-level evidence only. Verify the applied production migration set, RLS policies, exposed schemas, and Supabase Auth/API settings in the Supabase dashboard. The critical API session bypass remains exploitable regardless of correct RLS because the Render server uses the service-role key.

## Dependency check

`npm audit --omit=dev --audit-level=high` completed on 2026-08-27 and reported no critical advisory. It reports high advisories in transitive build-time `nanoid` and `postcss`, plus moderate `protobufjs` (from unused-in-source `@google/genai`) and low `body-parser`. The `nanoid`/`postcss` paths are via Vite/Autoprefixer build tooling, not a verified production request path. Upgrade through a tested dependency update rather than applying an automatic bulk fix.
