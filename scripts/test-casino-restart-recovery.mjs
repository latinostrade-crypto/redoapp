import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-casino-restart-'));
const port = 35_000 + Math.floor(Math.random() * 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
let server;

function startServer() {
  return spawn(process.execPath, [tsxCli, path.join(root, 'server.ts')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      APP_SESSION_SECRET: 'casino-restart-test-secret',
      RUNTIME_STATE_DIR: runtimeDir,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Casino restart test server did not start.');
}

async function request(userId, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: { 'x-user-id': userId, ...(options.body ? { 'content-type': 'application/json' } : {}) },
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${options.method || 'GET'} ${endpoint}: ${JSON.stringify(payload)}`);
  return payload;
}

async function stopServer() {
  if (!server || server.killed) return;
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 6_000))]);
}

try {
  server = startServer();
  await waitForServer();

  const tableId = 'table-poker-free-2';
  await request('restart_poker_a', `/api/casino/open-table/${tableId}`, { method: 'POST' });
  await request('restart_poker_a', '/api/casino/join-table', {
    method: 'POST', body: JSON.stringify({ tableId, chips: 100, idempotencyKey: 'restart-poker-a' }),
  });
  await request('restart_poker_b', '/api/casino/join-table', {
    method: 'POST', body: JSON.stringify({ tableId, chips: 100, idempotencyKey: 'restart-poker-b' }),
  });
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const beforeRestart = await request('restart_poker_a', `/api/matches/state/${tableId}`);
  assert.equal(beforeRestart.pokerGameState.stage, 'preflop');

  const current = beforeRestart.pokerGameState.players[beforeRestart.pokerGameState.currentPlayerIndex];
  const action = current.currentBet < beforeRestart.pokerGameState.currentBet ? 'call' : 'check';
  const afterAction = await request(current.userId, '/api/matches/action', {
    method: 'POST',
    body: JSON.stringify({ matchId: tableId, action, expectedStateVersion: beforeRestart.pokerGameState.stateVersion }),
  });
  assert.ok(afterAction.pokerGameState.stateVersion > beforeRestart.pokerGameState.stateVersion);

  // The runtime checkpoint is asynchronous by design, just like production.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await stopServer();
  server = startServer();
  await waitForServer();

  const recovered = await request('restart_poker_a', `/api/matches/state/${tableId}`);
  assert.equal(recovered.pokerGameState.players.length, 2, 'restart must restore the durable human table runtime');
  assert.notEqual(recovered.pokerGameState.stage, 'idle', 'restart must not replace a live human hand with a stale waiting wrapper');
  assert.ok(recovered.pokerGameState.stateVersion >= afterAction.pokerGameState.stateVersion,
    'restart must preserve or advance the authoritative casino revision');

  const recoveredCurrent = recovered.pokerGameState.players[recovered.pokerGameState.currentPlayerIndex];
  const recoveredAction = recoveredCurrent.currentBet < recovered.pokerGameState.currentBet ? 'call' : 'check';
  const progressed = await request(recoveredCurrent.userId, '/api/matches/action', {
    method: 'POST',
    body: JSON.stringify({ matchId: tableId, action: recoveredAction, expectedStateVersion: recovered.pokerGameState.stateVersion }),
  });
  assert.ok(progressed.pokerGameState.stateVersion > recovered.pokerGameState.stateVersion,
    'the table must accept a valid action after restart');
  console.log('Casino restart recovery checks passed.');
} finally {
  await stopServer();
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}
