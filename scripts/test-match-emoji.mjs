import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-emoji-'));
const port = 36000 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, 'build/server.mjs')], {
  cwd: root, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development', RUNTIME_STATE_DIR: runtimeDir,
    APP_SESSION_SECRET: 'isolated-emoji-test-secret-at-least-32-characters', ADMIN_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_DB_PASSWORD: '',
    UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', TON_API_KEY: '',
    CASINO_TABLES_DB_MODE: 'false', ENABLE_CHAIN_VERIFICATION: 'false' },
});
const streams = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(user, endpoint, body) {
  const result = await fetch(base + endpoint, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-user-id': user, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  assert.ok(result.ok, `${endpoint}: ${result.status}`);
  return result.json();
}
async function listen(user, table) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(`${base}/api/matches/stream/${table}`, { headers: { 'x-user-id': user }, signal: controller.signal });
  assert.equal(response.status, 200);
  const events = [];
  const reader = response.body.getReader();
  const reading = (async () => {
    let pending = ''; const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
          if (frame.includes('event: match-emoji')) events.push(JSON.parse(frame.split('\n').find(line => line.startsWith('data:')).slice(5)));
        }
      }
    } catch (error) { if (!controller.signal.aborted) throw error; }
  })();
  streams.push({ close: () => { clearTimeout(timeout); controller.abort(); }, reading });
  return events;
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(400) })).ok) { ready = true; break; } } catch {}
    await pause(100);
  }
  assert.ok(ready, 'isolated compiled backend did not start');
  const table = 'table-poker-free-2';
  const users = ['emoji_alice', 'emoji_bob', 'emoji_carol'];
  await request(users[0], `/api/casino/open-table/${table}`, {});
  for (const user of users) await request(user, '/api/casino/join-table', { tableId: table, chips: 100, idempotencyKey: `emoji-seat-${user}` });
  const views = await Promise.all(users.map(user => listen(user, table)));
  await request(users[0], `/api/matches/${table}/emoji`, { emojiId: 'Fire' });
  await request(users[1], `/api/matches/${table}/emoji`, { emojiId: 'LIKE' });
  for (let i = 0; i < 50 && views.some(events => events.length < 2); i++) await pause(50);
  for (const events of views) assert.deepEqual(events.map(e => [e.senderUserId, e.emojiId]), [[users[0], 'Fire'], [users[1], 'LIKE']], 'sender and every other subscriber receive both reactions');
  for (const user of users) {
    const perspective = (await request(user, `/api/matches/state/${table}`)).pokerGameState;
    for (const sender of users) assert.ok(perspective.players.some(p => p.userId === sender), 'event sender IDs map to visible player seats in every perspective');
  }
  console.log('Three independent poker clients received both reactions; sender identities match every perspective.');
} finally {
  streams.forEach(stream => stream.close());
  await Promise.allSettled(streams.map(stream => stream.reading));
  const exited = once(server, 'exit'); server.kill();
  if (server.exitCode === null) await exited;
  assert.equal(path.dirname(path.resolve(runtimeDir)), path.resolve(tmpdir()));
  assert.ok(path.basename(runtimeDir).startsWith('redoapp-emoji-'));
  await rm(runtimeDir, { recursive: true, force: true });
}
