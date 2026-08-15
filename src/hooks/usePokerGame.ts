/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PokerCard,
  PokerGameState,
  PokerPlayer,
  PokerPlayerId,
  PokerStage,
} from '../types/poker';
import { AvatarId } from '../types';
import { createShuffledPokerDeck, evaluate7CardHand } from '../utils/pokerEvaluator';
import { sound } from '../utils/sound';

const STARTING_CHIPS = 100;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;
const TURN_TIME_LIMIT_SEC = 15;

const DEFAULT_BOTS: { name: string; avatar: AvatarId }[] = [
  { name: 'Bear Ace', avatar: 'bear' },
  { name: 'Fox River', avatar: 'fox' },
  { name: 'Panda Pot', avatar: 'panda' },
];

export function usePokerGame(options?: {
  onSettlement?: (payout: number, won: boolean) => void;
}) {
  const [gameState, setGameState] = useState<PokerGameState>({
    stage: 'idle',
    pot: 0,
    currentBet: 0,
    minRaise: BIG_BLIND,
    communityCards: [],
    players: [],
    dealerIndex: 0,
    smallBlindIndex: 1,
    bigBlindIndex: 2,
    currentPlayerIndex: 0,
    smallBlindAmount: SMALL_BLIND,
    bigBlindAmount: BIG_BLIND,
    winnerIds: [],
    winningCardIds: [],
    logs: [],
    stake: 0,
    mode: 'offline',
    isDealing: false,
  });

  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_TIME_LIMIT_SEC);
  const deckRef = useRef<PokerCard[]>([]);
  const isProcessingBotRef = useRef(false);
  const isAdvancingRef = useRef(false);
  const dealingTimeoutsRef = useRef<number[]>([]);

  const clearDealingTimeouts = () => {
    dealingTimeoutsRef.current.forEach((t) => clearTimeout(t));
    dealingTimeoutsRef.current = [];
  };

  const addLog = useCallback((message: string, type: 'info' | 'bet' | 'fold' | 'deal' | 'win') => {
    setGameState((prev) => ({
      ...prev,
      logs: [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          message,
          type,
        },
        ...prev.logs.slice(0, 29),
      ],
    }));
  }, []);

  /**
   * Start a new Texas Hold'em Poker Session
   */
  const startPokerSession = useCallback(
    (
      userAvatar: AvatarId,
      userName: string,
      mode: 'offline' | 'pvp' | 'private',
      stake: number,
      roomCode?: string,
      matchId?: string
    ) => {
      sound.playShuffle();
      clearDealingTimeouts();
      isAdvancingRef.current = false;

      const deck = createShuffledPokerDeck();
      deckRef.current = deck;

      const humanPlayer: PokerPlayer = {
        id: 'player',
        name: userName || 'Player',
        avatar: userAvatar,
        chips: STARTING_CHIPS,
        currentBet: 0,
        totalMatchInvested: 0,
        holeCards: [],
        folded: false,
        isAllIn: false,
        isAi: false,
      };

      const allPlayers: PokerPlayer[] = [humanPlayer];

      if (mode === 'offline') {
        // Free Practice vs 3 AI Bots
        const bots: PokerPlayer[] = DEFAULT_BOTS.map((bot, idx) => ({
          id: `ai_${idx + 1}`,
          name: bot.name,
          avatar: bot.avatar,
          chips: STARTING_CHIPS,
          currentBet: 0,
          totalMatchInvested: 0,
          holeCards: [],
          folded: false,
          isAllIn: false,
          isAi: true,
        }));
        allPlayers.push(...bots);
      } else {
        // Strictly Real Multiplayer PVP (NO BOTS)
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
          allPlayers.length = 0; // reset
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
              currentBet: 0,
              totalMatchInvested: 0,
              holeCards: [],
              folded: false,
              isAllIn: false,
              isAi: false,
            });
          });
          if (!allPlayers.some((p) => p.id === 'player') && allPlayers.length > 0) {
            allPlayers[0].id = 'player';
            allPlayers[0].name = userName || allPlayers[0].name;
            allPlayers[0].avatar = userAvatar;
          }
        } else {
          // 2-Player Heads-Up PVP Table (Real Opponent)
          const opponentName = userName.startsWith('PC') ? 'Phone_Player' : 'Opponent';
          const opponentAvatar: AvatarId = userAvatar === 'rabbit' ? 'fox' : 'rabbit';
          allPlayers.push({
            id: 'opponent',
            name: opponentName,
            avatar: opponentAvatar,
            chips: STARTING_CHIPS,
            currentBet: 0,
            totalMatchInvested: 0,
            holeCards: [],
            folded: false,
            isAllIn: false,
            isAi: false,
          });
        }
      }

      // Dealer position
      const dealerIdx = 0;
      const sbIdx = (dealerIdx + 1) % allPlayers.length;
      const bbIdx = (dealerIdx + 2) % allPlayers.length;
      const firstTurnIdx = (bbIdx + 1) % allPlayers.length;

      // Deduct Blinds
      allPlayers[sbIdx].chips -= SMALL_BLIND;
      allPlayers[sbIdx].currentBet = SMALL_BLIND;
      allPlayers[sbIdx].totalMatchInvested = SMALL_BLIND;
      allPlayers[sbIdx].lastAction = `SB (${SMALL_BLIND})`;

      allPlayers[bbIdx].chips -= BIG_BLIND;
      allPlayers[bbIdx].currentBet = BIG_BLIND;
      allPlayers[bbIdx].totalMatchInvested = BIG_BLIND;
      allPlayers[bbIdx].lastAction = `BB (${BIG_BLIND})`;

      const initialPot = SMALL_BLIND + BIG_BLIND;

      // Sequential dealing cards
      const dealtCards: PokerCard[][] = allPlayers.map(() => [deck.pop()!, deck.pop()!]);

      setGameState({
        stage: 'preflop',
        pot: initialPot,
        currentBet: BIG_BLIND,
        minRaise: BIG_BLIND * 2,
        communityCards: [],
        players: allPlayers,
        dealerIndex: dealerIdx,
        smallBlindIndex: sbIdx,
        bigBlindIndex: bbIdx,
        currentPlayerIndex: firstTurnIdx,
        smallBlindAmount: SMALL_BLIND,
        bigBlindAmount: BIG_BLIND,
        winnerIds: [],
        winningCardIds: [],
        logs: [
          {
            id: '1',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            message: `Texas Hold'em started (${mode.toUpperCase()}, stake: ${stake} TKT). Blinds: ${SMALL_BLIND}/${BIG_BLIND}`,
            type: 'info',
          },
        ],
        stake,
        mode,
        isDealing: true,
        roomCode,
        matchId,
      });

      // Deal card 1 to all (delay 250ms)
      const t1 = window.setTimeout(() => {
        sound.playPop();
        setGameState((prev) => ({
          ...prev,
          players: prev.players.map((p, idx) => ({
            ...p,
            holeCards: [dealtCards[idx][0]],
          })),
        }));
      }, 250);

      // Deal card 2 to all (delay 600ms)
      const t2 = window.setTimeout(() => {
        sound.playPop();
        setGameState((prev) => ({
          ...prev,
          isDealing: false,
          players: prev.players.map((p, idx) => ({
            ...p,
            holeCards: dealtCards[idx],
          })),
        }));
        setTurnTimeLeft(TURN_TIME_LIMIT_SEC);
      }, 600);

      dealingTimeoutsRef.current = [t1, t2];
    },
    []
  );

  /**
   * Advances game to the next betting round (Preflop -> Flop 3 cards -> Turn 1 card -> River 1 card -> Showdown)
   */
  const advanceStage = useCallback(() => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    clearDealingTimeouts();

    setGameState((prev) => {
      const activePlayers = prev.players.filter((p) => !p.folded && !p.eliminated);
      if (activePlayers.length === 1) {
        // Everyone else folded!
        const winner = activePlayers[0];
        sound.playPop();
        isAdvancingRef.current = false;

        const won = winner.id === 'player';
        if (won && options?.onSettlement) {
          options.onSettlement(prev.pot, true);
        }

        return {
          ...prev,
          stage: 'ended',
          winnerIds: [winner.id],
          winningCardIds: winner.holeCards.map((c) => c.id),
          winningHandDesc: 'Uncontested - All opponents folded',
          players: prev.players.map((p) => (p.id === winner.id ? { ...p, chips: p.chips + prev.pot } : p)),
        };
      }

      const resetPlayers = prev.players.map((p) => ({
        ...p,
        currentBet: 0,
        lastAction: p.folded || p.isAllIn || p.eliminated ? p.lastAction : undefined,
        hasActedThisStage: false,
      }));

      const nextDeck = deckRef.current;
      let nextStage: PokerStage = prev.stage;
      let nextCommunity: PokerCard[] = [];

      if (prev.stage === 'preflop') {
        // Preflop -> FLOP (Strictly 3 cards!)
        nextStage = 'flop';
        const flopCards = [nextDeck.pop()!, nextDeck.pop()!, nextDeck.pop()!];
        nextCommunity = flopCards;
        sound.playShuffle();
      } else if (prev.stage === 'flop') {
        // Flop (3 cards) -> TURN (Strictly 1 card -> 4 cards total!)
        nextStage = 'turn';
        const turnCard = nextDeck.pop()!;
        nextCommunity = [...prev.communityCards.slice(0, 3), turnCard];
        sound.playPop();
      } else if (prev.stage === 'turn') {
        // Turn (4 cards) -> RIVER (Strictly 1 card -> 5 cards total!)
        nextStage = 'river';
        const riverCard = nextDeck.pop()!;
        nextCommunity = [...prev.communityCards.slice(0, 4), riverCard];
        sound.playPop();
      } else if (prev.stage === 'river') {
        // River -> SHOWDOWN
        nextStage = 'showdown';
        nextCommunity = [...prev.communityCards];
      }

      if (nextStage === 'showdown') {
        isAdvancingRef.current = false;
        // Evaluate all hands
        let bestScore = -1;
        let winners: PokerPlayerId[] = [];
        let bestDesc = '';
        let winningBestFive: PokerCard[] = [];

        for (const p of activePlayers) {
          const evalResult = evaluate7CardHand([...p.holeCards, ...nextCommunity]);
          if (evalResult.score > bestScore) {
            bestScore = evalResult.score;
            winners = [p.id];
            bestDesc = evalResult.description;
            winningBestFive = evalResult.bestFive;
          } else if (evalResult.score === bestScore) {
            winners.push(p.id);
          }
        }

        const splitAmount = Math.floor(prev.pot / winners.length);
        const finalPlayers = resetPlayers.map((p) => {
          if (winners.includes(p.id)) {
            return { ...p, chips: p.chips + splitAmount };
          }
          return p;
        });

        sound.playPop();
        const playerWon = winners.includes('player');
        if (playerWon && options?.onSettlement) {
          options.onSettlement(splitAmount, true);
        }

        return {
          ...prev,
          stage: 'ended',
          communityCards: nextCommunity,
          players: finalPlayers,
          winnerIds: winners,
          winningCardIds: winningBestFive.map((c) => c.id),
          winningHandDesc: bestDesc,
        };
      }

      let nextTurn = (prev.dealerIndex + 1) % resetPlayers.length;
      while (resetPlayers[nextTurn].folded || resetPlayers[nextTurn].isAllIn || resetPlayers[nextTurn].eliminated) {
        nextTurn = (nextTurn + 1) % resetPlayers.length;
      }

      setTurnTimeLeft(TURN_TIME_LIMIT_SEC);
      isAdvancingRef.current = false;

      return {
        ...prev,
        stage: nextStage,
        communityCards: nextCommunity,
        currentBet: 0,
        minRaise: BIG_BLIND,
        players: resetPlayers,
        currentPlayerIndex: nextTurn,
      };
    });
  }, [options]);

  /**
   * Check if current betting round is completed
   */
  const checkRoundCompletion = useCallback(
    (currentPlayers: PokerPlayer[], currentBet: number, lastActorIdx: number) => {
      const active = currentPlayers.filter((p) => !p.folded && !p.eliminated);
      if (active.length <= 1) {
        advanceStage();
        return;
      }

      const allActedAndMatched = active.every(
        (p) => p.isAllIn || (p.hasActedThisStage && p.currentBet === currentBet)
      );

      if (allActedAndMatched) {
        advanceStage();
      } else {
        let nextTurn = (lastActorIdx + 1) % currentPlayers.length;
        while (currentPlayers[nextTurn].folded || currentPlayers[nextTurn].isAllIn || currentPlayers[nextTurn].eliminated) {
          nextTurn = (nextTurn + 1) % currentPlayers.length;
        }
        setTurnTimeLeft(TURN_TIME_LIMIT_SEC);
        setGameState((prev) => ({ ...prev, currentPlayerIndex: nextTurn }));
      }
    },
    [advanceStage]
  );

  /**
   * Action: FOLD
   */
  const playerFold = useCallback(() => {
    sound.playPop();
    setGameState((prev) => {
      const currIdx = prev.currentPlayerIndex;
      const updatedPlayers = prev.players.map((p, idx) =>
        idx === currIdx ? { ...p, folded: true, hasActedThisStage: true, lastAction: 'FOLD' } : p
      );
      addLog(`${prev.players[currIdx].name} folded`, 'fold');
      setTimeout(() => checkRoundCompletion(updatedPlayers, prev.currentBet, currIdx), 50);
      return { ...prev, players: updatedPlayers };
    });
  }, [addLog, checkRoundCompletion]);

  /**
   * Action: CHECK / CALL
   */
  const playerCallOrCheck = useCallback(() => {
    sound.playPop();
    setGameState((prev) => {
      const currIdx = prev.currentPlayerIndex;
      const player = prev.players[currIdx];
      const needed = prev.currentBet - player.currentBet;

      if (needed <= 0) {
        // CHECK
        const updatedPlayers = prev.players.map((p, idx) =>
          idx === currIdx ? { ...p, hasActedThisStage: true, lastAction: 'CHECK' } : p
        );
        addLog(`${player.name} checked`, 'bet');
        setTimeout(() => checkRoundCompletion(updatedPlayers, prev.currentBet, currIdx), 50);
        return { ...prev, players: updatedPlayers };
      }

      // CALL
      const callAmount = Math.min(player.chips, needed);
      const isAllIn = callAmount >= player.chips;
      const updatedPlayers = prev.players.map((p, idx) =>
        idx === currIdx
          ? {
              ...p,
              chips: p.chips - callAmount,
              currentBet: p.currentBet + callAmount,
              totalMatchInvested: p.totalMatchInvested + callAmount,
              isAllIn,
              hasActedThisStage: true,
              lastAction: isAllIn ? 'ALL-IN' : `CALL ${callAmount}`,
            }
          : p
      );

      addLog(`${player.name} called ${callAmount}`, 'bet');
      const nextPot = prev.pot + callAmount;

      setTimeout(() => checkRoundCompletion(updatedPlayers, prev.currentBet, currIdx), 50);
      return { ...prev, pot: nextPot, players: updatedPlayers };
    });
  }, [addLog, checkRoundCompletion]);

  /**
   * Action: RAISE
   */
  const playerRaise = useCallback(
    (raiseToAmount: number) => {
      sound.playPop();
      setGameState((prev) => {
        const currIdx = prev.currentPlayerIndex;
        const player = prev.players[currIdx];
        const additionalNeeded = raiseToAmount - player.currentBet;
        const actualBet = Math.min(player.chips, additionalNeeded);
        const isAllIn = actualBet >= player.chips;
        const newCurrentBet = player.currentBet + actualBet;

        const updatedPlayers = prev.players.map((p, idx) =>
          idx === currIdx
            ? {
                ...p,
                chips: p.chips - actualBet,
                currentBet: newCurrentBet,
                totalMatchInvested: p.totalMatchInvested + actualBet,
                isAllIn,
                hasActedThisStage: true,
                lastAction: isAllIn ? 'ALL-IN' : `RAISE ${newCurrentBet}`,
              }
            : {
                ...p,
                hasActedThisStage: p.folded || p.isAllIn || p.eliminated,
              }
        );

        addLog(`${player.name} raised to ${newCurrentBet}`, 'bet');
        const nextPot = prev.pot + actualBet;

        setTimeout(() => checkRoundCompletion(updatedPlayers, newCurrentBet, currIdx), 50);
        return {
          ...prev,
          pot: nextPot,
          currentBet: newCurrentBet,
          minRaise: newCurrentBet + BIG_BLIND,
          players: updatedPlayers,
        };
      });
    },
    [addLog, checkRoundCompletion]
  );

  /**
   * Bot Action Engine
   */
  useEffect(() => {
    if (gameState.stage === 'idle' || gameState.stage === 'ended' || gameState.isDealing) return;

    const currPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currPlayer || !currPlayer.isAi || currPlayer.folded || currPlayer.isAllIn || currPlayer.eliminated) return;

    if (isProcessingBotRef.current) return;
    isProcessingBotRef.current = true;

    const timer = setTimeout(() => {
      isProcessingBotRef.current = false;
      const callNeeded = gameState.currentBet - currPlayer.currentBet;

      const handEval = evaluate7CardHand([...currPlayer.holeCards, ...gameState.communityCards]);
      const isGoodHand = handEval.rankType !== 'high_card' || (currPlayer.holeCards[0]?.rank ?? 0) >= 10;

      if (callNeeded === 0) {
        if (isGoodHand && Math.random() > 0.6) {
          playerRaise(gameState.currentBet + BIG_BLIND);
        } else {
          playerCallOrCheck();
        }
      } else {
        if (callNeeded > currPlayer.chips * 0.6 && !isGoodHand) {
          playerFold();
        } else if (isGoodHand && Math.random() > 0.7 && currPlayer.chips > callNeeded + BIG_BLIND) {
          playerRaise(gameState.currentBet + BIG_BLIND * 2);
        } else {
          playerCallOrCheck();
        }
      }
    }, 750 + Math.floor(Math.random() * 500));

    return () => {
      clearTimeout(timer);
      isProcessingBotRef.current = false;
    };
  }, [
    gameState.stage,
    gameState.isDealing,
    gameState.currentPlayerIndex,
    gameState.currentBet,
    gameState.communityCards,
    gameState.players,
    playerCallOrCheck,
    playerFold,
    playerRaise,
  ]);

  /**
   * Auto advance if all remaining active players are All-In
   */
  useEffect(() => {
    if (gameState.stage === 'idle' || gameState.stage === 'ended' || gameState.isDealing) return;
    const active = gameState.players.filter((p) => !p.folded && !p.eliminated);
    const nonAllIn = active.filter((p) => !p.isAllIn);

    if (active.length > 1 && nonAllIn.length <= 1) {
      const timer = setTimeout(() => {
        advanceStage();
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [gameState.stage, gameState.isDealing, gameState.communityCards.length, gameState.players, advanceStage]);

  /**
   * Turn timer countdown effect (15 seconds)
   */
  useEffect(() => {
    if (gameState.stage === 'idle' || gameState.stage === 'ended' || gameState.isDealing) return;

    const timer = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          const curr = gameState.players[gameState.currentPlayerIndex];
          if (curr && !curr.folded && !curr.isAllIn && !curr.eliminated) {
            const callNeeded = gameState.currentBet - curr.currentBet;
            if (callNeeded <= 0) {
              playerCallOrCheck();
            } else {
              playerFold();
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, gameState.isDealing, gameState.currentPlayerIndex, gameState.currentBet, gameState.players, playerCallOrCheck, playerFold]);

  /**
   * Action: NEXT HAND
   */
  const nextHand = useCallback(() => {
    sound.playShuffle();
    clearDealingTimeouts();
    isAdvancingRef.current = false;

    setGameState((prev) => {
      const updatedEliminated = prev.players.map((p) => ({
        ...p,
        eliminated: p.eliminated || p.chips <= 0,
      }));

      const activeSurvivors = updatedEliminated.filter((p) => !p.eliminated && p.chips > 0);
      const humanPlayer = updatedEliminated.find((p) => p.id === 'player');

      if (activeSurvivors.length <= 1 || (humanPlayer && humanPlayer.chips <= 0)) {
        const winner = activeSurvivors[0] || prev.players[0];
        return {
          ...prev,
          stage: 'ended',
          isMatchOver: true,
          matchWinnerName: winner.name,
          winnerIds: [winner.id],
          winningCardIds: [],
          winningHandDesc: winner.id === 'player' ? 'MATCH CHAMPION! You won all the chips!' : `${winner.name} won the poker match!`,
        };
      }

      const deck = createShuffledPokerDeck();
      deckRef.current = deck;

      const dealtCards: PokerCard[][] = updatedEliminated.map((p) =>
        p.eliminated || p.chips <= 0 ? [] : [deck.pop()!, deck.pop()!]
      );

      const nextPlayers = updatedEliminated.map((p) => {
        if (p.eliminated || p.chips <= 0) return { ...p, folded: true, holeCards: [] };
        return {
          ...p,
          currentBet: 0,
          totalMatchInvested: 0,
          holeCards: [],
          folded: false,
          isAllIn: false,
          hasActedThisStage: false,
          lastAction: undefined,
        };
      });

      let nextDealerIdx = (prev.dealerIndex + 1) % nextPlayers.length;
      while (nextPlayers[nextDealerIdx].eliminated || nextPlayers[nextDealerIdx].chips <= 0) {
        nextDealerIdx = (nextDealerIdx + 1) % nextPlayers.length;
      }

      let sbIdx = (nextDealerIdx + 1) % nextPlayers.length;
      while (nextPlayers[sbIdx].eliminated || nextPlayers[sbIdx].chips <= 0) {
        sbIdx = (sbIdx + 1) % nextPlayers.length;
      }

      let bbIdx = (sbIdx + 1) % nextPlayers.length;
      while (nextPlayers[bbIdx].eliminated || nextPlayers[bbIdx].chips <= 0) {
        bbIdx = (bbIdx + 1) % nextPlayers.length;
      }

      let firstTurnIdx = (bbIdx + 1) % nextPlayers.length;
      while (nextPlayers[firstTurnIdx].eliminated || nextPlayers[firstTurnIdx].chips <= 0) {
        firstTurnIdx = (firstTurnIdx + 1) % nextPlayers.length;
      }

      const sbPost = Math.min(nextPlayers[sbIdx].chips, SMALL_BLIND);
      nextPlayers[sbIdx].chips -= sbPost;
      nextPlayers[sbIdx].currentBet = sbPost;
      nextPlayers[sbIdx].totalMatchInvested = sbPost;
      nextPlayers[sbIdx].lastAction = `SB (${sbPost})`;

      const bbPost = Math.min(nextPlayers[bbIdx].chips, BIG_BLIND);
      nextPlayers[bbIdx].chips -= bbPost;
      nextPlayers[bbIdx].currentBet = bbPost;
      nextPlayers[bbIdx].totalMatchInvested = bbPost;
      nextPlayers[bbIdx].lastAction = `BB (${bbPost})`;

      const t1 = window.setTimeout(() => {
        sound.playPop();
        setGameState((current) => ({
          ...current,
          players: current.players.map((p, idx) => ({
            ...p,
            holeCards: dealtCards[idx].length > 0 ? [dealtCards[idx][0]] : [],
          })),
        }));
      }, 250);

      const t2 = window.setTimeout(() => {
        sound.playPop();
        setGameState((current) => ({
          ...current,
          isDealing: false,
          players: current.players.map((p, idx) => ({
            ...p,
            holeCards: dealtCards[idx],
          })),
        }));
        setTurnTimeLeft(TURN_TIME_LIMIT_SEC);
      }, 600);

      dealingTimeoutsRef.current = [t1, t2];

      return {
        ...prev,
        stage: 'preflop',
        pot: sbPost + bbPost,
        currentBet: Math.max(sbPost, bbPost),
        minRaise: Math.max(sbPost, bbPost) * 2,
        communityCards: [],
        players: nextPlayers,
        dealerIndex: nextDealerIdx,
        smallBlindIndex: sbIdx,
        bigBlindIndex: bbIdx,
        currentPlayerIndex: firstTurnIdx,
        winnerIds: [],
        winningCardIds: [],
        winningHandDesc: undefined,
        isMatchOver: false,
        matchWinnerName: undefined,
        isDealing: true,
      };
    });
  }, []);

  useEffect(() => {
    return () => clearDealingTimeouts();
  }, []);

  return {
    gameState,
    turnTimeLeft,
    startPokerSession,
    nextHand,
    playerFold,
    playerCallOrCheck,
    playerRaise,
  };
}
