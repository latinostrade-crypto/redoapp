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

export function useBlackjackGame(options?: {
  onSettlement?: (payout: number, won: boolean, push: boolean) => void;
}) {
  const [gameState, setGameState] = useState<BlackjackGameState>({
    stage: 'idle',
    pot: 0,
    stake: 0,
    mode: 'offline',
    player: {
      id: 'player',
      name: 'Player',
      avatar: 'koala',
      chips: STARTING_CHIPS,
      bet: DEFAULT_BET,
      cards: [],
      score: 0,
      isSoft: false,
      isBusted: false,
      hasBlackjack: false,
      status: 'playing',
    },
    dealer: {
      id: 'dealer',
      name: 'Dealer (House)',
      avatar: 'fox',
      chips: 9999,
      bet: 0,
      cards: [],
      score: 0,
      isSoft: false,
      isBusted: false,
      hasBlackjack: false,
      status: 'playing',
    },
    winner: null,
    winningHandDesc: undefined,
    logs: [],
    isDealing: false,
    turnTimeLeft: TURN_DURATION_SEC,
  });

  const deckRef = useRef<BlackjackCard[]>([]);
  const dealingTimeoutsRef = useRef<number[]>([]);
  const isDealerDrawingRef = useRef<boolean>(false);

  const clearDealingTimeouts = () => {
    dealingTimeoutsRef.current.forEach((t) => clearTimeout(t));
    dealingTimeoutsRef.current = [];
  };

  /**
   * Execute sequential initial card deal:
   * Player Card 1 -> Dealer Card 1 -> Player Card 2 -> Dealer Hole Card
   */
  const executeInitialDeal = useCallback(
    (
      deck: BlackjackCard[],
      initialPlayer: BlackjackPlayer,
      initialDealer: BlackjackPlayer,
      betAmount: number,
      mode: 'offline' | 'pvp' | 'private',
      stake: number,
      roomCode?: string,
      matchId?: string
    ) => {
      clearDealingTimeouts();

      const pCard1 = deck.pop()!;
      const dCard1 = deck.pop()!;
      const pCard2 = deck.pop()!;
      const dCard2 = deck.pop()!;

      // Step 0: Empty table, dealing state
      setGameState({
        stage: 'idle',
        pot: betAmount * 2,
        stake,
        mode,
        player: { ...initialPlayer, cards: [], score: 0 },
        dealer: { ...initialDealer, cards: [], score: 0 },
        winner: null,
        winningHandDesc: undefined,
        logs: [
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            message: `Blackjack session started (${mode.toUpperCase()}, stake: ${stake} TKT, bet: ${betAmount}).`,
          },
        ],
        isDealing: true,
        turnTimeLeft: TURN_DURATION_SEC,
        roomCode,
        matchId,
      });

      // Step 1: Deal Player Card 1 (after 250ms)
      const t1 = window.setTimeout(() => {
        sound.playShuffle();
        setGameState((prev) => ({
          ...prev,
          player: {
            ...prev.player,
            cards: [pCard1],
            score: evaluateBlackjackHand([pCard1]).score,
          },
        }));
      }, 250);

      // Step 2: Deal Dealer Card 1 (after 600ms)
      const t2 = window.setTimeout(() => {
        sound.playPop();
        setGameState((prev) => ({
          ...prev,
          dealer: {
            ...prev.dealer,
            cards: [dCard1],
            score: evaluateBlackjackHand([dCard1]).score,
          },
        }));
      }, 600);

      // Step 3: Deal Player Card 2 (after 950ms)
      const t3 = window.setTimeout(() => {
        sound.playPop();
        const playerCards = [pCard1, pCard2];
        const pEval = evaluateBlackjackHand(playerCards);
        setGameState((prev) => ({
          ...prev,
          player: {
            ...prev.player,
            cards: playerCards,
            score: pEval.score,
            isSoft: pEval.isSoft,
            hasBlackjack: pEval.hasBlackjack,
            status: pEval.hasBlackjack ? 'blackjack' : 'playing',
          },
        }));
      }, 950);

      // Step 4: Deal Dealer Card 2 (Hole Card) (after 1300ms) and evaluate start state
      const t4 = window.setTimeout(() => {
        sound.playPop();
        const playerCards = [pCard1, pCard2];
        const dealerCards = [dCard1, dCard2];
        const pEval = evaluateBlackjackHand(playerCards);
        const dEval = evaluateBlackjackHand(dealerCards);

        let stage: BlackjackGameState['stage'] = 'player_turn';
        let winner: BlackjackGameState['winner'] = null;
        let winningHandDesc: string | undefined = undefined;
        let finalChips = initialPlayer.chips;

        if (pEval.hasBlackjack && dEval.hasBlackjack) {
          stage = 'ended';
          winner = 'push';
          winningHandDesc = 'Both player & dealer have Natural Blackjack! PUSH!';
          finalChips += betAmount;
          options?.onSettlement?.(betAmount, false, true);
        } else if (pEval.hasBlackjack) {
          stage = 'ended';
          winner = 'player';
          winningHandDesc = 'NATURAL BLACKJACK 21! Player wins 3:2 payout!';
          const payout = Math.floor(betAmount * 2.5);
          finalChips += payout;
          sound.playPop();
          options?.onSettlement?.(payout, true, false);
        } else if (dEval.hasBlackjack) {
          stage = 'ended';
          winner = 'dealer';
          winningHandDesc = 'Dealer has Natural Blackjack 21!';
          options?.onSettlement?.(0, false, false);
        }

        setGameState((prev) => ({
          ...prev,
          isDealing: false,
          stage,
          winner,
          winningHandDesc,
          turnTimeLeft: TURN_DURATION_SEC,
          player: {
            ...prev.player,
            cards: playerCards,
            score: pEval.score,
            isSoft: pEval.isSoft,
            hasBlackjack: pEval.hasBlackjack,
            status: pEval.hasBlackjack ? 'blackjack' : 'playing',
            chips: finalChips,
          },
          dealer: {
            ...prev.dealer,
            cards: dealerCards,
            score: dEval.score,
            isSoft: dEval.isSoft,
            hasBlackjack: dEval.hasBlackjack,
          },
        }));
      }, 1300);

      dealingTimeoutsRef.current = [t1, t2, t3, t4];
    },
    [options]
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

      const player: BlackjackPlayer = {
        id: 'player',
        name: userName || 'Player',
        avatar: userAvatar,
        chips: STARTING_CHIPS - betAmount,
        bet: betAmount,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
      };

      const dealer: BlackjackPlayer = {
        id: 'dealer',
        name: 'Dealer (House)',
        avatar: 'fox',
        chips: 9999,
        bet: 0,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
      };

      executeInitialDeal(deck, player, dealer, betAmount, mode, stake, roomCode, matchId);
    },
    [executeInitialDeal]
  );

  /**
   * Action: HIT (Draw 1 Card for player)
   */
  const playerHit = useCallback(() => {
    sound.playPop();
    setGameState((prev) => {
      if (prev.stage !== 'player_turn' || prev.isDealing) return prev;

      const deck = deckRef.current;
      const newCard = deck.pop();
      if (!newCard) return prev;

      const updatedCards = [...prev.player.cards, newCard];
      const playerEval = evaluateBlackjackHand(updatedCards);

      const updatedPlayer: BlackjackPlayer = {
        ...prev.player,
        cards: updatedCards,
        score: playerEval.score,
        isSoft: playerEval.isSoft,
        isBusted: playerEval.isBusted,
        status: playerEval.isBusted ? 'busted' : 'playing',
      };

      if (playerEval.isBusted) {
        sound.playPop();
        options?.onSettlement?.(0, false, false);
        return {
          ...prev,
          stage: 'ended',
          winner: 'dealer',
          winningHandDesc: `PLAYER BUSTED (${playerEval.score})! Dealer wins!`,
          player: updatedPlayer,
        };
      }

      return {
        ...prev,
        player: updatedPlayer,
        turnTimeLeft: TURN_DURATION_SEC,
      };
    });
  }, [options]);

  /**
   * Dealer hit sequence when player stands or reaches 21
   */
  const runDealerDrawSequence = useCallback(
    (currentGameState: BlackjackGameState) => {
      if (isDealerDrawingRef.current) return;
      isDealerDrawingRef.current = true;

      setGameState((prev) => ({ ...prev, stage: 'dealer_turn', isDealing: true }));

      const deck = deckRef.current;
      let currentDealerCards = [...currentGameState.dealer.cards];
      let dealerEval = evaluateBlackjackHand(currentDealerCards);

      const drawNextDealerCard = () => {
        if (dealerEval.score < 17 && deck.length > 0) {
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
          // Dealer finished drawing, determine winner!
          isDealerDrawingRef.current = false;
          let winner: BlackjackGameState['winner'] = null;
          let winningHandDesc = '';
          let updatedPlayerChips = currentGameState.player.chips;

          if (dealerEval.isBusted) {
            winner = 'player';
            winningHandDesc = `DEALER BUSTED (${dealerEval.score})! Player wins!`;
            const payout = currentGameState.player.bet * 2;
            updatedPlayerChips += payout;
            sound.playPop();
            options?.onSettlement?.(payout, true, false);
          } else if (currentGameState.player.score > dealerEval.score) {
            winner = 'player';
            winningHandDesc = `PLAYER WINS! (${currentGameState.player.score} vs ${dealerEval.score})`;
            const payout = currentGameState.player.bet * 2;
            updatedPlayerChips += payout;
            sound.playPop();
            options?.onSettlement?.(payout, true, false);
          } else if (currentGameState.player.score < dealerEval.score) {
            winner = 'dealer';
            winningHandDesc = `DEALER WINS! (${dealerEval.score} vs ${currentGameState.player.score})`;
            options?.onSettlement?.(0, false, false);
          } else {
            winner = 'push';
            winningHandDesc = `PUSH (TIE)! Both have ${currentGameState.player.score}. Bet returned.`;
            updatedPlayerChips += currentGameState.player.bet;
            options?.onSettlement?.(currentGameState.player.bet, false, true);
          }

          setGameState((prev) => ({
            ...prev,
            stage: 'ended',
            isDealing: false,
            winner,
            winningHandDesc,
            player: { ...prev.player, chips: updatedPlayerChips, status: 'stood' },
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

      // Reveal hole card and pause before drawing first extra card
      sound.playPop();
      const initialDealerPause = window.setTimeout(drawNextDealerCard, 600);
      dealingTimeoutsRef.current.push(initialDealerPause);
    },
    [options]
  );

  /**
   * Action: STAND (Pass to Dealer)
   */
  const playerStand = useCallback(() => {
    sound.playPop();
    setGameState((prev) => {
      if (prev.stage !== 'player_turn' || prev.isDealing) return prev;
      setTimeout(() => runDealerDrawSequence(prev), 50);
      return {
        ...prev,
        stage: 'dealer_turn',
        player: { ...prev.player, status: 'stood' },
      };
    });
  }, [runDealerDrawSequence]);

  /**
   * Action: DOUBLE DOWN (Double bet, draw exactly 1 card, then pass to dealer)
   */
  const playerDoubleDown = useCallback(() => {
    sound.playPop();
    setGameState((prev) => {
      if (prev.stage !== 'player_turn' || prev.isDealing || prev.player.cards.length !== 2) return prev;

      const additionalBet = prev.player.bet;
      if (prev.player.chips < additionalBet) return prev;

      const deck = deckRef.current;
      const newCard = deck.pop();
      if (!newCard) return prev;

      const updatedCards = [...prev.player.cards, newCard];
      const playerEval = evaluateBlackjackHand(updatedCards);
      const newTotalBet = prev.player.bet * 2;

      const updatedPlayer: BlackjackPlayer = {
        ...prev.player,
        chips: prev.player.chips - additionalBet,
        bet: newTotalBet,
        cards: updatedCards,
        score: playerEval.score,
        isSoft: playerEval.isSoft,
        isBusted: playerEval.isBusted,
        status: playerEval.isBusted ? 'busted' : 'stood',
      };

      if (playerEval.isBusted) {
        options?.onSettlement?.(0, false, false);
        return {
          ...prev,
          stage: 'ended',
          winner: 'dealer',
          winningHandDesc: `DOUBLE DOWN BUSTED (${playerEval.score})! Dealer wins!`,
          player: updatedPlayer,
        };
      }

      const nextState: BlackjackGameState = {
        ...prev,
        pot: newTotalBet * 2,
        player: updatedPlayer,
      };

      setTimeout(() => runDealerDrawSequence(nextState), 500);
      return {
        ...nextState,
        stage: 'dealer_turn',
      };
    });
  }, [options, runDealerDrawSequence]);

  /**
   * Action: NEXT HAND (Continuous loop)
   */
  const nextHand = useCallback(() => {
    sound.playShuffle();
    clearDealingTimeouts();

    setGameState((prev) => {
      const betAmount = prev.stake > 0 ? prev.stake : DEFAULT_BET;
      const currentChips = prev.player.chips <= 0 ? STARTING_CHIPS : prev.player.chips;

      const deck = createShuffledBlackjackDeck();
      deckRef.current = deck;

      const initialPlayer: BlackjackPlayer = {
        ...prev.player,
        chips: currentChips - betAmount,
        bet: betAmount,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
      };

      const initialDealer: BlackjackPlayer = {
        ...prev.dealer,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing',
      };

      executeInitialDeal(
        deck,
        initialPlayer,
        initialDealer,
        betAmount,
        prev.mode,
        prev.stake,
        prev.roomCode,
        prev.matchId
      );

      return {
        ...prev,
        isDealing: true,
        player: initialPlayer,
        dealer: initialDealer,
        winner: null,
        winningHandDesc: undefined,
      };
    });
  }, [executeInitialDeal]);

  /**
   * 15-second Turn Timer Effect for human player
   */
  useEffect(() => {
    if (gameState.stage !== 'player_turn' || gameState.isDealing) {
      return;
    }

    const timer = window.setInterval(() => {
      setGameState((prev) => {
        if (prev.stage !== 'player_turn' || prev.isDealing) return prev;
        const currentLeft = prev.turnTimeLeft ?? TURN_DURATION_SEC;
        if (currentLeft <= 1) {
          clearInterval(timer);
          // Time expired: auto stand!
          setTimeout(() => playerStand(), 10);
          return { ...prev, turnTimeLeft: 0 };
        }
        return { ...prev, turnTimeLeft: currentLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, gameState.isDealing, playerStand]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearDealingTimeouts();
  }, []);

  return {
    gameState,
    turnTimeLeft: gameState.turnTimeLeft ?? TURN_DURATION_SEC,
    startBlackjackSession,
    playerHit,
    playerStand,
    playerDoubleDown,
    nextHand,
  };
}
