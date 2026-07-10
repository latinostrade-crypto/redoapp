# Security Best Practices Review

## Executive summary

The application is a TypeScript React/Vite frontend with an Express backend, Telegram Mini App authentication, Supabase persistence, and TON-denominated ticket deposits/withdrawals. One **critical** issue can allow an authenticated user to obtain ticket credit without a verified payment. Two **high** issues concern long-lived, URL-borne authority tokens and production secret fallback. Three medium-priority hardening issues were also verified.

This was a source review on 2026-07-10. No remediation was applied. The dependency advisory scan could not complete because the npm audit endpoint was unreachable from this environment; dependency findings are therefore not asserted.

## Critical

### SEC-001 — Deposit confirmation credits tickets without blockchain verification

- **Rule ID:** EXPRESS-INPUT-001 / payment-integrity control
- **Severity:** Critical
- **Location:** [render.yaml](render.yaml):35-39; [server/tickets.ts](server/tickets.ts):231-249; [server/tickets.ts](server/tickets.ts):463-498
- **Evidence:** Deployment configuration sets `ENABLE_CHAIN_VERIFICATION` to `false` and `TON_VERIFICATION_MODE` to `manual`. In manual mode, `verifyTonDeposit` returns `{ ok: true }` after only deriving a message hash from the submitted `signedBoc`; `deposit-confirm` then calls `finalizeConfirmedIntent` and returns the credited balance.
- **Impact:** An authenticated attacker can submit a syntactically valid external-message BOC that does not represent a payment, receive tickets, and subsequently request a withdrawal. This directly risks loss of TON and invalid ticket balances.
- **Fix:** Enable on-chain verification in production and fail closed when it is unavailable. Remove the `manual` success path from production builds; verify recipient wallet, amount, transaction/message hash, and finality using a trusted provider before crediting the intent.
- **Mitigation:** Until fixed, disable deposits and withdrawals, or ensure the endpoint is inaccessible in production.
- **False-positive notes:** This finding assumes the checked-in `render.yaml` represents the production deployment. If production overrides both values to strict verification, verify that configuration and treat the committed unsafe defaults as a deployment regression risk.

## High

### SEC-002 — Withdrawal approval/rejection capabilities are permanent GET URLs

- **Rule ID:** EXPRESS-INPUT-001 / state-changing-route control
- **Severity:** High
- **Location:** [server.ts](server.ts):1489-1507; [server.ts](server.ts):1566-1588; [server.ts](server.ts):2370-2436
- **Evidence:** Withdrawal operator links are HMAC values derived only from action and request ID, with no expiry, nonce, or server-side one-time record. They are placed in a `?token=` query parameter and a Telegram message. Visiting GET `/complete` changes a withdrawal to completed; GET `/reject` refunds it.
- **Impact:** Anyone who obtains an operator link can perform the financial state change until the request is resolved. URLs can leak through logs, browser history, link previews, forwarded messages, and referrer handling.
- **Fix:** Replace links with an authenticated operator workflow using POST plus CSRF protection where applicable. If a one-click workflow is necessary, generate a cryptographically random, stored, short-expiry, single-use token; require a confirmation page before the state-changing POST, and do not put authority tokens in URLs.
- **Mitigation:** Rotate `APP_SESSION_SECRET` to invalidate outstanding links and restrict access to operator messages while implementing the change.
- **False-positive notes:** The HMAC comparison is timing-safe; the risk is token lifecycle and transport, not signature forgery.

### SEC-003 — Production session signing secret can silently fall back to unrelated or predictable values

- **Rule ID:** EXPRESS-SESS-002
- **Severity:** High
- **Location:** [server.ts](server.ts):33; [server.ts](server.ts):1160-1247; [server.ts](server.ts):3489-3491
- **Evidence:** `APP_SESSION_SECRET` falls back to the Telegram bot token, then the Supabase service-role key, then the literal `local-dev-session-secret`. The process only logs a warning in production when a fallback is detected; it still starts and signs bearer session tokens with that value.
- **Impact:** A production misconfiguration can make bearer tokens forgeable (literal fallback) or makes compromise of one unrelated secret equivalent to compromise of application session signing.
- **Fix:** Require an explicit high-entropy `APP_SESSION_SECRET` in production and terminate startup if it is missing, too short, or equal to a prohibited fallback. Use a dedicated secret only for session signing.
- **Mitigation:** Verify the current Render secret immediately, rotate it if it has ever used a fallback, and invalidate existing sessions as part of rotation.
- **False-positive notes:** `render.yaml` declares `APP_SESSION_SECRET` with `sync: false`, which is good, but does not prevent an unset/misconfigured production value.

## Medium

### SEC-004 — Bearer session and Telegram credentials are supported in query strings

- **Rule ID:** EXPRESS-INPUT-001 / token-handling control
- **Severity:** Medium
- **Location:** [server.ts](server.ts):1234-1262; [src/utils/api.ts](src/utils/api.ts):38-52; [src/components/Web3Dashboard.tsx](src/components/Web3Dashboard.tsx):601-628
- **Evidence:** `extractSessionToken` accepts `sessionToken` from `req.query`; `extractTelegramInitData` accepts `telegramInitData` from `req.query`. `buildAuthenticatedUrl` deliberately appends either credential to URLs for EventSource and iframe requests.
- **Impact:** A reusable bearer credential may be recorded in server/proxy logs, browser history, monitoring, or copied URLs. Its holder can act as the user for up to two hours.
- **Fix:** Accept credentials only in `Authorization` or a dedicated request header. For SSE, use a short-lived, single-use stream token obtained over an authenticated header-based POST; avoid URL credentials. For the iframe bridge, redesign to make an authenticated POST or use a short-lived one-time bridge token.
- **Mitigation:** Configure log redaction for these query parameter names and avoid exposing API URLs to third parties.

### SEC-005 — Private-room bridge accepts cross-origin postMessage replies

- **Rule ID:** REACT-POSTMSG-001
- **Severity:** Medium
- **Location:** [src/components/Web3Dashboard.tsx](src/components/Web3Dashboard.tsx):614-628; [server.ts](server.ts):2591-2603
- **Evidence:** The client receives `message` events but checks only data fields, not `event.origin` or `event.source`. The backend iframe responds with `parent.postMessage(..., '*')`.
- **Impact:** A malicious frame/window that can send a correctly shaped message during the request can cause the UI to accept attacker-controlled room payloads. This is primarily an integrity/UI issue today, but can become more severe if the accepted payload gains authority in future changes.
- **Fix:** Require `event.origin === new URL(API_BASE_URL).origin` and `event.source === iframe.contentWindow`. Send the response to the exact parent origin rather than `*`.
- **Mitigation:** Keep the iframe hidden and do not use message data for privileged actions without a follow-up authenticated server read.

### SEC-006 — Response security headers are incomplete and CSP is explicitly disabled

- **Rule ID:** EXPRESS-HEADERS-001 / REACT-HEADERS-001
- **Severity:** Medium
- **Location:** [server.ts](server.ts):57-68; [index.html](index.html):7
- **Evidence:** Helmet is enabled but `contentSecurityPolicy` is disabled. The frontend loads Telegram’s remote script, and no static-host header configuration is present in the repository for the Vite application.
- **Impact:** A successful HTML/DOM injection has fewer browser-level controls and can read the session token stored in `localStorage`. Clickjacking and other header protections should be verified on the static host.
- **Fix:** Deploy a tested CSP for the frontend (including the necessary Telegram and TON Connect origins), plus `frame-ancestors`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`. Set these at the static hosting/CDN layer if the Vite server cannot.
- **Mitigation:** Start with CSP Report-Only, tune it using reports, then enforce it. Avoid `unsafe-inline` where feasible.
- **False-positive notes:** Helmet supplies several backend headers; this finding concerns the intentionally disabled CSP and absence of visible frontend-edge configuration.

## Low

### SEC-007 — Request parsers have no explicit body-size limits; in-memory rate limits do not scale

- **Rule ID:** EXPRESS-INPUT-001 / availability hardening
- **Severity:** Low
- **Location:** [server.ts](server.ts):68-96
- **Evidence:** `express.json()` and `express.urlencoded()` use defaults rather than declared limits. Rate-limit counters are held in a process-local `Map` keyed by `req.ip`, with no cleanup for inactive keys and no shared store.
- **Impact:** Large payloads and distributed/multi-instance traffic can bypass the intended protection or consume process memory.
- **Fix:** Set explicit small parser limits appropriate to the API (for example, `express.json({ limit: '64kb' })`) and use a shared, expiring rate-limit store for production. Configure `trust proxy` explicitly only after confirming Render’s proxy topology.

## Positive controls observed

- Ticket routes are globally protected by `requireAuth` before registration ([server.ts](server.ts):2360-2368).
- Telegram init data is HMAC-verified and timestamp-checked ([server.ts](server.ts):1160-1195).
- Session-token signatures are compared using `timingSafeEqual` ([server.ts](server.ts):1210-1217).
- Ticket ledger and balance routes enforce that a supplied user ID matches the authenticated user ([server/tickets.ts](server/tickets.ts):388-430).
- The repository ignores `.env` files and retains only `.env.example` ([.gitignore](.gitignore):1-10).
