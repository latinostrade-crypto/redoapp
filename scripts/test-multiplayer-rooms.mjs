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
    ADMIN_API_KEY: 'isolated-multiplayer-test-admin-key',
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
  assert.equal(created.matchId, null, 'waiting rooms must not create placeholder matches');
  assert.equal(created.version, 1, 'new lobbies begin with a server snapshot version');
  assert.match(created.telegramLink, /startapp=room_uno_ABCD1234$/);

  const unauthenticatedStatus = await fetch(`${baseUrl}/api/private-rooms/status/ABCD1234`);
  assert.equal(unauthenticatedStatus.status, 401, 'private room reads must not silently fall back to an invented identity');
  const outsiderStatus = await fetch(`${baseUrl}/api/private-rooms/status/ABCD1234`, {
    headers: { 'x-user-id': 'room_outsider' },
  });
  assert.equal(outsiderStatus.status, 403, 'a room code alone must not expose a private lobby');

  // A committed POST can lose its response in a Telegram WebView. The client
  // must reconcile the idempotency key rather than create another room.
  const recoveredCreate = await request('room_host', '/api/private-rooms/create-status/room-create-replay-001');
  assert.equal(recoveredCreate.operationStatus, 'created');
  assert.equal(recoveredCreate.roomCode, created.roomCode);
  assert.equal(recoveredCreate.players.length, 1);
  assert.equal(recoveredCreate.hostUserId, 'room_host');

  const bridgeResponse = await fetch(`${baseUrl}/api/private-rooms/create-beacon?${new URLSearchParams({
    ...Object.fromEntries(Object.entries(createPayload).map(([key, value]) => [key, String(value)])),
    responseMode: 'iframe',
    bridgeRequestId: 'bridge-header-check',
    parentOrigin: 'https://redoapp.org',
  })}`, { headers: { 'x-user-id': 'room_host' } });
  assert.equal(bridgeResponse.ok, true);
  assert.equal(bridgeResponse.headers.get('x-frame-options'), null, 'cross-origin iframe bridge must not inherit Helmet SAMEORIGIN');
  assert.match(bridgeResponse.headers.get('content-security-policy') || '', /frame-ancestors https:\/\/redoapp\.org/);

  const joinBridgeResponse = await fetch(`${baseUrl}/api/private-rooms/join-beacon?${new URLSearchParams({
    roomCode: 'ABCD1234', username: 'B', avatarId: 'fox', walletAddress: '', gameType: 'uno',
    responseMode: 'iframe', bridgeRequestId: 'join-bridge-header-check', parentOrigin: 'https://redoapp.org',
  })}`, { headers: { 'x-user-id': 'room_b' } });
  assert.equal(joinBridgeResponse.ok, true);
  assert.equal(joinBridgeResponse.headers.get('x-frame-options'), null, 'join bridge must be embeddable by the frontend');
  assert.match(joinBridgeResponse.headers.get('content-security-policy') || '', /frame-ancestors https:\/\/redoapp\.org/);

  // A full Telegram WebApp reload must be able to reconstruct the waiting
  // lobby from the server, rather than forcing the host to create it again.
  const hostProfile = await request('room_host', '/api/me');
  assert.equal(hostProfile.activeMatch?.status, 'waiting');
  assert.equal(hostProfile.activeMatch?.roomCode, 'ABCD1234');

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
  assert.ok(second.version > created.version, 'joining advances the authoritative lobby version');

  const stillWaiting = await request('room_host', '/api/private-rooms/status/ABCD1234');
  assert.equal(stillWaiting.status, 'waiting');
  assert.equal(stillWaiting.canStart, false, 'a 4-seat room must not expose a partial manual start');
  const partialStart = await fetch(`${baseUrl}/api/private-rooms/start`, {
    method: 'POST',
    headers: { 'x-user-id': 'room_host', 'content-type': 'application/json' },
    body: JSON.stringify({ roomCode: created.roomCode }),
  });
  assert.equal(partialStart.status, 409, 'the legacy start endpoint must reject 2/4 rooms');

  const duplicate = await join('room_b', 'B', 'fox');
  assert.equal(duplicate.playersCount, 2, 'reconnecting player must not occupy another seat');
  const third = await join('room_c', 'C', 'bear');
  assert.equal(third.status, 'waiting');
  assert.equal(third.playersCount, 3);
  const fourth = await join('room_d', 'D', 'panda');
  assert.equal(fourth.status, 'started', 'filling the room must take both clients straight to the table');
  assert.equal(fourth.playersCount, 4);
  assert.ok(fourth.matchId, 'the completing guest receives the canonical match id');

  const started = await request('room_host', '/api/private-rooms/start', {
    method: 'POST', body: JSON.stringify({ roomCode: created.roomCode }),
  });
  assert.equal(started.status, 'started');
  assert.equal(started.playersCount, 4);
  assert.ok(started.matchId, 'the match is created only by the atomic start transition');

  const startedAgain = await request('room_host', '/api/private-rooms/start', {
    method: 'POST', body: JSON.stringify({ roomCode: created.roomCode }),
  });
  assert.equal(startedAgain.matchId, started.matchId, 'retrying start must not reshuffle or create another match');

  const lateJoin = await fetch(`${baseUrl}/api/private-rooms/join`, {
    method: 'POST',
    headers: { 'x-user-id': 'room_late', 'content-type': 'application/json' },
    body: JSON.stringify({ roomCode: created.roomCode, ...player('Late', 'koala') }),
  });
  assert.equal(lateJoin.status, 400, 'a started private table must freeze its participant list');

  const stateA = await request('room_host', `/api/matches/state/${started.matchId}`);
  const stateD = await request('room_d', `/api/matches/state/${started.matchId}`);
  assert.equal(stateA.gameState.players.length, 4);
  assert.equal(stateD.gameState.players.length, 4);
  assert.equal(stateA.gameState.waitingForPlayers, false);

  // A 3-seat room follows the same contract: 2/3 stays in the lobby and the
  // third confirmed participant starts exactly one shared table.
  const threeRoom = await request('three_host', '/api/private-rooms/create', {
    method: 'POST', body: JSON.stringify({
      ...player('Three Host', 'rabbit'), stake: 0, targetPlayers: 3,
      requestedRoomCode: 'THREE333', createRequestId: 'three-room-001',
    }),
  });
  const threeSecond = await join('three_b', 'Three B', 'fox', threeRoom.roomCode);
  assert.equal(threeSecond.status, 'waiting');
  assert.equal(threeSecond.playersCount, 2);
  const threePartialStart = await fetch(`${baseUrl}/api/private-rooms/start`, {
    method: 'POST', headers: { 'x-user-id': 'three_host', 'content-type': 'application/json' },
    body: JSON.stringify({ roomCode: threeRoom.roomCode }),
  });
  assert.equal(threePartialStart.status, 409, 'a 3-seat room must not start at 2/3');
  const threeFinal = await join('three_c', 'Three C', 'bear', threeRoom.roomCode);
  assert.equal(threeFinal.status, 'started');
  assert.equal(threeFinal.playersCount, 3);
  assert.ok(threeFinal.matchId);
  const threeHostRecovery = await request('three_host', `/api/private-rooms/status/${threeRoom.roomCode}`);
  const threeGuestRecovery = await request('three_b', `/api/private-rooms/status/${threeRoom.roomCode}`);
  assert.equal(threeHostRecovery.matchId, threeFinal.matchId, 'host recovery opens the same 3-player table');
  assert.equal(threeGuestRecovery.matchId, threeFinal.matchId, 'earlier guests recover the same 3-player table');

  // Paid seats are reserved as they are occupied. A lobby that is full must
  // not become unstartable because an early guest spends the advertised stake.
  for (const userId of ['paid_host', 'paid_b']) {
    await request(userId, '/api/admin/users/adjust-balance', {
      method: 'POST',
      headers: { 'x-admin-key': 'isolated-multiplayer-test-admin-key' },
      body: JSON.stringify({ targetUserId: userId, amount: 1, mode: 'set', reason: 'isolated private-room reservation test' }),
    });
  }
  const paidRoom = await request('paid_host', '/api/private-rooms/create', {
    method: 'POST', body: JSON.stringify({
      ...player('Paid Host', 'rabbit'), stake: 0.3, targetPlayers: 3,
      requestedRoomCode: 'PAID3333', createRequestId: 'paid-room-001',
    }),
  });
  assert.equal(paidRoom.heldTickets, 0.3, 'host stake is held while waiting');
  const paidGuest = await join('paid_b', 'Paid B', 'fox', paidRoom.roomCode);
  assert.equal(paidGuest.heldTickets, 0.3, 'guest stake is held while waiting');
  await request('paid_b', '/api/matches/leave-unstarted', {
    method: 'POST', body: JSON.stringify({ roomCode: paidRoom.roomCode }),
  });
  const paidGuestAfterLeave = await request('paid_b', '/api/me');
  assert.equal(paidGuestAfterLeave.heldTickets, 0, 'leaving a waiting room releases the held stake');

  // Two guests racing for the final seat must produce exactly one winner;
  // neither response may fabricate a third participant.
  const racingRoom = await request('room_race_host', '/api/private-rooms/create', {
    method: 'POST',
    body: JSON.stringify({
      ...player('Race Host', 'rabbit'),
      stake: 0,
      targetPlayers: 2,
      requestedRoomCode: 'RACE2026',
      createRequestId: 'room-race-001',
    }),
  });
  const raceJoin = (userId, username) => fetch(`${baseUrl}/api/private-rooms/join`, {
    method: 'POST',
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    body: JSON.stringify({ roomCode: racingRoom.roomCode, ...player(username, 'fox') }),
  });
  const raceResponses = await Promise.all([raceJoin('room_race_a', 'Race A'), raceJoin('room_race_b', 'Race B')]);
  assert.deepEqual(raceResponses.map((response) => response.status).sort(), [200, 400]);
  const raceSnapshot = await request('room_race_host', `/api/private-rooms/status/${racingRoom.roomCode}`);
  assert.equal(raceSnapshot.playersCount, 2, 'the final-seat race leaves exactly two confirmed players');
  assert.equal(raceSnapshot.status, 'started', 'a 2-player invite starts automatically once the guest is seated');
  assert.ok(raceSnapshot.matchId, 'host recovery exposes the same auto-started table');
  assert.ok(raceSnapshot.version > racingRoom.version, 'the winning join publishes a newer snapshot');

  console.log('Multiplayer private-room checks passed.');
} finally {
  if (!server.killed) server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}
