import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canRebuyPoker, pokerRebuyPrice, applyPokerRebuy } from '../server/pokerRebuy';

const busted = { chips: 0, eliminated: false, isConnected: true, tableBuyInChips: 100 };
for (const stage of ['preflop', 'flop', 'turn', 'river', 'showdown']) {
  assert.equal(canRebuyPoker(stage, busted), false, 'An unresolved all-in is not a loss');
}
assert.equal(canRebuyPoker('ended', busted), true);
assert.equal(canRebuyPoker('idle', { ...busted, eliminated: true }), true);
assert.equal(canRebuyPoker('flop', { ...busted, eliminated: true }), true, 'A player busted in an earlier hand may queue a rebuy');
assert.equal(canRebuyPoker('ended', { ...busted, chips: 1 }), false);
assert.equal(canRebuyPoker('ended', { ...busted, pendingTableRemoval: true }), false);
assert.equal(canRebuyPoker('ended', { ...busted, isConnected: false }), false);
assert.equal(canRebuyPoker('ended', undefined), false);
assert.deepEqual(pokerRebuyPrice('free', 100000, 100), { chips: 100, energyCost: 2 });
assert.deepEqual(pokerRebuyPrice('public', 50, 50), { chips: 50, energyCost: 0 });
for (const amount of [0, -1, 49, 50.5, Infinity, NaN, 100001]) {
  assert.throws(() => pokerRebuyPrice('public', amount, 50));
}
const funded = applyPokerRebuy(busted, 100);
assert.equal(funded.chips, 100);
assert.equal(funded.tableBuyInChips, 200, 'Rebuy is cost basis, never cash-out profit');
assert.equal(funded.rebuyPending, true);
assert.equal(canRebuyPoker('ended', funded), false, 'A funded seat cannot be funded again');
assert.equal(applyPokerRebuy({ chips: 0, eliminated: true }, 100).tableBuyInChips, undefined);
assert.equal(busted.chips, 0, 'Building a candidate snapshot must not mutate the live table before payment');
const migration = readFileSync(new URL('../supabase/20260907_poker_rebuy.sql', import.meta.url), 'utf8');
assert.match(migration, /casino_checkpoint_runtime\(p_table_id, p_state, 'active'\)/,
  'balance debit and funded runtime must commit in one database transaction');
assert.match(migration, /v_old_player[\s\S]*'chips'[\s\S]*<> 0/,
  'database must independently verify that the durable stack is empty');
assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/,
  'browser roles cannot invoke the server-authoritative rebuy function');
console.log('Poker rebuy rules passed.');
