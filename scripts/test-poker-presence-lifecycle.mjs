import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-poker-presence-'));
const port = 34_000 + Math.floor(Math.random() * 800);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'server.ts')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    APP_SESSION_SECRET: 'poker-presence-lifecycle-test-secret',
    RUNTIME_STATE_DIR: runtimeDir,
    TEST_CASINO_PRESENCE_GRACE_MS: '1200',
  },
  stdio: 'ignore',
  windowsHide: true,
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Poker presence test server did not start.');
}

async function request(userId, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'x-user-id': userId,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${options.method || 'GET'} ${endpoint}: ${JSON.stringify(payload)}`);
  return payload;
}

const tableId = 'table-poker-free-2';
const one = 'presence_player_one';
const two = 'presence_player_two';

try {
  await waitForServer();
  await request(one, `/api/casino/open-table/${tableId}`, { method: 'POST' });
  await request(one, '/api/casino/join-table', {
    method: 'POST',
    body: JSON.stringify({ tableId, chips: 100, idempotencyKey: 'presence-seat-one' }),
  });
  await request(two, '/api/casino/join-table', {
    method: 'POST',
    body: JSON.stringify({ tableId, chips: 100, idempotencyKey: 'presence-seat-two' }),
  });

  for (let pulse = 0; pulse < 7; pulse += 1) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await request(one, '/api/casino/table-heartbeat', {
      method: 'POST',
      body: JSON.stringify({ tableId }),
    });
  }

  const disconnectedState = (await request(one, `/api/matches/state/${tableId}`)).pokerGameState;
  const disconnectedPlayer = disconnectedState.players.find((player) => player.userId === two);
  assert.equal(disconnectedPlayer?.isConnected, false, 'expired player must enter the server-authoritative disconnected state');
  assert.ok(disconnectedPlayer?.disconnectedAt, 'disconnect state must include a timestamp for visual lifecycle handling');

  const reconnectedPerspective = (await request(two, `/api/matches/state/${tableId}`)).pokerGameState;
  const reconnectedPlayer = reconnectedPerspective.players.find((player) => player.userId === two || player.id === 'player');
  assert.equal(reconnectedPlayer?.isConnected, true, 'a returning state read must rebuild the player connection');
  assert.equal(reconnectedPlayer?.disconnectedAt ?? null, null, 'reconnect must clear the disconnect timestamp');

  const sharedReconnectedState = (await request(one, `/api/matches/state/${tableId}`)).pokerGameState;
  assert.equal(
    sharedReconnectedState.players.find((player) => player.userId === two)?.isConnected,
    true,
    'other clients must observe the restored signal state',
  );

  console.log('Poker disconnect/reconnect lifecycle checks passed.');
} finally {
  if (!server.killed) server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}
