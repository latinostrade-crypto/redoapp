import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [server, apiClient, renderBlueprint] = await Promise.all([
  readFile(new URL('../server.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/utils/api.ts', import.meta.url), 'utf8'),
  readFile(new URL('../render.yaml', import.meta.url), 'utf8'),
]);

// Browser-provided identities are not authentication. Production must mint a
// new opaque guest identity instead of signing a caller-selected user ID.
assert.match(server, /const fallbackUserId = process\.env\.NODE_ENV !== 'production' && isLocalOrLan/, 'identity fallback must stay outside production');
assert.match(server, /const userId = resolved\.userId \|\| `guest:\$\{crypto\.randomUUID\(\)\}`;/, 'production must generate anonymous identities server-side');
assert.match(server, /const canIssueSessionToken = Boolean\(resolved\.auth \|\| resolved\.isSessionFallback \|\| userId\.startsWith\('guest:'\)\);/, 'sessions must have a verified or server-generated identity');
assert.doesNotMatch(server, /\|\| Boolean\(resolved\.userId\)/, 'arbitrary user IDs must never authorize session issuance');
assert.match(server, /function isQueryCredentialBridgeRequest\(req: Request\)/, 'URL credentials must have a narrow server-side scope');
assert.match(server, /isQueryCredentialBridgeRequest\(req\) && typeof req\.query\.bridgeToken/, 'bridge tokens in a URL must be restricted to bridge routes');
assert.doesNotMatch(server, /req\.query\.sessionToken/, 'general bearer sessions must never be read from URL query strings');
assert.match(apiClient, /params\.set\('bridgeToken', bridgeToken\)/, 'client bridge URLs must use the scoped credential');
assert.doesNotMatch(apiClient, /params\.set\('sessionToken', token\)/, 'client bridge URLs must not expose the bearer session');

// Administrator authority is a dedicated secret, not a Telegram profile ID.
assert.match(server, /function hasAdminApiKey\(req: Request\)/, 'admin checks must be centralized');
assert.match(server, /authenticated\.authSource === 'telegram' && authenticated\.authUserId === `tg:\$\{WITHDRAWAL_OPERATOR_CHAT_ID\}`/, 'Telegram operator authority must require verified initData');
assert.doesNotMatch(server, /requesterId === `tg:\$\{WITHDRAWAL_OPERATOR_CHAT_ID\}`/, 'Telegram IDs must not grant administrator authority');
assert.doesNotMatch(server, /userId === `tg:\$\{WITHDRAWAL_OPERATOR_CHAT_ID\}`/, 'Telegram IDs must not grant administrator authority');
assert.match(server, /app\.get\('\/api\/debug\/users', restrictProductionDebug/, 'production diagnostics must require administrator access');

// Do not retain a money-app bearer token across browser restarts.
assert.match(apiClient, /sessionStorage\.setItem\('redoapp_tab_session_token', token\)/, 'session token must be tab-scoped');
assert.doesNotMatch(apiClient, /localStorage\.setItem\(SESSION_TOKEN_STORAGE_KEY, token\)/, 'session token must not be persisted in localStorage');

// Render must apply baseline browser hardening to the static application.
assert.match(renderBlueprint, /name: Content-Security-Policy/, 'Render must send a CSP');
assert.match(renderBlueprint, /name: Referrer-Policy/, 'Render must send a referrer policy');
assert.match(renderBlueprint, /name: Permissions-Policy/, 'Render must send a permissions policy');

console.log('Security boundary regression checks passed.');
