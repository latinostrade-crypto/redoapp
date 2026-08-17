/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AvatarId } from '../types';

export type PokerSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

// 2-10, 11 (J), 12 (Q), 13 (K), 14 (A)
export type PokerRank = number;

export interface PokerCard {
  id: string;
  suit: PokerSuit;
  rank: PokerRank;
  hidden?: boolean;
}

export type PokerHandRankType =
  | 'high_card'
  | 'one_pair'
  | 'two_pair'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_of_a_kind'
  | 'straight_flush'
  | 'royal_flush';

export interface EvaluatedHand {
  rankType: PokerHandRankType;
  score: number; // Numerical score for sorting
  description: string;
  bestFive: PokerCard[];
}

export type PokerPlayerId = string;

export interface PokerPlayer {
  id: PokerPlayerId;
  userId?: string;
  name: string;
  avatar: AvatarId;
  chips: number;
  currentBet: number;
  totalMatchInvested: number;
  holeCards: PokerCard[];
  folded: boolean;
  isAllIn: boolean;
  isAi: boolean;
  lastAction?: string; // e.g. 'CHECK', 'CALL', 'RAISE 10', 'FOLD', 'ALL-IN'
  hasActedThisStage?: boolean;
  eliminated?: boolean;
  isConnected?: boolean;
  disconnectedAt?: number | null;
}

export type PokerStage =
  | 'idle'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'ended'
  | 'match_ended';

export interface PokerGameLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'bet' | 'fold' | 'deal' | 'win';
}

export interface PokerGameState {
  stage: PokerStage;
  pot: number;
  currentBet: number; // Minimum bet amount required to call in current betting round
  minRaise: number;
  communityCards: PokerCard[];
  players: PokerPlayer[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  currentPlayerIndex: number;
  smallBlindAmount: number;
  bigBlindAmount: number;
  winnerIds: PokerPlayerId[];
  winningCardIds?: string[];
  winningHandDesc?: string;
  isMatchOver?: boolean;
  matchWinnerName?: string;
  winningPayout?: number;
  logs: PokerGameLog[];
  roundEndTimestamp?: number | null;
  nextRoundStartsAt?: number | null;
  turnStartedAt?: number;
  turnTimeLeft?: number;
  turnTimeoutSec?: number;
  stake: number;
  mode: 'offline' | 'pvp' | 'private';
  isDealing?: boolean;
  matchId?: string;
  roomCode?: string;
  waitingForPlayers?: boolean;
  connectionDeadlineAt?: number | null;
}
