import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-pvp-handoff-'));
const port = 32_000 + Math.floor(Math.random() * 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const server = spawn(process.execPath, [tsxCli, path.join(root, 'server.ts')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    APP_SESSION_SECRET: 'pvp-handoff-test-secret-that-is-long-enough',
    RUNTIME_STATE_DIR: runtimeDir,
  },
  stdio: 'ignore',
  windowsHide: true,
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Isolated PVP test server did not start.');
}

async function request(userId, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'x-user-id': userId,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${options.method || 'GET'} ${endpoint}: ${JSON.stringify(payload)}`);
  return payload;
}

const joinPayload = (username, avatarId) => ({
  username,
  avatarId,
  stake: 0,
  mode: 'pvp',
  gameType: 'uno',
  forceFresh: false,
});

try {
  await waitForServer();

  const firstJoin = await request('pvp_handoff_a', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Handoff A', 'rabbit')),
  });
  assert.equal(firstJoin.matchmaker.status, 'searching');

  await request('pvp_handoff_b', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Handoff B', 'fox')),
  });
  const queueA = await request('pvp_handoff_a', '/api/matchmaker/status');
  const queueB = await request('pvp_handoff_b', '/api/matchmaker/status');
  assert.equal(queueA.status, 'ready');
  assert.equal(queueB.status, 'ready');
  assert.equal(queueA.matchId, queueB.matchId, 'matched users must receive one shared match id');

  const debug = await (await fetch(`${baseUrl}/api/debug/matchmaker`)).json();
  const waitingMatch = debug.activeMatches.find((match) => match.matchId === queueA.matchId);
  assert.ok(waitingMatch, 'the matched table must exist');
  assert.equal(waitingMatch.playStartedAt, null, 'queue delivery must not count as table connection');

  const tableA = await request('pvp_handoff_a', `/api/matches/state/${queueA.matchId}`);
  assert.equal(tableA.gameState.waitingForPlayers, true, 'the first table arrival must see the connection lobby');
  const tableB = await request('pvp_handoff_b', `/api/matches/state/${queueB.matchId}`);
  assert.equal(tableB.gameState.waitingForPlayers, false, 'the second table arrival must start the shared match');

  await request('pvp_retry_a', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Retry A', 'rabbit')),
  });
  await request('pvp_retry_b', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Retry B', 'fox')),
  });
  const beforeRetry = await request('pvp_retry_a', '/api/matchmaker/status');
  const retry = await request('pvp_retry_a', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Retry A', 'rabbit')),
  });
  assert.equal(retry.replayed, true);
  assert.equal(retry.matchmaker.matchId, beforeRetry.matchId, 'a retry must keep the player in the same match');

  console.log('PVP handoff checks passed.');
} finally {
  if (!server.killed) {
    server.kill('SIGTERM');
  }
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(runtimeDir, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
