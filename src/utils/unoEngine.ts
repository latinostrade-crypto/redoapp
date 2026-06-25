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

// Custom emoji and quotes dictionary based on characters for barks
export const CARTOON_BUBBLES = {
  bear: {
    thinking: ['MUNCH MUNCH... let me think! 🐻🍯', 'Which honey pot color should I play?', 'Bear-y interesting hand...'],
    playing: ['Take that! 🐾', 'Soft paws, strong plays! 🐻', 'BOOM! Played card! 🎉'],
    worried: ['Oh dear, my paws are sweating! 🍯', 'Uh oh, honey supply is low...', 'I hope you do not have wild card!'],
    angry: ['Hey! Stop skipping me! 😡🐻', 'GRRR! Who did that?', 'Are you playing tricks with me?'],
    celebrating: ['YAAY! Honey for everyone! 🍯✨', 'Un-bear-ably awesome turn!', 'Look at my one card! UNO!'],
  },
  fox: {
    thinking: ['Just plotting my next masterstroke... 🦊✨', 'A sneaky fox never reveals cards...', 'Hmm, calculations! 🧮'],
    playing: ['Sneak attack! 🦊💨', 'Outfoxed you! Haha!', 'WILD design! Let is swap!'],
    worried: ['Wait, that was not in my plans... 💀', 'Yikes! Am I cornered?', 'Don\'t play +4 please!'],
    angry: ['Hey! Sneaky is MY job! 🦊💢', 'Humph! Not fair!', 'I see what you are doing...'],
    celebrating: ['Fantastic! 🦊🎉', 'UNO! Simply too smart for you!', 'Foxy victory is near!'],
  },
  rabbit: {
    thinking: ['Hop hop, sorting my carrots! 🥕✨', 'So many colors, so little time!', 'Quick, bunny thoughts! 🐰'],
    playing: ['BOUNCY move! 🐰🌾', 'BAM! Chew on this!', 'Bunny power! 🥕'],
    worried: ['Oh my, ears shaking! 🐰💦', 'Don\'t scare me!', 'Aaaaah too many cards!'],
    angry: ['Stomping my foot! 🐰💢', 'Not cool, doc!', 'No skip, please!'],
    celebrating: ['Boing! Hop! UNO! 🐰🎉', 'Hoppiest day ever!', 'Carrot party tonight!'],
  },
  panda: {
    thinking: ['Zzz... Oh, my turn? 🐼🍃', 'Nibbling on fresh bamboo...', 'Is red or blue more relaxing?'],
    playing: ['Panda slap! 🐼🐼', 'Here we go, slowly but surely.', 'Bamboo roll-out!'],
    worried: ['Oh no, too exciting for panda...', 'My eyes are getting blacker.', 'Are those draw cards for me?'],
    angry: ['Disturbing my sleep? 🐼💢', 'Panda rage... activated.', 'Rude! Very rude!'],
    celebrating: ['UNO! Panda cuddle time! 🐼❤', 'Dreamy victory!', 'Let\'s roll around!'],
  }
};
