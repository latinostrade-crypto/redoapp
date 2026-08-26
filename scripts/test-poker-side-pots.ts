import assert from 'node:assert/strict';
import { buildPokerSidePots, calculatePokerPotAwards } from '../server/pokerPots';

const player = (userId: string, totalMatchInvested: number, folded = false) => ({
  userId,
  totalMatchInvested,
  folded,
  eliminated: false,
});

// Three stacks: 20 x 3 main pot, then 30 x 2 and an uncontested 50-chip
// excess that must return to the lone deepest stack at showdown.
assert.deepEqual(buildPokerSidePots([
  player('short', 20),
  player('middle', 50),
  player('deep', 100),
]), [
  { amount: 60, eligibleUserIds: ['short', 'middle', 'deep'] },
  { amount: 60, eligibleUserIds: ['middle', 'deep'] },
  { amount: 50, eligibleUserIds: ['deep'] },
]);

// A folded player continues funding both pots but can win neither one.
assert.deepEqual(buildPokerSidePots([
  player('folded', 40, true),
  player('short', 20),
  player('deep', 40),
]), [
  { amount: 60, eligibleUserIds: ['short', 'deep'] },
  { amount: 40, eligibleUserIds: ['deep'] },
]);

assert.deepEqual(buildPokerSidePots([player('zero', 0), player('only', 17)]), [
  { amount: 17, eligibleUserIds: ['only'] },
]);

const oddSplit = calculatePokerPotAwards(
  { amount: 5, eligibleUserIds: ['one', 'two', 'three'] },
  [
    { userId: 'one', handScore: 10, seatIndex: 0 },
    { userId: 'two', handScore: 20, seatIndex: 1 },
    { userId: 'three', handScore: 20, seatIndex: 2 },
  ],
  0,
  3,
);
assert.deepEqual(oddSplit.winnerUserIds, ['two', 'three']);
assert.equal(oddSplit.awards.get('two'), 3, 'first winner left of dealer receives the odd chip');
assert.equal(oddSplit.awards.get('three'), 2);

console.log('Poker side-pot calculation checks passed.');
