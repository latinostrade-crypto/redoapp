import assert from 'node:assert/strict';
import { calculatePokerCashoutReferralShares } from '../server/pokerCashout';

assert.deepEqual(calculatePokerCashoutReferralShares(0, [
  { userId: 'l1', level: 1 },
]), [], 'a break-even or losing cash-out cannot create a referral share');

assert.deepEqual(calculatePokerCashoutReferralShares(100, [
  { userId: 'l1', level: 1 },
  { userId: 'l2', level: 2 },
]), [
  { userId: 'l1', level: 1, amount: 2 },
  { userId: 'l2', level: 2, amount: 1 },
], 'cash poker pays 2% to L1 and 1% to L2 from realised profit');

assert.deepEqual(calculatePokerCashoutReferralShares(49, [
  { userId: 'l1', level: 1 },
  { userId: 'l2', level: 2 },
]), [], 'fractional chip rewards are rounded down rather than minted');

assert.deepEqual(calculatePokerCashoutReferralShares(10_000, [
  { userId: 'same-user', level: 1 },
  { userId: 'same-user', level: 2 },
  { userId: 'another-l1', level: 1 },
]), [
  { userId: 'same-user', level: 1, amount: 200 },
], 'a malformed graph cannot pay one account twice or duplicate a level');

const shares = calculatePokerCashoutReferralShares(123, [
  { userId: 'l1', level: 1 },
  { userId: 'l2', level: 2 },
]);
assert.ok(shares.reduce((total, share) => total + share.amount, 0) <= 123,
  'total referral shares can never exceed the realised profit');

console.log('Poker cash-out referral checks passed.');
