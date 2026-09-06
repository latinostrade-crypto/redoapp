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
import { apiRequest, buildAuthenticatedUrl } from '../utils/api';
import { settlePracticeChips } from '../utils/pokerChipSettlement';

const STARTING_CHIPS = 100;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;
const TURN_TIME_LIMIT_SEC = 15;

const DEFAULT_BOTS: { name: string; avatar: AvatarId }[] = [
  { name: 'Bear Ace', avatar: 'bear' },
  { name: 'Fox River', avatar: 'fox' },
  { name: 'Panda Pot', avatar: 'panda' },
  { name: 'Shark Fin', avatar: 'cat' },
  { name: 'Wolf Stack', avatar: 'cat' },
  { name: 'Eagle Eye', avatar: 'rabbit' },
  { name: 'Lion Share', avatar: 'panda' },
  { name: 'Tiger Bluff', avatar: 'fox' },
  { name: 'Owl Wise', avatar: 'bear' }
];

export function usePokerGame(options?: {
  onSettlement?: (payout: number, won: boolean) => void;
  onMatchCancelled?: () => void;
}) {
  const [remoteMatchId, setRemoteMatchId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('redoapp_active_match');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.gameType === 'poker' && parsed.matchId) {
          return parsed.matchId;
        }
      }
    } catch {}
    return null;
  });

  const [gameState, setGameState] = useState<PokerGameState>(() => ({
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
    waitingForPlayers: Boolean(remoteMatchId),
    matchId: remoteMatchId || undefined,
  }));

  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_TIME_LIMIT_SEC);
  const deckRef = useRef<PokerCard[]>([]);
  const isProcessingBotRef = useRef(false);
  const isAdvancingRef = useRef(false);
  const dealingTimeoutsRef = useRef<number[]>([]);

  // Online Multiplayer state tracking
  const remoteMatchStreamRef = useRef<EventSource | null>(null);
  const settledRef = useRef<boolean>(false);
  const remoteStateVersionRef = useRef(0);
  const remoteStateMatchIdRef = useRef('');
  const remoteSyncInFlightRef = useRef<Promise<void> | null>(null);
  const lastRemoteEventAtRef = useRef(0);
  const lastStreamRecoveryAtRef = useRef(0);
  const remoteStreamRetryTimerRef = useRef<number | null>(null);
  const remoteStreamRetryAttemptRef = useRef(0);
  const recoveredPersistentSeatRef = useRef('');
  const remoteActionInFlightRef = useRef(false);
  const optionsRef = useRef(options);

  // Callbacks are often passed as inline functions by the game shell.  Keeping
  // the current callbacks in a ref prevents an incoming state update from
  // tearing down and recreating the EventSource on every render.
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // A delayed polling response must never repaint an earlier turn over an
  // SSE update that already contains the opponent's action.
  const applyRemoteState = useCallback((state: PokerGameState) => {
    const incomingMatchId = state.matchId || state.tableId || '';
    if (incomingMatchId && incomingMatchId !== remoteStateMatchIdRef.current) {
      remoteStateMatchIdRef.current = incomingMatchId;
      remoteStateVersionRef.current = 0;
    }
    const version = Number(state.stateVersion || 0);
    if (version && version < remoteStateVersionRef.current) return false;
    if (version) remoteStateVersionRef.current = version;
    setGameState((prev) => ({
      ...prev,
      ...state,
      waitingForPlayers: state.waitingForPlayers !== undefined ? state.waitingForPlayers : false,
    }));
    if (typeof state.turnTimeLeft === 'number') setTurnTimeLeft(state.turnTimeLeft);
    return true;
  }, []);

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
   * Sync authoritative state from backend in online mode
   */
  const syncRemoteMatchState = useCallback(async (matchIdToSync = remoteMatchId) => {
    if (!matchIdToSync) return;
    if (remoteSyncInFlightRef.current) return remoteSyncInFlightRef.current;
    const sync = (async () => {
      try {
      const result = await apiRequest<{ pokerGameState?: PokerGameState; gameState?: PokerGameState }>(
        `/api/matches/state/${encodeURIComponent(matchIdToSync)}`,
        { retryOnNetworkError: true, networkAttempts: 1, timeoutMs: 12_000 }
      );
      const state = result.pokerGameState || result.gameState;
      if (state) {
        applyRemoteState(state);
      }
      } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (msg.includes('404') || msg.includes('not found') || msg.includes('concluded') || msg.includes('cancelled')) {
        try { localStorage.removeItem('redoapp_active_match'); } catch {}
        setRemoteMatchId(null);
        optionsRef.current?.onMatchCancelled?.();
      }
      }
    })();
    remoteSyncInFlightRef.current = sync;
    try { await sync; } finally {
      if (remoteSyncInFlightRef.current === sync) remoteSyncInFlightRef.current = null;
    }
  }, [remoteMatchId, applyRemoteState]);

  const sendRemotePokerAction = useCallback(async (action: 'fold' | 'check' | 'call' | 'raise' | 'next_hand', amount?: number) => {
    if (!remoteMatchId || remoteActionInFlightRef.current) return;
    remoteActionInFlightRef.current = true;
    try {
      const result = await apiRequest<{ pokerGameState?: PokerGameState; gameState?: PokerGameState }>('/api/matches/action', {
        method: 'POST',
        timeoutMs: 12_000,
        body: JSON.stringify({ matchId: remoteMatchId, action, ...(amount === undefined ? {} : { amount }), expectedStateVersion: gameState.stateVersion }),
      });
      const state = result.pokerGameState || result.gameState;
      if (state) applyRemoteState(state);
    } catch (err) {
      console.error(`Poker ${action} action error`, err);
      void syncRemoteMatchState();
    } finally {
      remoteActionInFlightRef.current = false;
    }
  }, [applyRemoteState, gameState.stateVersion, remoteMatchId, syncRemoteMatchState]);

  /**
   * Start a new Texas Hold'em Poker Session
   */
  const startPokerSession = useCallback(
    (
      userAvatar: AvatarId,
      userName: string,
      mode: 'offline' | 'pvp' | 'private',
      stake: number,
      tableId?: string,
      matchId?: string
    ) => {
      sound.playShuffle();
      clearDealingTimeouts();
      isAdvancingRef.current = false;
      settledRef.current = false;
      remoteStateVersionRef.current = 0;

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
      remoteStateMatchIdRef.current = resolvedMatchId || '';

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
              gameType: 'poker',
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
          stage: 'preflop',
          waitingForPlayers: true,
        }));
        if (resolvedMatchId) {
          syncRemoteMatchState(resolvedMatchId);
        }
        return;
      }

      // Offline Practice Mode vs 3 AI Bots
      setRemoteMatchId(null);

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

      const allPlayers: PokerPlayer[] = [humanPlayer, ...bots];

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
        visualEpoch: Date.now(),
        pot: initialPot,
        currentBet: BIG_BLIND,
        minRaise: BIG_BLIND,
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
            message: `Texas Hold'em started (Practice vs Bots). Blinds: ${SMALL_BLIND}/${BIG_BLIND}`,
            type: 'info',
          },
        ],
        stake,
        mode,
        isDealing: true,
        tableId,
        matchId,
        waitingForPlayers: false,
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
    [syncRemoteMatchState]
  );

  /**
   * Advances game to the next betting round (Preflop -> Flop 3 cards -> Turn 1 card -> River 1 card -> Showdown)
   * (Offline Mode)
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

        return {
          ...prev,
          stage: 'ended',
          winnerIds: [winner.id],
          sidePots: [{ amount: prev.pot, eligiblePlayerIds: [winner.id] }],
          chipAwards: (() => {
            const returned = Math.max(0, winner.totalMatchInvested - Math.max(0, ...prev.players.filter(p => p.id !== winner.id).map(p => p.totalMatchInvested)));
            return [
              { playerId: winner.id, amount: prev.pot - returned, potIndex: 0, kind: 'win' as const },
              { playerId: winner.id, amount: returned, potIndex: 0, kind: 'return' as const },
            ].filter(a => a.amount > 0);
          })(),
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
        nextStage = 'flop';
        const flopCards = [nextDeck.pop()!, nextDeck.pop()!, nextDeck.pop()!];
        nextCommunity = flopCards;
        sound.playShuffle();
      } else if (prev.stage === 'flop') {
        nextStage = 'turn';
        const turnCard = nextDeck.pop()!;
        nextCommunity = [...prev.communityCards.slice(0, 3), turnCard];
        sound.playPop();
      } else if (prev.stage === 'turn') {
        nextStage = 'river';
        const riverCard = nextDeck.pop()!;
        nextCommunity = [...prev.communityCards.slice(0, 4), riverCard];
        sound.playPop();
      } else if (prev.stage === 'river') {
        nextStage = 'showdown';
        nextCommunity = [...prev.communityCards];
      }

      // No betting remains once at most one live player has chips. Run out
      // the board instead of searching forever for an actionable seat.
      if (activePlayers.filter(p => !p.isAllIn).length <= 1) {
        while (nextCommunity.length < 5 && nextDeck.length) nextCommunity.push(nextDeck.pop()!);
        nextStage = 'showdown';
      }

      if (nextStage === 'showdown') {
        isAdvancingRef.current = false;
        // Evaluate all hands
        let bestScore = -1;
        let bestDesc = '';
        let winningBestFive: PokerCard[] = [];
        const scores = new Map<string, number>();

        for (const p of activePlayers) {
          const evalResult = evaluate7CardHand([...p.holeCards, ...nextCommunity]);
          scores.set(p.id, evalResult.score);
          if (evalResult.score > bestScore) {
            bestScore = evalResult.score;
            bestDesc = evalResult.description;
            winningBestFive = evalResult.bestFive;
          }
        }

        const settlement = settlePracticeChips(resetPlayers, scores, prev.dealerIndex);

        sound.playPop();

        return {
          ...prev,
          stage: 'ended',
          communityCards: nextCommunity,
          ...settlement,
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
  }, []);

  /**
   * Check if current betting round is completed (Offline Mode)
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
  const playerFold = useCallback(async () => {
    sound.playPop();

    if (remoteMatchId) {
      await sendRemotePokerAction('fold');
      return;
    }

    // Offline mode
    setGameState((prev) => {
      const currIdx = prev.currentPlayerIndex;
      const updatedPlayers = prev.players.map((p, idx) =>
        idx === currIdx ? { ...p, folded: true, hasActedThisStage: true, lastAction: 'FOLD' } : p
      );
      addLog(`${prev.players[currIdx]?.name || 'Player'} folded`, 'fold');
      setTimeout(() => checkRoundCompletion(updatedPlayers, prev.currentBet, currIdx), 50);
      return { ...prev, players: updatedPlayers };
    });
  }, [addLog, checkRoundCompletion, remoteMatchId, sendRemotePokerAction]);

  /**
   * Action: CHECK / CALL
   */
  const playerCallOrCheck = useCallback(async () => {
    sound.playPop();

    if (remoteMatchId) {
      const human = gameState.players.find((p) => p.id === 'player');
      const needed = human ? gameState.currentBet - human.currentBet : 0;
      const action = needed <= 0 ? 'check' : 'call';
      await sendRemotePokerAction(action);
      return;
    }

    // Offline mode
    setGameState((prev) => {
      const currIdx = prev.currentPlayerIndex;
      const player = prev.players[currIdx];
      if (!player) return prev;
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
  }, [addLog, checkRoundCompletion, gameState.currentBet, gameState.players, remoteMatchId, sendRemotePokerAction]);

  /**
   * Action: RAISE
   */
  const playerRaise = useCallback(
    async (raiseToAmount: number) => {
      sound.playPop();

      if (remoteMatchId) {
        await sendRemotePokerAction('raise', raiseToAmount);
        return;
      }

      // Offline mode
      setGameState((prev) => {
        const currIdx = prev.currentPlayerIndex;
        const player = prev.players[currIdx];
        if (!player) return prev;
        const additionalNeeded = raiseToAmount - player.currentBet;
        const actualBet = Math.min(player.chips, additionalNeeded);
        const isAllIn = actualBet >= player.chips;
        const newCurrentBet = player.currentBet + actualBet;
        const raiseIncrement = newCurrentBet - prev.currentBet;
        if (raiseIncrement <= 0 || (raiseIncrement < prev.minRaise && !isAllIn)) return prev;
        const isFullRaise = raiseIncrement >= prev.minRaise;

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
                // A short all-in can be called, but it must not reopen betting
                // for players who have already acted on this street.
                hasActedThisStage: isFullRaise ? (p.folded || p.isAllIn || p.eliminated) : p.hasActedThisStage,
              }
        );

        addLog(`${player.name} raised to ${newCurrentBet}`, 'bet');
        const nextPot = prev.pot + actualBet;

        setTimeout(() => checkRoundCompletion(updatedPlayers, newCurrentBet, currIdx), 50);
        return {
          ...prev,
          pot: nextPot,
          currentBet: newCurrentBet,
          minRaise: isFullRaise ? raiseIncrement : prev.minRaise,
          players: updatedPlayers,
        };
      });
    },
    [addLog, checkRoundCompletion, remoteMatchId, sendRemotePokerAction]
  );

  /**
   * Action: NEXT HAND
   */
  const nextHand = useCallback(async () => {
    sound.playShuffle();
    clearDealingTimeouts();
    isAdvancingRef.current = false;

    if (remoteMatchId) {
      await sendRemotePokerAction('next_hand');
      return;
    }

    // Offline mode
    setGameState((prev) => {
      const updatedEliminated = prev.players.map((p) => ({
        ...p,
        eliminated: p.eliminated || p.chips <= 0,
      }));

      const activeSurvivors = updatedEliminated.filter((p) => !p.eliminated && p.chips > 0);
      const humanPlayer = updatedEliminated.find((p) => p.id === 'player');

      if (activeSurvivors.length <= 1 || (humanPlayer && humanPlayer.chips <= 0)) {
        // Human elimination ends this practice session, not necessarily the
        // whole table. Seat order cannot identify a match champion.
        const winner = activeSurvivors.length === 1 ? activeSurvivors[0] : undefined;
        const isHumanWinner = winner?.id === 'player';
        const matchPayout = isHumanWinner && prev.stake > 0
          ? Math.round(prev.stake * prev.players.length * 0.96 * 100) / 100
          : 0;

        if (optionsRef.current?.onSettlement) {
          optionsRef.current.onSettlement(matchPayout, isHumanWinner);
        }

        return {
          ...prev,
          stage: 'ended',
          isMatchOver: true,
          matchWinnerName: winner?.name,
          // Preserve the last hand's winners/cards; chipAwards still describe
          // that hand even when the human has run out of chips.
          winningHandDesc: prev.winningHandDesc,
        };
      }

      const deck = createShuffledPokerDeck();
      deckRef.current = deck;

      const dealtCards: PokerCard[][] = updatedEliminated.map((p) =>
        p.eliminated || p.chips <= 0 ? [] : [deck.pop()!, deck.pop()!]
      );

      const nextPlayers = updatedEliminated.map((p) => {
        if (p.eliminated || p.chips <= 0) return { ...p, folded: true, holeCards: [], currentBet: 0, totalMatchInvested: 0 };
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
        visualEpoch: (prev.visualEpoch || 1) + 1,
        chipAwards: [],
        sidePots: [],
        pot: sbPost + bbPost,
        currentBet: Math.max(sbPost, bbPost),
        minRaise: BIG_BLIND,
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
  }, [remoteMatchId, sendRemotePokerAction]);

  // SSE Stream Listener for Online Multiplayer
  useEffect(() => {
    if (!remoteMatchId) {
      return;
    }

    remoteMatchStreamRef.current?.close();
    if (remoteStreamRetryTimerRef.current !== null) {
      window.clearTimeout(remoteStreamRetryTimerRef.current);
      remoteStreamRetryTimerRef.current = null;
    }

    let disposed = false;
    let activeStream: EventSource | null = null;
    const connect = () => {
      if (disposed) return;

      const stream = new EventSource(buildAuthenticatedUrl(`/api/matches/stream/${encodeURIComponent(remoteMatchId)}`));
      activeStream = stream;
      remoteMatchStreamRef.current = stream;

      stream.addEventListener('match-state', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          const pkState: PokerGameState = payload.pokerGameState || payload.gameState;
          if (pkState) {
            remoteStreamRetryAttemptRef.current = 0;
            lastRemoteEventAtRef.current = Date.now();
            if (!applyRemoteState(pkState)) return;

            if ((pkState.stage === 'match_ended' || pkState.isMatchOver) && !settledRef.current) {
              settledRef.current = true;
              const humanPlayer = pkState.players.find((p) => p.id === 'player');
              const isHumanWinner = Boolean(
                humanPlayer && (
                  pkState.matchWinnerName === humanPlayer.name ||
                  pkState.winnerIds?.includes(humanPlayer.id)
                )
              );
              if (isHumanWinner) {
                sound.playVictory();
                optionsRef.current?.onSettlement?.(pkState.winningPayout || 0, true);
              } else {
                optionsRef.current?.onSettlement?.(0, false);
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
          winnerIds: [],
          logs: [],
        }));
        optionsRef.current?.onMatchCancelled?.();
      });

      stream.addEventListener('heartbeat', () => {
        remoteStreamRetryAttemptRef.current = 0;
        lastRemoteEventAtRef.current = Date.now();
      });
      stream.onerror = () => {
        if (disposed || activeStream !== stream) return;
        stream.close();
        if (remoteMatchStreamRef.current === stream) remoteMatchStreamRef.current = null;

        const now = Date.now();
        if (now - lastStreamRecoveryAtRef.current >= 5_000) {
          lastStreamRecoveryAtRef.current = now;
          void syncRemoteMatchState(remoteMatchId);
        }
        const delayMs = Math.min(15_000, 2_000 * 2 ** remoteStreamRetryAttemptRef.current);
        remoteStreamRetryAttemptRef.current = Math.min(remoteStreamRetryAttemptRef.current + 1, 3);
        remoteStreamRetryTimerRef.current = window.setTimeout(connect, delayMs);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (remoteStreamRetryTimerRef.current !== null) {
        window.clearTimeout(remoteStreamRetryTimerRef.current);
        remoteStreamRetryTimerRef.current = null;
      }
      activeStream?.close();
      if (remoteMatchStreamRef.current === activeStream) {
        remoteMatchStreamRef.current = null;
      }
    };
  }, [remoteMatchId, syncRemoteMatchState, applyRemoteState]);

  // Continuous Polling during Online Match Setup and Gameplay
  useEffect(() => {
    if (!remoteMatchId || gameState.stage === 'match_ended' || gameState.isMatchOver) {
      return;
    }

    const pollIntervalMs = gameState.waitingForPlayers ? 3_000 : 4_000;
    const interval = window.setInterval(() => {
      if (Date.now() - lastRemoteEventAtRef.current >= 6_000) void syncRemoteMatchState(remoteMatchId);
    }, pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [gameState.isMatchOver, gameState.stage, gameState.waitingForPlayers, gameState.currentPlayerIndex, remoteMatchId, syncRemoteMatchState]);

  // Restore a durable seat before presenting the spectator buy-in UI after a
  // Telegram reload. This reconciliation is idempotent and never charges.
  useEffect(() => {
    if (!remoteMatchId?.startsWith('table-') || recoveredPersistentSeatRef.current === remoteMatchId) return;
    recoveredPersistentSeatRef.current = remoteMatchId;
    apiRequest<{ seated: boolean }>(`/api/casino/my-seat/${encodeURIComponent(remoteMatchId)}`, { timeoutMs: 12_000 })
      .then(() => syncRemoteMatchState(remoteMatchId))
      .catch(() => undefined);
  }, [remoteMatchId, syncRemoteMatchState]);

  useEffect(() => {
    if (!remoteMatchId || !['preflop', 'flop', 'turn', 'river'].includes(gameState.stage)) return;
    const update = () => setTurnTimeLeft(Math.max(0, Math.ceil(((gameState.turnStartedAt || Date.now()) + TURN_TIME_LIMIT_SEC * 1000 - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [gameState.stage, gameState.turnStartedAt, remoteMatchId]);

  // The buy-in dialog completes before the next polling interval. Refresh the
  // authoritative table state immediately so the user sees their seat at once.
  useEffect(() => {
    const onSeatTaken = (event: Event) => {
      const tableId = (event as CustomEvent<{ tableId?: string }>).detail?.tableId;
      if (tableId && tableId === remoteMatchId) void syncRemoteMatchState(tableId);
    };
    window.addEventListener('redoapp:casino-seat-taken', onSeatTaken);
    return () => window.removeEventListener('redoapp:casino-seat-taken', onSeatTaken);
  }, [remoteMatchId, syncRemoteMatchState]);

  const isSeatedAtPersistentPokerTable = gameState.players.some((player) => player.id === 'player');
  useEffect(() => {
    if (!remoteMatchId?.startsWith('table-') || !isSeatedAtPersistentPokerTable) return;
    const heartbeat = () => apiRequest('/api/casino/table-heartbeat', {
      method: 'POST',
      body: JSON.stringify({ tableId: remoteMatchId }),
      timeoutMs: 8_000,
    }).catch(() => undefined);
    heartbeat();
    const timer = window.setInterval(heartbeat, 25_000);
    return () => window.clearInterval(timer);
  }, [isSeatedAtPersistentPokerTable, remoteMatchId]);

  /**
   * Bot Action Engine (Offline Mode Only)
   */
  useEffect(() => {
    if (remoteMatchId || gameState.stage === 'idle' || gameState.stage === 'ended' || gameState.isDealing) return;

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
    remoteMatchId,
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
   * Auto advance if all remaining active players are All-In (Offline Mode Only)
   */
  useEffect(() => {
    if (remoteMatchId || gameState.stage === 'idle' || gameState.stage === 'ended' || gameState.isDealing) return;
    const active = gameState.players.filter((p) => !p.folded && !p.eliminated);
    const nonAllIn = active.filter((p) => !p.isAllIn);

    if (active.length > 1 && nonAllIn.length <= 1) {
      const timer = setTimeout(() => {
        advanceStage();
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [remoteMatchId, gameState.stage, gameState.isDealing, gameState.communityCards.length, gameState.players, advanceStage]);

  /**
   * Turn timer countdown effect (15 seconds) (Offline Mode Only)
   */
  useEffect(() => {
    if (remoteMatchId || gameState.stage === 'idle' || gameState.stage === 'ended' || gameState.isDealing) return;

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
  }, [remoteMatchId, gameState.stage, gameState.isDealing, gameState.currentPlayerIndex, gameState.currentBet, gameState.players, playerCallOrCheck, playerFold]);

  // Auto-restore active poker match on mount
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('redoapp_active_match') : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.gameType === 'poker' && parsed.matchId) {
          if (!String(parsed.matchId).startsWith('table-') && parsed.createdAt && Date.now() - Number(parsed.createdAt) > 15 * 60 * 1000) {
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

  const resetPokerSession = useCallback(() => {
    remoteMatchStreamRef.current?.close();
    remoteMatchStreamRef.current = null;
    if (remoteStreamRetryTimerRef.current !== null) {
      window.clearTimeout(remoteStreamRetryTimerRef.current);
      remoteStreamRetryTimerRef.current = null;
    }
    remoteStreamRetryAttemptRef.current = 0;
    clearDealingTimeouts();
    setRemoteMatchId(null);
    setGameState({
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
      waitingForPlayers: false,
      matchId: undefined,
    });
  }, []);

  const spectatePokerMatch = useCallback(async (matchId: string) => {
    if (!matchId) return false;
    clearDealingTimeouts();
    settledRef.current = false;
    remoteStateVersionRef.current = 0;
    remoteStateMatchIdRef.current = matchId;
    try {
      localStorage.setItem('redoapp_active_match', JSON.stringify({
        matchId,
        mode: 'pvp',
        gameType: 'poker',
        isSpectator: true,
        createdAt: Date.now(),
      }));
    } catch {}
    setRemoteMatchId(matchId);
    setGameState((prev) => ({ ...prev, matchId, mode: 'pvp', waitingForPlayers: true }));
    await syncRemoteMatchState(matchId);
    return true;
  }, [syncRemoteMatchState]);

  return {
    gameState,
    turnTimeLeft,
    startPokerSession,
    nextHand,
    playerFold,
    playerCallOrCheck,
    playerRaise,
    spectatePokerMatch,
    resetPokerSession,
  };
}
