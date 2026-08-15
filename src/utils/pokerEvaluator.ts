/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvaluatedHand, PokerCard, PokerHandRankType, PokerSuit } from '../types/poker';

const RANK_NAMES: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};

const SUIT_SYMBOLS: Record<PokerSuit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

/**
 * Generates combinations of k elements from array n
 */
function getCombinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (array.length === 0) return [];
  const head = array[0];
  const tail = array.slice(1);
  const withHead = getCombinations(tail, k - 1).map((comb) => [head, ...comb]);
  const withoutHead = getCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

/**
 * Evaluates a 5-card hand and returns its EvaluatedHand structure with score and description
 */
export function evaluate5CardHand(cards: PokerCard[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error('evaluate5CardHand requires exactly 5 cards');
  }

  // Sort descending by rank
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);

  // Group by suit
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  // Check straight (including A-2-3-4-5 wheel straight)
  let isStraight = false;
  let straightHighRank = 0;

  const ranks = sorted.map((c) => c.rank);
  if (
    ranks[0] - ranks[4] === 4 &&
    new Set(ranks).size === 5
  ) {
    isStraight = true;
    straightHighRank = ranks[0];
  } else if (
    ranks[0] === 14 &&
    ranks[1] === 5 &&
    ranks[2] === 4 &&
    ranks[3] === 3 &&
    ranks[4] === 2
  ) {
    isStraight = true;
    straightHighRank = 5; // 5-high straight
  }

  // Group counts by rank
  const rankCounts: Record<number, number> = {};
  for (const c of sorted) {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  }

  const countEntries = Object.entries(rankCounts)
    .map(([rankStr, count]) => ({ rank: Number(rankStr), count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.rank - a.rank;
    });

  // Royal Flush / Straight Flush
  if (isFlush && isStraight) {
    if (straightHighRank === 14) {
      return {
        rankType: 'royal_flush',
        score: 900_000_000,
        description: `Royal Flush of ${SUIT_SYMBOLS[sorted[0].suit]}`,
        bestFive: sorted,
      };
    }
    return {
      rankType: 'straight_flush',
      score: 800_000_000 + straightHighRank,
      description: `Straight Flush, ${RANK_NAMES[straightHighRank]}-High`,
      bestFive: sorted,
    };
  }

  // Four of a Kind
  if (countEntries[0].count === 4) {
    const quadRank = countEntries[0].rank;
    const kicker = countEntries[1].rank;
    const score = 700_000_000 + quadRank * 15 + kicker;
    return {
      rankType: 'four_of_a_kind',
      score,
      description: `Four of a Kind, ${RANK_NAMES[quadRank]}s`,
      bestFive: sorted,
    };
  }

  // Full House
  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    const tripRank = countEntries[0].rank;
    const pairRank = countEntries[1].rank;
    const score = 600_000_000 + tripRank * 15 + pairRank;
    return {
      rankType: 'full_house',
      score,
      description: `Full House, ${RANK_NAMES[tripRank]}s full of ${RANK_NAMES[pairRank]}s`,
      bestFive: sorted,
    };
  }

  // Flush
  if (isFlush) {
    let score = 500_000_000;
    for (let i = 0; i < 5; i++) {
      score += sorted[i].rank * Math.pow(15, 4 - i);
    }
    return {
      rankType: 'flush',
      score,
      description: `Flush, ${RANK_NAMES[sorted[0].rank]}-High`,
      bestFive: sorted,
    };
  }

  // Straight
  if (isStraight) {
    return {
      rankType: 'straight',
      score: 400_000_000 + straightHighRank,
      description: `Straight, ${RANK_NAMES[straightHighRank]}-High`,
      bestFive: sorted,
    };
  }

  // Three of a Kind
  if (countEntries[0].count === 3) {
    const tripRank = countEntries[0].rank;
    const k1 = countEntries[1].rank;
    const k2 = countEntries[2].rank;
    const score = 300_000_000 + tripRank * 15 * 15 + k1 * 15 + k2;
    return {
      rankType: 'three_of_a_kind',
      score,
      description: `Three of a Kind, ${RANK_NAMES[tripRank]}s`,
      bestFive: sorted,
    };
  }

  // Two Pair
  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const p1 = countEntries[0].rank;
    const p2 = countEntries[1].rank;
    const k = countEntries[2].rank;
    const score = 200_000_000 + p1 * 15 * 15 + p2 * 15 + k;
    return {
      rankType: 'two_pair',
      score,
      description: `Two Pair, ${RANK_NAMES[p1]}s and ${RANK_NAMES[p2]}s`,
      bestFive: sorted,
    };
  }

  // One Pair
  if (countEntries[0].count === 2) {
    const p = countEntries[0].rank;
    const k1 = countEntries[1].rank;
    const k2 = countEntries[2].rank;
    const k3 = countEntries[3].rank;
    const score = 100_000_000 + p * 15 * 15 * 15 + k1 * 15 * 15 + k2 * 15 + k3;
    return {
      rankType: 'one_pair',
      score,
      description: `Pair of ${RANK_NAMES[p]}s`,
      bestFive: sorted,
    };
  }

  // High Card
  let score = 0;
  for (let i = 0; i < 5; i++) {
    score += sorted[i].rank * Math.pow(15, 4 - i);
  }
  return {
    rankType: 'high_card',
    score,
    description: `High Card, ${RANK_NAMES[sorted[0].rank]}`,
    bestFive: sorted,
  };
}

/**
 * Evaluates the best 5-card hand out of any available cards (up to 7: 2 hole cards + community cards)
 */
export function evaluate7CardHand(cards: PokerCard[]): EvaluatedHand {
  if (cards.length < 5) {
    // Fallback for empty/short community cards
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    return {
      rankType: 'high_card',
      score: sorted[0]?.rank || 0,
      description: sorted[0] ? `High Card ${RANK_NAMES[sorted[0].rank]}` : 'High Card',
      bestFive: sorted,
    };
  }

  const combinations = getCombinations(cards, 5);
  let bestHand: EvaluatedHand | null = null;

  for (const comb of combinations) {
    const evaluated = evaluate5CardHand(comb);
    if (!bestHand || evaluated.score > bestHand.score) {
      bestHand = evaluated;
    }
  }

  return bestHand!;
}

/**
 * Utility to generate a standard shuffled 52-card deck
 */
export function createShuffledPokerDeck(): PokerCard[] {
  const suits: PokerSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const deck: PokerCard[] = [];

  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({
        id: `${suit}_${rank}`,
        suit,
        rank,
      });
    }
  }

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}
