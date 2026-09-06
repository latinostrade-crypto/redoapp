import assert from 'node:assert/strict';
import { canQueuePokerPreCheck, resolvePokerPreAction } from '../src/components/poker/preActions';

const base = {
  canRemainQueued: true,
  isHumanTurn: false,
  canAct: false,
  callNeeded: 0,
};

assert.equal(resolvePokerPreAction({ ...base, queued: null }), 'none');
assert.equal(resolvePokerPreAction({ ...base, queued: 'fold' }), 'wait');
assert.equal(resolvePokerPreAction({ ...base, queued: 'check' }), 'wait');
assert.equal(resolvePokerPreAction({ ...base, queued: 'fold', canRemainQueued: false }), 'cancel');
assert.equal(resolvePokerPreAction({ ...base, queued: 'fold', isHumanTurn: true, canAct: true }), 'fold');
assert.equal(resolvePokerPreAction({ ...base, queued: 'check', isHumanTurn: true, canAct: true }), 'check');
assert.equal(resolvePokerPreAction({ ...base, queued: 'check', isHumanTurn: true, canAct: true, callNeeded: 20 }), 'cancel');
assert.equal(resolvePokerPreAction({ ...base, queued: 'check', isHumanTurn: true, canAct: false }), 'cancel');
assert.equal(canQueuePokerPreCheck(0), true, 'pre-check can be armed only while no bet is owed');
assert.equal(canQueuePokerPreCheck(1), false, 'pre-check must be locked when a bet already exists');
assert.equal(canQueuePokerPreCheck(Number.NaN), false, 'invalid bet state must fail closed');

console.log('Poker pre-action contract passed.');
