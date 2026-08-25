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
    // Keep the production behaviour (a server-owned recruitment phase) while
    // making this integration test fast.
    PUBLIC_UNO_RECRUITMENT_MS: '600',
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
  const firstExpiry = firstJoin.matchmaker.queueExpiresAt;
  assert.ok(firstExpiry, 'queued player must receive an absolute server expiry');

  // Simulate a Telegram retry after a lost join response. It must observe the
  // existing queue and never move the player to the back or restart its timer.
  const replayedFirstJoin = await request('pvp_handoff_a', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Handoff A', 'rabbit')),
  });
  assert.equal(replayedFirstJoin.replayed, true);
  assert.equal(replayedFirstJoin.matchmaker.queueExpiresAt, firstExpiry, 'replayed join must preserve the original queue deadline');

  await request('pvp_handoff_b', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Handoff B', 'fox')),
  });
  const queueA = await request('pvp_handoff_a', '/api/matchmaker/status');
  const queueB = await request('pvp_handoff_b', '/api/matchmaker/status');
  assert.equal(queueA.status, 'ready');
  assert.equal(queueB.status, 'ready');
  assert.equal(queueA.matchId, queueB.matchId, 'matched users must receive one shared match id');

  // This is the non-SSE recovery route used by a first Telegram client that
  // missed the ready frame while it remained on the dashboard.
  const profileA = await request('pvp_handoff_a', '/api/me');
  assert.equal(profileA.activeMatch?.matchId, queueA.matchId, 'profile reconciliation must expose the assigned match to the first player');

  const debug = await (await fetch(`${baseUrl}/api/debug/matchmaker`)).json();
  const waitingMatch = debug.activeMatches.find((match) => match.matchId === queueA.matchId);
  assert.ok(waitingMatch, 'the matched table must exist');
  assert.equal(waitingMatch.playStartedAt, null, 'queue delivery must not count as table connection');

  const tableA = await request('pvp_handoff_a', `/api/matches/state/${queueA.matchId}`);
  assert.equal(tableA.gameState.waitingForPlayers, true, 'the first table arrival must see the connection lobby');
  const tableB = await request('pvp_handoff_b', `/api/matches/state/${queueB.matchId}`);
  assert.equal(tableB.gameState.waitingForPlayers, true, 'the second table arrival must see the same recruitment lobby');
  assert.equal(tableB.gameState.recruitmentOpen, true, 'UNO must keep recruiting after the first two players arrive');

  // Seats three and four join the already-created table rather than a second
  // queue. They are not considered connected until their own table request.
  const thirdJoin = await request('pvp_handoff_c', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Handoff C', 'bear')),
  });
  const fourthJoin = await request('pvp_handoff_d', '/api/matchmaker/join', {
    method: 'POST',
    body: JSON.stringify(joinPayload('Handoff D', 'koala')),
  });
  assert.equal(thirdJoin.matchmaker.matchId, queueA.matchId);
  assert.equal(fourthJoin.matchmaker.matchId, queueA.matchId);
  await request('pvp_handoff_c', `/api/matches/state/${queueA.matchId}`);
  await request('pvp_handoff_d', `/api/matches/state/${queueA.matchId}`);

  // Server time, not a client timer, closes recruitment and starts everyone
  // together. Triggering a state read after the short test deadline exercises
  // the same lifecycle path used by the production ticker.
  await new Promise((resolve) => setTimeout(resolve, 700));
  const started = await request('pvp_handoff_a', `/api/matches/state/${queueA.matchId}`);
  assert.equal(started.gameState.waitingForPlayers, false, 'the table starts only after recruitment closes');
  assert.equal(started.gameState.players.length, 4, 'all four recruited players share one UNO table');

  const cancelAfterAssignment = await fetch(`${baseUrl}/api/matchmaker/leave`, {
    method: 'POST',
    headers: { 'x-user-id': 'pvp_handoff_b', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(cancelAfterAssignment.status, 409, 'cancel must not erase an assigned public match');

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
  await request('pvp_retry_a', `/api/matches/state/${beforeRetry.matchId}`);
  const retryLobby = await request('pvp_retry_b', `/api/matches/state/${beforeRetry.matchId}`);
  assert.equal(retryLobby.gameState.waitingForPlayers, true, 'a two-player table also waits through the common recruitment phase');
  await new Promise((resolve) => setTimeout(resolve, 700));
  const twoPlayerStarted = await request('pvp_retry_a', `/api/matches/state/${beforeRetry.matchId}`);
  assert.equal(twoPlayerStarted.gameState.waitingForPlayers, false, 'a valid two-player UNO table starts when the recruitment timer ends');
  assert.equal(twoPlayerStarted.gameState.players.length, 2);

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
