import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createChangedSnapshotWriter } from '../server/changedSnapshot';

const writes: unknown[] = [];
let fail = false;
const store = createChangedSnapshotWriter(async (snapshot: unknown) => {
  if (fail) throw new Error('database unavailable');
  writes.push(snapshot);
});
const state = { queue: [] as string[], notifications: [{ status: 'sent', message: 'x'.repeat(584_000) }] };
assert.equal(await store(state), true);
for (let tick = 0; tick < 240; tick++) assert.equal(await store(state), false);
assert.equal(writes.length, 1, 'one hour of unchanged ticks must add zero database writes');
state.queue.push('new-player');
assert.equal(await store(state), true, 'matchmaking changes must persist');
state.notifications[0].status = 'sending';
fail = true;
await assert.rejects(store(state), /unavailable/);
fail = false;
assert.equal(await store(state), true, 'failed writes must remain retryable');

let release!: () => void;
let entered!: () => void;
const started = new Promise<void>(resolve => { entered = resolve; });
const gate = new Promise<void>(resolve => { release = resolve; });
const ordered: Array<{ status: string }> = [];
const serial = createChangedSnapshotWriter(async (snapshot: { status: string }) => {
  if (!ordered.length) { entered(); await gate; }
  ordered.push(snapshot);
});
const mutable = { status: 'pending' };
const first = serial(mutable);
await started;
mutable.status = 'sending';
const second = serial(mutable);
mutable.status = 'sent';
release();
await Promise.all([first, second]);
assert.deepEqual(ordered, [{ status: 'pending' }, { status: 'sending' }]);
assert.equal(await serial(mutable), true, 'a mutation during a write is not acknowledged prematurely');

// Exercise the actual server functions with isolated persistence/network boundaries.
const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const flushSource = source.slice(source.indexOf('async function performTelegramNotificationFlush()'), source.indexOf('\nfunction flushTelegramNotifications()'));
const events: string[] = [];
const notifications: Array<Record<string, unknown>> = [];
let intentFails = false;
let responseStatus = 200;
const context = vm.createContext({
  TELEGRAM_BOT_TOKEN: 'isolated-test-token', telegramNotifications: notifications,
  persistInFlight: null, Date, AbortSignal,
  console: { error() {}, warn() {} },
  persistStateNow: async () => { events.push(`persist:${notifications[0]?.status}`); if (intentFails) throw new Error('offline'); },
  schedulePersist: () => { events.push('schedule'); },
  markTelegramChatUndeliverable: () => { events.push('invalid'); },
  fetch: async () => { events.push('send'); return { ok: responseStatus === 200, status: responseStatus, text: async () => '{"parameters":{"retry_after":60}}' }; },
});
vm.runInContext(ts.transpileModule(flushSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const flush = () => vm.runInContext('performTelegramNotificationFlush()', context) as Promise<void>;
for (let tick = 0; tick < 240; tick++) await flush();
assert.deepEqual(events, [], 'an empty outbox must not schedule writes or send messages');
notifications.push({ id: 'test', status: 'pending', createdAt: 1, attempts: 0 });
await flush();
assert.deepEqual(events, ['persist:sending', 'send', 'schedule'], 'durable send intent must precede Telegram');
assert.equal(notifications[0].status, 'sent');
events.length = 0;
await flush();
assert.deepEqual(events, [], 'completed history must not be rewritten by idle ticks');
notifications[0].status = 'pending';
intentFails = true;
await flush();
assert.deepEqual(events, ['persist:sending', 'schedule'], 'no Telegram delivery after failed durable intent');
assert.equal(notifications[0].status, 'failed');
events.length = 0;
await flush();
assert.deepEqual(events, [], 'future retries must not cause idle writes');
intentFails = false;
notifications[0].nextAttemptAt = 0;
responseStatus = 429;
await flush();
assert.equal(notifications[0].status, 'failed');
assert.ok(Number(notifications[0].nextAttemptAt) > Date.now(), 'Telegram rate-limit retry must survive');

const persistSource = source.slice(source.indexOf('async function persistStateNow()'), source.indexOf('\nasync function persistDirtyUsers()'));
let finish!: () => void;
let calls = 0;
const persistContext = vm.createContext({
  persistInFlight: null, persistRequestedWhileWriting: false,
  persistStateNowInternal: async () => { if (++calls === 1) await new Promise<void>(resolve => { finish = resolve; }); },
});
vm.runInContext(persistSource, persistContext);
const a = vm.runInContext('persistStateNow()', persistContext);
const b = vm.runInContext('persistStateNow()', persistContext);
finish();
await Promise.all([a, b]);
assert.equal(calls, 2, 'a request during an active write must flush again before resolving');
assert.match(source, /await persistGlobalSnapshot\(globalState\)/);
console.log('Persistence budget passed: idle writes, immutable snapshots, retry, send-intent ordering, 429 and concurrent flushes.');
