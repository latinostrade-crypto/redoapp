/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  BlackjackCard,
  BlackjackGameState,
  BlackjackPlayer,
} from '../types/blackjack';
import { AvatarId } from '../types';
import {
  createShuffledBlackjackDeck,
  evaluateBlackjackHand,
} from '../utils/blackjackEvaluator';
import { sound } from '../utils/sound';
import { apiRequest, buildAuthenticatedUrl } from '../utils/api';

const STARTING_CHIPS = 100;
const DEFAULT_BET = 10;
const TURN_DURATION_SEC = 15;
const MAX_HANDS = 5;

const DEFAULT_BOTS: { name: string; avatar: AvatarId }[] = [
  { name: 'Koala Jack', avatar: 'koala' },
  { name: 'Panda Ace', avatar: 'panda' },
  { name: 'Fox River', avatar: 'fox' },
];

export function useBlackjackGame(options?: {
  onSettlement?: (payout: number, won: boolean, push: boolean) => void;
  onMatchCancelled?: () => void;
}) {
  const [selectedBet, setSelectedBet] = useState<number>(DEFAULT_BET);
  const [remoteMatchId, setRemoteMatchId] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem('redoapp_active_match');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.gameType === 'blackjack' && parsed.matchId) {
          return parsed.matchId;
        }
      }
    } catch {}
    return null;
  });

  const [gameState, setGameState] = useState<BlackjackGameState>(() => {
    const initialMode = remoteMatchId ? 'pvp' : 'offline';
    return {
      stage: remoteMatchId ? 'player_turn' : 'idle',
      pot: 0,
      stake: 0,
      mode: initialMode,
      currentPlayerIndex: 0,
      players: [],
      dealer: {
        id: 'dealer',
        name: 'Dealer (House)',
        avatar: 'bear',
        chips: 9999,
        bet: 0,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
        wins: 0,
      },
      currentHand: 1,
      maxHands: MAX_HANDS,
      winner: null,
      matchChampion: null,
      winningHandDesc: undefined,
      logs: [],
      isDealing: false,
      turnTimeLeft: TURN_DURATION_SEC,
      waitingForPlayers: Boolean(remoteMatchId),
      matchId: remoteMatchId || undefined,
    };
  });

  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_DURATION_SEC);
  const deckRef = useRef<BlackjackCard[]>([]);
  const dealingTimeoutsRef = useRef<number[]>([]);
  const isDealerDrawingRef = useRef<boolean>(false);
  const isProcessingAiTurnRef = useRef<boolean>(false);

  // Online Multiplayer state tracking
  const remoteMatchStreamRef = useRef<EventSource | null>(null);
  const settledRef = useRef<boolean>(false);

  const clearDealingTimeouts = () => {
    dealingTimeoutsRef.current.forEach((t) => clearTimeout(t));
    dealingTimeoutsRef.current = [];
  };

  /**
   * Sync authoritative state from backend in online mode
   */
  const syncRemoteMatchState = useCallback(async (matchIdToSync = remoteMatchId) => {
    if (!matchIdToSync) return;
    try {
      const result = await apiRequest<{ blackjackGameState?: BlackjackGameState; gameState?: BlackjackGameState }>(
        `/api/matches/state/${encodeURIComponent(matchIdToSync)}`,
        { retryOnNetworkError: true, networkAttempts: 2 }
      );
      const state = result.blackjackGameState || result.gameState;
      if (state) {
        setGameState(state);
        if (typeof state.turnTimeLeft === 'number') {
          setTurnTimeLeft(state.turnTimeLeft);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (msg.includes('404') || msg.includes('not found') || msg.includes('concluded') || msg.includes('cancelled')) {
        try { localStorage.removeItem('redoapp_active_match'); } catch {}
        setRemoteMatchId(null);
        if (options?.onMatchCancelled) {
          options.onMatchCancelled();
        }
      }
    }
  }, [remoteMatchId, options]);

  /**
   * Advance to the next player's turn or start Dealer turn if all finished (Offline Mode)
   */
  const advanceToNextTurn = useCallback((currentPlayers: BlackjackPlayer[], nextIndex: number) => {
    let nextIdx = nextIndex;
    while (nextIdx < currentPlayers.length && (currentPlayers[nextIdx].status !== 'playing' || currentPlayers[nextIdx].eliminated)) {
      nextIdx++;
    }

    if (nextIdx < currentPlayers.length) {
      setGameState((prev) => ({
        ...prev,
        players: currentPlayers,
        currentPlayerIndex: nextIdx,
        stage: 'player_turn',
        turnTimeLeft: TURN_DURATION_SEC,
      }));
      setTurnTimeLeft(TURN_DURATION_SEC);
    } else {
      // All players have taken their turns; Dealer now draws with paced animation!
      setGameState((prev) => ({
        ...prev,
        players: currentPlayers,
        stage: 'dealer_turn',
      }));
      setTimeout(() => runDealerDrawSequence(currentPlayers), 300);
    }
  }, []);

  /**
   * Dealer hit sequence when all players finish their turns (Offline Mode)
   */
  const runDealerDrawSequence = useCallback(
    (currentPlayers: BlackjackPlayer[]) => {
      if (isDealerDrawingRef.current) return;
      isDealerDrawingRef.current = true;

      setGameState((prev) => ({ ...prev, stage: 'dealer_turn', isDealing: true }));

      const deck = deckRef.current;
      let currentDealerCards = [...gameState.dealer.cards];
      let dealerEval = evaluateBlackjackHand(currentDealerCards);

      const drawNextDealerCard = () => {
        const activePlayers = currentPlayers.filter((p) => !p.eliminated);
        const anyPlayerStanding = activePlayers.some((p) => !p.isBusted);
        if (anyPlayerStanding && dealerEval.score < 17 && deck.length > 0) {
          const nextCard = deck.pop()!;
          currentDealerCards.push(nextCard);
          dealerEval = evaluateBlackjackHand(currentDealerCards);

          sound.playPop();
          setGameState((prev) => ({
            ...prev,
            dealer: {
              ...prev.dealer,
              cards: [...currentDealerCards],
              score: dealerEval.score,
              isSoft: dealerEval.isSoft,
              isBusted: dealerEval.isBusted,
            },
          }));

          const timer = window.setTimeout(drawNextDealerCard, 1000);
          dealingTimeoutsRef.current.push(timer);
        } else {
          isDealerDrawingRef.current = false;
          const updatedPlayers = currentPlayers.map((p) => {
            if (p.eliminated) return p;

            let wonRound = false;
            let finalChips = p.chips;
            let profit = 0;

            if (p.isBusted) {
              wonRound = false;
              profit = -p.bet;
            } else if (dealerEval.isBusted) {
              wonRound = true;
              profit = p.hasBlackjack ? Math.round(p.bet * 1.5) : p.bet;
              finalChips += (p.bet + profit);
            } else if (p.hasBlackjack && !dealerEval.hasBlackjack) {
              wonRound = true;
              profit = Math.round(p.bet * 1.5);
              finalChips += (p.bet + profit);
            } else if (p.score > dealerEval.score) {
              wonRound = true;
              profit = p.bet;
              finalChips += (p.bet + profit);
            } else if (p.score === dealerEval.score) {
              wonRound = false;
              profit = 0;
              finalChips += p.bet;
            } else {
              wonRound = false;
              profit = -p.bet;
            }

            const isOut = finalChips <= 0;
            return {
              ...p,
              chips: Math.max(0, finalChips),
              wins: wonRound ? p.wins + 1 : p.wins,
              status: p.isBusted ? ('busted' as const) : ('stood' as const),
              eliminated: isOut,
              lastProfit: profit,
            };
          });

          // Check if match is finished (Hand 5 or only 1 player remains)
          const survivors = updatedPlayers.filter((p) => !p.eliminated && p.chips > 0);
          const isMatchOver = survivors.length <= 1 || gameState.currentHand >= gameState.maxHands;

          // Find Chip Leader / Champion
          const sorted = [...updatedPlayers].sort((a, b) => (b.chips - a.chips) || (b.wins - a.wins));
          const champion = isMatchOver ? sorted[0] : null;

          let winningHandDesc = '';
          if (champion) {
            winningHandDesc = `🏆 ${champion.name.toUpperCase()} WINS WITH ${champion.chips} CHIPS!`;
          } else if (dealerEval.isBusted) {
            winningHandDesc = `DEALER BUSTED (${dealerEval.score})! Standing players win chips!`;
          } else {
            winningHandDesc = `Dealer score: ${dealerEval.score}. Hand ${gameState.currentHand}/${gameState.maxHands} complete.`;
          }

          const humanPlayer = updatedPlayers.find((p) => p.id === 'player') || updatedPlayers[0];
          const humanWonMatch = Boolean(champion && champion.id === humanPlayer?.id);
          const tablePot = gameState.stake > 0 ? gameState.stake * updatedPlayers.length : 0;
          const championPayout = tablePot > 0 ? Math.round(tablePot * 0.96 * 100) / 100 : 0;

          if (isMatchOver) {
            if (humanWonMatch) {
              sound.playVictory();
              options?.onSettlement?.(championPayout, true, false);
            } else {
              options?.onSettlement?.(0, false, false);
            }
          }

          setGameState((prev) => ({
            ...prev,
            stage: isMatchOver ? 'match_ended' : 'round_ended',
            isDealing: false,
            winner: champion ? champion.name : dealerEval.isBusted ? 'Players' : 'Dealer',
            matchChampion: champion || null,
            winningHandDesc,
            winningPayout: championPayout,
            players: updatedPlayers,
            dealer: {
              ...prev.dealer,
              cards: currentDealerCards,
              score: dealerEval.score,
              isSoft: dealerEval.isSoft,
              isBusted: dealerEval.isBusted,
              status: dealerEval.isBusted ? 'busted' : 'stood',
            },
          }));
        }
      };

      sound.playPop();
      const initialDealerPause = window.setTimeout(drawNextDealerCard, 1000);
      dealingTimeoutsRef.current.push(initialDealerPause);
    },
    [gameState.currentHand, gameState.dealer.cards, gameState.maxHands, gameState.stake, options]
  );

  /**
   * Execute sequential initial deal to all table players and dealer (Offline Mode)
   */
  const dealNewRoundCards = useCallback(
    (
      currentPlayers: BlackjackPlayer[],
      initialDealer: BlackjackPlayer,
      mode: 'offline' | 'pvp' | 'private',
      stake: number,
      tableId?: string,
      matchId?: string,
      handNum = 1,
      betOverride?: number
    ) => {
      clearDealingTimeouts();
      isDealerDrawingRef.current = false;
      isProcessingAiTurnRef.current = false;

      let deck = deckRef.current;
      if (deck.length < (currentPlayers.length + 1) * 5) {
        deck = createShuffledBlackjackDeck();
        deckRef.current = deck;
      }

      const activeBet = betOverride || selectedBet || DEFAULT_BET;
      let totalPot = 0;

      const dealtPlayers: BlackjackPlayer[] = currentPlayers.map((p) => {
        if (p.eliminated || p.chips <= 0) {
          return {
            ...p,
            chips: 0,
            bet: 0,
            cards: [],
            score: 0,
            status: 'stood' as const,
            eliminated: true,
          };
        }

        const betAmount = Math.min(activeBet, p.chips);
        const c1 = deck.pop()!;
        const c2 = deck.pop()!;
        const pEval = evaluateBlackjackHand([c1, c2]);
        totalPot += betAmount;

        return {
          ...p,
          bet: betAmount,
          chips: p.chips - betAmount,
          cards: [c1, c2],
          score: pEval.score,
          isSoft: pEval.isSoft,
          isBusted: false,
          hasBlackjack: pEval.hasBlackjack,
          status: pEval.hasBlackjack ? ('blackjack' as const) : ('playing' as const),
        };
      });

      const d1 = deck.pop()!;
      const d2 = deck.pop()!;
      const dEval = evaluateBlackjackHand([d1, d2]);

      let initialIdx = 0;
      while (initialIdx < dealtPlayers.length && (dealtPlayers[initialIdx].status !== 'playing' || dealtPlayers[initialIdx].eliminated)) {
        initialIdx++;
      }

      setGameState({
        stage: initialIdx < dealtPlayers.length ? 'player_turn' : 'dealer_turn',
        pot: totalPot,
        stake,
        mode,
        currentPlayerIndex: initialIdx < dealtPlayers.length ? initialIdx : 0,
        players: dealtPlayers,
        dealer: {
          ...initialDealer,
          cards: [d1, d2],
          score: dEval.score,
          isSoft: dEval.isSoft,
          isBusted: false,
          hasBlackjack: dEval.hasBlackjack,
          status: 'playing',
        },
        currentHand: handNum,
        maxHands: MAX_HANDS,
        winner: null,
        matchChampion: null,
        winningHandDesc: undefined,
        logs: [
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            message: `Hand ${handNum}/${MAX_HANDS} dealt with ${activeBet} chips bet!`,
          },
        ],
        isDealing: false,
        turnTimeLeft: TURN_DURATION_SEC,
        tableId,
        matchId,
        waitingForPlayers: false,
      });
      setTurnTimeLeft(TURN_DURATION_SEC);
    },
    [selectedBet]
  );

  /**
   * Adjust player's bet before deal / during round setup
   */
  const placeBet = useCallback(
    async (amount: number) => {
      sound.playPop();
      setSelectedBet(amount);

      if (remoteMatchId) {
        try {
          const result = await apiRequest<{ blackjackGameState?: BlackjackGameState; gameState?: BlackjackGameState }>(
            '/api/matches/action',
            {
              method: 'POST',
              body: JSON.stringify({
                matchId: remoteMatchId,
                action: 'place_bet',
                amount,
              }),
            }
          );
          const state = result.blackjackGameState || result.gameState;
          if (state) setGameState(state);
        } catch (err) {
          console.error('Blackjack place_bet error', err);
          syncRemoteMatchState();
        }
      }
    },
    [remoteMatchId, syncRemoteMatchState]
  );

  /**
   * Start a new Blackjack Match Session
   */
  const startBlackjackSession = useCallback(
    (
      userAvatar: AvatarId,
      userName: string,
      mode: 'offline' | 'pvp' | 'private',
      stake: number,
      tableId?: string,
      matchId?: string
    ) => {
      sound.playShuffle();
      settledRef.current = false;

      let resolvedMatchId = matchId;
      if (!resolvedMatchId && typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('redoapp_active_match');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.matchId) {
              resolvedMatchId = parsed.matchId;
            }
          }
        } catch {}
      }

      if (mode === 'pvp' || mode === 'private') {
        setRemoteMatchId(resolvedMatchId || null);
        if (resolvedMatchId) {
          try {
            const raw = localStorage.getItem('redoapp_active_match');
            const existing = raw ? JSON.parse(raw) : null;
            const effectiveUserId = existing?.currentUserId || (typeof window !== 'undefined' ? (sessionStorage.getItem('redoapp_tab_guest_id') || localStorage.getItem('redoapp_current_user_id') || localStorage.getItem('redoapp_guest_user_id') || 'player') : 'player');
            localStorage.setItem('redoapp_active_match', JSON.stringify({
              ...(existing || {}),
              matchId: resolvedMatchId,
              mode,
              gameType: 'blackjack',
              stake,
              tableId,
              currentUserId: effectiveUserId,
              createdAt: existing?.createdAt || Date.now(),
            }));
          } catch {}
        }
        setGameState((prev) => ({
          ...prev,
          mode,
          matchId: resolvedMatchId,
          tableId,
          stake,
          currentHand: 1,
          maxHands: MAX_HANDS,
          stage: 'player_turn',
          waitingForPlayers: true,
        }));
        if (resolvedMatchId) {
          syncRemoteMatchState(resolvedMatchId);
        }
        return;
      }

      // Offline Practice Mode against Bots (100 chips each)
      setRemoteMatchId(null);

      const deck = createShuffledBlackjackDeck();
      deckRef.current = deck;

      const humanPlayer: BlackjackPlayer = {
        id: 'player',
        name: userName || 'Player',
        avatar: userAvatar,
        chips: STARTING_CHIPS,
        bet: 0,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
        wins: 0,
        isAi: false,
        eliminated: false,
      };

      const bots: BlackjackPlayer[] = DEFAULT_BOTS.slice(0, 3).map((bot, idx) => ({
        id: `ai_${idx + 1}`,
        name: bot.name,
        avatar: bot.avatar,
        chips: STARTING_CHIPS,
        bet: 0,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
        wins: 0,
        isAi: true,
        eliminated: false,
      }));

      const allPlayers: BlackjackPlayer[] = [humanPlayer, ...bots];

      const dealer: BlackjackPlayer = {
        id: 'dealer',
        name: 'Dealer (House)',
        avatar: 'bear',
        chips: 9999,
        bet: 0,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
        wins: 0,
      };

      dealNewRoundCards(allPlayers, dealer, mode, stake, tableId, matchId, 1);
    },
    [dealNewRoundCards, syncRemoteMatchState]
  );

  /**
   * Action: HIT (Draw 1 Card)
   */
  const playerHit = useCallback(async () => {
    sound.playPop();

    if (remoteMatchId) {
      try {
        const result = await apiRequest<{ blackjackGameState?: BlackjackGameState; gameState?: BlackjackGameState }>(
          '/api/matches/action',
          {
            method: 'POST',
            body: JSON.stringify({
              matchId: remoteMatchId,
              action: 'hit',
            }),
          }
        );
        const state = result.blackjackGameState || result.gameState;
        if (state) setGameState(state);
      } catch (err) {
        console.error('Blackjack hit action error', err);
        syncRemoteMatchState();
      }
      return;
    }

    // Offline mode
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || gameState.stage !== 'player_turn' || gameState.isDealing || currPlayer.eliminated) return;

    const deck = deckRef.current;
    const newCard = deck.pop();
    if (!newCard) return;

    const updatedCards = [...currPlayer.cards, newCard];
    const playerEval = evaluateBlackjackHand(updatedCards);

    const updatedPlayer: BlackjackPlayer = {
      ...currPlayer,
      cards: updatedCards,
      score: playerEval.score,
      isSoft: playerEval.isSoft,
      isBusted: playerEval.isBusted,
      status: playerEval.isBusted ? 'busted' : 'playing',
    };

    const nextPlayers = [...gameState.players];
    nextPlayers[currIdx] = updatedPlayer;

    if (playerEval.isBusted || playerEval.score === 21) {
      advanceToNextTurn(nextPlayers, currIdx + 1);
    } else {
      setGameState((prev) => ({
        ...prev,
        players: nextPlayers,
        turnTimeLeft: TURN_DURATION_SEC,
      }));
      setTurnTimeLeft(TURN_DURATION_SEC);
    }
  }, [advanceToNextTurn, gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage, remoteMatchId, syncRemoteMatchState]);

  /**
   * Action: STAND (Finish turn)
   */
  const playerStand = useCallback(async () => {
    sound.playPop();

    if (remoteMatchId) {
      try {
        const result = await apiRequest<{ blackjackGameState?: BlackjackGameState; gameState?: BlackjackGameState }>(
          '/api/matches/action',
          {
            method: 'POST',
            body: JSON.stringify({
              matchId: remoteMatchId,
              action: 'stand',
            }),
          }
        );
        const state = result.blackjackGameState || result.gameState;
        if (state) setGameState(state);
      } catch (err) {
        console.error('Blackjack stand action error', err);
        syncRemoteMatchState();
      }
      return;
    }

    // Offline mode
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || gameState.stage !== 'player_turn' || gameState.isDealing || currPlayer.eliminated) return;

    const updatedPlayer: BlackjackPlayer = {
      ...currPlayer,
      status: 'stood',
    };

    const nextPlayers = [...gameState.players];
    nextPlayers[currIdx] = updatedPlayer;
    advanceToNextTurn(nextPlayers, currIdx + 1);
  }, [advanceToNextTurn, gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage, remoteMatchId, syncRemoteMatchState]);

  /**
   * Action: DOUBLE DOWN (Double bet with remaining chips, draw 1 card, stand)
   */
  const playerDoubleDown = useCallback(async () => {
    sound.playPop();

    if (remoteMatchId) {
      try {
        const result = await apiRequest<{ blackjackGameState?: BlackjackGameState; gameState?: BlackjackGameState }>(
          '/api/matches/action',
          {
            method: 'POST',
            body: JSON.stringify({
              matchId: remoteMatchId,
              action: 'double',
            }),
          }
        );
        const state = result.blackjackGameState || result.gameState;
        if (state) setGameState(state);
      } catch (err) {
        console.error('Blackjack double action error', err);
        syncRemoteMatchState();
      }
      return;
    }

    // Offline mode
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || gameState.stage !== 'player_turn' || gameState.isDealing || currPlayer.cards.length !== 2 || currPlayer.eliminated) return;

    const additionalBet = Math.min(currPlayer.bet, currPlayer.chips);
    const deck = deckRef.current;
    const newCard = deck.pop();
    if (!newCard) return;

    const updatedCards = [...currPlayer.cards, newCard];
    const playerEval = evaluateBlackjackHand(updatedCards);

    const updatedPlayer: BlackjackPlayer = {
      ...currPlayer,
      chips: currPlayer.chips - additionalBet,
      bet: currPlayer.bet + additionalBet,
      cards: updatedCards,
      score: playerEval.score,
      isSoft: playerEval.isSoft,
      isBusted: playerEval.isBusted,
      status: playerEval.isBusted ? 'busted' : 'stood',
    };

    const nextPlayers = [...gameState.players];
    nextPlayers[currIdx] = updatedPlayer;
    advanceToNextTurn(nextPlayers, currIdx + 1);
  }, [advanceToNextTurn, gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage, remoteMatchId, syncRemoteMatchState]);

  /**
   * Start next round keeping chips intact
   */
  const nextHand = useCallback(
    async (betForNextHand?: number) => {
      sound.playShuffle();
      const nextBet = betForNextHand || selectedBet;

      if (remoteMatchId) {
        try {
          const result = await apiRequest<{ blackjackGameState?: BlackjackGameState; gameState?: BlackjackGameState }>(
            '/api/matches/action',
            {
              method: 'POST',
              body: JSON.stringify({
                matchId: remoteMatchId,
                action: 'next_hand',
                amount: nextBet,
              }),
            }
          );
          const state = result.blackjackGameState || result.gameState;
          if (state) setGameState(state);
        } catch (err) {
          console.error('Blackjack next_hand action error', err);
          syncRemoteMatchState();
        }
        return;
      }

      // Offline mode
      const nextHandNum = gameState.currentHand + 1;
      dealNewRoundCards(gameState.players, gameState.dealer, gameState.mode, gameState.stake, gameState.tableId, gameState.matchId, nextHandNum, nextBet);
    },
    [dealNewRoundCards, gameState.currentHand, gameState.dealer, gameState.matchId, gameState.mode, gameState.players, gameState.tableId, gameState.stake, remoteMatchId, selectedBet, syncRemoteMatchState]
  );

  // SSE Stream Listener for Online Multiplayer
  useEffect(() => {
    if (!remoteMatchId) {
      return;
    }

    remoteMatchStreamRef.current?.close();
    const stream = new EventSource(buildAuthenticatedUrl(`/api/matches/stream/${encodeURIComponent(remoteMatchId)}`));
    remoteMatchStreamRef.current = stream;

    stream.addEventListener('match-state', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        const bjState: BlackjackGameState = payload.blackjackGameState || payload.gameState;
        if (bjState) {
          setGameState(bjState);
          if (typeof bjState.turnTimeLeft === 'number') {
            setTurnTimeLeft(bjState.turnTimeLeft);
          }

          if (bjState.stage === 'match_ended' && !settledRef.current) {
            settledRef.current = true;
            const humanPlayer = bjState.players.find((p) => p.id === 'player');
            const isHumanWinner = bjState.matchChampion && humanPlayer && bjState.matchChampion.name === humanPlayer.name;
            if (isHumanWinner) {
              sound.playVictory();
              options?.onSettlement?.(bjState.winningPayout || 0, true, false);
            } else {
              options?.onSettlement?.(0, false, false);
            }
          }
        }
      } catch (err) {
        console.error('SSE match-state parse error', err);
      }
    });

    stream.addEventListener('match-cancelled', () => {
      stream.close();
      try { localStorage.removeItem('redoapp_active_match'); } catch {}
      setRemoteMatchId(null);
      setGameState((prev) => ({
        ...prev,
        stage: 'idle',
        players: [],
        winner: null,
        logs: [],
      }));
      if (options?.onMatchCancelled) {
        options.onMatchCancelled();
      }
    });

    stream.onerror = () => {
      syncRemoteMatchState(remoteMatchId);
    };

    return () => {
      stream.close();
      if (remoteMatchStreamRef.current === stream) {
        remoteMatchStreamRef.current = null;
      }
    };
  }, [options, remoteMatchId, syncRemoteMatchState]);

  // Continuous Polling during Online Match Setup and Gameplay
  useEffect(() => {
    if (!remoteMatchId || gameState.stage === 'match_ended') {
      return;
    }

    const isLocalTurn = gameState.currentPlayerIndex === 0;
    const pollIntervalMs = gameState.waitingForPlayers || !isLocalTurn ? 1200 : 2000;
    const interval = window.setInterval(() => {
      syncRemoteMatchState(remoteMatchId);
    }, pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [gameState.stage, gameState.waitingForPlayers, gameState.currentPlayerIndex, remoteMatchId, syncRemoteMatchState]);

  const isSeatedAtPersistentBlackjackTable = gameState.players.some((player) => player.id === 'player');
  useEffect(() => {
    if (!remoteMatchId?.startsWith('table-') || !isSeatedAtPersistentBlackjackTable) return;
    const heartbeat = () => apiRequest('/api/casino/table-heartbeat', {
      method: 'POST',
      body: JSON.stringify({ tableId: remoteMatchId }),
      timeoutMs: 8_000,
    }).catch(() => undefined);
    heartbeat();
    const timer = window.setInterval(heartbeat, 25_000);
    return () => window.clearInterval(timer);
  }, [isSeatedAtPersistentBlackjackTable, remoteMatchId]);

  // AI Turn Handling in Offline Mode
  useEffect(() => {
    if (remoteMatchId || gameState.stage !== 'player_turn' || gameState.isDealing) return;
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || !currPlayer.isAi || isProcessingAiTurnRef.current || currPlayer.eliminated) return;

    isProcessingAiTurnRef.current = true;
    const timer = setTimeout(() => {
      isProcessingAiTurnRef.current = false;
      if (currPlayer.score < 17) {
        playerHit();
      } else {
        playerStand();
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage, playerHit, playerStand, remoteMatchId]);

  // Turn Countdown Timer (Offline and Local Tick)
  useEffect(() => {
    if (gameState.stage !== 'player_turn' || gameState.isDealing) return;

    const timer = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          if (!remoteMatchId) {
            playerStand();
          }
          return TURN_DURATION_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, gameState.isDealing, playerStand, remoteMatchId]);

  // Auto-restore active blackjack match on mount
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('redoapp_active_match') : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.gameType === 'blackjack' && parsed.matchId) {
          if (parsed.createdAt && Date.now() - Number(parsed.createdAt) > 15 * 60 * 1000) {
            localStorage.removeItem('redoapp_active_match');
            return;
          }
          let leftMatchId = '';
          try { leftMatchId = sessionStorage.getItem('redoapp_user_left_match') || ''; } catch {}
          if (leftMatchId && leftMatchId === parsed.matchId) {
            localStorage.removeItem('redoapp_active_match');
            return;
          }
          setRemoteMatchId(parsed.matchId);
          syncRemoteMatchState(parsed.matchId);
        }
      } catch {}
    }
  }, [syncRemoteMatchState]);

  const resetSession = useCallback(() => {
    remoteMatchStreamRef.current?.close();
    remoteMatchStreamRef.current = null;
    clearDealingTimeouts();
    setRemoteMatchId(null);
    setGameState({
      players: [],
      dealer: { cards: [], score: 0, isSoft: false, isBusted: false, hasBlackjack: false },
      pot: 0,
      stage: 'idle',
      currentPlayerIndex: 0,
      turnTimeLeft: TURN_DURATION_SEC,
      isDealing: false,
      logs: [],
      mode: 'offline',
      stake: 0,
      currentHand: 1,
      maxHands: 5,
      winner: null,
      matchChampion: null,
      waitingForPlayers: false,
      matchId: undefined,
    });
  }, []);

  return {
    gameState,
    turnTimeLeft,
    selectedBet,
    setSelectedBet,
    placeBet,
    startBlackjackSession,
    playerHit,
    playerStand,
    playerDoubleDown,
    nextHand,
    resetSession,
  };
}
