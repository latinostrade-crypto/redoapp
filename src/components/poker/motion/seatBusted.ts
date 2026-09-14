import type { PokerPlayer, PokerStage } from '../../../types/poker';

/** Zero during an all-in is not a loss: wait for authoritative settlement. */
export function isPokerSeatBusted(player: Pick<PokerPlayer, 'chips' | 'eliminated'>, stage: PokerStage, settled: boolean) {
  if (player.chips > 0) return false;
  if (stage === 'ended' || stage === 'match_ended') return settled;
  return Boolean(player.eliminated) || stage === 'idle';
}
