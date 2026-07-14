/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useUnoGame } from './hooks/useUnoGame';
import { Avatar } from './components/Avatars';
import { UnoCard } from './components/UnoCard';
import { RuleModal } from './components/RuleModal';
import { Web3Dashboard } from './components/Web3Dashboard';
import { LoadingScreen } from './components/LoadingScreen';
import { motion, AnimatePresence } from 'motion/react';
import { apiRequest, ApiTraceDetail } from './utils/api';
import {
  Volume2,
  VolumeX,
  HelpCircle,
  Trophy,
  Play,
  RotateCcw,
  ArrowRightLeft,
  Flame,
  Star,
  Users,
} from 'lucide-react';
import { sound } from './utils/sound';
import { AvatarId, CardColor } from './types';

export default function App() {
  const firstFreeGameWalletPromptKey = 'redoapp_prompt_connect_wallet_after_free_game';
  const {
    gameState,
    stats,
    wildSelectOpen,
    startGame,
    playCard,
    drawCard,
    passTurn,
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
    resetStats,
  } = useUnoGame();

  const getDisplayName = (p: any) => {
    return p.name;
  };

  // Level Progression Calculation
  const playerXp = stats.xp || 0;
  const xpNeeded = 400;
  const playerLevel = Math.floor(playerXp / xpNeeded) + 1;
  const currentLevelXp = playerXp % xpNeeded;
  const xpProgressPercentage = Math.min(100, Math.floor((currentLevelXp / xpNeeded) * 100));

  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMuted] = useState(() => sound.getMuted());
  const [userName, setUserName] = useState(() => {
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser) {
      return tgUser.username || `${tgUser.first_name} ${tgUser.last_name || ''}`.trim() || 'guest';
    }
    return 'guest';
  });
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>('rabbit');
  const shouldPromptWalletAfterFirstFreeGame =
    gameState.phase === 'game_over' &&
    gameMode === 'offline' &&
    stats.practiceGamesPlayed === 1;

  // Available avatars to select in lobby
  const AVATAR_LIST: { id: AvatarId; emoji: string; bg: string; description: string }[] = [
    { id: 'rabbit', emoji: 'R', bg: 'bg-slate-900 border-black text-[#ff9eb5]', description: 'Twilight Wave rider.' },
    { id: 'bear', emoji: 'B', bg: 'bg-slate-900 border-black text-[#926239]', description: 'Ocean Deep rider.' },
    { id: 'fox', emoji: 'F', bg: 'bg-slate-900 border-black text-[#ff823b]', description: 'Sunset Glide rider.' },
    { id: 'panda', emoji: 'P', bg: 'bg-slate-900 border-black text-white', description: 'Lagoon Teal rider.' },
    { id: 'cat', emoji: 'C', bg: 'bg-slate-900 border-black text-[#ec4899]', description: 'Coral Surf rider.' },
    { id: 'koala', emoji: 'K', bg: 'bg-slate-900 border-black text-[#94a3b8]', description: 'Storm Rider.' },
  ];

  const toggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
    sound.playPop();
  };

  const handleStartGame = useCallback((mode: 'offline' | 'pvp' | 'private', stake: number) => {
    startGame(selectedAvatar, userName, mode, stake);
  }, [selectedAvatar, startGame, userName]);

  const currentActivePlayer = gameState.players[gameState.currentPlayerIndex];
  const isWaitingForPlayers = gameMode === 'pvp' && !!gameState.waitingForPlayers;
  const isHumanTurn = !isWaitingForPlayers && currentActivePlayer?.id === 'player';
  const connectedPlayerCount = gameState.players.filter((player) => player.isConnected !== false).length;
  const totalMatchPlayerCount = gameState.players.length;
  const [connectionTimeLeft, setConnectionTimeLeft] = useState(60);

  useEffect(() => {
    if (!isWaitingForPlayers || !gameState.connectionDeadlineAt) return;
    const update = () => setConnectionTimeLeft(Math.max(0, Math.ceil((gameState.connectionDeadlineAt! - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [isWaitingForPlayers, gameState.connectionDeadlineAt]);

  // Calculate playable check for human hand
  const checkPlayable = (card: any) => {
    if (!isHumanTurn) return false;
    if (gameState.phase !== 'playing') return false;
    
    if (card.color === 'wild') return true;
    if (card.color === gameState.activeColor) return true;
    if (card.value === gameState.activeValue) return true;
    return false;
  };

  const playableCount = gameState.players.find((p) => p.id === 'player')?.hand.filter(checkPlayable).length || 0;

  // Render Play table suit color details
  const getActiveColorBorder = (color: CardColor) => {
    switch (color) {
      case 'red':
        return 'border-black bg-[#ff4b4b] text-black';
      case 'blue':
        return 'border-black bg-[#00d2ff] text-black';
      case 'green':
        return 'border-black bg-[#a855f7] text-black';
      case 'yellow':
        return 'border-black bg-[#ffcc00] text-black';
      default:
        return 'border-black bg-[#1e293b] text-white';
    }
  };

  // Flying Cards Animation State
  interface FlyingCardAnimation {
    id: string;
    card: any;
    isBack: boolean;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    rotateStart: number;
    rotateEnd: number;
  }

  const [flyingCards, setFlyingCards] = useState<FlyingCardAnimation[]>([]);
  const [visualTopCard, setVisualTopCard] = useState<any>(null);
  const prevGameStateRef = useRef<any>(null);
  const settlementHandledRef = useRef<string | null>(null);

  // Fullscreen loading screen state & API request tracking (minimum 3-second display)
  const [activeLoads, setActiveLoads] = useState<string[]>(() => (window as any).redoappActiveLoads || []);
  const [isAppStarting, setIsAppStarting] = useState<boolean>(() => (window as any).redoappIsAppStarting ?? true);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  const showLoadingScreenRef = useRef<boolean>(true);
  const loadingStartTimestampRef = useRef<number>(Date.now());
  const loadingTimeoutRef = useRef<number | null>(null);

  const setShowLoading = (val: boolean) => {
    showLoadingScreenRef.current = val;
    setShowLoadingScreen(val);
  };

  const updateLoadingVisibility = useCallback((isLoadingActive: boolean) => {
    if (isLoadingActive) {
      if (loadingTimeoutRef.current) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (!showLoadingScreenRef.current) {
        loadingStartTimestampRef.current = Date.now();
        setShowLoading(true);
      }
    } else {
      const elapsed = Date.now() - loadingStartTimestampRef.current;
      const minDuration = 3000; // 3 seconds minimum display time

      if (elapsed < minDuration) {
        const remaining = minDuration - elapsed;
        if (loadingTimeoutRef.current) {
          window.clearTimeout(loadingTimeoutRef.current);
        }
        loadingTimeoutRef.current = window.setTimeout(() => {
          setShowLoading(false);
          loadingTimeoutRef.current = null;
        }, remaining);
      } else {
        setShowLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleLoadingChange = () => {
      const currentLoads = (window as any).redoappActiveLoads || [];
      const currentStarting = (window as any).redoappIsAppStarting ?? true;
      
      setActiveLoads(currentLoads);
      setIsAppStarting(currentStarting);

      const isLoadActive = currentStarting || currentLoads.length > 0;
      updateLoadingVisibility(isLoadActive);
    };

    // Run once on mount to capture any early updates
    handleLoadingChange();

    window.addEventListener('redoapp:loading-change', handleLoadingChange);
    return () => {
      window.removeEventListener('redoapp:loading-change', handleLoadingChange);
    };
  }, [updateLoadingVisibility]);

  useEffect(() => {
    // A wallet disconnect can interrupt the bootstrap request in an embedded
    // Telegram browser. Never leave the whole Mini App behind an unbounded
    // splash screen; the dashboard exposes its own retry state.
    const safetyTimeout = window.setTimeout(() => {
      if (!(window as any).redoappIsAppStarting) return;
      (window as any).redoappIsAppStarting = false;
      window.dispatchEvent(new CustomEvent('redoapp:loading-change'));
    }, 15_000);
    return () => window.clearTimeout(safetyTimeout);
  }, []);

  useEffect(() => {
    if (gameState.phase !== 'game_over' || gameMode === 'offline' || !leaderboard.length) {
      return;
    }

    const activeMatchRaw = localStorage.getItem('redoapp_active_match');
    if (!activeMatchRaw) {
      return;
    }

    try {
      const activeMatch = JSON.parse(activeMatchRaw) as {
        matchId: string;
        mode: 'pvp' | 'private';
        stake: number;
        currentUserId: string;
        players: Array<{ userId: string; username: string; avatarId: string }>;
      };

      if (!activeMatch.matchId || settlementHandledRef.current === activeMatch.matchId) {
        return;
      }

      const myEntry = leaderboard.find((entry: any) => entry.playerId === 'player');
      if (!myEntry) {
        return;
      }

      settlementHandledRef.current = activeMatch.matchId;

      apiRequest('/api/matches/settle', {
        method: 'POST',
        body: JSON.stringify({
          matchId: activeMatch.matchId,
        }),
      }).then(() => {
        return apiRequest<{ availableTickets: number; heldTickets: number }>('/api/tickets/balance/' + encodeURIComponent(activeMatch.currentUserId));
      }).then((balance) => {
        setGoldenTickets(balance.availableTickets);
        return apiRequest<{ transactions: any[] }>('/api/tickets/ledger/' + encodeURIComponent(activeMatch.currentUserId));
      }).then((ledger) => {
        setTransactions(ledger.transactions);
        localStorage.removeItem('redoapp_active_match');
      }).catch((error) => {
        console.error('Settlement failed', error);
        settlementHandledRef.current = null;
      });
    } catch (error) {
      console.error('Invalid active match payload', error);
    }
  }, [gameState.phase, gameMode, leaderboard, setGoldenTickets, setTransactions]);

  // Synchronize discard pile top card with flight duration
  useEffect(() => {
    if (!gameState || !gameState.discardPile || gameState.discardPile.length === 0) {
      setVisualTopCard(null);
      return;
    }

    const currentTop = gameState.discardPile[gameState.discardPile.length - 1];

    if (!prevGameStateRef.current) {
      setVisualTopCard(currentTop);
      return;
    }

    const prev = prevGameStateRef.current;

    if (gameState.discardPile.length > (prev.discardPile?.length || 0)) {
      const prevTop = prev.discardPile[prev.discardPile.length - 1];
      if (prevTop) {
        setVisualTopCard(prevTop);
      }
      
      const timer = setTimeout(() => {
        setVisualTopCard(currentTop);
      }, 550);

      return () => clearTimeout(timer);
    } else {
      setVisualTopCard(currentTop);
    }
  }, [gameState.discardPile, gameState.activeColor]);

  useEffect(() => {
    if (!gameState || !gameState.players || gameState.players.length === 0) return;
    if (!prevGameStateRef.current) {
      prevGameStateRef.current = gameState;
      return;
    }

    const prev = prevGameStateRef.current;
    const current = gameState;

    // Detect Played Card
    if (current.discardPile && prev.discardPile && current.discardPile.length > prev.discardPile.length) {
      const playedCard = current.discardPile[current.discardPile.length - 1];
      const activePlayerIndex = prev.currentPlayerIndex;
      const activePlayer = prev.players[activePlayerIndex];
      
      if (activePlayer && playedCard) {
        let startX = 50;
        let startY = 95;
        let rotateStart = 0;
        
        if (activePlayer.id === 'player') {
          startX = 50;
          startY = 95;
          rotateStart = 0;
        } else if (activePlayer.id === 'ai1') {
          startX = 12;
          startY = 50;
          rotateStart = -90;
        } else if (activePlayer.id === 'ai2') {
          startX = 50;
          startY = 8;
          rotateStart = 180;
        } else if (activePlayer.id === 'ai3') {
          startX = 88;
          startY = 50;
          rotateStart = 90;
        }

        const animId = `play-${Date.now()}-${Math.random()}`;
        setFlyingCards((prevAnims) => [
          ...prevAnims,
          {
            id: animId,
            card: playedCard,
            isBack: false,
            startX,
            startY,
            endX: 62,
            endY: 50,
            rotateStart,
            rotateEnd: Math.random() * 20 - 10,
          }
        ]);

        setTimeout(() => {
          setFlyingCards((prevAnims) => prevAnims.filter((f) => f.id !== animId));
        }, 700);
      }
    }

    // Detect Drawn Card
    if (current.players && prev.players) {
      current.players.forEach((currPlayer: any) => {
        const prevPlayer = prev.players.find((p: any) => p.id === currPlayer.id);
        if (prevPlayer && currPlayer.hand && prevPlayer.hand && currPlayer.hand.length > prevPlayer.hand.length) {
          const newlyDrawnCard = currPlayer.hand[currPlayer.hand.length - 1];
          
          let endX = 50;
          let endY = 95;
          let rotateEnd = 0;
          
          if (currPlayer.id === 'player') {
            endX = 50;
            endY = 95;
            rotateEnd = 0;
          } else if (currPlayer.id === 'ai1') {
            endX = 12;
            endY = 50;
            rotateEnd = -90;
          } else if (currPlayer.id === 'ai2') {
            endX = 50;
            endY = 8;
            rotateEnd = 180;
          } else if (currPlayer.id === 'ai3') {
            endX = 88;
            endY = 50;
            rotateEnd = 90;
          }

          const animId = `draw-${Date.now()}-${Math.random()}`;
          setFlyingCards((prevAnims) => [
            ...prevAnims,
            {
              id: animId,
              card: newlyDrawnCard || { id: 'back', color: 'wild', value: 'wild', score: 0 },
              isBack: true,
              startX: 38,
              startY: 50,
              endX,
              endY,
              rotateStart: 0,
              rotateEnd,
            }
          ]);

          setTimeout(() => {
            setFlyingCards((prevAnims) => prevAnims.filter((f) => f.id !== animId));
          }, 700);
        }
      });
    }

    prevGameStateRef.current = gameState;
  }, [gameState]);

  return (
    <div className={`w-full bg-[#0c0f12] text-[#f8fafc] flex flex-col items-center relative select-none ${
      gameState.phase === 'setup' ? 'min-h-screen justify-start overflow-y-auto pb-8 sm:pb-12' : 'h-screen max-h-screen justify-start overflow-hidden'
    }`}>
      
      {showLoadingScreen && (
        <LoadingScreen />
      )}
      {/* Pixelated grid background in setup mode */}
      {gameState.phase === 'setup' && (
        <div className="absolute inset-0 bg-[#0c0f12] overflow-hidden pointer-events-none z-0">
          <div className="absolute inset-0 opacity-[0.05]" style={{
            backgroundImage: 'radial-gradient(circle, #f8fafc 1.5px, transparent 1.5px)',
            backgroundSize: '20px 20px'
          }}></div>

          <div className="absolute top-[8%] left-[8%] text-slate-800/10 text-7xl font-black font-mono select-none">WEB3</div>
          <div className="absolute bottom-[8%] right-[8%] text-slate-800/10 text-7xl font-black font-mono select-none">PIXEL</div>
        </div>
      )}

      {/* HEADER PANELS (Only rendered during active gameplay) */}
      {gameState.phase !== 'setup' && (
        <header className="w-full max-w-4xl px-3 py-2 flex justify-between items-center z-30 bg-[#18181c] border-b-4 border-black font-mono">
          <div className="flex items-center gap-2">
            <img src="/text(logo).jpg" alt="Logo" className="h-6 w-auto object-contain select-none" />
          </div>

          {/* Global Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sound.playPop();
                if (gameState.phase === 'game_over') {
                  returnToLobby();
                  return;
                }
                if (window.confirm('Wanna head back to lobby? Current progress will lose.')) {
                  returnToLobby();
                }
              }}
              className="px-2 py-1 bg-slate-950 border-2 border-black text-white pixel-btn-interactive flex items-center gap-1 text-[9px] font-black"
              title="Lobby Setup"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>MENU</span>
            </button>

            <button
              onClick={() => {
                sound.playPop();
                setRulesOpen(true);
              }}
              className="p-1 bg-slate-950 border-2 border-black text-[#ffcc00] pixel-btn-interactive"
              title="Schedules / Rules"
            >
              <HelpCircle className="w-4 h-4 stroke-[3]" />
            </button>

            <button
              onClick={toggleMute}
              className={`p-1 border-2 border-black pixel-btn-interactive ${
                muted ? 'bg-red-950/40 text-[#ff4b4b]' : 'bg-slate-950 text-[#00ff66]'
              }`}
              title={muted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </header>
      )}

      {/* LOBBY / SETUP SCREEN */}
      {gameState.phase === 'setup' && (
        <main className="w-full max-w-md px-4 py-4 z-10 animate-fade-in flex flex-col justify-start">

          {/* Lobby Banner */}
          <div className="w-full border-4 border-black overflow-hidden bg-slate-950 shadow-[4px_4px_0_#000] aspect-[3/1] mb-4 relative">
            <img
              src="./banner.png"
              alt="YO PIXEL REDOapp Banner"
              className="w-full h-full object-cover select-none pointer-events-none"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* Web3 Smartphone-Oriented Dashboard Menu */}
          <div className="w-full z-10">
            <Web3Dashboard
              userName={userName}
              selectedAvatar={selectedAvatar}
              AVATAR_LIST={AVATAR_LIST}
              stats={stats}
              playerLevel={playerLevel}
              currentLevelXp={currentLevelXp}
              xpNeeded={xpNeeded}
              xpProgressPercentage={xpProgressPercentage}
              playerXp={playerXp}
              onStartGame={handleStartGame}
              onNameChange={setUserName}
              onAvatarSelect={setSelectedAvatar}
              onOpenRules={() => setRulesOpen(true)}
              goldenTickets={goldenTickets}
              setGoldenTickets={setGoldenTickets}
              transactions={transactions}
              setTransactions={setTransactions}
              resetStats={resetStats}
            />
          </div>
        </main>
      )}

      {/* ACTIVE GAMEPLAY CONTAINER: THEMED GEOMETRIC BALANCE FELT PLAY TABLE */}
      {gameState.phase !== 'setup' && (
        <main className="flex-1 w-full max-w-4xl my-1 p-2.5 flex flex-col justify-between gap-2 overflow-hidden z-10 relative bg-[#0c0f12] border-4 border-black shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
          
          {/* FLYING CARDS ANIMATION OVERLAY */}
          <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
            <AnimatePresence>
              {flyingCards.map((fc) => (
                <motion.div
                  key={fc.id}
                  initial={{
                    left: `${fc.startX}%`,
                    top: `${fc.startY}%`,
                    scale: 0.35,
                    rotate: fc.rotateStart,
                    opacity: 1,
                  }}
                  animate={{
                    left: `${fc.endX}%`,
                    top: `${fc.endY}%`,
                    scale: fc.isBack ? 0.75 : 0.85,
                    rotate: fc.rotateEnd,
                    opacity: [1, 1, 0.9, 0],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.55,
                    ease: 'easeOut',
                  }}
                  style={{
                    position: 'absolute',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <UnoCard card={fc.card} isBack={fc.isBack} size="responsive" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {isWaitingForPlayers && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0c0f12]/90 p-4 font-mono backdrop-blur-sm">
              <div className="w-full max-w-xs border-4 border-black bg-slate-950 p-5 text-center shadow-[4px_4px_0_#000]">
                <div className="text-[11px] font-black uppercase tracking-wider text-[#00d2ff]">Connecting players</div>
                <div className="mt-3 text-[24px] font-black text-[#ffcc00]">{connectionTimeLeft}s</div>
                <div className="mt-1 text-[9px] font-black uppercase text-[#00ff66]">
                  {connectedPlayerCount}/{totalMatchPlayerCount} players connected
                </div>
                <div className="mt-3 text-[7px] leading-relaxed text-slate-400">
                  The match starts when everyone connects. If nobody connects, no tickets or energy are charged.
                </div>
              </div>
            </div>
          )}

          {/* WAITING FOR OPPONENT IN PRIVATE ROOM OVERLAY */}
          {gameState.players.some((p) => p.name === 'Waiting...') && (
            <div className="absolute inset-0 bg-[#0c0f12]/85 backdrop-blur-md z-30 flex items-center justify-center p-4 select-none font-mono">
              <div className="w-full max-w-xs bg-slate-950 border-4 border-black p-5 text-center shadow-[4px_4px_0_#000] pixel-box-sm flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none bg-radial from-transparent to-black/20 opacity-30"></div>
                
                <div className="w-12 h-12 mx-auto bg-slate-900 border-2 border-black flex items-center justify-center animate-pulse">
                  <span className="text-xl">⏳</span>
                </div>
                
                <h3 className="text-[11px] font-black text-[#ffcc00] uppercase tracking-widest leading-none">
                  Waiting for Opponent...
                </h3>
                
                <p className="text-[8px] text-slate-400 font-sans leading-normal px-2">
                  Share the link or code with your friend. The game table is ready and waiting for them.
                </p>

                {(() => {
                  const activeMatchRaw = localStorage.getItem('redoapp_active_match');
                  if (activeMatchRaw) {
                    try {
                      const activeMatch = JSON.parse(activeMatchRaw);
                      if (activeMatch.roomCode) {
                        return (
                          <div className="bg-slate-900 border border-slate-800 p-1.5 font-mono text-[9px] text-[#00ff66] break-all select-all">
                            CODE: <span className="font-bold text-white text-[10px]">{activeMatch.roomCode}</span>
                          </div>
                        );
                      }
                    } catch (e) {}
                  }
                  return null;
                })()}

                <button
                  type="button"
                  onClick={() => {
                    sound.playPop();
                    const activeMatchRaw = localStorage.getItem('redoapp_active_match');
                    if (activeMatchRaw) {
                      try {
                        const activeMatch = JSON.parse(activeMatchRaw);
                        if (activeMatch.roomCode) {
                          const tgBotUsername = 'redo_appbot';
                          const appShortName = 'app';
                          const link = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${tgBotUsername}/${appShortName}?startapp=room_${activeMatch.roomCode}`)}&text=${encodeURIComponent('Join my REDOapp match! Let’s play! 🎴')}`;
                          const tg = (window as any).Telegram?.WebApp;
                          if (tg?.openTelegramLink) {
                            tg.openTelegramLink(link);
                          } else {
                            window.open(link, '_blank');
                          }
                        } else {
                          alert('Room code not found in session.');
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    }
                  }}
                  className="w-full py-2 bg-[#00ff66] text-black font-black text-[9px] uppercase tracking-wider pixel-btn-interactive border-2 border-black cursor-pointer shadow-[3px_3px_0_#000] hover:translate-y-0.5 hover:shadow-[1px_1px_0_#000] transition-all"
                >
                  Invite Friend ➔
                </button>
              </div>
            </div>
          )}
          
          {/* TOP ZONE: AI PLAYER 2 */}
          <section className="w-full flex justify-center items-center py-1">
            {(() => {
              const pandaPlayer = gameState.players[2];
              if (!pandaPlayer) return null;
              const isActive = gameState.currentPlayerIndex === 2;
              const isOffline = gameMode !== 'offline' && !pandaPlayer.isConnected;
              const isBot = gameMode !== 'offline' && pandaPlayer.isAi;
              const avatarFilter = `${gameMode === 'pvp' ? 'blur(4.5px) ' : ''}${isOffline ? 'grayscale(90%) opacity(0.5)' : ''}`.trim() || 'none';
              return (
                <div className="flex flex-col items-center relative gap-1">
                  <div style={{ filter: avatarFilter }}>
                    <Avatar id={pandaPlayer.avatar} emotion={pandaPlayer.emotion} isActive={isActive} size={38} />
                  </div>
                  
                  <div className="bg-black text-white px-2 py-0.5 border border-black text-[9px] font-mono flex items-center gap-1.5 shadow-[2px_2px_0_#000] max-w-[170px] truncate">
                    <span className="truncate">{getDisplayName(pandaPlayer)}</span>
                    <span className="bg-[#ff4b4b] text-black px-1 border border-black text-[8px] font-black">
                      🎴 {pandaPlayer.hand.length}
                    </span>
                    {isOffline && (
                      <span className="text-[#ff4b4b] font-black text-[7px] animate-pulse">🔌 OFF</span>
                    )}
                    {isBot && (
                      <span className="text-[#ffcc00] font-black text-[7px]">🤖 BOT</span>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* MIDDLE ZONE: LEFT AI, PLAY DESK, RIGHT AI */}
          <section className="flex-1 w-full grid grid-cols-12 items-center gap-1 my-1">
            
            {/* LEFT AI PLAYER 1 */}
            <div className="col-span-3 flex justify-center items-center">
              {(() => {
                const leftPlayer = gameState.players[1];
                if (!leftPlayer) return null;
                const isActive = gameState.currentPlayerIndex === 1;
                const isOffline = gameMode !== 'offline' && !leftPlayer.isConnected;
                const isBot = gameMode !== 'offline' && leftPlayer.isAi;
                const avatarFilter = `${gameMode === 'pvp' ? 'blur(4.5px) ' : ''}${isOffline ? 'grayscale(90%) opacity(0.5)' : ''}`.trim() || 'none';
                return (
                  <div className="flex flex-col items-center relative gap-1 text-center">
                    <div style={{ filter: avatarFilter }}>
                      <Avatar id={leftPlayer.avatar} emotion={leftPlayer.emotion} isActive={isActive} size={36} />
                    </div>
                    
                    <div className="bg-black text-white px-1.5 py-1 border border-black text-[8px] font-mono flex flex-col items-center leading-none shadow-[2px_2px_0_#000] max-w-[85px] truncate">
                      <span className="max-w-[80px] truncate text-center">{getDisplayName(leftPlayer)}</span>
                      <span className="text-[#ffcc00] font-black mt-0.5 whitespace-nowrap">🎴 {leftPlayer.hand.length} CARDS</span>
                      {isOffline && (
                        <span className="text-[#ff4b4b] font-black text-[7px] animate-pulse mt-0.5">🔌 OFF</span>
                      )}
                      {isBot && (
                        <span className="text-[#ffcc00] font-black text-[7px] mt-0.5">🤖 BOT</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CENTRAL PLAY MAT FELT TABLE BOARD */}
            <div className="col-span-6 h-full flex items-center justify-center relative min-h-[110px] min-[370px]:min-h-[135px] sm:min-h-[170px]">
              
              {/* Play Mat Felt Grid Background */}
              <div className="absolute inset-0 border border-dashed border-[#2e3846] opacity-60"></div>

              {/* DYNAMIC TURN TIMER BADGE */}
              {gameState.phase === 'playing' && !isWaitingForPlayers && (
                <div className="absolute top-0.5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
                  <div className={`px-2 py-0.5 border border-black font-mono font-black text-[9px] min-[370px]:text-[10px] sm:text-[11px] shadow-[1px_1px_0_#000] text-center transition-all ${
                    turnTimeLeft <= 6 && isHumanTurn
                      ? 'bg-[#ff4b4b] text-white animate-bounce shadow-[0_0_8px_#ff4b4b]'
                      : 'bg-[#ffcc00] text-black'
                  }`}>
                    {isHumanTurn ? '⏱️ YOUR TURN: ' : `⏱️ ${currentActivePlayer?.name || 'Turn'}: `}
                    <span className="font-extrabold">{turnTimeLeft}s</span>
                  </div>
                </div>
              )}

              {/* SOFT PIXELATED DIRECTION CIRCLE */}
              <div className="absolute w-[95px] h-[95px] min-[370px]:w-[115px] min-[370px]:h-[115px] sm:w-[155px] sm:h-[155px] flex items-center justify-center pointer-events-none">
                <div
                  className={`w-full h-full rounded-full border-4 border-dashed border-[#ffcc00]/25 flex items-center justify-center font-mono text-[8px] min-[370px]:text-[10px] shadow-[inset_0_0_12px_rgba(255,204,0,0.15)] bg-radial from-[#ffcc00]/5 to-transparent
                    ${gameState.direction === 1 ? 'animate-rotate-slow' : 'animate-rotate-slow-reverse'} animate-pulse-soft
                  `}
                  style={{ imageRendering: 'pixelated' }}
                >
                  <span className="text-[#ffcc00]/40 font-black tracking-widest">
                    ➔ ➔ ➔
                  </span>
                </div>
              </div>

              {/* CENTRAL PILES CONTAINER */}
              <div className="grid grid-cols-2 gap-3 items-center justify-center z-10 w-full px-1">
                
                {/* DRAW DECK PILE (Clickable button) */}
                <div className="flex flex-col items-center gap-1 justify-self-center">
                  <div className="relative">
                    <div className="absolute top-1 left-1 w-[54px] h-[80px] min-[370px]:w-[68px] min-[370px]:h-[100px] sm:w-[82px] sm:h-[122px] bg-black border-2 border-black opacity-60 z-0"></div>
                    
                    <button
                      onClick={() => {
                        if (isHumanTurn) {
                          drawCard('player');
                        } else {
                          sound.playError();
                        }
                      }}
                      disabled={!isHumanTurn}
                      className={`relative z-10 transition-transform active:translate-y-1 border-none bg-none outline-none ${
                        isHumanTurn ? 'cursor-pointer hover:-translate-y-1' : 'opacity-85'
                      }`}
                      aria-label="Draw a card"
                    >
                      <UnoCard card={{ id: 'draw-pile-gui', color: 'wild', value: 'wild', score: 0 }} isBack={true} size="responsive" />
                      
                      {/* Interactive Tap-glowing Ring for Human turn */}
                      {isHumanTurn && playableCount === 0 && (
                        <span className="absolute inset-x-0 -bottom-1 text-center bg-[#ffcc00] text-black font-black text-[7px] min-[370px]:text-[9px] uppercase px-1 border border-black shadow animate-pulse tracking-tight select-none font-mono">
                          TAP DRAW!
                        </span>
                      )}
                    </button>
                  </div>
                  <span className="text-[8px] min-[370px]:text-[9px] font-mono font-bold text-slate-450 bg-black px-1.5 border border-black/40">
                    {gameState.deck.length} REM
                  </span>
                </div>

                {/* DISCARD PILE */}
                <div className="flex flex-col items-center gap-1 justify-self-center">
                  <div className="relative">
                    <div className="relative z-10">
                      {(() => {
                        const topCard = visualTopCard || gameState.discardPile[gameState.discardPile.length - 1] || { id: 'fallback', color: 'red', value: '0', score: 0 };
                        const displayCard = topCard.color === 'wild'
                          ? { ...topCard, color: gameState.activeColor }
                          : topCard;
                        return (
                          <AnimatePresence mode="popLayout">
                            <motion.div
                              key={`discard-top-${displayCard.id}-${displayCard.color}`}
                              initial={{ scale: 0.75, opacity: 0.7 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 450, damping: 18 }}
                            >
                              <UnoCard
                                card={displayCard}
                                size="responsive"
                              />
                            </motion.div>
                          </AnimatePresence>
                        );
                      })()}
                    </div>
                  </div>
                          {/* Current Table Target Color Badge */}
                  <span className={`text-[8px] min-[370px]:text-[9px] font-black uppercase font-mono px-2 py-0.5 border border-black shadow-[1px_1px_0_#000] ${getActiveColorBorder(gameState.activeColor)}`}>
                    {gameState.activeColor === 'green' ? 'purple' : gameState.activeColor}
                  </span>
                </div>

              </div>

              {/* Play Direction Action Alert Text Overlay */}
              <div className="absolute bottom-1 bg-black border border-black px-2 py-0.5 flex items-center gap-1 text-[8px] font-mono text-slate-300 select-none max-w-[115px] sm:max-w-none truncate">
                <ArrowRightLeft className="w-2.5 h-2.5 text-[#ffcc00]" />
                <span>DIR: {gameState.direction === 1 ? 'CW 🔄' : 'CCW 🔄'}</span>
              </div>
            </div>

            {/* RIGHT AI PLAYER 3 */}
            <div className="col-span-3 flex justify-center items-center">
              {(() => {
                const rightPlayer = gameState.players[3];
                if (!rightPlayer) return null;
                const isActive = gameState.currentPlayerIndex === 3;
                const isOffline = gameMode !== 'offline' && !rightPlayer.isConnected;
                const isBot = gameMode !== 'offline' && rightPlayer.isAi;
                const avatarFilter = `${gameMode === 'pvp' ? 'blur(4.5px) ' : ''}${isOffline ? 'grayscale(90%) opacity(0.5)' : ''}`.trim() || 'none';
                return (
                  <div className="flex flex-col items-center relative gap-1 text-center">
                    <div style={{ filter: avatarFilter }}>
                      <Avatar id={rightPlayer.avatar} emotion={rightPlayer.emotion} isActive={isActive} size={36} />
                    </div>
                    
                    <div className="bg-black text-white px-1.5 py-1 border border-black text-[8px] font-mono flex flex-col items-center leading-none shadow-[2px_2px_0_#000] max-w-[85px] truncate">
                      <span className="max-w-[80px] truncate text-center">{getDisplayName(rightPlayer)}</span>
                      <span className="text-[#ffcc00] font-black mt-0.5 whitespace-nowrap">🎴 {rightPlayer.hand.length} CARDS</span>
                      {isOffline && (
                        <span className="text-[#ff4b4b] font-black text-[7px] animate-pulse mt-0.5">🔌 OFF</span>
                      )}
                      {isBot && (
                        <span className="text-[#ffcc00] font-black text-[7px] mt-0.5">🤖 BOT</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

          </section>

          {/* EVENT BAR */}
          <section className="w-full max-w-lg mx-auto flex gap-2 justify-center py-1">
            {isHumanTurn && gameState.consecutiveDraws > 0 && playableCount > 0 && (
              <button
                onClick={passTurn}
                className="py-2 px-4 bg-[#00d2ff] text-black font-black text-xs uppercase font-mono tracking-wider border-2 border-black pixel-btn-interactive shadow-[2px_2px_0_#000]"
              >
                PASS TURN ➔
              </button>
            )}
          </section>

          {/* BOTTOM ZONE: HUMAN PLAYER ZONE */}
          <section className="w-full bg-[#18181c] border-2 border-black p-2.5 space-y-2">
            
            {/* NO-SCROLL DYNAMIC OVERLAPPING CARDS ZONE */}
            <div className="cards-hand-container w-full overflow-x-auto py-2 px-1 flex flex-row items-center justify-start min-h-[106px] min-[370px]:min-h-[126px] sm:min-h-[148px] select-none relative bg-black/40 border border-black">
              {(() => {
                const human = gameState.players.find((p) => p.id === 'player');
                if (!human) return <div className="text-slate-500 text-xs italic font-mono">Loading...</div>;
                if (human.hand.length === 0) return <div className="text-slate-500 text-xs italic font-mono">Empty hand.</div>;

                const handLength = human.hand.length;
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                const isVerySmall = typeof window !== 'undefined' && window.innerWidth < 370;
                
                const cardWidth = isVerySmall ? 54 : (isMobile ? 68 : 82);
                const containerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 32, 860) : 320;

                const totalNeeded = handLength * cardWidth;
                let overlapPx = 0;
                if (totalNeeded > containerWidth && handLength > 1) {
                  overlapPx = (totalNeeded - containerWidth) / (handLength - 1);
                  overlapPx = Math.min(overlapPx, cardWidth - 16);
                }

                return human.hand.map((card, idx) => {
                  const isPlayable = checkPlayable(card);
                  return (
                    <div
                      key={card.id || `my-card-${idx}`}
                      className="shrink-0 transition-all duration-100 hover:-translate-y-4 relative cursor-pointer"
                      style={{
                        marginLeft: idx > 0 ? `-${overlapPx}px` : '0px',
                        zIndex: idx,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.zIndex = '999'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.zIndex = idx.toString(); }}
                    >
                      <UnoCard
                        card={card}
                        isPlayable={isPlayable}
                        onClick={isPlayable ? () => playCard(card) : undefined}
                        size="responsive"
                        indexOffset={idx}
                      />
                    </div>
                  );
                });
              })()}
            </div>

            {/* ACTION TRIGGERS IN HAND */}
            <div className="w-full flex items-center justify-between gap-2 px-1 pt-0.5 font-mono text-[9px] min-[370px]:text-[10px]">
              <div className="flex items-center gap-1.5 text-white bg-black px-2 py-1.5 border border-black">
                <Star className="w-3 h-3 text-[#ffcc00] fill-[#ffcc00]" />
                <span>LEVEL {playerLevel}</span>
              </div>
              
              <div className="text-white bg-black px-2 py-1.5 border border-black">
                CARDS: <strong>{gameState.players.find((p) => p.id === 'player')?.hand.length || 0}</strong>
              </div>
            </div>

          </section>

        </main>
      )}

      {/* WILD COLOR PICKER MODAL SELECTOR OVERLAY */}
      {wildSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0c0f12] text-white border-4 border-black p-5 w-full max-w-sm text-center shadow-[6px_6px_0_#000000] font-mono">
            <h3 className="text-xs font-black text-white mb-1 uppercase tracking-wider">
              :: SELECT SUIT ::
            </h3>
            <p className="text-[10px] text-slate-400 mb-4 font-sans leading-relaxed">
              Choose the next active color suit for the table pile
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => selectWildColor('red')}
                className="py-3 bg-[#ff4b4b] text-black font-black text-xs border-2 border-black pixel-btn-interactive uppercase"
              >
                Red Suit
              </button>
              <button
                onClick={() => selectWildColor('blue')}
                className="py-3 bg-[#00d2ff] text-black font-black text-xs border-2 border-black pixel-btn-interactive uppercase"
              >
                Blue Suit
              </button>
              <button
                onClick={() => selectWildColor('yellow')}
                className="py-3 bg-[#ffcc00] text-black font-black text-xs border-2 border-black pixel-btn-interactive uppercase"
              >
                Gold Suit
              </button>
              <button
                onClick={() => selectWildColor('green')}
                className="py-3 bg-[#a855f7] text-black font-black text-xs border-2 border-black pixel-btn-interactive uppercase"
              >
                Purple Suit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER SCREEN OVERLAY (LEADERBOARD & REWARDS) */}
      {gameState.phase === 'game_over' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-5 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md space-y-3">
            <div className="w-full px-3 py-2 flex justify-between items-center bg-[#18181c] border-4 border-black font-mono shadow-[6px_6px_0_#000]">
              <div className="flex items-center gap-2">
                <img src="/text(logo).jpg" alt="Logo" className="h-6 w-auto object-contain select-none" />
              </div>

              <button
                onClick={() => {
                  sound.playPop();
                  returnToLobby();
                }}
                className="px-2 py-1 bg-slate-950 border-2 border-black text-white pixel-btn-interactive flex items-center gap-1 text-[9px] font-black"
                title="Lobby Setup"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>MENU</span>
              </button>
            </div>

            <div className="bg-[#0c0f12] text-white border-4 border-black p-4 w-full text-center shadow-[6px_6px_0_#000] font-mono max-h-[78vh] flex flex-col overflow-y-auto custom-scroll">
            
            <h2 className="text-sm sm:text-base font-black tracking-tight leading-none mb-2 text-[#ffcc00] uppercase">
              {gameState.winnerId === 'player' ? '🏆 VICTORY MATCH 🏆' : '💀 GAME OVER 💀'}
            </h2>
            <p className="text-slate-450 text-[9px] sm:text-[10px] mb-3 leading-normal font-sans">
              {gameState.winnerId === 'player' ? 'Outstanding game! You cleared your hand first!' : 'The AI bots cleared their hand first!'}
            </p>

            {/* Leaderboard entries */}
            <div className="space-y-1.5 mb-3">
              {(leaderboard || []).map((entry: any, index: number) => {
                const isUser = entry.playerId === 'player';
                const rankLabels = ['1st', '2nd', '3rd', '4th'];
                const rankBadgeColors = [
                  'bg-[#ffcc00]/20 border-[#ffcc00] text-[#ffcc00]',
                  'bg-slate-300/20 border-slate-300 text-slate-300',
                  'bg-amber-600/20 border-amber-600 text-amber-500',
                  'bg-slate-800 border-black text-slate-500',
                ];

                return (
                  <div
                    key={entry.playerId}
                    className={`flex items-center justify-between p-1.5 border ${
                      isUser
                        ? 'bg-[#00d2ff]/20 border-[#00d2ff] shadow-[inset_2px_2px_rgba(0,210,255,0.1)]'
                        : 'bg-black/50 border-black'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-left">
                      {/* Rank Indicator */}
                      <span className={`w-6 h-5 flex items-center justify-center font-bold text-[8px] border font-mono ${rankBadgeColors[index] || 'bg-slate-900 border-black'}`}>
                        {rankLabels[index] || entry.rank}
                      </span>
                      
                      {/* Avatar */}
                      <Avatar id={entry.avatar} emotion={entry.isWinner ? 'celebrating' : 'happy'} size={24} />
                      
                      <div className="leading-tight">
                        <span className={`block font-bold text-[10px] ${isUser ? 'text-[#00d2ff]' : 'text-slate-200'}`}>
                          {entry.name} {isUser && ' (You)'}
                        </span>
                        <span className="text-[8px] text-slate-550 font-mono">
                          {entry.cardsLeft || 0} {entry.cardsLeft === 1 ? 'CARD' : 'CARDS'} LEFT ({entry.points} PTS)
                        </span>
                      </div>
                    </div>

                    <div className="text-right leading-none">
                      {entry.isWinner && (
                        <span className="text-[6px] bg-[#00ff66]/20 text-[#00ff66] px-1 border border-[#00ff66] font-black uppercase tracking-wider mt-0.5 inline-block">
                          Winner
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unified Sleek Rewards Panel */}
            {(() => {
              const myEntry = (leaderboard || []).find((e: any) => e.playerId === 'player');
              if (!myEntry) return null;
              
              const previousXp = Math.max(0, playerXp - myEntry.xpGained);
              const prevLevel = Math.floor(previousXp / xpNeeded) + 1;

              return (
                <div className="bg-black p-2.5 border border-black mb-3 text-left space-y-1.5 font-mono text-[9px]">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-[#00d2ff] flex flex-col gap-0.5">
                      <span>YOUR REWARD</span>
                      <span className="text-[#ffcc00] text-[12px]">+{myEntry.xpGained} XP</span>
                      {gameMode !== 'offline' && myEntry.ticketsGained !== undefined && (
                        <span className="text-[#00ff66]">TICKETS: <span className="text-[#ffcc00]">+{myEntry.ticketsGained.toFixed(2)} TKT</span></span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[8px] font-bold text-slate-400">
                    <span>Level {playerLevel}</span>
                    <span>{currentLevelXp}/{xpNeeded} XP</span>
                  </div>

                  <div className="w-full bg-slate-900 h-2 border border-black overflow-hidden relative">
                    <div
                      className="bg-[#00d2ff] h-full transition-all duration-1000 ease-out"
                      style={{ width: `${xpProgressPercentage}%` }}
                    ></div>
                  </div>

                  {playerLevel > prevLevel && (
                    <div className="text-center text-[8px] text-[#00ff66] font-black animate-pulse mt-0.5 uppercase">
                      Level Up! Reached Level {playerLevel}
                    </div>
                  )}
                </div>
              );
            })()}

            {shouldPromptWalletAfterFirstFreeGame && (
              <div className="bg-[#08131f] border border-[#00d2ff] mb-3 p-3 text-left font-mono">
                <div className="text-[10px] font-black uppercase text-[#00d2ff]">After Your First Free Game</div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-200 font-sans">
                  Return to the lobby and connect your wallet to sync progress, open the rewards flow, and start earning free energy from quests.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(firstFreeGameWalletPromptKey, '1');
                    sound.playPop();
                    returnToLobby();
                  }}
                  className="mt-3 w-full py-2 bg-[#00d2ff] text-black font-black text-[10px] uppercase border-2 border-black shadow-[2px_2px_0_#000]"
                >
                  Open Rewards And Connect Wallet
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  sound.playPop();
                  returnToLobby();
                }}
                className="w-full py-2.5 bg-slate-950 text-white font-black text-xs uppercase tracking-wider pixel-btn-interactive border-2 border-black shadow-[2px_2px_0_#000]"
              >
                MENU
              </button>
              <button
                onClick={() => {
                  sound.playShuffle();
                  startGame(selectedAvatar, userName, gameMode, activeStake);
                }}
                className="w-full py-2.5 bg-[#00ff66] text-black font-black text-xs uppercase tracking-wider pixel-btn-interactive border-2 border-black shadow-[2px_2px_0_#000]"
              >
                PLAY AGAIN
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* INJECT RULES MODAL DIALOG */}
      <RuleModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />

    </div>
  );
}
