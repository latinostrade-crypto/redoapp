import assert from 'node:assert/strict';
import { PokerEngine, type ServerPokerPlayer } from '../server/pokerEngine';

function player(userId: string, chips: number, currentBet = 0): ServerPokerPlayer {
  return {
    userId,
    username: userId,
    avatarId: 'rabbit',
    chips,
    currentBet,
    totalMatchInvested: currentBet,
    holeCards: [],
    folded: false,
    isAllIn: false,
    hasActedThisStage: false,
    eliminated: false,
    isConnected: true,
  };
}

// Regression: in heads-up, an all-in followed by the opponent folding must
// award the complete pot immediately. It must not leave a folded seat as the
// current player or wait for another betting action.
{
  const engine = new PokerEngine('all-in-fold', 1, 2);
  engine.state.stage = 'preflop';
  engine.state.players = [player('hero', 98, 2), player('bot', 98, 2)];
  engine.state.currentPlayerIndex = 0;
  engine.state.currentBet = 100;
  engine.state.pot = 4;

  assert.equal(engine.handleAction('hero', 'call'), true);
  assert.equal(engine.state.players[0].isAllIn, true);
  assert.equal(engine.state.pot, 102);
  assert.equal(engine.state.currentPlayerIndex, 1);

  assert.equal(engine.handleAction('bot', 'fold'), true);
  assert.equal(engine.state.stage, 'ended');
  assert.deepEqual(engine.state.winnerUserIds, ['hero']);
  assert.equal(engine.state.players[0].chips, 102);
  assert.equal(engine.state.players[1].folded, true);
}

// A short all-in call stays eligible for showdown and never becomes folded.
{
  const engine = new PokerEngine('short-call', 1, 2);
  engine.state.stage = 'preflop';
  engine.state.players = [player('short', 20), player('cover', 100, 40)];
  engine.state.currentPlayerIndex = 0;
  engine.state.currentBet = 40;
  engine.state.pot = 40;
  engine.state.deck = Array.from({ length: 9 }, (_, index) => ({ id: `d${index}`, suit: 'spades' as const, rank: 2 + index }));
  engine.state.players[0].holeCards = [{ id: 'h1', suit: 'hearts', rank: 14 }, { id: 'h2', suit: 'clubs', rank: 14 }];
  engine.state.players[1].holeCards = [{ id: 'c1', suit: 'hearts', rank: 13 }, { id: 'c2', suit: 'clubs', rank: 13 }];

  assert.equal(engine.handleAction('short', 'call'), true);
  assert.equal(engine.state.players[0].isAllIn, true);
  assert.equal(engine.state.players[0].folded, false);
}

console.log('Poker all-in regressions passed.');
