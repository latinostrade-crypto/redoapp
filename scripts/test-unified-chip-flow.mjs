import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = await mkdtemp(path.join(tmpdir(), 'redoapp-unified-chips-'));
const port = 35_000 + Math.floor(Math.random() * 700);
const baseUrl = `http://127.0.0.1:${port}`;
const userId = 'unified_chip_user';
await mkdir(path.join(runtimeDir, 'data'));
await writeFile(path.join(runtimeDir, 'data', 'runtime-state.json'), JSON.stringify({
  users: [{ userId, availableTickets: 1, heldTickets: 0, casinoChips: 50, energy: 10, maxEnergy: 10 }],
}));

let server;
const start = () => spawn(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'server.ts')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development', RUNTIME_STATE_DIR: runtimeDir,
    SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', CASINO_TABLES_DB_MODE: 'false',
    ENABLE_CHAIN_VERIFICATION: 'false', TELEGRAM_BOT_TOKEN: '', TON_API_KEY: '',
    APP_SESSION_SECRET: 'unified-chip-flow-test-secret-long-enough' },
  stdio: 'ignore', windowsHide: true,
});
const waitForServer = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Unified chip test server did not start.');
};
const request = async (endpoint, options = {}, expectedStatus = 200) => {
  const response = await fetch(baseUrl + endpoint, { ...options, headers: {
    'x-user-id': userId, ...(options.body ? { 'content-type': 'application/json' } : {}),
  }});
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, `${endpoint}: ${JSON.stringify(payload)}`);
  return payload;
};

try {
  server = start(); await waitForServer();
  let profile = await request('/api/me');
  assert.equal(profile.casinoChips, 150, 'legacy coins and casino chips must migrate without loss');
  assert.equal(profile.availableTickets, 1.5, 'legacy decimal response must only project canonical chips');

  await request('/api/matchmaker/join', { method: 'POST', body: JSON.stringify({
    username: 'ChipUser', avatarId: 'cat', stake: 0.31, mode: 'pvp', gameType: 'uno', forceFresh: true,
  })}, 400);
  profile = await request('/api/me');
  assert.equal(profile.casinoChips, 150, 'unsupported stake must not mutate the wallet');

  await request('/api/matchmaker/join', { method: 'POST', body: JSON.stringify({
    username: 'ChipUser', avatarId: 'cat', stake: 1, mode: 'pvp', gameType: 'uno', forceFresh: true,
  })});
  profile = await request('/api/me');
  assert.equal(profile.casinoChips, 50, 'UNO stake must debit the same chips used by casino');
  assert.equal(profile.heldCasinoChips, 100, 'UNO stake must move into integer held chips');
  assert.equal(profile.availableTickets, 0.5);
  assert.equal(profile.heldTickets, 1);

  await request('/api/matchmaker/leave', { method: 'POST', body: '{}' });
  profile = await request('/api/me');
  assert.equal(profile.casinoChips, 150, 'queue cancellation must refund the exact chip hold');
  assert.equal(profile.heldCasinoChips, 0);

  await request('/api/casino/exchange', { method: 'POST', body: JSON.stringify({ direction: 'chips_to_tkt', amount: 1 }) }, 410);
  await request('/api/tickets/withdraw-request', { method: 'POST', body: JSON.stringify({ walletAddress: 'test', ticketAmount: 1 }) }, 410);

  await new Promise(resolve => setTimeout(resolve, 300));
  server.kill(); await new Promise(resolve => server.once('exit', resolve));
  server = start(); await waitForServer();
  profile = await request('/api/me');
  assert.equal(profile.casinoChips, 150, 'restart must preserve the unified balance');
  assert.equal(profile.heldCasinoChips, 0);

  const stored = JSON.parse(await readFile(path.join(runtimeDir, 'data', 'runtime-state.json'), 'utf8'));
  const storedUser = stored.users.find(user => user.userId === userId);
  assert.equal(storedUser.chipEconomyVersion, 1);
  assert.equal(storedUser.availableTickets, storedUser.casinoChips / 100);
  console.log('Unified chip migration, UNO hold/refund, retired routes and restart checks passed.');
} finally {
  server?.kill();
  await rm(runtimeDir, { recursive: true, force: true });
}
