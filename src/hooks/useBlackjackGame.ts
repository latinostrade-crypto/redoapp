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

const STARTING_CHIPS = 100;
const DEFAULT_BET = 10;
const TURN_DURATION_SEC = 15;
const TARGET_WINS = 2;

const DEFAULT_BOTS: { name: string; avatar: AvatarId }[] = [
  { name: 'Koala Jack', avatar: 'koala' },
  { name: 'Panda Ace', avatar: 'panda' },
  { name: 'Fox River', avatar: 'fox' },
];

export function useBlackjackGame(options?: {
  onSettlement?: (payout: number, won: boolean, push: boolean) => void;
}) {
  const [gameState, setGameState] = useState<BlackjackGameState>({
    stage: 'idle',
    pot: 0,
    stake: 0,
    mode: 'offline',
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
    targetWins: TARGET_WINS,
    winner: null,
    matchChampion: null,
    winningHandDesc: undefined,
    logs: [],
    isDealing: false,
    turnTimeLeft: TURN_DURATION_SEC,
  });

  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_DURATION_SEC);
  const deckRef = useRef<BlackjackCard[]>([]);
  const dealingTimeoutsRef = useRef<number[]>([]);
  const isDealerDrawingRef = useRef<boolean>(false);
  const isProcessingAiTurnRef = useRef<boolean>(false);

  const clearDealingTimeouts = () => {
    dealingTimeoutsRef.current.forEach((t) => clearTimeout(t));
    dealingTimeoutsRef.current = [];
  };

  /**
   * Advance to the next player's turn or start Dealer turn if all finished
   */
  const advanceToNextTurn = useCallback((currentPlayers: BlackjackPlayer[], nextIndex: number) => {
    if (nextIndex < currentPlayers.length) {
      setGameState((prev) => ({
        ...prev,
        players: currentPlayers,
        currentPlayerIndex: nextIndex,
        stage: 'player_turn',
        turnTimeLeft: TURN_DURATION_SEC,
      }));
      setTurnTimeLeft(TURN_DURATION_SEC);
    } else {
      // All players have taken their turns; Dealer now draws!
      setGameState((prev) => ({
        ...prev,
        players: currentPlayers,
        stage: 'dealer_turn',
      }));
      setTimeout(() => runDealerDrawSequence(currentPlayers), 100);
    }
  }, []);

  /**
   * Dealer hit sequence when all players finish their turns
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
        const anyPlayerStanding = currentPlayers.some((p) => !p.isBusted);
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

          const timer = window.setTimeout(drawNextDealerCard, 700);
          dealingTimeoutsRef.current.push(timer);
        } else {
          isDealerDrawingRef.current = false;
          const updatedPlayers = currentPlayers.map((p) => {
            let wonRound = false;
            let finalChips = p.chips;
            if (p.isBusted) {
              wonRound = false;
            } else if (dealerEval.isBusted) {
              wonRound = true;
              finalChips += p.bet * 2;
            } else if (p.score > dealerEval.score) {
              wonRound = true;
              finalChips += p.bet * 2;
            } else if (p.score === dealerEval.score) {
              wonRound = false;
              finalChips += p.bet;
            } else {
              wonRound = false;
            }

            return {
              ...p,
              chips: finalChips,
              wins: wonRound ? p.wins + 1 : p.wins,
              status: p.isBusted ? ('busted' as const) : ('stood' as const),
            };
          });

          const champion = updatedPlayers.find((p) => p.wins >= TARGET_WINS);
          const isMatchOver = Boolean(champion);

          let winningHandDesc = '';
          if (champion) {
            winningHandDesc = `🏆 ${champion.name.toUpperCase()} WINS THE MATCH! (${champion.wins}/${TARGET_WINS} WINS)`;
          } else if (dealerEval.isBusted) {
            winningHandDesc = `DEALER BUSTED (${dealerEval.score})! Standing players win round!`;
          } else {
            winningHandDesc = `Dealer score: ${dealerEval.score}. Round complete.`;
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
      const initialDealerPause = window.setTimeout(drawNextDealerCard, 600);
      dealingTimeoutsRef.current.push(initialDealerPause);
    },
    [gameState.dealer.cards, gameState.stake, options]
  );

  /**
   * Execute sequential initial deal to all table players and dealer
   */
  const dealNewRoundCards = useCallback(
    (currentPlayers: BlackjackPlayer[], initialDealer: BlackjackPlayer, mode: 'offline' | 'pvp' | 'private', stake: number, roomCode?: string, matchId?: string) => {
      clearDealingTimeouts();
      isDealerDrawingRef.current = false;
      isProcessingAiTurnRef.current = false;

      let deck = deckRef.current;
      if (deck.length < (currentPlayers.length + 1) * 5) {
        deck = createShuffledBlackjackDeck();
        deckRef.current = deck;
      }

      const betAmount = stake > 0 ? stake : DEFAULT_BET;

      const dealtPlayers: BlackjackPlayer[] = currentPlayers.map((p) => {
        const c1 = deck.pop()!;
        const c2 = deck.pop()!;
        const pEval = evaluateBlackjackHand([c1, c2]);
        return {
          ...p,
          bet: betAmount,
          chips: Math.max(0, p.chips - betAmount),
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

      const totalPot = betAmount * dealtPlayers.length;

      setGameState({
        stage: 'player_turn',
        pot: totalPot,
        stake,
        mode,
        currentPlayerIndex: 0,
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
        targetWins: TARGET_WINS,
        winner: null,
        matchChampion: null,
        winningHandDesc: undefined,
        logs: [
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            message: `New round dealt for ${dealtPlayers.length} players vs Dealer. First to ${TARGET_WINS} wins!`,
          },
        ],
        isDealing: false,
        turnTimeLeft: TURN_DURATION_SEC,
        roomCode,
        matchId,
      });
      setTurnTimeLeft(TURN_DURATION_SEC);
    },
    []
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
      roomCode?: string,
      matchId?: string
    ) => {
      sound.playShuffle();
      const deck = createShuffledBlackjackDeck();
      deckRef.current = deck;

      const betAmount = stake > 0 ? stake : DEFAULT_BET;

      const humanPlayer: BlackjackPlayer = {
        id: 'player',
        name: userName || 'Player',
        avatar: userAvatar,
        chips: STARTING_CHIPS,
        bet: betAmount,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
        wins: 0,
        isAi: false,
      };

      const allPlayers: BlackjackPlayer[] = [humanPlayer];

      if (mode === 'offline') {
        const bots: BlackjackPlayer[] = DEFAULT_BOTS.slice(0, 2).map((bot, idx) => ({
          id: `ai_${idx + 1}`,
          name: bot.name,
          avatar: bot.avatar,
          chips: STARTING_CHIPS,
          bet: betAmount,
          cards: [],
          score: 0,
          isSoft: false,
          isBusted: false,
          hasBlackjack: false,
          status: 'playing',
          wins: 0,
          isAi: true,
        }));
        allPlayers.push(...bots);
      } else {
        let activePlayersList: Array<{ userId: string; username: string; avatarId: string }> = [];
        try {
          const raw = localStorage.getItem('redoapp_active_match');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.players) && parsed.players.length > 0) {
              activePlayersList = parsed.players;
            }
          }
        } catch {}

        if (activePlayersList.length > 1) {
          allPlayers.length = 0;
          const myStoredId = typeof window !== 'undefined'
            ? (localStorage.getItem('redoapp_current_user_id') || localStorage.getItem('redoapp_guest_user_id') || '')
            : '';
          activePlayersList.forEach((p, idx) => {
            const isMe = (myStoredId && p.userId === myStoredId) || p.username === userName;
            allPlayers.push({
              id: isMe ? 'player' : `opponent_${idx}`,
              name: p.username || `Player ${idx + 1}`,
              avatar: (p.avatarId as AvatarId) || (isMe ? userAvatar : 'fox'),
              chips: STARTING_CHIPS,
              bet: betAmount,
              cards: [],
              score: 0,
              isSoft: false,
              isBusted: false,
              hasBlackjack: false,
              status: 'playing',
              wins: 0,
              isAi: false,
            });
          });
          if (!allPlayers.some((p) => p.id === 'player') && allPlayers.length > 0) {
            allPlayers[0].id = 'player';
            allPlayers[0].name = userName || allPlayers[0].name;
            allPlayers[0].avatar = userAvatar;
          }
        } else {
          const opponentName = userName.startsWith('PC') ? 'Phone_Player' : 'Opponent';
          const opponentAvatar: AvatarId = userAvatar === 'rabbit' ? 'fox' : 'rabbit';
          allPlayers.push({
            id: 'opponent',
            name: opponentName,
            avatar: opponentAvatar,
            chips: STARTING_CHIPS,
            bet: betAmount,
            cards: [],
            score: 0,
            isSoft: false,
            isBusted: false,
            hasBlackjack: false,
            status: 'playing',
            wins: 0,
            isAi: false,
          });
        }
      }

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

      dealNewRoundCards(allPlayers, dealer, mode, stake, roomCode, matchId);
    },
    [dealNewRoundCards]
  );

  /**
   * Action: HIT (Draw 1 Card for current active player)
   */
  const playerHit = useCallback(() => {
    sound.playPop();
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || gameState.stage !== 'player_turn' || gameState.isDealing) return;

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
  }, [advanceToNextTurn, gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage]);

  /**
   * Action: STAND (Finish turn for current active player)
   */
  const playerStand = useCallback(() => {
    sound.playPop();
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || gameState.stage !== 'player_turn' || gameState.isDealing) return;

    const updatedPlayer: BlackjackPlayer = {
      ...currPlayer,
      status: 'stood',
    };

    const nextPlayers = [...gameState.players];
    nextPlayers[currIdx] = updatedPlayer;
    advanceToNextTurn(nextPlayers, currIdx + 1);
  }, [advanceToNextTurn, gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage]);

  /**
   * Action: DOUBLE DOWN (Double bet, draw 1 card, then stand)
   */
  const playerDoubleDown = useCallback(() => {
    sound.playPop();
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || gameState.stage !== 'player_turn' || gameState.isDealing || currPlayer.cards.length !== 2) return;

    const additionalBet = currPlayer.bet;
    if (currPlayer.chips < additionalBet) return;

    const deck = deckRef.current;
    const newCard = deck.pop();
    if (!newCard) return;

    const updatedCards = [...currPlayer.cards, newCard];
    const playerEval = evaluateBlackjackHand(updatedCards);

    const updatedPlayer: BlackjackPlayer = {
      ...currPlayer,
      chips: currPlayer.chips - additionalBet,
      bet: currPlayer.bet * 2,
      cards: updatedCards,
      score: playerEval.score,
      isSoft: playerEval.isSoft,
      isBusted: playerEval.isBusted,
      status: playerEval.isBusted ? 'busted' : 'stood',
    };

    const nextPlayers = [...gameState.players];
    nextPlayers[currIdx] = updatedPlayer;
    advanceToNextTurn(nextPlayers, currIdx + 1);
  }, [advanceToNextTurn, gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage]);

  /**
   * Start next round keeping wins counter intact
   */
  const nextHand = useCallback(() => {
    sound.playShuffle();
    dealNewRoundCards(gameState.players, gameState.dealer, gameState.mode, gameState.stake, gameState.roomCode, gameState.matchId);
  }, [dealNewRoundCards, gameState.dealer, gameState.matchId, gameState.mode, gameState.players, gameState.roomCode, gameState.stake]);

  // AI Turn Handling
  useEffect(() => {
    if (gameState.stage !== 'player_turn' || gameState.isDealing) return;
    const currIdx = gameState.currentPlayerIndex;
    const currPlayer = gameState.players[currIdx];
    if (!currPlayer || !currPlayer.isAi || isProcessingAiTurnRef.current) return;

    isProcessingAiTurnRef.current = true;
    const timer = setTimeout(() => {
      isProcessingAiTurnRef.current = false;
      if (currPlayer.score < 17) {
        playerHit();
      } else {
        playerStand();
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [gameState.currentPlayerIndex, gameState.isDealing, gameState.players, gameState.stage, playerHit, playerStand]);

  // Turn Countdown Timer
  useEffect(() => {
    if (gameState.stage !== 'player_turn' || gameState.isDealing) return;

    const timer = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          playerStand();
          return TURN_DURATION_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, gameState.isDealing, playerStand]);

  return {
    gameState,
    turnTimeLeft,
    startBlackjackSession,
    playerHit,
    playerStand,
    playerDoubleDown,
    nextHand,
  };
}
