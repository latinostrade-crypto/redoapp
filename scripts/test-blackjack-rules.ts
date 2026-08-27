import assert from 'node:assert/strict';
import { evaluateBlackjackHand } from '../src/utils/blackjackEvaluator';
import type { BlackjackCard } from '../src/types/blackjack';
import { calculatePokerCashoutReferralShares } from '../server/pokerCashout';

const card = (rank: number, suit: BlackjackCard['suit'] = 'spades'): BlackjackCard => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
  value: rank === 14 ? 11 : Math.min(rank, 10),
});

// Natural blackjack is restricted to exactly two cards.
assert.deepEqual(evaluateBlackjackHand([card(14), card(13)]), {
  score: 21, isSoft: true, isBusted: false, hasBlackjack: true,
});
assert.equal(evaluateBlackjackHand([card(14), card(5), card(5)]).hasBlackjack, false);

// Aces must be reduced one at a time and never leave a hand falsely busted.
assert.deepEqual(evaluateBlackjackHand([card(14), card(14), card(9)]), {
  score: 21, isSoft: true, isBusted: false, hasBlackjack: false,
});
assert.deepEqual(evaluateBlackjackHand([card(14), card(14), card(9), card(9)]), {
  score: 20, isSoft: false, isBusted: false, hasBlackjack: false,
});
assert.equal(evaluateBlackjackHand([card(10), card(9), card(5)]).isBusted, true);

// Cash-table referral math is game-agnostic: Blackjack takes 2%/1% only
// from realised profit, never from the player's original buy-in.
assert.deepEqual(calculatePokerCashoutReferralShares(100, [
  { userId: 'blackjack-l1', level: 1 },
  { userId: 'blackjack-l2', level: 2 },
]), [
  { userId: 'blackjack-l1', level: 1, amount: 2 },
  { userId: 'blackjack-l2', level: 2, amount: 1 },
]);
assert.deepEqual(calculatePokerCashoutReferralShares(0, [{ userId: 'blackjack-l1', level: 1 }]), []);

console.log('Blackjack rule checks passed.');
