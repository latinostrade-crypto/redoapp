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
}

export type BlackjackHandStatus = 'playing' | 'stood' | 'busted' | 'blackjack';

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
}

export type BlackjackStage = 'idle' | 'player_turn' | 'dealer_turn' | 'ended';

export interface BlackjackGameState {
  stage: BlackjackStage;
  pot: number;
  stake: number;
  mode: 'offline' | 'pvp' | 'private';
  player: BlackjackPlayer;
  dealer: BlackjackPlayer;
  winner: 'player' | 'dealer' | 'push' | null;
  winningHandDesc?: string;
  logs: { id: string; timestamp: string; message: string }[];
  isDealing?: boolean;
  turnTimeLeft?: number;
  turnDeadlineAt?: number | null;
  matchId?: string;
  roomCode?: string;
}
