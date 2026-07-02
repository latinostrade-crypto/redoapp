/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CardColor = 'red' | 'blue' | 'yellow' | 'green' | 'wild';


export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild_draw4';

export interface UnoCardType {
  id: string;
  color: CardColor;
  value: CardValue;
  // Score value when counting hand points at game end
  score: number;
}

export type PlayerId = 'player' | 'ai1' | 'ai2' | 'ai3';

export type AvatarId = 'bear' | 'fox' | 'rabbit' | 'panda' | 'cat' | 'koala';

export interface Player {
  id: PlayerId;
  name: string;
  avatar: AvatarId;
  hand: UnoCardType[];
  isAi: boolean;
  unoDeclared: boolean;
  // Emotion indicator to make the game hilarious and cartoonish!
  emotion: 'happy' | 'thinking' | 'worried' | 'angry' | 'celebrating';
  activeBubble?: string;
}

export type GamePhase = 'setup' | 'playing' | 'choosing_color' | 'game_over';

export interface GameLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'play' | 'draw' | 'uno' | 'action' | 'win';
}

export interface GameState {
  deck: UnoCardType[];
  discardPile: UnoCardType[];
  players: Player[];
  currentPlayerIndex: number;
  direction: 1 | -1; // 1 is clockwise (increasing index), -1 is counter-clockwise
  activeColor: CardColor; // Keeps track of active color, handles wild choices as well
  activeValue: CardValue;
  phase: GamePhase;
  winnerId: PlayerId | null;
  logs: GameLog[];
  drawCountAccumulator: number; // For stacking draw cards (+2 or +4 stacking if selected in options, or direct count)
  unoShoutCooldown: { [key in PlayerId]?: number }; // Timestamp tracking for UNO accusations
  dealerId: PlayerId;
  consecutiveDraws: number; // Tracks draws in current turn
  accusablePlayers: PlayerId[]; // Players with 1 card who haven't declared UNO and can be caught
}

export interface GameStats {
  gamesPlayed: number;
  gamesWon: number;
  cardsPlayedCount: number;
  xp: number; // Persisted experience points
  practiceGamesPlayed: number;
  practiceGamesWon: number;
  realPvpGamesPlayed: number;
  realPvpGamesWon: number;
  privateGamesPlayed: number;
  privateGamesWon: number;
  practiceXp: number;
  realPvpXp: number;
  privateXp: number;
}

export interface LeaderboardEntry {
  playerId: PlayerId;
  name: string;
  avatar: AvatarId;
  points: number; // Sum of card score values (winner gets 0 points)
  rank: number; // Rank 1 (winner), then 2, 3, 4 based on ascending points
  xpGained: number; // XP gained from this match
  isWinner: boolean;
  ticketsGained?: number; // Tickets gained/lost from this match
}
