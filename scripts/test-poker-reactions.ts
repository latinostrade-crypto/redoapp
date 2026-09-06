import assert from 'node:assert/strict';
import { createReactionTimeline, REACTION_DURATION_MS, type SeatReaction } from '../src/components/poker/reactionTimeline';

let now = 0, nextTimer = 0;
let state: Record<string, SeatReaction> = {};
const tasks = new Map<number, { due: number; fn: () => void }>();
const callbacks: Array<() => void> = [];
const timeline = createReactionTimeline(items => { state = items; }, (fn, ms) => {
  const id = ++nextTimer;
  tasks.set(id, { due: now + ms, fn }); callbacks.push(fn);
  return id as unknown as ReturnType<typeof setTimeout>;
}, timer => { tasks.delete(timer as unknown as number); });
const tick = (ms: number) => {
  now += ms;
  for (const [id, task] of [...tasks]) if (task.due <= now) { tasks.delete(id); task.fn(); }
};

const first = timeline.show('player', 'Fire');
assert.deepEqual(Object.keys(state), ['player'], 'offline reaction belongs only to the local seat, never bots without userId');
tick(1000);
timeline.show('remote', 'LIKE');
assert.equal(Object.keys(state).length, 2, 'simultaneous reactions must coexist');
tick(1000);
timeline.show('player', 'Cool');
callbacks[0](); // A cancelled callback already queued by the browser.
timeline.remove('player', first); // A failed stale optimistic request.
assert.equal(state.player.emojiId, 'Cool', 'old expiry/error cannot remove the replacement');
tick(REACTION_DURATION_MS - 2000);
assert.equal(state.player.emojiId, 'Cool');
assert.equal(state.remote.emojiId, 'LIKE');
tick(1000);
assert.equal(state.remote, undefined, 'each sender has an independent expiry');
assert.equal(state.player.emojiId, 'Cool');
tick(1000);
assert.deepEqual(state, {});
for (let i = 0; i < 100; i++) timeline.show('player', 'HAHA');
assert.equal(tasks.size, 1, 'rapid clicks keep a single timer per sender');
timeline.dispose();
assert.equal(tasks.size, 0, 'table exit cleans every timer');
const disposedState = state;
callbacks.at(-1)!();
timeline.show('player', 'Fire');
assert.equal(state, disposedState, 'disposed timelines never publish into another table');
console.log('Poker reaction ownership, concurrency, replacement, expiry and cleanup passed.');
