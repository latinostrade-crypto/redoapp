import assert from 'node:assert/strict';
import { PokerEngine } from '../server/pokerEngine';

function createLiveEngine(id: string) {
  const engine = new PokerEngine(id, 1, 2);
  engine.addPlayer(`${id}-one`, 'One', 'cat', 100);
  engine.addPlayer(`${id}-two`, 'Two', 'fox', 100);
  assert.equal(engine.startHand(), true, 'test fixture must start a hand');
  return engine;
}

// A disconnected/folded seat can already be present when the final seated
// player presses Leave. This was the production Render crash path: showdown
// received no active hands and dereferenced active[0].
const lastPlayerLeaves = createLiveEngine('last-player-leaves');
const disconnected = lastPlayerLeaves.state.players.find((player) => player.userId === 'last-player-leaves-one')!;
disconnected.folded = true;
disconnected.eliminated = true;
disconnected.isConnected = false;
const remaining = lastPlayerLeaves.state.players.find((player) => player.userId === 'last-player-leaves-two')!;
lastPlayerLeaves.state.currentPlayerIndex = lastPlayerLeaves.state.players.indexOf(remaining);
assert.doesNotThrow(() => lastPlayerLeaves.removePlayer(remaining.userId));
assert.equal(lastPlayerLeaves.state.stage, 'ended');
assert.deepEqual(lastPlayerLeaves.state.winnerUserIds, []);
assert.equal(lastPlayerLeaves.state.pot, 0);

// The engine must also tolerate a recovered stale state where every player
// is folded before its turn-recovery ticker advances the hand.
const allFoldedRecovery = createLiveEngine('all-folded-recovery');
allFoldedRecovery.state.players.forEach((player) => {
  player.folded = true;
  player.eliminated = true;
  player.isConnected = false;
});
assert.doesNotThrow(() => allFoldedRecovery.advanceTurn());
assert.equal(allFoldedRecovery.state.stage, 'ended');
assert.equal(allFoldedRecovery.state.pot, 0);

console.log('Poker engine resilience checks passed.');
