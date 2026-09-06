import { buildPokerSidePots, calculatePokerPotAwards, pokerPotTransferKind } from '../../server/pokerPots';
import type { PokerChipAward, PokerPlayer, PokerSidePot } from '../types/poker';

/** Practice uses the same integer pot allocation as the server. No wallet units. */
export function settlePracticeChips(players: PokerPlayer[], scores: Map<string, number>, dealerIndex: number) {
  const contributors = players.map(p => ({ ...p, userId: p.id, eliminated: Boolean(p.eliminated) }));
  const pots = buildPokerSidePots(contributors);
  const chipAwards: PokerChipAward[] = [];
  pots.forEach((pot, potIndex) => {
    const split = calculatePokerPotAwards(pot, players.filter(p => scores.has(p.id)).map((p) => ({
      userId: p.id, handScore: scores.get(p.id)!, seatIndex: players.indexOf(p),
    })), dealerIndex, players.length);
    split.awards.forEach((amount, playerId) => chipAwards.push({ playerId, amount, potIndex, kind: pokerPotTransferKind(contributors, potIndex) }));
  });
  const sidePots: PokerSidePot[] = pots.map(p => ({ amount: p.amount, eligiblePlayerIds: p.eligibleUserIds }));
  return {
    sidePots, chipAwards,
    winnerIds: [...new Set(chipAwards.filter(a => a.kind === 'win').map(a => a.playerId))],
    players: players.map(p => ({ ...p, chips: p.chips + chipAwards.filter(a => a.playerId === p.id).reduce((s, a) => s + a.amount, 0) })),
  };
}
