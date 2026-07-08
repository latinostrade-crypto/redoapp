/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  UnoCardType,
  Player,
  PlayerId,
  GamePhase,
  GameState,
  CardColor,
  CardValue,
  GameStats,
} from '../types';
import {
  generateDeck,
  shuffleDeck,
  isValidMove,
  getBestColorForAi,
  createLog,
  CARTOON_BUBBLES,
} from '../utils/unoEngine';
import { sound } from '../utils/sound';
import { calculateTicketPayouts } from '../utils/rewardEconomy';
import { apiRequest, buildAuthenticatedUrl } from '../utils/api';

const INITIAL_STATS: GameStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  cardsPlayedCount: 0,
  xp: 0,
  practiceGamesPlayed: 0,
  practiceGamesWon: 0,
  realPvpGamesPlayed: 0,
  realPvpGamesWon: 0,
  privateGamesPlayed: 0,
  privateGamesWon: 0,
  practiceXp: 0,
  realPvpXp: 0,
  privateXp: 0,
};

export function useUnoGame() {
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    discardPile: [],
    players: [],
    currentPlayerIndex: 0,
    direction: 1,
    activeColor: 'red',
    activeValue: '0',
    phase: 'setup',
    winnerId: null,
    logs: [],
    drawCountAccumulator: 0,
    unoShoutCooldown: {},
    dealerId: 'ai1',
    consecutiveDraws: 0,
    accusablePlayers: [],
  });

  const [stats, setStats] = useState<GameStats>(INITIAL_STATS);
  const [wildSelectOpen, setWildSelectOpen] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState<UnoCardType | null>(null);
  const [caughtDialog, setCaughtDialog] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });

  // Experience point and leaderboard state
  const [cardsPlayedThisRound, setCardsPlayedThisRound] = useState(0);
  const [cardsDrawnThisRound, setCardsDrawnThisRound] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Ticket, transaction and game mode states
  const [gameMode, setGameMode] = useState<'offline' | 'pvp' | 'private'>('offline');
  const [activeStake, setActiveStake] = useState<number>(0);
  const [goldenTickets, setGoldenTickets] = useState<number>(() => {
    const saved = localStorage.getItem('uno_golden_tickets');
    return saved ? parseFloat(saved) : 0;
  });
  const [transactions, setTransactions] = useState<any[]>(() => {
    const saved = localStorage.getItem('yo_transactions');
    if (saved) return JSON.parse(saved);
    return [];
  });
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(20);
  const remoteMatchIdRef = useRef<string | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);
  const [remoteSessionActive, setRemoteSessionActive] = useState(false);
  const remoteMatchStreamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    localStorage.setItem('uno_golden_tickets', goldenTickets.toString());
  }, [goldenTickets]);

  useEffect(() => {
    localStorage.setItem('yo_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // Reference to timing timers for clear cleanup
  const aiTurnTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const speechBubbleTimeoutRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const aiTurnHandledRef = useRef<string | null>(null);

  // Load stats from localStorage
  useEffect(() => {
    const cached = localStorage.getItem('uno_cartoon_stats');
    if (cached) {
      try {
        setStats(JSON.parse(cached));
      } catch (e) {
        console.error('Error parsing stats', e);
      }
    }
  }, []);

  const saveStats = useCallback((updater: GameStats | ((prev: GameStats) => GameStats)) => {
    setStats((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      localStorage.setItem('uno_cartoon_stats', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handleProfileSync = (event: Event) => {
      const detail = (event as CustomEvent<{ xp?: number }>).detail;
      if (typeof detail?.xp !== 'number') return;
      saveStats((prev) => ({
        ...prev,
        xp: detail.xp!,
      }));
    };
    window.addEventListener('redoapp:profile-sync', handleProfileSync as EventListener);
    return () => {
      window.removeEventListener('redoapp:profile-sync', handleProfileSync as EventListener);
    };
  }, [saveStats]);

  const syncRemoteMatchState = useCallback(async () => {
    const activeMatchRaw = localStorage.getItem('redoapp_active_match');
    if (!activeMatchRaw) {
      remoteMatchIdRef.current = null;
      remoteUserIdRef.current = null;
      setRemoteSessionActive(false);
      return false;
    }

    try {
      const activeMatch = JSON.parse(activeMatchRaw) as {
        matchId: string;
        currentUserId: string;
      };
      if (!activeMatch.matchId || !activeMatch.currentUserId) {
        return false;
      }
      remoteMatchIdRef.current = activeMatch.matchId;
      remoteUserIdRef.current = activeMatch.currentUserId;
      const result = await apiRequest<{ gameState: GameState }>(`/api/matches/state/${encodeURIComponent(activeMatch.matchId)}`);
      setGameState(result.gameState);
      setRemoteSessionActive(true);
      return true;
    } catch (error) {
      console.error('Remote match state sync failed', error);
      localStorage.removeItem('redoapp_active_match');
      remoteMatchIdRef.current = null;
      remoteUserIdRef.current = null;
      setRemoteSessionActive(false);
      setGameState((prev) => ({
        ...prev,
        phase: 'setup',
        players: [],
        winnerId: null,
      }));
      return false;
    }
  }, []);

  // Listen for game over to calculate leaderboard and reward XP and Tickets
  useEffect(() => {
    if (gameState.phase === 'game_over' && gameState.winnerId && leaderboard.length === 0) {
      const winnerId = gameState.winnerId;
      const totalPlayers = gameState.players.length;
      const ticketPayouts = gameMode === 'offline' || activeStake <= 0
        ? []
        : calculateTicketPayouts(activeStake, Math.min(4, Math.max(2, totalPlayers)) as 2 | 3 | 4).payouts;
      
      const entries = gameState.players.map((player) => {
        const isWinner = player.id === winnerId;
        // Winner gets 0 points. Rest of the players sum up the score value of their remaining cards
        const points = isWinner ? 0 : player.hand.reduce((sum, card) => sum + (card.score || 0), 0);
        
        return {
          playerId: player.id,
          name: player.name,
          avatar: player.avatar,
          points,
          rank: 1, // Will update
          xpGained: 0, // Will update
          isWinner,
        };
      });

      // Sort by points in ascending order (lowest points = better)
      // Winner has 0 points, so they are guaranteed 1st place!
      entries.sort((a, b) => a.points - b.points);

      const finalEntries = entries.map((entry, index) => {
        const rank = index + 1;
        let xpGained = 0;
        let ticketsGained = 0;
        
        if (entry.playerId === 'player') {
          if (gameMode === 'offline') {
            xpGained = Math.round(12 + (rank === 1 ? 18 : rank === 2 ? 8 : rank === 3 ? 4 : 2) + (cardsPlayedThisRound * 1.5) + (cardsDrawnThisRound * 0.5));
          } else if (gameMode === 'pvp') {
            const baseXp = 30 + (rank === 1 ? 55 : rank === 2 ? 30 : rank === 3 ? 18 : 10) + (cardsPlayedThisRound * 2);
            const stakeMultiplier = activeStake >= 30 ? 1.35 : activeStake >= 10 ? 1.2 : activeStake >= 5 ? 1.1 : 1;
            xpGained = Math.round(baseXp * stakeMultiplier);
          } else {
            xpGained = Math.round(22 + (rank === 1 ? 38 : rank === 2 ? 22 : rank === 3 ? 12 : 8) + (cardsPlayedThisRound * 1.5));
          }
        } else {
          xpGained = rank === 1 ? 40 : rank === 2 ? 20 : rank === 3 ? 10 : 5;
        }

        // Calculate Ticket Payouts if PVP or Private Mode
        if (gameMode !== 'offline' && activeStake > 0) {
          ticketsGained = ticketPayouts[rank - 1] || 0;
        }

        return {
          ...entry,
          rank,
          xpGained,
          ticketsGained,
        };
      });

      setLeaderboard(finalEntries);

      // Find player entry to award XP and tickets to stats
      const playerEntry = finalEntries.find((e) => e.playerId === 'player');
      if (playerEntry) {
        saveStats((prev) => ({
          ...prev,
          xp: (prev.xp || 0) + playerEntry.xpGained,
          practiceXp: prev.practiceXp + (gameMode === 'offline' ? playerEntry.xpGained : 0),
          realPvpXp: prev.realPvpXp + (gameMode === 'pvp' ? playerEntry.xpGained : 0),
          privateXp: prev.privateXp + (gameMode === 'private' ? playerEntry.xpGained : 0),
        }));

        if (gameMode === 'offline') {
          const won = playerEntry.rank === 1;
          const newTx = {
            id: `tx-free-over-${Date.now()}`,
            event: won ? 'Victory in Free Game' : 'Free Game Ended',
            value: won ? `+${playerEntry.xpGained} XP` : `Rank ${playerEntry.rank}`,
            time: 'Just now',
            type: won ? 'mint' : 'disconnect',
          };
          setTransactions((prev) => [newTx, ...prev].slice(0, 10));
        }
      }
    }
  }, [gameState.phase, gameState.winnerId, cardsPlayedThisRound, cardsDrawnThisRound, saveStats, gameState.players, gameMode, activeStake, leaderboard.length]);

  useEffect(() => {
    if ((gameMode !== 'pvp' && gameMode !== 'private') || !remoteSessionActive || gameState.phase === 'game_over') {
      return;
    }

    if (!remoteMatchIdRef.current || !remoteUserIdRef.current) {
      return;
    }

    remoteMatchStreamRef.current?.close();
    const stream = new EventSource(buildAuthenticatedUrl(`/api/matches/stream/${encodeURIComponent(remoteMatchIdRef.current)}`));
    remoteMatchStreamRef.current = stream;

    stream.addEventListener('match-state', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { gameState: GameState };
      setGameState(payload.gameState);
    });

    stream.onerror = () => {
      syncRemoteMatchState().catch(() => undefined);
    };

    return () => {
      stream.close();
      if (remoteMatchStreamRef.current === stream) {
        remoteMatchStreamRef.current = null;
      }
    };
  }, [gameMode, gameState.phase, remoteSessionActive, syncRemoteMatchState]);

  const addLog = useCallback((message: string, type: 'info' | 'play' | 'draw' | 'uno' | 'action' | 'win' = 'info') => {
    setGameState((prev) => {
      const log = createLog(message, type);
      return {
        ...prev,
        logs: [log, ...prev.logs].slice(0, 50), // keep last 50 logs
      };
    });
  }, []);

  // Set avatar Speech bubble in state
  const triggerBubble = useCallback((playerId: PlayerId, text: string, durationMs: number = 3000) => {
    setGameState((prev) => {
      const players = prev.players.map((p) => {
        if (p.id === playerId) {
          return { ...p, activeBubble: text };
        }
        return p;
      });
      return { ...prev, players };
    });

    if (speechBubbleTimeoutRefs.current[playerId]) {
      clearTimeout(speechBubbleTimeoutRefs.current[playerId]);
    }

    speechBubbleTimeoutRefs.current[playerId] = setTimeout(() => {
      setGameState((prev) => {
        const players = prev.players.map((p) => {
          if (p.id === playerId) {
            return { ...p, activeBubble: undefined };
          }
          return p;
        });
        return { ...prev, players };
      });
    }, durationMs);
  }, []);

  const changeEmotion = useCallback((playerId: PlayerId, emotion: Player['emotion'], durationMs: number = 4000) => {
    setGameState((prev) => {
      const players = prev.players.map((p) => {
        if (p.id === playerId) {
          return { ...p, emotion };
        }
        return p;
      });
      return { ...prev, players };
    });

    // Reset to happy or normal after a duration
    setTimeout(() => {
      setGameState((prev) => {
        const players = prev.players.map((p) => {
          if (p.id === playerId) {
            // Determine baseline emotion based on hand size
            const baseEmotion = p.hand.length > 8 ? 'worried' : 'happy';
            return { ...p, emotion: baseEmotion };
          }
          return p;
        });
        return { ...prev, players };
      });
    }, durationMs);
  }, []);

  // Initialize Game Setup
  const startGame = useCallback((
    selectedAvatar: 'bear' | 'rabbit' | 'fox' | 'panda' | 'cat' | 'koala' = 'bear',
    userName: string = 'Cute Cadet',
    mode: 'offline' | 'pvp' | 'private' = 'offline',
    stakeAmount: number = 0
  ) => {
    sound.playShuffle();
    setGameMode(mode);
    setActiveStake(stakeAmount);

    if (mode !== 'pvp' && mode !== 'private') {
      setRemoteSessionActive(false);
      remoteMatchIdRef.current = null;
      remoteUserIdRef.current = null;
    }

    if ((mode === 'pvp' || mode === 'private') && localStorage.getItem('redoapp_active_match')) {
      setCardsPlayedThisRound(0);
      setCardsDrawnThisRound(0);
      setLeaderboard([]);
      setWildSelectOpen(false);
      setPendingWildCard(null);
      saveStats((prev) => ({
        ...prev,
        gamesPlayed: prev.gamesPlayed + 1,
        realPvpGamesPlayed: prev.realPvpGamesPlayed + (mode === 'pvp' ? 1 : 0),
        privateGamesPlayed: prev.privateGamesPlayed + (mode === 'private' ? 1 : 0),
      }));
      setGameState({
        deck: [],
        discardPile: [],
        players: [],
        currentPlayerIndex: 0,
        direction: 1,
        activeColor: 'red',
        activeValue: '0',
        phase: 'playing',
        winnerId: null,
        logs: [createLog('Connecting to live stake table...', 'info')],
        drawCountAccumulator: 0,
        unoShoutCooldown: {},
        dealerId: 'ai1',
        consecutiveDraws: 0,
        accusablePlayers: [],
      });
      syncRemoteMatchState();
      speechBubbleTimeoutRefs.current = {};
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
      aiTurnHandledRef.current = null;
      return;
    }

    if (mode === 'offline') {
      const newTx = {
        id: `tx-free-game-${Date.now()}`,
        event: 'Free Game Played',
        value: '0 Stake',
        time: 'Just now',
        type: 'claim',
      };
      setTransactions((prev) => [newTx, ...prev].slice(0, 10));
    }

    let tempDeck = shuffleDeck(generateDeck());

    // Reset round metrics and leaderboard
    setCardsPlayedThisRound(0);
    setCardsDrawnThisRound(0);
    setLeaderboard([]);

    // Create 4 initial players
    const humanPlayer: Player = {
      id: 'player',
      name: userName || 'You',
      avatar: selectedAvatar,
      hand: [],
      isAi: false,
      unoDeclared: false,
      emotion: 'happy',
    };

    const aiBots: Player[] = [
      {
        id: 'ai1',
        name: 'Happy Bear 🐻',
        avatar: 'bear' as const,
        hand: [],
        isAi: true,
        unoDeclared: false,
        emotion: 'happy',
      },
      {
        id: 'ai2',
        name: 'Sneaky Fox 🦊',
        avatar: 'fox' as const,
        hand: [],
        isAi: true,
        unoDeclared: false,
        emotion: 'happy',
      },
      {
        id: 'ai3',
        name: 'Sleepy Panda 🐼',
        avatar: 'panda' as const,
        hand: [],
        isAi: true,
        unoDeclared: false,
        emotion: 'happy',
      },
    ];

    // Filter out human avatar so AI bots have distinct avatars
    const extraAvatars: ('bear' | 'rabbit' | 'fox' | 'panda' | 'cat' | 'koala')[] = ['rabbit', 'panda', 'cat', 'koala', 'fox', 'bear'];
    const filteredExtra = extraAvatars.filter((av) => av !== selectedAvatar);

    aiBots[0].avatar = filteredExtra[0];
    aiBots[0].name = `Bouncy ${filteredExtra[0].charAt(0).toUpperCase() + filteredExtra[0].slice(1)}`;
    aiBots[1].avatar = filteredExtra[1];
    aiBots[1].name = `Sneaky ${filteredExtra[1].charAt(0).toUpperCase() + filteredExtra[1].slice(1)}`;
    aiBots[2].avatar = filteredExtra[2];
    aiBots[2].name = `Sleepy ${filteredExtra[2].charAt(0).toUpperCase() + filteredExtra[2].slice(1)}`;

    const allPlayers = [humanPlayer, ...aiBots];

    // Deal 7 cards to each player
    for (let c = 0; c < 7; c++) {
      allPlayers.forEach((p) => {
        const drawn = tempDeck.pop();
        if (drawn) p.hand.push(drawn);
      });
    }

    // Find first standard non-wild card to put on discard pile
    let startingCardIndex = tempDeck.findIndex((c) => c.color !== 'wild');
    if (startingCardIndex === -1) startingCardIndex = 0; // fallback if somehow all wild

    const startingCard = tempDeck.splice(startingCardIndex, 1)[0];

    // Assign Initial state
    setGameState({
      deck: tempDeck,
      discardPile: [startingCard],
      players: allPlayers,
      currentPlayerIndex: 0,
      direction: 1,
      activeColor: startingCard.color,
      activeValue: startingCard.value,
      phase: 'playing',
      winnerId: null,
      logs: [createLog('🎈 Welcome to the card table! Let the match begin! 🐾', 'info')],
      drawCountAccumulator: 0,
      unoShoutCooldown: {},
      dealerId: 'ai1',
      consecutiveDraws: 0,
      accusablePlayers: [],
    });

    setWildSelectOpen(false);
    setPendingWildCard(null);

    // Save statistics in localStorage
    saveStats((prev) => ({
      ...prev,
      gamesPlayed: prev.gamesPlayed + 1,
      practiceGamesPlayed: prev.practiceGamesPlayed + (mode === 'offline' ? 1 : 0),
      realPvpGamesPlayed: prev.realPvpGamesPlayed + (mode === 'pvp' ? 1 : 0),
      privateGamesPlayed: prev.privateGamesPlayed + (mode === 'private' ? 1 : 0),
    }));

    // Reset clean bubbles
    speechBubbleTimeoutRefs.current = {};
    if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
    aiTurnHandledRef.current = null;
  }, [saveStats, syncRemoteMatchState]);

  // Execute Player Turn switch log
  const advanceTurn = useCallback((state: GameState, customSkipCount: number = 1): GameState => {
    let nextIndex = state.currentPlayerIndex + state.direction * customSkipCount;

    // Loop indices around player size (4 players)
    const numPlayers = state.players.length;
    nextIndex = (nextIndex % numPlayers + numPlayers) % numPlayers;

    const nextPlayer = state.players[nextIndex];

    // Reset draw count if we didn't perform stacking (standard draw rules)
    // We also clear accusable list except for anyone who has just moved
    return {
      ...state,
      currentPlayerIndex: nextIndex,
      consecutiveDraws: 0,
    };
  }, []);

  // Standard play execution with effects
  const playCard = useCallback((playerId: PlayerId, card: UnoCardType, chosenColor?: CardColor) => {
    setGameState((prev) => {
      // Find player
      const sender = prev.players.find((p) => p.id === playerId);
      if (!sender) return prev;

      // Validate playable matching card (unless it's a wild, or color-matching)
      const valid = card.color === 'wild' || isValidMove(card, prev.activeColor, prev.activeValue);
      if (!valid) {
        if (playerId === 'player') sound.playError();
        return prev;
      }

      // If playing the last card, game is over!
      const isGameOver = sender.hand.length === 1;

      // Extract played card from hand
      const updatedHand = sender.hand.filter((c) => c.id !== card.id);
      const updatedPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          return {
            ...p,
            hand: updatedHand,
          };
        }
        return p;
      });

      // Wild color choice handling
      const finalColor = card.color === 'wild' ? (chosenColor || 'red') : card.color;

      // Play card sounds
      if (card.color === 'wild') {
        sound.playWild();
      } else if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') {
        sound.playAction();
      } else {
        sound.playPlay();
      }

      let newState: GameState = {
        ...prev,
        discardPile: [...prev.discardPile, card],
        players: updatedPlayers,
        activeColor: finalColor,
        activeValue: card.value,
        accusablePlayers: [],
      };

      const displayColorStr = (col: string) => col === 'green' ? 'purple' : col;
      const cardLabel = card.color === 'wild'
        ? `${card.value === 'wild_draw4' ? 'Wild Draw +4' : 'Wild'} (Color: ${displayColorStr(finalColor).toUpperCase()} 🌈)`
        : `${displayColorStr(card.color).toUpperCase()} ${card.value.toUpperCase()}`;

      let logMsg = `🃏 ${sender.name} played ${cardLabel}`;

      // Handle win state
      if (isGameOver) {
        sound.playVictory();
        saveStats((prevStats) => ({
          ...prevStats,
          gamesWon: prevStats.gamesWon + (playerId === 'player' ? 1 : 0),
          practiceGamesWon: prevStats.practiceGamesWon + (playerId === 'player' && gameMode === 'offline' ? 1 : 0),
          realPvpGamesWon: prevStats.realPvpGamesWon + (playerId === 'player' && gameMode === 'pvp' ? 1 : 0),
          privateGamesWon: prevStats.privateGamesWon + (playerId === 'player' && gameMode === 'private' ? 1 : 0),
        }));

        // Calculate scores
        return {
          ...newState,
          phase: 'game_over',
          winnerId: playerId,
          logs: [createLog(`👑 HOOPLA! ${sender.name} won the match! 🎉🎈`, 'win'), ...newState.logs],
        };
      }

      // Handle Wild Card Draw 4 and Action Cards
      let skipCount = 1;
      let deck = [...prev.deck];
      let discardPile = [...newState.discardPile];

      const checkRefillDeck = (countNeeded: number) => {
        if (deck.length < countNeeded) {
          const topOfDiscard = discardPile.pop()!;
          deck = shuffleDeck([...deck, ...discardPile]);
          discardPile = [topOfDiscard];
        }
      };

      if (card.value === 'reverse') {
        newState.direction = newState.direction === 1 ? -1 : 1;
        logMsg += ` 🔄 Turned reverse play direction!`;
        const activeAiPlayer = prev.players[(prev.currentPlayerIndex + prev.direction * 1 + 4) % 4];
        changeEmotion(activeAiPlayer.id, 'thinking', 1500);
      } else if (card.value === 'skip') {
        skipCount = 2;
        const skippedId = prev.players[(prev.currentPlayerIndex + prev.direction + 4) % 4].id;
        logMsg += ` 🚫 Skipped ${prev.players[(prev.currentPlayerIndex + prev.direction + 4) % 4].name}!`;
        // Trigger cute upset reaction
        setTimeout(() => {
          changeEmotion(skippedId, 'angry', 2500);
          triggerBubble(skippedId, 'Hey! I was ready to play! 💢', 1500);
        }, 150);
      } else if (card.value === 'draw2') {
        // Draw 2 penalty
        const victimIndex = (prev.currentPlayerIndex + prev.direction + 4) % 4;
        const victim = prev.players[victimIndex];

        checkRefillDeck(2);
        const drawnCards = deck.splice(0, 2);

        newState.players = newState.players.map((p) => {
          if (p.id === victim.id) {
            return {
              ...p,
              hand: [...p.hand, ...drawnCards],
              emotion: 'worried' as const,
            };
          }
          return p;
        });

        skipCount = 2; // skip they after drawing
        logMsg += ` 📥 Forced ${victim.name} to draw 2 cards!`;

        setTimeout(() => {
          triggerBubble(victim.id, 'Oops! Two extra cards! 🥕🐼', 2500);
        }, 150);
      } else if (card.value === 'wild_draw4') {
        // Draw 4 penalty
        const victimIndex = (prev.currentPlayerIndex + prev.direction + 4) % 4;
        const victim = prev.players[victimIndex];

        checkRefillDeck(4);
        const drawnCards = deck.splice(0, 4);

        newState.players = newState.players.map((p) => {
          if (p.id === victim.id) {
            return {
              ...p,
              hand: [...p.hand, ...drawnCards],
              emotion: 'angry' as const,
            };
          }
          return p;
        });

        skipCount = 2; // skip after drawing
        logMsg += ` 💥 Forced ${victim.name} to draw 4 cards!`;

        setTimeout(() => {
          triggerBubble(victim.id, 'Oh, no! FOUR CARDS? Unfair! 🦊😭💦', 3000);
        }, 150);
      }

      // Add actual log
      const formattedLog = createLog(logMsg, card.color === 'wild' || card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2' ? 'action' : 'play');
      newState.logs = [formattedLog, ...newState.logs].slice(0, 50);

      // Save deck state updates
      newState.deck = deck;
      newState.discardPile = discardPile;

      // Advance turn index
      return advanceTurn(newState, skipCount);
    });

    // Stats play update
    if (playerId === 'player') {
      setCardsPlayedThisRound((prev) => prev + 1);
      saveStats((prevStats) => ({
        ...prevStats,
        cardsPlayedCount: prevStats.cardsPlayedCount + 1,
      }));
    }
  }, [advanceTurn, triggerBubble, changeEmotion, saveStats, addLog]);

  // Handle color picker for wild cards
  const selectWildColor = useCallback((color: CardColor) => {
    if (pendingWildCard) {
      if ((gameMode === 'pvp' || gameMode === 'private') && remoteSessionActive && remoteMatchIdRef.current && remoteUserIdRef.current) {
        apiRequest<{ gameState: GameState }>('/api/matches/action', {
          method: 'POST',
          body: JSON.stringify({
            matchId: remoteMatchIdRef.current,
            userId: remoteUserIdRef.current,
            action: 'play',
            cardId: pendingWildCard.id,
            chosenColor: color,
          }),
        }).then((result) => {
          sound.playWild();
          setGameState(result.gameState);
          setCardsPlayedThisRound((prev) => prev + 1);
          saveStats((prevStats) => ({
            ...prevStats,
            cardsPlayedCount: prevStats.cardsPlayedCount + 1,
          }));
          setWildSelectOpen(false);
          setPendingWildCard(null);
        }).catch((error) => {
          sound.playError();
          alert(error.message);
        });
        return;
      }

      playCard('player', pendingWildCard, color);
      setWildSelectOpen(false);
      setPendingWildCard(null);
    }
  }, [gameMode, pendingWildCard, playCard, remoteSessionActive, saveStats]);

  // Initiate Playing wild card (Human)
  const initiatePlayCard = useCallback((card: UnoCardType) => {
    if ((gameMode === 'pvp' || gameMode === 'private') && remoteSessionActive && remoteMatchIdRef.current && remoteUserIdRef.current) {
      if (card.color === 'wild') {
        setPendingWildCard(card);
        setWildSelectOpen(true);
        sound.playPop();
      } else {
        apiRequest<{ gameState: GameState }>('/api/matches/action', {
          method: 'POST',
          body: JSON.stringify({
            matchId: remoteMatchIdRef.current,
            userId: remoteUserIdRef.current,
            action: 'play',
            cardId: card.id,
          }),
        }).then((result) => {
          sound.playPlay();
          setGameState(result.gameState);
          setCardsPlayedThisRound((prev) => prev + 1);
          saveStats((prevStats) => ({
            ...prevStats,
            cardsPlayedCount: prevStats.cardsPlayedCount + 1,
          }));
        }).catch((error) => {
          sound.playError();
          alert(error.message);
        });
      }
      return;
    }

    if (card.color === 'wild') {
      setPendingWildCard(card);
      setWildSelectOpen(true);
      sound.playPop();
    } else {
      playCard('player', card);
    }
  }, [gameMode, playCard, remoteSessionActive, saveStats]);

  // Draw Card Logic
  const drawCard = useCallback((playerId: PlayerId) => {
    if ((gameMode === 'pvp' || gameMode === 'private') && remoteSessionActive && remoteMatchIdRef.current && remoteUserIdRef.current && playerId === 'player') {
      sound.playDraw();
      apiRequest<{ gameState: GameState }>('/api/matches/action', {
        method: 'POST',
        body: JSON.stringify({
          matchId: remoteMatchIdRef.current,
          userId: remoteUserIdRef.current,
          action: 'draw',
        }),
      }).then((result) => {
        setGameState(result.gameState);
        setCardsDrawnThisRound((prev) => prev + 1);
      }).catch((error) => {
        sound.playError();
        alert(error.message);
      });
      return null;
    }

    sound.playDraw();
    let drawnPlayableCard: UnoCardType | null = null;

    setGameState((prev) => {
      const sender = prev.players.find((p) => p.id === playerId);
      if (!sender) return prev;

      let deck = [...prev.deck];
      let discardPile = [...prev.discardPile];

      if (deck.length === 0) {
        if (discardPile.length <= 1) {
          // Absolute fail case: regenerate cards
          deck = shuffleDeck(generateDeck());
        } else {
          // Normal card recycling
          const topOfDiscard = discardPile.pop()!;
          deck = shuffleDeck(discardPile);
          discardPile = [topOfDiscard];
        }
        addLog('🔄 Deck reshuffled! Cards recycled smoothly. 🎈', 'info');
      }

      const drawnCard = deck.pop();
      if (!drawnCard) return prev;

      // Under UNO rules: if the drawn card is playable immediately,
      // it can be played! Let's check if playable
      const playable = drawnCard.color === 'wild' || isValidMove(drawnCard, prev.activeColor, prev.activeValue);
      if (playable) {
        drawnPlayableCard = drawnCard;
      }

      const updatedPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          return {
            ...p,
            hand: [...p.hand, drawnCard],
          };
        }
        return p;
      });

      let nextState = {
        ...prev,
        deck,
        discardPile,
        players: updatedPlayers,
        consecutiveDraws: prev.consecutiveDraws + 1,
      };

      const logMsg = `📥 ${sender.name} drew a card.`;
      nextState.logs = [createLog(logMsg, 'draw'), ...prev.logs].slice(0, 50);

      // For AI: if they drew a playable card, make them play it automatically!
      // This is fast and makes matches much more snappy!
      // For Human: we let them select it in their hand.
      // So if it's AI, we return custom flag or handle in AI play runner.
      // Here, if it's the player's turn, we can transition to them, but we don't automatically advance turn
      // if they just drew a card, standard rules state they get to skip if they don't play.
      // To simplify: if they drew a card and can't play, we advance the turn!
      // If it's playable, we still let them choose? Or if not playable, auto-skip.
      // Standard UNO: you draw once. If playable, you can play it immediately or pass.
      // To make it very streamlined and prevent stuck situations:
      // If they cannot play the drawn card, we immediately pass the turn!
      if (!playable) {
        return advanceTurn(nextState);
      }

      // If it IS playable, and it is AI, we will handle that in the AI engine.
      // If it IS playable and it is human, we keep the turn active so they can play it!
      return nextState;
    });

    if (playerId === 'player') {
      setCardsDrawnThisRound((p) => p + 1);
    }

    return drawnPlayableCard;
  }, [addLog, advanceTurn, gameMode, remoteSessionActive]);

  // Human Declares Pass (after drawing playable card but choosing not to play it)
  const passTurn = useCallback(() => {
    if ((gameMode === 'pvp' || gameMode === 'private') && remoteSessionActive && remoteMatchIdRef.current && remoteUserIdRef.current) {
      sound.playPop();
      apiRequest<{ gameState: GameState }>('/api/matches/action', {
        method: 'POST',
        body: JSON.stringify({
          matchId: remoteMatchIdRef.current,
          userId: remoteUserIdRef.current,
          action: 'pass',
        }),
      }).then((result) => {
        setGameState(result.gameState);
      }).catch((error) => {
        sound.playError();
        alert(error.message);
      });
      return;
    }

    sound.playPop();
    setGameState((prev) => {
      const stateLog = createLog('🐾 You chose to keep the card and passed the turn.', 'info');
      const advanced = advanceTurn(prev);
      return {
        ...advanced,
        logs: [stateLog, ...advanced.logs].slice(0, 50),
      };
    });
  }, [advanceTurn, gameMode, remoteSessionActive]);

  // AI Brain & Play Automation
  useEffect(() => {
    if ((gameMode === 'pvp' || gameMode === 'private') && remoteSessionActive) {
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
      aiTurnHandledRef.current = null;
      return;
    }

    const { players, currentPlayerIndex, phase } = gameState;
    if (phase !== 'playing') {
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
      aiTurnHandledRef.current = null;
      return;
    }

    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isAi) {
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
      aiTurnHandledRef.current = null;
      return;
    }

    // Check if we already scheduled / ran this player's turn to prevent infinite restart
    const turnKey = `${currentPlayer.id}_${currentPlayer.hand.length}_${gameState.discardPile.length}`;
    if (aiTurnHandledRef.current === turnKey) {
      return;
    }
    aiTurnHandledRef.current = turnKey;

    const playAiTurn = () => {
      // Find all valid playable cards in AI hand
      const playableCards = currentPlayer.hand.filter((card) =>
        card.color === 'wild' || isValidMove(card, gameState.activeColor, gameState.activeValue)
      );

      // AI cute thoughts barks choices
      const quotes = CARTOON_BUBBLES[currentPlayer.avatar as keyof typeof CARTOON_BUBBLES] || CARTOON_BUBBLES.bear;
      let thoughtQuote = quotes.thinking[Math.floor(Math.random() * quotes.thinking.length)];

      // Raise panic voice if low hand
      const humanPlayer = players.find((p) => p.id === 'player');
      if (humanPlayer && humanPlayer.hand.length <= 2) {
        thoughtQuote = `Oh! ${humanPlayer.name} has only ${humanPlayer.hand.length} card! I must be quick! 🐻💦`;
      }

      triggerBubble(currentPlayer.id, thoughtQuote, 1400);
      changeEmotion(currentPlayer.id, 'thinking', 1500);

      // Actual execution after thinking delay of 1.6 seconds (feels wonderful, like real opponents)
      aiTurnTimeoutRef.current = setTimeout(() => {
        if (playableCards.length > 0) {
          // Select best card to play: Action cards first, otherwise highest score cards
          let selectedCard = playableCards[0];

          // Priority actions
          const actions = playableCards.filter((c) => c.value === 'wild_draw4' || c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse');
          if (actions.length > 0) {
            // Play action first to mess with other players
            selectedCard = actions[Math.floor(Math.random() * actions.length)];
          } else {
            // Choose highest point card to empty hand
            selectedCard = playableCards.reduce((max, c) => (c.score > max.score ? c : max), playableCards[0]);
          }

          // If Wild, auto pick color AI has most of in hand
          let chosenColor: CardColor | undefined = undefined;
          if (selectedCard.color === 'wild') {
            chosenColor = getBestColorForAi(currentPlayer.hand);
          }

          // Play Card
          playCard(currentPlayer.id, selectedCard, chosenColor);

          // Pop bubble play
          const playQuote = quotes.playing[Math.floor(Math.random() * quotes.playing.length)];
          triggerBubble(currentPlayer.id, playQuote, 2500);
        } else {
          // Draw card
          drawCard(currentPlayer.id);
          triggerBubble(currentPlayer.id, 'No matches... I will draw! 🐾💭', 2200);
          changeEmotion(currentPlayer.id, 'worried', 1800);
        }
      }, 1600);
    };

    // Queue AI move
    if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
    aiTurnTimeoutRef.current = setTimeout(playAiTurn, 100);

    return () => {
      // We don't clear the timeout on re-renders unless the turn actually changed
    };
  }, [gameState.currentPlayerIndex, gameState.phase, gameState.activeColor, gameState.activeValue, drawCard, playCard, triggerBubble, changeEmotion, gameState.players]);

  const handleAutoPlayTimeout = useCallback(() => {
    const human = gameState.players.find((p) => p.id === 'player');
    if (!human) return;

    const playableCards = human.hand.filter((card) =>
      card.color === 'wild' || isValidMove(card, gameState.activeColor, gameState.activeValue)
    );

    if (playableCards.length > 0) {
      const selectedCard = playableCards[0];
      let chosenColor: CardColor = 'red';
      if (selectedCard.color === 'wild') {
        chosenColor = getBestColorForAi(human.hand);
      }
      initiatePlayCard(selectedCard, chosenColor);
    } else {
      const drawn = drawCard('player');
      if (drawn) {
        let chosenColor: CardColor = 'red';
        if (drawn.color === 'wild') {
          chosenColor = getBestColorForAi(human.hand);
        }
        initiatePlayCard(drawn, chosenColor);
      }
    }
  }, [gameState.players, gameState.activeColor, gameState.activeValue, initiatePlayCard, drawCard]);

  // Countdown timer and warning beep triggers
  useEffect(() => {
    if (gameState.phase !== 'playing') {
      return;
    }

    const currentActivePlayer = gameState.players[gameState.currentPlayerIndex];
    const isHumanTurn = currentActivePlayer?.id === 'player';

    let initialTime = 20;
    if (gameMode !== 'offline' && gameState.turnStartedAt) {
      const elapsed = Math.floor((Date.now() - gameState.turnStartedAt) / 1000);
      initialTime = Math.max(0, 20 - elapsed);
    }
    setTurnTimeLeft(initialTime);

    const interval = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (gameMode === 'offline' && isHumanTurn) {
            handleAutoPlayTimeout();
          }
          return 0;
        }
        if (prev <= 7 && isHumanTurn) {
          sound.playWarning();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.currentPlayerIndex, gameState.discardPile.length, gameState.phase, gameMode, gameState.turnStartedAt, handleAutoPlayTimeout]);

  // Auto-rejoin active match on mount
  useEffect(() => {
    const activeMatchRaw = localStorage.getItem('redoapp_active_match');
    if (activeMatchRaw) {
      try {
        const activeMatch = JSON.parse(activeMatchRaw);
        if (activeMatch.matchId) {
          setGameMode(activeMatch.mode || 'pvp');
          setActiveStake(activeMatch.stake || 0);
          setGameState((prev) => ({
            ...prev,
            phase: 'playing',
            logs: [createLog('Reconnecting to active match...', 'info')],
          }));
          setRemoteSessionActive(true);
          syncRemoteMatchState();
        }
      } catch (e) {
        console.error('Error parsing active match on mount', e);
      }
    }
  }, [syncRemoteMatchState]);

  // Clean-up hooks on dismount
  useEffect(() => {
    return () => {
      remoteMatchStreamRef.current?.close();
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
      Object.values(speechBubbleTimeoutRefs.current).forEach((t) => clearTimeout(t as any));
    };
  }, []);

  const resetStats = () => {
    sound.playShuffle();
    saveStats(INITIAL_STATS);
  };

  const returnToLobby = useCallback(() => {
    sound.playPop();
    remoteMatchStreamRef.current?.close();
    remoteMatchStreamRef.current = null;
    remoteMatchIdRef.current = null;
    remoteUserIdRef.current = null;
    setRemoteSessionActive(false);
    localStorage.removeItem('redoapp_active_match');
    setCardsPlayedThisRound(0);
    setCardsDrawnThisRound(0);
    setLeaderboard([]);
    setWildSelectOpen(false);
    setPendingWildCard(null);
    setGameMode('offline');
    setActiveStake(0);
    setGameState({
      deck: [],
      discardPile: [],
      players: [],
      currentPlayerIndex: 0,
      direction: 1,
      activeColor: 'red',
      activeValue: '0',
      phase: 'setup',
      winnerId: null,
      logs: [],
      drawCountAccumulator: 0,
      unoShoutCooldown: {},
      dealerId: 'ai1',
      consecutiveDraws: 0,
      accusablePlayers: [],
    });
  }, []);

  return {
    gameState,
    stats,
    wildSelectOpen,
    pendingWildCard,
    setWildSelectOpen,
    startGame,
    playCard: initiatePlayCard,
    drawCard,
    passTurn,
    resetStats,
    selectWildColor,
    leaderboard,
    cardsPlayedThisRound,
    cardsDrawnThisRound,
    goldenTickets,
    setGoldenTickets,
    transactions,
    setTransactions,
    gameMode,
    setGameMode,
    activeStake,
    returnToLobby,
    turnTimeLeft,
  };
}
