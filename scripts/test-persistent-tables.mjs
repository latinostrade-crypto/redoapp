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
  console.log('Persistent table checks passed.');
} finally {
  if (!server.killed) server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}
