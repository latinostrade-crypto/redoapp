/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlackjackCard, BlackjackSuit } from '../types/blackjack';

const SUITS: BlackjackSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function createShuffledBlackjackDeck(): BlackjackCard[] {
  const deck: BlackjackCard[] = [];

  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      let value = rank;
      if (rank > 10 && rank < 14) value = 10; // J, Q, K are worth 10
      if (rank === 14) value = 11; // Ace worth 11 initially

      deck.push({
        id: `${suit}_${rank}_${Math.random().toString(36).substring(2, 7)}`,
        suit,
        rank,
        value,
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

export function evaluateBlackjackHand(cards: BlackjackCard[]): {
  score: number;
  isSoft: boolean;
  isBusted: boolean;
  hasBlackjack: boolean;
} {
  let score = 0;
  let aces = 0;

  for (const card of cards) {
    score += card.value;
    if (card.rank === 14) {
      aces += 1;
    }
  }

  let isSoft = aces > 0 && score <= 21;

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  isSoft = aces > 0 && score <= 21;
  const isBusted = score > 21;
  const hasBlackjack = cards.length === 2 && score === 21;

  return {
    score,
    isSoft,
    isBusted,
    hasBlackjack,
  };
}
