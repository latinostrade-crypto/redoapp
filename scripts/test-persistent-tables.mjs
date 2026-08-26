import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-persistent-tables-'));
const port = 33_000 + Math.floor(Math.random() * 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'server.ts')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', APP_SESSION_SECRET: 'persistent-table-test-secret', RUNTIME_STATE_DIR: runtimeDir },
  stdio: 'ignore',
  windowsHide: true,
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Persistent-table test server did not start.');
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

try {
  await waitForServer();
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200, 'Render health endpoint must be independent of game state');
  for (const [gameType, mode] of [['poker', 'public'], ['poker', 'free'], ['blackjack', 'public'], ['blackjack', 'free']]) {
    const response = await fetch(`${baseUrl}/api/casino/tables?gameType=${gameType}&mode=${mode}`);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    const result = await response.json();
    assert.equal(response.ok, true, `${gameType}/${mode} catalogue must be public`);
    assert.equal(result.tables.length, 2, `${gameType}/${mode} must expose exactly two permanent tables`);
    assert.deepEqual(result.tables.map((table) => table.id), [
      `table-${gameType}-${mode}-1`,
      `table-${gameType}-${mode}-2`,
    ]);
  }
  const invalidFilter = await fetch(`${baseUrl}/api/casino/tables?gameType=uno&mode=public`);
  assert.equal(invalidFilter.status, 400, 'catalogue endpoint must reject unsupported filters');
  const tableId = 'table-blackjack-free-1';
  await request('persistent_table_user', `/api/casino/open-table/${tableId}`, { method: 'POST' });
  const first = await request('persistent_table_user', '/api/casino/join-table', { method: 'POST', body: JSON.stringify({ tableId, chips: 100, idempotencyKey: 'persistent-table-free-entry-1' }) });
  assert.equal(first.joined, true);
  const seatStatus = await request('persistent_table_user', `/api/casino/my-seat/${tableId}`);
  assert.equal(seatStatus.seated, true, 'a timed-out client must be able to reconcile an existing seat');
  const repeat = await request('persistent_table_user', '/api/casino/join-table', { method: 'POST', body: JSON.stringify({ tableId, chips: 100, idempotencyKey: 'persistent-table-free-entry-1' }) });
  assert.equal(repeat.joined, false, 'a repeated join must not create a second seat or charge');
  const heartbeat = await request('persistent_table_user', '/api/casino/table-heartbeat', { method: 'POST', body: JSON.stringify({ tableId }) });
  assert.ok(heartbeat.presenceExpiresAt > Date.now());
  await request('persistent_table_user', '/api/casino/leave-table', { method: 'POST', body: JSON.stringify({ tableId, idempotencyKey: 'persistent-table-free-leave-1' }) });
  const rejoin = await request('persistent_table_user', '/api/casino/join-table', {
    method: 'POST',
    body: JSON.stringify({ tableId, chips: 100, idempotencyKey: 'persistent-table-free-entry-2' }),
  });
  assert.equal(rejoin.joined, true, 'a released seat must be reusable by the same player');
  await request('persistent_table_user', '/api/casino/leave-table', { method: 'POST', body: JSON.stringify({ tableId, idempotencyKey: 'persistent-table-free-leave-2' }) });
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const recoveredEmptyTable = await request('table_spectator', `/api/matches/state/${tableId}`);
  assert.equal(recoveredEmptyTable.blackjackGameState.players.length, 2, 'an empty table must return to bot ambience, not retain a departed player');
  assert.ok(recoveredEmptyTable.blackjackGameState.players.every((player) => player.isAi), 'empty-table recovery must remove stale human seats');

  const pokerTableId = 'table-poker-free-1';
  await request('poker_table_user_one', `/api/casino/open-table/${pokerTableId}`, { method: 'POST' });
  await request('poker_table_user_one', '/api/casino/join-table', {
    method: 'POST', body: JSON.stringify({ tableId: pokerTableId, chips: 100, idempotencyKey: 'poker-human-entry-1' }),
  });
  const afterFirstSeat = await request('poker_table_user_one', `/api/matches/state/${pokerTableId}`);
  assert.equal(afterFirstSeat.pokerGameState.players.length, 1, 'bots must leave immediately when a human takes the table');
  assert.equal(afterFirstSeat.pokerGameState.stage, 'idle', 'one human waits for an opponent instead of a bot turn');
  const persistentProfile = await request('poker_table_user_one', '/api/me');
  assert.equal(persistentProfile.activeMatch?.matchId, pokerTableId, 'a seated permanent-table user must be recoverable from their profile');
  assert.equal(persistentProfile.activeMatch?.pokerGameState?.stage, 'idle', 'waiting for an opponent is a recoverable persistent-table state');
  await request('poker_table_user_two', '/api/casino/join-table', {
    method: 'POST', body: JSON.stringify({ tableId: pokerTableId, chips: 100, idempotencyKey: 'poker-human-entry-2' }),
  });
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const afterSecondSeat = await request('poker_table_user_one', `/api/matches/state/${pokerTableId}`);
  assert.equal(afterSecondSeat.pokerGameState.players.length, 2, 'two humans must occupy the human-only table');
  assert.equal(afterSecondSeat.pokerGameState.stage, 'preflop', 'the human hand must start through the authoritative tick');
  assert.ok(afterSecondSeat.pokerGameState.stateVersion > afterFirstSeat.pokerGameState.stateVersion,
    'human join/start transitions must have a newer authoritative snapshot version');
  const passiveRevision = afterSecondSeat.pokerGameState.stateVersion;
  await Promise.all(Array.from({ length: 8 }, (_, index) => request(
    index % 2 ? 'poker_table_user_one' : 'poker_table_user_two',
    `/api/matches/state/${pokerTableId}`,
  )));
  const afterPassiveReads = await request('poker_table_user_one', `/api/matches/state/${pokerTableId}`);
  assert.equal(afterPassiveReads.pokerGameState.stateVersion, passiveRevision,
    'read-only polling must not invalidate a player action by advancing the table revision');
  const activePlayer = afterSecondSeat.pokerGameState.players[afterSecondSeat.pokerGameState.currentPlayerIndex];
  const action = activePlayer.currentBet < afterSecondSeat.pokerGameState.currentBet ? 'call' : 'check';
  const actionResult = await request(activePlayer.userId, '/api/matches/action', {
    method: 'POST',
    body: JSON.stringify({
      matchId: pokerTableId,
      action,
      expectedStateVersion: afterSecondSeat.pokerGameState.stateVersion,
    }),
  });
  assert.ok(actionResult.pokerGameState.stateVersion > afterSecondSeat.pokerGameState.stateVersion,
    'a player action must publish a strictly newer state for every client');
  const staleAction = await fetch(`${baseUrl}/api/matches/action`, {
    method: 'POST',
    headers: { 'x-user-id': activePlayer.userId, 'content-type': 'application/json' },
    body: JSON.stringify({ matchId: pokerTableId, action, expectedStateVersion: afterSecondSeat.pokerGameState.stateVersion }),
  });
  assert.equal(staleAction.status, 409, 'a delayed action must not apply to a later table state');

  // A regression in the stage transition used to leave Poker visually stuck
  // after the flop. Drive both human seats through every betting street using
  // only server-authoritative snapshots and confirm that each street advances.
  let pokerState = actionResult.pokerGameState;
  async function completePokerStreet(expectedStage, nextStage) {
    for (let turn = 0; turn < 8 && pokerState.stage === expectedStage; turn += 1) {
      const current = pokerState.players[pokerState.currentPlayerIndex];
      assert.ok(current?.userId, `${expectedStage} must expose an actionable current player`);
      const nextAction = current.currentBet < pokerState.currentBet ? 'call' : 'check';
      const result = await request(current.userId, '/api/matches/action', {
        method: 'POST',
        body: JSON.stringify({
          matchId: pokerTableId,
          action: nextAction,
          expectedStateVersion: pokerState.stateVersion,
        }),
      });
      pokerState = result.pokerGameState;
    }
    assert.equal(pokerState.stage, nextStage, `Poker must advance from ${expectedStage} to ${nextStage}`);
  }
  await completePokerStreet('preflop', 'flop');
  await completePokerStreet('flop', 'turn');
  await completePokerStreet('turn', 'river');
  await completePokerStreet('river', 'ended');
  assert.ok(pokerState.nextRoundStartsAt, 'a persistent poker result must publish the server next-hand deadline');
  const pokerNextHandDeadline = Date.now() + 7_000;
  while (Date.now() < pokerNextHandDeadline && pokerState.stage !== 'preflop') {
    await new Promise((resolve) => setTimeout(resolve, 250));
    pokerState = (await request('poker_table_user_one', `/api/matches/state/${pokerTableId}`)).pokerGameState;
  }
  assert.equal(pokerState.stage, 'preflop', 'persistent poker must start the next hand without a client tap or reload');

  const concurrentTableId = 'table-blackjack-free-2';
  await request('seat_race_one', `/api/casino/open-table/${concurrentTableId}`, { method: 'POST' });
  const concurrentJoins = await Promise.all([
    request('seat_race_one', '/api/casino/join-table', { method: 'POST', body: JSON.stringify({ tableId: concurrentTableId, chips: 100, idempotencyKey: 'seat-race-one' }) }),
    request('seat_race_two', '/api/casino/join-table', { method: 'POST', body: JSON.stringify({ tableId: concurrentTableId, chips: 100, idempotencyKey: 'seat-race-two' }) }),
  ]);
  assert.equal(concurrentJoins.filter((entry) => entry.joined).length, 2, 'simultaneous human joins must be serialized without a phantom wait');
  let blackjackState = (await request('seat_race_one', `/api/matches/state/${concurrentTableId}`)).blackjackGameState;
  const blackjackInitialDeadline = Date.now() + 7_000;
  while (Date.now() < blackjackInitialDeadline && blackjackState.stage !== 'player_turn') {
    await new Promise((resolve) => setTimeout(resolve, 250));
    blackjackState = (await request('seat_race_one', `/api/matches/state/${concurrentTableId}`)).blackjackGameState;
  }
  assert.equal(blackjackState.stage, 'player_turn', 'two seated blackjack players must start a live hand');
  for (let turn = 0; turn < 3 && blackjackState.stage === 'player_turn'; turn += 1) {
    const current = blackjackState.players[blackjackState.currentPlayerIndex];
    const actionResult = await request(current.userId, '/api/matches/action', {
      method: 'POST',
      body: JSON.stringify({
        matchId: concurrentTableId,
        action: 'stand',
        expectedStateVersion: blackjackState.stateVersion,
      }),
    });
    blackjackState = actionResult.blackjackGameState;
  }
  const roundDeadline = Date.now() + 6_000;
  while (Date.now() < roundDeadline && blackjackState.stage !== 'round_ended') {
    await new Promise((resolve) => setTimeout(resolve, 250));
    blackjackState = (await request('seat_race_one', `/api/matches/state/${concurrentTableId}`)).blackjackGameState;
  }
  assert.equal(blackjackState.stage, 'round_ended', 'a blackjack hand must finish after all seated players stand');
  assert.ok(blackjackState.nextRoundStartsAt, 'blackjack round results must expose a server-authoritative next-hand deadline');
  const blackjackNextHandDeadline = Date.now() + 7_000;
  while (Date.now() < blackjackNextHandDeadline && blackjackState.stage !== 'player_turn') {
    await new Promise((resolve) => setTimeout(resolve, 250));
    blackjackState = (await request('seat_race_one', `/api/matches/state/${concurrentTableId}`)).blackjackGameState;
  }
  assert.equal(blackjackState.stage, 'player_turn', 'persistent blackjack must automatically deal the next hand after the visible countdown');
  console.log('Persistent table checks passed.');
} finally {
  if (!server.killed) server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}
