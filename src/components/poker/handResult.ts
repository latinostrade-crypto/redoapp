import type { PokerGameState } from '../../types/poker';

export function getResultHoleCards(state: PokerGameState, player: PokerGameState['players'][number]) {
  const finished = state.stage === 'ended' || state.stage === 'match_ended';
  const revealed = finished && !player.folded && !player.mucked
    && (state.mode === 'offline' || player.id === 'player' || player.hasShownCards);
  // Folded and mucked hands remain private in every mode, including practice.
  return [0, 1].map(index => {
    const card = player.holeCards[index];
    return revealed && card && !card.hidden ? card : undefined;
  });
}

/** Hand payouts, not remaining seat order or returned uncalled bets, identify winners. */
export function getPokerHandWinners(state: PokerGameState) {
  const awards = state.chipAwards?.filter(a => a.kind === 'win' && a.amount > 0) || [];
  const ids = state.chipAwards?.length
    ? [...new Set(awards.map(a => a.playerId))]
    : state.winnerIds.filter(id => state.players.some(p => p.id === id && !p.folded));
  return ids.flatMap(id => {
    const player = state.players.find(p => p.id === id);
    return player ? [{ player, amount: awards.length ? awards.filter(a => a.playerId === id).reduce((sum, a) => sum + a.amount, 0) : null }] : [];
  });
}
