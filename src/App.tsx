/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { useUnoGame } from './hooks/useUnoGame';
import { Avatar } from './components/Avatars';
import { UnoCard } from './components/UnoCard';
import { RuleModal } from './components/RuleModal';
import { Web3Dashboard } from './components/Web3Dashboard';
import { motion, AnimatePresence } from 'motion/react';
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
  const {
    gameState,
    stats,
    wildSelectOpen,
    startGame,
    playCard,
    drawCard,
    passTurn,
    resetStats,
    selectWildColor,
    leaderboard,
    cardsPlayedThisRound,
    cardsDrawnThisRound,
  } = useUnoGame();

  // Level Progression Calculation
  const playerXp = stats.xp || 0;
  const xpNeeded = 400;
  const playerLevel = Math.floor(playerXp / xpNeeded) + 1;
  const currentLevelXp = playerXp % xpNeeded;
  const xpProgressPercentage = Math.min(100, Math.floor((currentLevelXp / xpNeeded) * 100));

  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMuted] = useState(() => sound.getMuted());
  const [userName, setUserName] = useState('Cute Cadet');
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>('rabbit');

  // Available avatars to select in lobby
  const AVATAR_LIST: { id: AvatarId; emoji: string; bg: string; description: string }[] = [
    { id: 'rabbit', emoji: '🐰', bg: 'bg-pink-100 border-pink-400 text-pink-700', description: 'Bouncy bunny hop!' },
    { id: 'bear', emoji: '🐻', bg: 'bg-amber-100 border-amber-400 text-amber-800', description: 'Sweet honey bear!' },
    { id: 'fox', emoji: '🦊', bg: 'bg-orange-100 border-orange-400 text-orange-700', description: 'Sneaky clever logs!' },
    { id: 'panda', emoji: '🐼', bg: 'bg-slate-100 border-slate-400 text-slate-800', description: 'Chill bamboo roller!' },
    { id: 'cat', emoji: '🐱', bg: 'bg-violet-100 border-violet-400 text-violet-700', description: 'Playful whisker star!' },
    { id: 'koala', emoji: '🐨', bg: 'bg-emerald-100 border-emerald-400 text-emerald-800', description: 'Cute eucalyptus hug!' },
  ];

  const toggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
    sound.playPop();
  };

  const currentActivePlayer = gameState.players[gameState.currentPlayerIndex];
  const isHumanTurn = currentActivePlayer?.id === 'player';

  // Calculate playable check for human hand
  const checkPlayable = (card: any) => {
    if (!isHumanTurn) return false;
    if (gameState.phase !== 'playing') return false;
    
    // Wilds can always card play
    if (card.color === 'wild') return true;
    if (card.color === gameState.activeColor) return true;
    if (card.value === gameState.activeValue) return true;
    return false;
  };

  const playableCount = gameState.players.find((p) => p.id === 'player')?.hand.filter(checkPlayable).length || 0;

  // Render Play table segment colors inside center
  const getActiveColorBorder = (color: CardColor) => {
    switch (color) {
      case 'red':
        return 'border-white bg-[#EF233C] text-white shadow-[#EF233C]/20';
      case 'blue':
        return 'border-white bg-[#0077B6] text-white shadow-[#0077B6]/20';
      case 'green':
        return 'border-white bg-[#38B000] text-white shadow-[#38B000]/20';
      case 'yellow':
        return 'border-white bg-[#FFD60A] text-zinc-950 font-black shadow-[#FFD60A]/20';
      default:
        return 'border-white bg-zinc-800 text-white shadow-zinc-800/20';
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

    // If discard pile grew, hold the visual card to previous card, then update after animation lands
    if (gameState.discardPile.length > (prev.discardPile?.length || 0)) {
      const prevTop = prev.discardPile[prev.discardPile.length - 1];
      if (prevTop) {
        setVisualTopCard(prevTop);
      }
      
      const timer = setTimeout(() => {
        setVisualTopCard(currentTop);
      }, 550); // matches throw animation duration

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

    // 1. Detect Played Card (Discard Pile grew or changed)
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
            endX: 62, // Discard pile position
            endY: 50,
            rotateStart,
            rotateEnd: Math.random() * 30 - 15,
          }
        ]);

        // Cleanup
        setTimeout(() => {
          setFlyingCards((prevAnims) => prevAnims.filter((f) => f.id !== animId));
        }, 700);
      }
    }

    // 2. Detect Drawn Card (Hand size increased)
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
              startX: 38, // Draw pile position
              startY: 50,
              endX,
              endY,
              rotateStart: 0,
              rotateEnd,
            }
          ]);

          // Cleanup
          setTimeout(() => {
            setFlyingCards((prevAnims) => prevAnims.filter((f) => f.id !== animId));
          }, 700);
        }
      });
    }

    prevGameStateRef.current = gameState;
  }, [gameState]);

  return (
    <div className={`w-full bg-[#1B4332] flex flex-col items-center justify-start font-sans relative select-none transition-colors duration-500 ${
      gameState.phase === 'setup' ? 'min-h-screen bg-[#070A0E] overflow-y-auto' : 'h-screen max-h-screen overflow-hidden'
    }`}>
      
      {/* Cyber/Web3 ambient neon matrix background when in Setup phase */}
      {gameState.phase === 'setup' && (
        <div className="absolute inset-0 bg-[#0A0D14] overflow-hidden pointer-events-none z-0">
          {/* Glowing background meshes */}
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]"></div>
          
          {/* Interactive grid mesh lines */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}></div>

          <div className="absolute top-[8%] left-[8%] text-indigo-500/5 text-8xl font-black font-mono select-none">WEB3</div>
          <div className="absolute bottom-[8%] right-[8%] text-emerald-500/5 text-8xl font-black font-mono select-none">CADET</div>
          
          {/* Floating animated ambient circles */}
          <div className="absolute top-[20%] right-[10%] w-32 h-32 bg-yellow-500/5 rounded-full filter blur-xl animate-pulse"></div>
          <div className="absolute bottom-[30%] left-[10%] w-44 h-44 bg-pink-500/5 rounded-full filter blur-2xl animate-pulse" style={{ animationDuration: '6s' }}></div>
        </div>
      )}

      {/* HEADER UTILITY PANEL */}
      <header className="w-full max-w-4xl px-2 py-1.5 sm:px-4 sm:py-3 flex justify-between items-center z-30 bg-black/30 backdrop-blur-md border-b-4 border-[#40916C]">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-[8px] sm:rounded-[10px] bg-[#EF233C] text-white font-extrabold text-sm sm:text-lg select-none shadow-[1px_1px_0_rgba(0,0,0,0.25)] sm:shadow-[2px_2px_0_rgba(0,0,0,0.25)] border sm:border-2 border-white transform rotate-[-3deg]">
            YO
          </span>
          <h1 className="text-sm min-[370px]:text-base sm:text-xl font-bold text-white tracking-tight drop-shadow whitespace-nowrap">
            Geometric <span className="text-[#FFD60A] hidden min-[400px]:inline">Balance</span>
          </h1>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {gameState.phase !== 'setup' && (
            <button
              onClick={() => {
                sound.playPop();
                if (window.confirm('Wanna head back to lobby? Current progress will lose.')) {
                  startGame(selectedAvatar, userName);
                  // Trigger direct hard reset by forcing setup phase or clean startGame lobby reset
                  window.location.reload();
                }
              }}
              className="p-1.5 sm:p-2 bg-slate-800 text-slate-200 hover:text-white rounded-lg sm:rounded-xl border-b-2 border-slate-950 active:scale-95 transition-transform"
              title="Lobby Setup"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          <button
            onClick={() => {
              sound.playPop();
              setRulesOpen(true);
            }}
            className="p-1.5 sm:p-2 bg-slate-800 text-yellow-400 hover:text-yellow-300 rounded-lg sm:rounded-xl border-b-2 border-slate-950 active:scale-95 transition-transform"
            title="Schedules / Rules"
          >
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </button>

          <button
            onClick={toggleMute}
            className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border-b-2 border-slate-950 active:scale-95 transition-transform ${
              muted ? 'bg-red-950/40 text-red-400' : 'bg-slate-800 text-emerald-400'
            }`}
            title={muted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>
      </header>

      {/* GAME EVENT TICKER LOG */}
      {gameState.phase === 'playing' && gameState.logs.length > 0 && (
        <div className="w-full max-w-4xl px-4 py-2 bg-slate-950/40 text-xs text-slate-300 flex items-center gap-2 border-b border-white/[0.02] overflow-hidden z-20">
          <div className="shrink-0 font-bold text-yellow-400 uppercase tracking-widest text-[9px] bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
            Feed 📢
          </div>
          <div className="flex-1 truncate italic text-slate-200">
            {gameState.logs[0].message}
          </div>
          <div className="shrink-0 text-[10px] text-slate-400 font-mono">
            {gameState.logs[0].timestamp}
          </div>
        </div>
      )}

      {/* LOBBY / SETUP SCREEN */}
      {gameState.phase === 'setup' && (
        <main className="flex-1 w-full max-w-lg px-4 py-3 sm:py-6 flex flex-col justify-center items-center gap-3 sm:gap-6 z-10 animate-fade-in">
          
          {/* Main Title Badge */}
          <div className="text-center space-y-1 sm:space-y-2 mt-1">
            <div className="inline-block transform rotate-[-3deg] hover:rotate-3 transition-transform duration-300">
              <div className="bg-slate-900 text-white border-2 sm:border-4 border-slate-950 rounded-[20px] sm:rounded-[30px] px-5 py-2 sm:px-8 sm:py-4 shadow-xl sm:shadow-2xl relative">
                <span className="absolute -top-2 -right-2 text-2xl sm:text-3xl animate-bounce">🎈</span>
                <span className="absolute -bottom-1 -left-2 text-xl sm:text-2xl">✨</span>
                <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-none text-yellow-400 drop-shadow-[0_2px_1px_rgba(0,0,0,0.5)] sm:drop-shadow-[0_4px_1px_rgba(0,0,0,0.5)]">
                  YO!
                </h2>
                <span className="text-[9px] sm:text-xs uppercase font-extrabold text-white tracking-widest">
                  Cartoon Party Web3 Game
                </span>
              </div>
            </div>
            <p className="text-slate-700 font-bold text-xs sm:text-sm bg-white/50 backdrop-blur-md px-3 py-0.5 sm:px-4 sm:py-1 rounded-full border border-white/40 shadow-sm max-w-[280px] mx-auto">
              Play against fluffy AI animal friends! 🐾
            </p>
          </div>

          {/* Web3 Smartphone-Oriented Dashboard Menu */}
          <div className="w-full max-w-md z-10">
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
              resetStats={resetStats}
              onStartGame={() => startGame(selectedAvatar, userName)}
            />
          </div>
        </main>
      )}

      {/* ACTIVE GAMEPLAY CONTAINER: THEMED GEOMETRIC BALANCE FELT PLAY TABLE */}
      {gameState.phase !== 'setup' && (
        <main className="flex-1 w-full max-w-4xl my-1 sm:my-2 p-1.5 sm:p-3 md:p-6 flex flex-col justify-between gap-1.5 sm:gap-3 overflow-hidden z-10 relative bg-[#2D6A4F] border-[4px] sm:border-[8px] md:border-[12px] border-[#40916C] rounded-[24px] sm:rounded-[48px] md:rounded-[80px] shadow-[inset_0_0_80px_rgba(0,0,0,0.55),0_15px_30px_rgba(0,0,0,0.5)]">
          
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
          
          {/* TOP ZONE: AI PLAYER 2 (Sleepy Panda) */}
          <section className="w-full flex justify-center items-center py-0.5 sm:py-1">
            {(() => {
              const pandaPlayer = gameState.players[2];
              if (!pandaPlayer) return null;
              const isActive = gameState.currentPlayerIndex === 2;
              return (
                <div className="flex flex-col items-center relative gap-0.5 sm:gap-1">
                  <Avatar id={pandaPlayer.avatar} emotion={pandaPlayer.emotion} isActive={isActive} size={typeof window !== 'undefined' && window.innerWidth < 640 ? 42 : 54} />
                  
                  <div className="bg-black/60 text-white px-2.5 py-0.5 sm:px-4 sm:py-1 rounded-[20px] text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1 sm:gap-2 border-2 border-white/20 shadow-lg max-w-[150px] sm:max-w-xs truncate">
                    <span className="truncate">{pandaPlayer.name}</span>
                    <span className="text-[8px] sm:text-[10px] bg-[#EF233C] text-white px-1.5 py-0.5 rounded-full font-mono font-black flex items-center gap-0.5 shadow-sm border border-white/20">
                      🎴 {pandaPlayer.hand.length}
                    </span>
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
                return (
                  <div className="flex flex-col items-center relative gap-0.5 sm:gap-1 text-center">
                    <Avatar id={leftPlayer.avatar} emotion={leftPlayer.emotion} isActive={isActive} size={typeof window !== 'undefined' && window.innerWidth < 640 ? 36 : 50} />
                    
                    <div className="bg-black/60 text-white px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-[16px] text-[8px] sm:text-[10px] font-bold uppercase tracking-wider flex flex-col items-center leading-none sm:leading-tight border-2 border-white/20 shadow-md">
                      <span className="max-w-[50px] min-[370px]:max-w-[65px] sm:max-w-[70px] truncate text-center">{leftPlayer.name}</span>
                      <span className="text-[7px] sm:text-[9px] text-[#FFD60A] font-extrabold mt-0.5 whitespace-nowrap">🎴 {leftPlayer.hand.length} Cards</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CENTRAL PLAY MAT FELT TABLE BOARD */}
            <div className="col-span-6 h-full flex items-center justify-center relative min-h-[110px] min-[370px]:min-h-[135px] sm:min-h-[170px] md:min-h-[220px]">
              
              {/* Play Mat Felt Graphic Background */}
              <div className="absolute inset-0 bg-gradient-to-b from-sky-300/10 to-sky-500/10 rounded-[24px] sm:rounded-[40px] border-2 sm:border-3 border-dashed border-slate-650/40 opacity-70"></div>

              {/* ROTATING DIRECTION RING ANIMATION */}
              <div className="absolute w-[100px] h-[100px] min-[370px]:w-[120px] min-[370px]:h-[120px] sm:w-[150px] sm:h-[150px] md:w-[200px] md:h-[200px] flex items-center justify-center opacity-60 pointer-events-none">
                <div
                  className={`w-full h-full border-2 sm:border-4 border-dashed border-yellow-300/30 rounded-full flex items-center justify-center relative ${
                    gameState.direction === 1 ? 'animate-[spin_24s_linear_infinite]' : 'animate-[spin_24s_linear_infinite_reverse]'
                  }`}
                >
                  {/* Tiny arrows */}
                  <span className="absolute top-1 text-slate-100 font-bold text-xs">➔</span>
                  <span className="absolute bottom-1 text-slate-100 font-bold text-xs rotate-180">➔</span>
                  <span className="absolute left-1 text-slate-100 font-bold text-xs -rotate-90">➔</span>
                  <span className="absolute right-1 text-slate-105 font-bold text-xs rotate-90">➔</span>
                </div>
              </div>

              {/* CENTRAL PILES CONTAINER */}
              <div className="grid grid-cols-2 gap-4 items-center justify-center z-10 w-full px-2">
                
                {/* DRAW DECK PILE (Clickable button) */}
                <div className="flex flex-col items-center gap-1 justify-self-center">
                  <div className="relative">
                    {/* Multi card stacking back offset lines */}
                    <div className="absolute top-1 left-1 w-[54px] h-[80px] min-[370px]:w-[68px] min-[370px]:h-[100px] sm:w-[82px] sm:h-[122px] bg-slate-950 border-2 min-[370px]:border-3 border-slate-900 rounded-xl sm:rounded-2xl opacity-60 z-0"></div>
                    <div className="absolute top-0.5 left-0.5 w-[54px] h-[80px] min-[370px]:w-[68px] min-[370px]:h-[100px] sm:w-[82px] sm:h-[122px] bg-red-850 border-2 min-[370px]:border-3 border-red-950 rounded-xl sm:rounded-2xl opacity-80 z-1"></div>
                    
                    <button
                      onClick={() => {
                        if (isHumanTurn) {
                          drawCard('player');
                        } else {
                          sound.playError();
                        }
                      }}
                      disabled={!isHumanTurn}
                      className={`relative z-10 transition-transform active:scale-95 border-none bg-none outline-none ${
                        isHumanTurn ? 'cursor-pointer hover:scale-102 hover:-translate-y-1' : 'opacity-85'
                      }`}
                      aria-label="Draw a card"
                    >
                      <UnoCard card={{ id: 'draw-pile-gui', color: 'wild', value: 'wild', score: 0 }} isBack={true} size="responsive" />
                      
                      {/* Interactive Tap-glowing Ring for Human turn */}
                      {isHumanTurn && playableCount === 0 && (
                        <span className="absolute inset-x-0 -bottom-1 text-center bg-yellow-405 text-slate-950 font-black text-[9px] uppercase px-1 rounded-full outline shadow animate-pulse tracking-tight select-none">
                          TAP DRAW! 👈
                        </span>
                      )}
                    </button>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-950/40 px-2 rounded-full">
                    {gameState.deck.length} remaining
                  </span>
                </div>

                {/* DISCARD PILE (Displays active playable top state) */}
                <div className="flex flex-col items-center gap-1 justify-self-center">
                  <div className="relative">
                    {/* Shadow cards under top card */}
                    {gameState.discardPile.length > 2 && (
                      <div className="absolute top-1 left-2 w-[54px] h-[80px] min-[370px]:w-[68px] min-[370px]:h-[100px] sm:w-[82px] sm:h-[122px] bg-slate-950/20 border border-black/10 rounded-xl sm:rounded-2xl rotate-[-12deg] z-0"></div>
                    )}
                    {gameState.discardPile.length > 1 && (
                      <div className="absolute bottom-1 right-1 w-[54px] h-[80px] min-[370px]:w-[68px] min-[370px]:h-[100px] sm:w-[82px] sm:h-[122px] bg-slate-950/30 border border-black/10 rounded-xl sm:rounded-2xl rotate-[8deg] z-1"></div>
                    )}

                    <div className="relative z-10">
                      {(() => {
                        const topCard = visualTopCard || gameState.discardPile[gameState.discardPile.length - 1] || { id: 'fallback', color: 'red', value: '0', score: 0 };
                        // If it's a wild card, display its outer color as the active suit color selected
                        const displayCard = topCard.color === 'wild'
                          ? { ...topCard, color: gameState.activeColor }
                          : topCard;
                        return (
                          <AnimatePresence mode="popLayout">
                            <motion.div
                              key={`discard-top-${displayCard.id}-${displayCard.color}`}
                              initial={{ scale: 0.7, rotate: -12, opacity: 0.7 }}
                              animate={{ scale: 1, rotate: 0, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 380, damping: 15 }}
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
                  <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full text-white shadow-sm border-2 ${getActiveColorBorder(gameState.activeColor)}`}>
                    Suit: {gameState.activeColor}
                  </span>
                </div>

              </div>

              {/* Play Direction Action Alert Text Overlay */}
              <div className="absolute bottom-1 bg-slate-950/80 rounded-full px-2 py-0.5 border border-white/10 flex items-center gap-1 text-[8px] sm:text-[10px] font-bold text-slate-250 select-none max-w-[115px] sm:max-w-none truncate">
                <ArrowRightLeft className="w-2.5 h-2.5 text-yellow-450" />
                <span>Play Direction: {gameState.direction === 1 ? 'Clockwise 🔄' : 'Counter 🔄'}</span>
              </div>
            </div>

            {/* RIGHT AI PLAYER 3 */}
            <div className="col-span-3 flex justify-center items-center">
              {(() => {
                const rightPlayer = gameState.players[3];
                if (!rightPlayer) return null;
                const isActive = gameState.currentPlayerIndex === 3;
                return (
                  <div className="flex flex-col items-center relative gap-0.5 sm:gap-1 text-center">
                    <Avatar id={rightPlayer.avatar} emotion={rightPlayer.emotion} isActive={isActive} size={typeof window !== 'undefined' && window.innerWidth < 640 ? 36 : 50} />
                    
                    <div className="bg-black/60 text-white px-1.5 py-1 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-[16px] text-[8px] sm:text-[10px] font-bold uppercase tracking-wider flex flex-col items-center leading-none sm:leading-tight border-2 border-white/20 shadow-md">
                      <span className="max-w-[50px] min-[370px]:max-w-[65px] sm:max-w-[70px] truncate text-center">{rightPlayer.name}</span>
                      <span className="text-[7px] sm:text-[9px] text-[#FFD60A] font-extrabold mt-0.5 whitespace-nowrap">🎴 {rightPlayer.hand.length} Cards</span>
                    </div>
                  </div>
                );
              })()}
            </div>

          </section>

          {/* EVENT BAR */}
          <section className="w-full max-w-lg mx-auto flex gap-2 justify-center py-1">
            {/* Draw Playable pass-through prompt button */}
            {isHumanTurn && gameState.consecutiveDraws > 0 && playableCount > 0 && (
              <button
                onClick={passTurn}
                className="py-2.5 px-5 bg-[#0077B6] hover:bg-[#0096C7] text-white font-bold text-xs uppercase tracking-wider rounded-xl border-2 border-white shadow-[2px_2px_0_rgba(0,0,0,0.2)] animate-pulse active:scale-95 transition-transform"
              >
                Keep Card & PASS 🐾
              </button>
            )}
          </section>

          {/* BOTTOM ZONE: HUMAN PLAYER ZONE */}
          <section className="w-full bg-black/35 rounded-2xl sm:rounded-3xl p-2 sm:p-4 border border-[#40916C]/40 shadow-inner backdrop-blur-md space-y-1.5 sm:space-y-3">
            
            {/* Turn status indicator */}
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-200 flex items-center gap-1 sm:gap-1.5 uppercase tracking-wide">
                <Users className="w-3 h-3 sm:w-4 sm:h-4 text-[#FFD60A]" />
                Your Hand Panel:
              </span>
              
              <span className={`text-[9px] sm:text-[11px] font-black px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border sm:border-2 tracking-wide ${
                isHumanTurn
                  ? 'bg-[#FFD60A] text-zinc-950 border-white shadow-md animate-pulse'
                  : 'bg-black/40 text-slate-400 border-white/10'
              }`}>
                {isHumanTurn ? '🌟 YOUR PLAY!' : '💤 COMPUTER IS THINKING...'}
              </span>
            </div>

            {/* NO-SCROLL DYNAMIC OVERLAPPING CARDS ZONE */}
            <div className="cards-hand-container w-full overflow-x-visible py-2 px-1 flex flex-row items-center justify-center min-h-[106px] min-[370px]:min-h-[126px] sm:min-h-[148px] select-none relative">
              {(() => {
                const human = gameState.players.find((p) => p.id === 'player');
                if (!human) return <div className="text-slate-400 text-xs italic">Loading hand...</div>;
                if (human.hand.length === 0) return <div className="text-slate-400 text-xs italic">Empty hand.</div>;

                const handLength = human.hand.length;
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                const isVerySmall = typeof window !== 'undefined' && window.innerWidth < 370;
                
                const cardWidth = isVerySmall ? 54 : (isMobile ? 68 : 82);
                const containerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 32, 860) : 320;

                const totalNeeded = handLength * cardWidth;
                let overlapPx = 0;
                if (totalNeeded > containerWidth && handLength > 1) {
                  overlapPx = (totalNeeded - containerWidth) / (handLength - 1);
                  // Ensure at least 16px of the card's left side/number remains visible
                  overlapPx = Math.min(overlapPx, cardWidth - 16);
                }

                return human.hand.map((card, idx) => {
                  const isPlayable = checkPlayable(card);
                  return (
                    <div
                      key={card.id || `my-card-${idx}`}
                      className="shrink-0 transition-all duration-200 hover:-translate-y-4 hover:scale-115 relative cursor-pointer"
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
            <div className="w-full flex items-center justify-between gap-2 px-1 pt-0.5">
              <div className="flex items-center gap-1 text-[9px] sm:text-[11px] text-slate-200 bg-black/40 px-2 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl border border-white/10">
                <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400 fill-yellow-400" />
                <span>Level {playerLevel}</span>
              </div>
              
              <div className="text-[9px] sm:text-[11px] font-mono text-white bg-black/40 px-2 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl border border-white/15">
                Total: <strong>{gameState.players.find((p) => p.id === 'player')?.hand.length || 0}</strong> Cards
              </div>
            </div>

          </section>

        </main>
      )}

      {/* WILD COLOR PICKER MODAL SELECTOR OVERLAY */}
      {wildSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border-4 border-slate-950 p-6 w-full max-w-sm text-center shadow-2xl animate-pop">
            <h3 className="text-xl font-black text-slate-900 mb-2 flex items-center justify-center gap-1.5">
              <span>🌈</span> Select Next Suit Color:
            </h3>
            <p className="text-xs text-slate-550 mb-5">
              Choose which cute color to color-swap the pile to!
            </p>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => selectWildColor('red')}
                className="py-5 rounded-2xl bg-[#EF233C] text-white font-black text-base border-b-4 border-[#D90429] active:scale-95 hover:brightness-105 transition-all shadow-md select-none uppercase"
              >
                🔴 Red Suit
              </button>
              <button
                onClick={() => selectWildColor('blue')}
                className="py-5 rounded-2xl bg-[#0077B6] text-white font-black text-base border-b-4 border-[#03045E] active:scale-95 hover:brightness-105 transition-all shadow-md select-none uppercase"
              >
                🔵 Blue Suit
              </button>
              <button
                onClick={() => selectWildColor('yellow')}
                className="py-5 rounded-2xl bg-[#FFD60A] text-zinc-950 font-black text-base border-b-4 border-[#FFB703] active:scale-95 hover:brightness-105 transition-all shadow-md select-none uppercase"
              >
                🟡 Yellow Suit
              </button>
              <button
                onClick={() => selectWildColor('green')}
                className="py-5 rounded-2xl bg-[#38B000] text-white font-black text-base border-b-4 border-[#007200] active:scale-95 hover:brightness-105 transition-all shadow-md select-none uppercase"
              >
                🟢 Green Suit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER SCREEN OVERLAY (LEADERBOARD & REWARDS) */}
      {gameState.phase === 'game_over' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          
          {/* Confetti container effect */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {gameState.winnerId === 'player' && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <div
                key={n}
                className="absolute text-2xl animate-confetti z-0"
                style={{
                  left: `${n * 10}%`,
                  color: ['#FCA5A5', '#FCD34D', '#86EFAC', '#93C5FD', '#F472B6'][n % 5],
                  animationDelay: `${n * 0.2}s`,
                  animationDuration: `${3 + (n % 3)}s`
                }}
              >
                🎉✨🏆🌈
              </div>
            ))}
          </div>

          <div className="bg-[#1A1C23] text-white rounded-3xl border-4 border-slate-900 p-3 sm:p-5 w-full max-w-sm sm:max-w-md text-center shadow-3xl animate-pop relative z-10 max-h-[92vh] flex flex-col overflow-y-auto custom-scroll">
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>

            {/* Header Badge */}
            <div className="inline-block mx-auto px-2.5 py-0.5 bg-slate-850 border border-slate-700 rounded-full text-[9px] sm:text-xs font-black text-yellow-400 tracking-wider uppercase mb-1">
              🏆 Match Standings
            </div>

            <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-none mb-0.5 text-white flex justify-center items-center gap-1">
              {gameState.winnerId === 'player' ? (
                <>🏆 VICTORY MATCH! <span className="animate-pulse">🎉</span></>
              ) : (
                <>🐾 GAME OVER <span className="opacity-80">🐼</span></>
              )}
            </h2>
            <p className="text-slate-400 text-[9px] sm:text-xs mb-2">
              {gameState.winnerId === 'player' ? 'Outstanding game! You cleared your hand first!' : 'The cute AI bots cleared their hand first!'}
            </p>

            {/* Leaderboard entries */}
            <div className="space-y-1 mb-2.5">
              {(leaderboard || []).map((entry: any, index: number) => {
                const isUser = entry.playerId === 'player';
                const rankEmojis = ['🥇', '🥈', '🥉', '🎖️'];
                const rankBadgeColors = [
                  'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
                  'bg-slate-300/10 border-slate-300/30 text-slate-300',
                  'bg-amber-600/10 border-amber-600/30 text-amber-500',
                  'bg-slate-700/10 border-slate-700/30 text-slate-400',
                ];

                return (
                  <div
                    key={entry.playerId}
                    className={`flex items-center justify-between p-1 sm:p-1.5 rounded-xl border transition-all ${
                      isUser
                        ? 'bg-indigo-600/20 border-indigo-500/60 shadow-[inset_0_0_8px_rgba(99,102,241,0.15)]'
                        : 'bg-slate-900/40 border-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Rank Indicator */}
                      <span className={`w-5 h-5 rounded-lg flex items-center justify-center font-bold text-[10px] border ${rankBadgeColors[index] || 'bg-slate-800'}`}>
                        {rankEmojis[index] || entry.rank}
                      </span>
                      
                      {/* Avatar */}
                      <Avatar id={entry.avatar} emotion={entry.isWinner ? 'celebrating' : 'happy'} size={24} />
                      
                      <div className="text-left leading-tight">
                        <span className={`block font-black text-[11px] ${isUser ? 'text-indigo-200' : 'text-slate-200'}`}>
                          {entry.name} {isUser && ' (You)'}
                        </span>
                        <span className="text-[8px] text-slate-400 font-mono">
                          {entry.points} hand points left
                        </span>
                      </div>
                    </div>

                    <div className="text-right leading-none">
                      <span className="text-[10px] font-black text-yellow-400 block">
                        +{entry.xpGained} XP
                      </span>
                      {entry.isWinner && (
                        <span className="text-[6px] bg-emerald-500/20 text-emerald-400 px-1 py-0.1 rounded-full font-black uppercase tracking-wider mt-0.5 inline-block">
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
              
              const placementXp = myEntry.rank === 1 ? 200 : (myEntry.rank === 2 ? 100 : (myEntry.rank === 3 ? 60 : 30));
              const cardsXp = cardsPlayedThisRound * 10;
              const previousXp = Math.max(0, playerXp - myEntry.xpGained);
              const prevLevel = Math.floor(previousXp / xpNeeded) + 1;

              return (
                <div className="bg-slate-900/60 rounded-xl border border-slate-800/80 p-1.5 sm:p-2.5 mb-2.5 text-left space-y-1">
                  <div className="flex justify-between items-center text-[9px] sm:text-xs">
                    <span className="font-extrabold text-indigo-300">
                      🎖️ Rewards: <span className="text-yellow-400">+{myEntry.xpGained} XP</span>
                    </span>
                    <span className="text-slate-450 font-mono text-[8px]">
                      ({placementXp} Rank + {cardsXp} Cards)
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[8px] sm:text-[10px] font-bold text-slate-300">
                    <span>Level {playerLevel}</span>
                    <span>{currentLevelXp}/{xpNeeded} XP</span>
                  </div>

                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden relative border border-slate-850">
                    <div
                      className="bg-gradient-to-r from-yellow-400 via-orange-400 to-rose-500 h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${xpProgressPercentage}%` }}
                    ></div>
                  </div>

                  {playerLevel > prevLevel && (
                    <div className="text-center text-[8px] text-emerald-400 font-black animate-pulse mt-0.5 uppercase tracking-wider">
                      ⭐ LEVEL UP! REACHED LEVEL {playerLevel}! ⭐
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ACTION REPLAY LOBBY BUTTON */}
            <button
              onClick={() => {
                sound.playShuffle();
                startGame(selectedAvatar, userName);
              }}
              className="w-full py-2 sm:py-2.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 text-white font-black text-xs sm:text-sm rounded-xl border-b-4 border-slate-950 hover:brightness-110 active:scale-[0.98] transition-transform select-none shadow-lg shadow-orange-500/20 uppercase tracking-wider cursor-pointer"
            >
              PLAY AGAIN! 🦊🌾
            </button>
          </div>
        </div>
      )}

      {/* INJECT RULES MODAL DIALOG */}
      <RuleModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />

    </div>
  );
}
