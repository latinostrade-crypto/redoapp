import assert from 'node:assert/strict';
import { isPokerSeatBusted } from '../src/components/poker/motion/seatBusted';

for (const stage of ['preflop', 'flop', 'turn', 'river', 'showdown'] as const) {
  assert.equal(isPokerSeatBusted({ chips: 0 }, stage, true), false, `all-in at ${stage} must remain alive`);
}
assert.equal(isPokerSeatBusted({ chips: 0, eliminated: true }, 'ended', false), false, 'wait for visible settlement');
assert.equal(isPokerSeatBusted({ chips: 0 }, 'ended', true), true, 'busted before eliminated flag arrives');
assert.equal(isPokerSeatBusted({ chips: 0 }, 'match_ended', true), true);
assert.equal(isPokerSeatBusted({ chips: 120 }, 'ended', true), false, 'all-in winner survives');
assert.equal(isPokerSeatBusted({ chips: 0, eliminated: true }, 'preflop', true), true, 'bust persists next hand');
assert.equal(isPokerSeatBusted({ chips: 100, eliminated: true }, 'idle', true), false, 'rebuy removes marker even with stale eliminated flag');
console.log('PASS busted seat: all-in, settlement, elimination, winner, next hand and rebuy');
