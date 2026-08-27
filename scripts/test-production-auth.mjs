import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-production-auth-'));
const port = 35_000 + Math.floor(Math.random() * 500);
const supabasePort = port + 500;
const redisPort = port + 1_000;
const baseUrl = `http://127.0.0.1:${port}`;
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

// The app needs a service-role Supabase client in production. This minimal
// local REST stand-in keeps the test fully isolated while exercising the real
// production authentication branch.
const supabase = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('[]');
});
supabase.listen(supabasePort, '127.0.0.1');
await once(supabase, 'listening');

// Minimal Upstash REST stand-in. It exercises the same atomic EVAL response
// shape used by the shared production limiter without reaching any network.
const redisCounters = new Map();
const redis = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const command = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (command[0] !== 'EVAL') {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unexpected Redis command in limiter test.' }));
  }
  const key = command[3];
  const ttlMs = Number(command[4]);
  const counter = redisCounters.get(key) || { count: 0, expiresAt: 0 };
  const now = Date.now();
  if (now >= counter.expiresAt) {
    counter.count = 0;
    counter.expiresAt = now + ttlMs;
  }
  counter.count += 1;
  redisCounters.set(key, counter);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ result: [counter.count, Math.max(0, counter.expiresAt - now)] }));
});
redis.listen(redisPort, '127.0.0.1');
await once(redis, 'listening');

const server = spawn(process.execPath, [tsxCli, path.join(root, 'server.ts')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    APP_SESSION_SECRET: 'production-auth-test-secret-that-is-long-enough',
    ADMIN_API_KEY: 'production-auth-test-admin-key-that-is-long-enough',
    TELEGRAM_BOT_TOKEN: 'production-auth-test-bot-token',
    TON_API_KEY: 'production-auth-test-ton-api-key',
    UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${redisPort}`,
    UPSTASH_REDIS_REST_TOKEN: 'production-auth-test-redis-token',
    RUNTIME_STATE_DIR: runtimeDir,
  },
  stdio: 'ignore',
  windowsHide: true,
});

async function waitForServer() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Production authentication test server did not start.');
}

try {
  await waitForServer();
  const response = await fetch(`${baseUrl}/api/users/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Production request semantics: a public Host is not treated as LAN.
      host: 'redoapp.org',
      'x-forwarded-host': 'redoapp.org',
    },
    body: JSON.stringify({ userId: 'tg:5152039743' }),
  });
  assert.equal(response.ok, true, 'anonymous browser bootstrap should still work');
  const payload = await response.json();
  assert.match(payload.userId, /^guest:[0-9a-f-]+$/, 'client-selected Telegram ID must be discarded in production');
  assert.ok(payload.sessionToken, 'server-generated anonymous identity receives a session');
  assert.ok(payload.bridgeToken, 'bridge routes receive a separate scoped credential');

  const spoofedHostResponse = await fetch(`${baseUrl}/api/users/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost', 'x-forwarded-host': 'localhost' },
    body: JSON.stringify({ userId: 'tg:5152039743' }),
  });
  const spoofedHostPayload = await spoofedHostResponse.json();
  assert.match(spoofedHostPayload.userId, /^guest:[0-9a-f-]+$/, 'a spoofed local Host must not enable development identities in production');

  const protectedResponse = await fetch(`${baseUrl}/api/admin/users/lookup?query=tg%3A5152039743`, {
    headers: { authorization: `Bearer ${payload.sessionToken}`, host: 'redoapp.org', 'x-forwarded-host': 'redoapp.org' },
  });
  assert.equal(protectedResponse.status, 403, 'anonymous session must not inherit withdrawal operator authority');

  // The normal and spoofed-host bootstrap checks consumed two shared-IP budget
  // slots. Fill the remaining budget and verify that a cold-start-safe Redis
  // counter blocks only the excess request, without changing normal bootstrap UX.
  for (let index = 0; index < 18; index += 1) {
    const allowed = await fetch(`${baseUrl}/api/users/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'redoapp.org' },
      body: JSON.stringify({}),
    });
    assert.equal(allowed.status, 200, 'shared limiter must allow requests within its budget');
  }
  const blocked = await fetch(`${baseUrl}/api/users/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'redoapp.org' },
    body: JSON.stringify({}),
  });
  assert.equal(blocked.status, 429, 'shared Redis limiter must block excess public sync requests');
  console.log('Production authentication boundary checks passed.');
} finally {
  server.kill();
  await once(server, 'exit').catch(() => undefined);
  await new Promise((resolve) => supabase.close(resolve));
  await new Promise((resolve) => redis.close(resolve));
  await rm(runtimeDir, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
}
