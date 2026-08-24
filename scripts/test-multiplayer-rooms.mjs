import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-multiplayer-rooms-'));
const port = 33_000 + Math.floor(Math.random() * 1_000);
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
    APP_SESSION_SECRET: 'multiplayer-rooms-test-secret-that-is-long-enough',
    RUNTIME_STATE_DIR: runtimeDir,
  },
  stdio: 'ignore',
  windowsHide: true,
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Isolated multiplayer room server did not start.');
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

const player = (username, avatarId) => ({ username, avatarId, walletAddress: null, gameType: 'uno' });

try {
  await waitForServer();

  const createPayload = {
    ...player('Host', 'rabbit'),
    stake: 0,
    targetPlayers: 4,
    requestedRoomCode: 'ABCD1234',
    createRequestId: 'room-create-replay-001',
  };
  const created = await request('room_host', '/api/private-rooms/create', {
    method: 'POST', body: JSON.stringify(createPayload),
  });
  assert.equal(created.roomCode, 'ABCD1234');
  assert.equal(created.status, 'waiting');
  assert.match(created.telegramLink, /startapp=room_uno_ABCD1234$/);

  // Simulates a committed create whose HTTP response was lost. The replay must
  // preserve the existing room instead of deleting its match or occupants.
  const replayed = await request('room_host', '/api/private-rooms/create', {
    method: 'POST', body: JSON.stringify(createPayload),
  });
  assert.equal(replayed.roomCode, created.roomCode);
  assert.equal(replayed.matchId, created.matchId);

  const join = async (id, username, avatarId, roomCode = 'ABCD1234') => request(id, '/api/private-rooms/join', {
    method: 'POST', body: JSON.stringify({ roomCode, ...player(username, avatarId) }),
  });
  const second = await join('room_b', 'B', 'fox', 'room_uno_ABCD1234');
  assert.equal(second.status, 'waiting');
  assert.equal(second.playersCount, 2);

  const duplicate = await join('room_b', 'B', 'fox');
  assert.equal(duplicate.playersCount, 2, 'reconnecting player must not occupy another seat');
  const third = await join('room_c', 'C', 'bear');
  assert.equal(third.status, 'waiting');
  assert.equal(third.playersCount, 3);
  const fourth = await join('room_d', 'D', 'panda');
  assert.equal(fourth.status, 'waiting');
  assert.equal(fourth.playersCount, 4);

  const started = await request('room_host', '/api/private-rooms/start', {
    method: 'POST', body: JSON.stringify({ roomCode: created.roomCode }),
  });
  assert.equal(started.status, 'started');
  assert.equal(started.playersCount, 4);

  const stateA = await request('room_host', `/api/matches/state/${created.matchId}`);
  const stateD = await request('room_d', `/api/matches/state/${created.matchId}`);
  assert.equal(stateA.gameState.players.length, 4);
  assert.equal(stateD.gameState.players.length, 4);
  assert.equal(stateA.gameState.waitingForPlayers, false);

  console.log('Multiplayer private-room checks passed.');
} finally {
  if (!server.killed) server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}
