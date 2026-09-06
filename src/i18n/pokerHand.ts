import type { EvaluatedHand, PokerHandRankType } from '../types/poker';
import type { MessageKey, MessageValues } from './message';

const handKeys = {
  high_card: 'handHigh', one_pair: 'handPair', two_pair: 'handTwoPair',
  three_of_a_kind: 'handThree', straight: 'handStraight', flush: 'handFlush',
  full_house: 'handFull', four_of_a_kind: 'handFour',
  straight_flush: 'handStraightFlush', royal_flush: 'handRoyal',
} as const satisfies Record<PokerHandRankType, MessageKey>;
const rankLabel = (rank?: number) => rank === undefined ? '—' : ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rank] || String(rank));

/** Presentation only: never changes evaluator scores or authoritative game state. */
export function describePokerHand(hand: EvaluatedHand, translate: (id: MessageKey, values?: MessageValues) => string) {
  const counts = new Map<number, number>();
  hand.bestFive.forEach(card => counts.set(card.rank, (counts.get(card.rank) || 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ranks = [...counts.keys()].sort((a, b) => b - a);
  const straight = hand.rankType === 'straight' || hand.rankType === 'straight_flush';
  const high = straight && ranks.join(',') === '14,5,4,3,2' ? 5 : ranks[0];
  const grouped = ['one_pair', 'two_pair', 'three_of_a_kind', 'full_house', 'four_of_a_kind'].includes(hand.rankType);
  return translate(handKeys[hand.rankType], {
    rank: rankLabel(grouped ? groups[0]?.[0] : high),
    other: rankLabel(groups[1]?.[0]),
    suit: hand.bestFive[0] ? { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[hand.bestFive[0].suit] : '',
  });
}
