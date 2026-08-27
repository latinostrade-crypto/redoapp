/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AvatarId } from '../types';

export type BlackjackSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type BlackjackRank = number; // 2-10, 11 (J), 12 (Q), 13 (K), 14 (A)

export interface BlackjackCard {
  id: string;
  suit: BlackjackSuit;
  rank: BlackjackRank;
  value: number; // 2-10, Face cards=10, Ace=11 or 1
  hidden?: boolean;
}

export type BlackjackHandStatus = 'playing' | 'stood' | 'busted' | 'blackjack' | 'surrendered';

export interface BlackjackPlayer {
  id: string;
  name: string;
  avatar: AvatarId;
  chips: number;
  bet: number;
  cards: BlackjackCard[];
  score: number;
  isSoft: boolean;
  isBusted: boolean;
  hasBlackjack: boolean;
  status: BlackjackHandStatus;
  wins: number;
  
  isInsured?: boolean;
  insuranceBet?: number;
  surrendered?: boolean;
  
  hasSplit?: boolean;
  splitCards?: BlackjackCard[];
  splitBet?: number;
  splitScore?: number;
  splitIsSoft?: boolean;
  splitIsBusted?: boolean;
  splitHasBlackjack?: boolean;
  splitStatus?: BlackjackHandStatus;
  splitWins?: number;
  activeHand?: 1 | 2;

  isAi?: boolean;
  eliminated?: boolean;
  lastProfit?: number;
  chipBalance?: number;
}

export interface BlackjackTable {
  id: string;
  name: string;
  stake: number;
  playersCount: number;
  maxPlayers: number;
  type: 'public' | 'free' | 'practice';
}

export type BlackjackStage = 'idle' | 'betting' | 'player_turn' | 'dealer_turn' | 'round_ended' | 'match_ended';

export type BlackjackActionType = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance' | 'next_hand' | 'place_bet';

export interface BlackjackGameState {
  stage: BlackjackStage;
  pot: number;
  stake: number;
  mode: 'offline' | 'pvp' | 'private';
  currentPlayerIndex: number;
  players: BlackjackPlayer[];
  dealer: BlackjackPlayer;
  targetWins?: number;
  currentHand: number;
  maxHands: number;
  winner: string | null;
  roundWinnerUserId?: string | null;
  roundWinnerName?: string | null;
  nextRoundStartsAt?: number | null;
  matchChampion?: BlackjackPlayer | null;
  winningHandDesc?: string;
  winningPayout?: number;
  logs: { id: string; timestamp: string; message: string; type?: string }[];
  isDealing?: boolean;
  turnTimeLeft?: number;
  turnDeadlineAt?: number | null;
  turnStartedAt?: number;
  matchId?: string;
  tableId?: string;
  waitingForPlayers?: boolean;
  waitingForOpponent?: boolean;
  isPersistentTable?: boolean;
  connectionDeadlineAt?: number | null;
  stateVersion?: number;
}
