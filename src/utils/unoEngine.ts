/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CardColor, CardValue, UnoCardType, Player, PlayerId, GameLog } from '../types';

export const UNO_COLORS: CardColor[] = ['red', 'blue', 'yellow', 'green'];

export function generateDeck(): UnoCardType[] {
  const deck: UnoCardType[] = [];
  let idCounter = 0;

  // Colors: red, blue, yellow, green
  UNO_COLORS.forEach((color) => {
    // One '0' card per color
    deck.push({
      id: `card-${idCounter++}`,
      color,
      value: '0',
      score: 0,
    });

    // Two '1' through '9' per color
    for (let num = 1; num <= 9; num++) {
      const valStr = num.toString() as CardValue;
      deck.push({ id: `card-${idCounter++}`, color, value: valStr, score: num });
      deck.push({ id: `card-${idCounter++}`, color, value: valStr, score: num });
    }

    // Two of each action per color: skip, reverse, draw2
    const actions: CardValue[] = ['skip', 'reverse', 'draw2'];
    actions.forEach((act) => {
      deck.push({ id: `card-${idCounter++}`, color, value: act, score: 20 });
      deck.push({ id: `card-${idCounter++}`, color, value: act, score: 20 });
    });
  });

  // 4 Wild and 4 Wild Draw Four
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `card-${idCounter++}`,
      color: 'wild',
      value: 'wild',
      score: 50,
    });
    deck.push({
      id: `card-${idCounter++}`,
      color: 'wild',
      value: 'wild_draw4',
      score: 50,
    });
  }

  return deck;
}

export function shuffleDeck(cards: UnoCardType[]): UnoCardType[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function isValidMove(
  card: UnoCardType,
  activeColor: CardColor,
  activeValue: CardValue
): boolean {
  // Wilds can always be played
  if (card.color === 'wild') {
    return true;
  }
  // Matches color
  if (card.color === activeColor) {
    return true;
  }
  // Matches value
  if (card.value === activeValue) {
    return true;
  }
  return false;
}

// Selects the color the AI has the most of in their hand
export function getBestColorForAi(hand: UnoCardType[]): CardColor {
  const colorCounts: { [key in CardColor]?: number } = {
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
  };

  hand.forEach((card) => {
    if (card.color !== 'wild' && card.color in colorCounts) {
      colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
    }
  });

  let maxCount = -1;
  let bestColor: CardColor = 'red';

  UNO_COLORS.forEach((color) => {
    const c = colorCounts[color] || 0;
    if (c > maxCount) {
      maxCount = c;
      bestColor = color;
    }
  });

  return bestColor;
}

export function createLog(message: string, type: GameLog['type'] = 'info'): GameLog {
  const date = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: timeStr,
    message,
    type,
  };
}

// Custom surfer dialog dictionary based on character profiles
export const CARTOON_BUBBLES = {
  bear: {
    thinking: ['Evaluating the tides, let me think...', 'Which current color should I run?', 'A very strategic hand here.'],
    playing: ['Catch this ride!', 'Smooth carve, clean execute.', 'Card played successfully.'],
    worried: ['The tide is rising fast...', 'Water level getting tight...', 'Hope you do not hold a wild card.'],
    angry: ['Hey! Do not cut off my line!', 'Who triggered that wave?', 'Stop playing underhanded tactics.'],
    celebrating: ['Excellent ride for everyone!', 'Unmatched execution this round!', 'Down to my last card! UNO!'],
  },
  fox: {
    thinking: ['Drafting my tactical line...', 'A true pro rider never reveals their hand...', 'Calculating the next break.'],
    playing: ['Surprise maneuver!', 'Total wipeout for you!', 'Wild card color shift.'],
    worried: ['That was not in the weather report...', 'Am I getting caught in the reef?', 'Avoid playing a draw four.'],
    angry: ['Hey! Snatching waves is my thing!', 'Totally off limits!', 'I see your alignment.'],
    celebrating: ['Fantastic run!', 'UNO! Outriding the competition.', 'Surfer victory is within reach.'],
  },
  rabbit: {
    thinking: ['Sorting my board setups...', 'So many directions, so little time!', 'Quick, surfers decision!'],
    playing: ['Big launch!', 'Clean execution!', 'Maximum power.'],
    worried: ['My stance is getting shaky...', 'Do not pull me under!', 'Too many cards in hand.'],
    angry: ['Stomping the deck!', 'Not cool at all!', 'No skips on my turn.'],
    celebrating: ['Stoked! UNO!', 'Best surf day ever!', 'Celebration at the beach tonight.'],
  },
  panda: {
    thinking: ['Relaxing on the deck... Oh, my turn?', 'Watching the distant swells...', 'Is red or blue more optimal?'],
    playing: ['Heavy cutback!', 'Here we go, steady and smooth.', 'Rolling out the card.'],
    worried: ['Tension is building on the water...', 'Checking my exit route.', 'Are those penalty draws meant for me?'],
    angry: ['Ruining my session?', 'Surfer focus shattered.', 'Rude maneuver.'],
    celebrating: ['UNO! Back to the shore!', 'Perfect session win!', 'Chilling on the beach.']
  }
};

