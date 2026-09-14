import React from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n/registerGame';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { PokerGame } from '../components/PokerGame';
import type { PokerGameState } from '../types/poker';
import '../index.css';

// Real result dialog + simultaneous rebuy/result footer, matching a lost practice match.
const state: PokerGameState = {
  visualEpoch: 1, mode: 'offline', stage: 'match_ended', isMatchOver: true,
  pot: 0, currentBet: 0, minRaise: 6, stake: 0, dealerIndex: 0, smallBlindIndex: 1, bigBlindIndex: 2,
  currentPlayerIndex: 1, smallBlindAmount: 3, bigBlindAmount: 6, winnerIds: ['bot-1'], logs: [],
  communityCards: [10, 2, 11, 3, 13].map((rank, i) => ({ id: `board-${i}`, rank, suit: 'hearts' })),
  players: ['You', 'Bear Ace', 'Fox River', 'Panda Pot'].map((name, i) => ({
    id: i === 0 ? 'player' : `bot-${i}`, name, avatar: 'panda', chips: i === 0 ? 0 : 100,
    currentBet: 0, totalMatchInvested: 0, holeCards: [{ id: `${i}-a`, rank: 14, suit: 'spades' }, { id: `${i}-k`, rank: 13, suit: 'clubs' }],
    folded: false, isAllIn: false, isAi: i > 0, eliminated: i === 0,
  })),
};
const noop = () => {};
createRoot(document.getElementById('root')!).render(<LanguageProvider><PokerGame gameState={state}
  onFold={noop} onCallOrCheck={noop} onRaise={noop} onPracticeRebuy={noop} onReturnToLobby={noop} /></LanguageProvider>);
