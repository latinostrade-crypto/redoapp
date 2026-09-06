import assert from 'node:assert/strict';
import { ChipTimeline, decomposeChips, type ChipSnapshot } from '../src/components/poker/chips/chipModel';
import { settlePracticeChips } from '../src/utils/pokerChipSettlement';
import type { PokerPlayer, PokerGameState } from '../src/types/poker';
import { getPokerHandWinners, getResultHoleCards } from '../src/components/poker/handResult';
import { PokerEngine } from '../server/pokerEngine';

for (const amount of [0, 1, 4, 5, 24, 25, 99, 100, 456, 9999, 987654]) {
  const piles = decomposeChips(amount);
  assert.equal(piles.reduce((s, p) => s + p.count * p.denomination, 0), amount);
  assert.ok(piles.length <= 7 && piles.every(p => p.columns <= 3 && p.layers <= 5));
}
const resultState = {
  players: [{ id: 'folded', folded: true }, { id: 'winner', folded: false }, { id: 'return', folded: false }],
  winnerIds: ['folded'],
  chipAwards: [{ playerId: 'winner', amount: 150, kind: 'win', potIndex: 0 }, { playerId: 'winner', amount: 50, kind: 'win', potIndex: 1 }, { playerId: 'return', amount: 20, kind: 'return', potIndex: 2 }],
} as PokerGameState;
assert.deepEqual(getPokerHandWinners(resultState).map(w => [w.player.id, w.amount]), [['winner', 200]], 'winner comes from actual awards, never seat order or uncalled returns');
assert.deepEqual(getPokerHandWinners({ ...resultState, chipAwards: undefined }), [], 'a folded legacy winner must not be announced');
assert.deepEqual(getPokerHandWinners({ ...resultState, chipAwards: undefined, winnerIds: ['winner','return'] }).map(w => w.player.id), ['winner','return'], 'legacy split winners all remain visible');
const knownHand = [{ id: 'q', rank: 12, suit: 'clubs' }, { id: 't', rank: 10, suit: 'hearts' }] as PokerPlayer['holeCards'];
const resultPlayer = { id: 'opponent', holeCards: knownHand, folded: false } as PokerPlayer;
const finishedState = { ...resultState, stage: 'ended', mode: 'offline' } as PokerGameState;
assert.deepEqual(getResultHoleCards(finishedState, { ...resultPlayer, folded: true }), knownHand, 'practice results show known folded cards');
const remoteResult = { ...finishedState, mode: 'pvp' } as PokerGameState;
assert.deepEqual(getResultHoleCards(remoteResult, resultPlayer), knownHand, 'showdown cards are visible');
for (const privateHand of [{ folded: true }, { mucked: true }]) {
  assert.deepEqual(getResultHoleCards(remoteResult, { ...resultPlayer, ...privateHand }), [undefined, undefined], 'remote private cards stay hidden');
}
assert.deepEqual(getResultHoleCards(remoteResult, { ...resultPlayer, folded: true, hasShownCards: true }), knownHand, 'explicitly revealed cards are visible');
assert.deepEqual(getResultHoleCards(remoteResult, { ...resultPlayer, id: 'player', folded: true }), knownHand, 'own folded cards remain visible');
assert.deepEqual(getResultHoleCards(remoteResult, { ...resultPlayer, holeCards: [] }), [undefined, undefined], 'unknown cards use two backs');
assert.deepEqual(getResultHoleCards(remoteResult, { ...resultPlayer, holeCards: knownHand.map(c => ({ ...c, hidden: true })) }), [undefined, undefined], 'hidden server placeholders must never reveal rank or suit');
assert.deepEqual(getResultHoleCards({ ...finishedState, stage: 'flop' }, resultPlayer), [undefined, undefined], 'result helper never reveals a live hand');
console.log('PASS result cards: practice, showdown, folded/mucked privacy, own hand, hidden placeholders');
const snapshot = (overrides: Partial<ChipSnapshot> = {}): ChipSnapshot => ({
  hand: 'h1', version: 1, pot: 0, ended: false, pots: [],
  players: [{ id: 'a', chips: 100, invested: 0 }, { id: 'b', chips: 100, invested: 0 }], ...overrides,
});
const timeline = new ChipTimeline();
timeline.sync(snapshot(), 0);
const bet = snapshot({ version: 2, pot: 10, players: [{ id: 'a', chips: 90, invested: 10 }, { id: 'b', chips: 100, invested: 0 }] });
timeline.sync(bet, 100);
assert.equal(timeline.view(100).pots[0], 0);
assert.equal(timeline.view(100).flights[0].amount, 10);
timeline.sync(bet, 150); // duplicate SSE/poll
timeline.sync(snapshot(), 180); // stale response
assert.equal(timeline.flights.length, 1);
assert.equal(timeline.view(921).pots[0], 10);
// Street reset doesn't matter: cumulative investment remains monotonic.
timeline.sync({ ...bet, version: 3 }, 1000);
assert.equal(timeline.flights.length, 1);
const raised = { ...bet, version: 4, pot: 25, players: [{ id: 'a', chips: 75, invested: 25 }, bet.players[1]] };
timeline.sync(raised, 1200);
assert.equal(timeline.flights.at(-1)!.amount, 15);
assert.equal(timeline.view(1200).pots[0], 10);
timeline.sync({ ...raised, version: 5, ended: true, players: [{ id: 'a', chips: 100, invested: 25 }, bet.players[1]], awards: [{ playerId: 'a', amount: 25, potIndex: 0, kind: 'win' }] }, 1250);
const award = timeline.flights.find(f => f.kind === 'win')!;
assert.ok(award.start > timeline.flights.filter(f => f.kind === 'bet').at(-1)!.end);
assert.equal(timeline.view(award.start).pots[0], 0);
assert.equal(timeline.view(award.start).balances.a, 75);
assert.equal(timeline.view(award.arrival).balances.a, 100);
timeline.sync(snapshot({ hand: 'h2', version: 6 }), award.start + 1);
assert.equal(timeline.snapshot!.hand, 'h1');
timeline.view(award.end + 1);
assert.equal(timeline.snapshot!.hand, 'h2');

for (const reduced of [false, true]) {
  const recovered = new ChipTimeline();
  recovered.sync(snapshot({ ended: true, pot: 100, awards: [{ playerId: 'a', amount: 100, potIndex: 0, kind: 'win' }] }), 1000, reduced);
  assert.equal(recovered.view(1000).pots[0], 0);
  assert.equal(recovered.view(1000).flights.length, 0);
}
const quiet = new ChipTimeline();
quiet.sync(snapshot(), 0);
quiet.sync(bet, 20000); // a long think is NOT a reconnect
assert.equal(quiet.view(20000).flights.length, 1);
quiet.sync({ ...bet, resync: true }, 20100);
assert.equal(quiet.view(20100).flights.length, 0);
assert.equal(quiet.view(20100).pots[0], 10);

const players = [50, 100, 150].map((invested, i) => ({ id: String(i), totalMatchInvested: invested, chips: 0, folded: false, eliminated: false })) as PokerPlayer[];
const settled = settlePracticeChips(players, new Map([['0', 10], ['1', 5], ['2', 5]]), 0);
assert.deepEqual(settled.sidePots.map(p => p.amount), [150, 100, 50]);
assert.deepEqual(settled.players.map(p => p.chips), [150, 50, 100]);
assert.equal(settled.chipAwards.at(-1)!.kind, 'return');
assert.equal(settled.chipAwards.reduce((s, a) => s + a.amount, 0), 300);
const splitTimeline = new ChipTimeline();
splitTimeline.sync(snapshot({ players: players.map(p => ({ id: p.id, invested: p.totalMatchInvested, chips: 0 })), pot: 300 }), 0);
splitTimeline.sync(snapshot({ version: 2, ended: true, pot: 300, pots: [150, 100, 50], awards: settled.chipAwards, players: settled.players.map(p => ({ id: p.id, invested: p.totalMatchInvested, chips: p.chips })) }), 10);
for (let t = 10; t < 1500; t += 10) {
  const view = splitTimeline.view(t);
  const transit = splitTimeline.flights.filter(f => f.kind !== 'bet' && t >= f.start && t < f.arrival).reduce((s, f) => s + f.amount, 0);
  assert.equal(view.pots.reduce((s, n) => s + n, 0) + Object.values(view.balances).reduce((s, n) => s + n, 0) + transit, 300);
}
console.log('PASS chip denominations, delta/duplicate/stale/street handling, quiet turn, reconnect, payout conservation, side pots, return, reduced motion, next-hand queue');

const engine = new PokerEngine('chip-settlement-test', 1, 2);
[50, 100, 150, 1].forEach((invested, i) => {
  engine.addPlayer(`u${i}`, `P${i}`, 'rabbit', invested);
  Object.assign(engine.state.players[i], { chips: 0, totalMatchInvested: invested, currentBet: invested, isAllIn: true, folded: i === 3,
    holeCards: [{ id: `a${i}`, rank: 2 + i, suit: 'hearts' }, { id: `b${i}`, rank: 2 + i, suit: 'clubs' }] });
});
engine.state.communityCards = [10, 11, 12, 13, 14].map(rank => ({ id: `board${rank}`, rank, suit: 'spades' }));
engine.state.pot = 301;
engine.state.stage = 'river';
engine.doShowdown();
assert.equal(engine.state.stage, 'ended');
assert.deepEqual(engine.state.players.map(p => p.chips), [51, 100, 150, 0]);
assert.equal(engine.state.chipAwards!.reduce((s, a) => s + a.amount, 0), 301);
assert.equal(engine.state.chipAwards!.filter(a => a.kind === 'return').reduce((s, a) => s + a.amount, 0), 50);
assert.ok(engine.startHand());
assert.deepEqual(engine.state.chipAwards, []);
assert.deepEqual(engine.state.sidePots, []);
console.log('PASS engine split/odd-chip conservation, precise transfers and new-hand reset');
