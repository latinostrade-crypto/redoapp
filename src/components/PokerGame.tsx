/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PokerCard, PokerGameState } from '../types/poker';
import { sound } from '../utils/sound';
import { RotateCcw, Volume2, VolumeX, Trophy, Timer, ArrowUpRight, Play, Plus, Minus, Loader2 } from 'lucide-react';
import { Avatar } from './Avatars';
import { evaluate7CardHand } from '../utils/pokerEvaluator';
import { QuickEmojiPanel, EmojiDisplayBadge, EmojiItem } from './QuickEmojiPanel';

interface PokerGameProps {
  gameState: PokerGameState;
  turnTimeLeft?: number;
  onFold: () => void;
  onCallOrCheck: () => void;
  onRaise: (amount: number) => void;
  onNextHand?: () => void;
  onReturnToLobby: () => void;
}

const SUIT_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  spades: { symbol: '♠', color: 'text-slate-950' },
  hearts: { symbol: '♥', color: 'text-red-600' },
  diamonds: { symbol: '♦', color: 'text-blue-600' },
  clubs: { symbol: '♣', color: 'text-emerald-700' },
};

const RANK_LABELS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

/**
 * Custom 3D Stack of Casino Chips SVG Logo
 */
export function ChipStackIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block shrink-0 ${className}`}
    >
      {/* Bottom Chip (Gold) */}
      <path d="M3 14.5v3.5c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5v-3.5" fill="#D97706" stroke="#78350F" strokeWidth="0.8" />
      <ellipse cx="12" cy="14.5" rx="9" ry="3.2" fill="#F59E0B" stroke="#78350F" strokeWidth="0.8" />
      <ellipse cx="12" cy="14.2" rx="7" ry="2.2" stroke="#FEF3C7" strokeWidth="0.6" strokeDasharray="2 1.5" />
      
      {/* Middle Chip (Emerald Green) */}
      <path d="M3 9.5v3.5c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5v-3.5" fill="#059669" stroke="#064E3B" strokeWidth="0.8" />
      <ellipse cx="12" cy="9.5" rx="9" ry="3.2" fill="#10B981" stroke="#064E3B" strokeWidth="0.8" />
      <ellipse cx="12" cy="9.2" rx="7" ry="2.2" stroke="#D1FAE5" strokeWidth="0.6" strokeDasharray="2 1.5" />
      
      {/* Top Chip (Ruby Red) */}
      <path d="M3 4.5v3.5c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5v-3.5" fill="#DC2626" stroke="#7F1D1D" strokeWidth="0.8" />
      <ellipse cx="12" cy="4.5" rx="9" ry="3.2" fill="#EF4444" stroke="#7F1D1D" strokeWidth="0.8" />
      <ellipse cx="12" cy="4.2" rx="7" ry="2.2" stroke="#FEE2E2" strokeWidth="0.6" strokeDasharray="2 1.5" />
      <ellipse cx="12" cy="4.2" rx="3.5" ry="1.2" fill="#FEF08A" stroke="#CA8A04" strokeWidth="0.5" />
    </svg>
  );
}

function ChipStack({ amount, label }: { amount: number; label?: string }) {
  if (amount <= 0) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="flex items-center gap-1 bg-black/90 border border-amber-400/80 px-1.5 py-0.5 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none shrink-0"
    >
      <ChipStackIcon className="w-3.5 h-3.5" />
      <span className="text-[7.5px] font-black text-[#ffcc00] leading-none">
        {label ? `${label} ${amount}` : amount}
      </span>
    </motion.div>
  );
}

function PokerCardView({
  card,
  hidden = false,
  isLarge = false,
  isWinning = false,
}: {
  card?: PokerCard;
  hidden?: boolean;
  isLarge?: boolean;
  isWinning?: boolean;
  key?: React.Key;
}) {
  const cardSizeClass = isLarge
    ? 'w-9 h-13 min-[380px]:w-11 min-[380px]:h-15'
    : 'w-8 h-11 min-[380px]:w-9 min-[380px]:h-13';

  if (hidden || !card) {
    return (
      <motion.div
        initial={{ scale: 0.4, y: -20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        className={`${cardSizeClass} border-2 border-black rounded-md shadow-md overflow-hidden bg-slate-950 select-none shrink-0`}
      >
        <img
          src="/card-thumbs/back.jpeg"
          alt="Card Back"
          className="w-full h-full object-cover"
        />
      </motion.div>
    );
  }

  const suitInfo = SUIT_SYMBOLS[card.suit] || { symbol: '?', color: 'text-black' };
  const rankLabel = RANK_LABELS[card.rank] || String(card.rank);

  return (
    <motion.div
      initial={{ scale: 0.4, y: -20, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={`${cardSizeClass} bg-slate-100 border-2 ${
        isWinning ? 'border-[#ffcc00] ring-2 ring-[#ffcc00] shadow-[0_0_12px_#ffcc00]' : 'border-black'
      } rounded-md p-1 flex flex-col justify-between select-none shadow-[2px_2px_0_#000] shrink-0 relative overflow-hidden`}
    >
      <div className={`text-[10px] min-[380px]:text-[11px] font-black leading-none ${suitInfo.color}`}>
        {rankLabel}
      </div>
      <div className={`text-base min-[380px]:text-lg self-center leading-none ${suitInfo.color}`}>
        {suitInfo.symbol}
      </div>
      <div className={`text-[10px] min-[380px]:text-[11px] font-black leading-none self-end rotate-180 ${suitInfo.color}`}>
        {rankLabel}
      </div>
    </motion.div>
  );
}

export function PokerGame({
  gameState,
  turnTimeLeft = 15,
  onFold,
  onCallOrCheck,
  onRaise,
  onNextHand,
  onReturnToLobby,
}: PokerGameProps) {
  const [muted, setMuted] = useState(() => sound.getMuted());
  const [showRaisePanel, setShowRaisePanel] = useState(false);
  const [customRaiseAmount, setCustomRaiseAmount] = useState(gameState.currentBet + gameState.bigBlindAmount);
  const [nextHandCountdown, setNextHandCountdown] = useState(6);
  const [activeEmoji, setActiveEmoji] = useState<{ emoji: EmojiItem | string; key: number } | null>(null);

  const handleSendEmoji = (emoji: EmojiItem) => {
    setActiveEmoji({ emoji, key: Date.now() });
    setTimeout(() => setActiveEmoji(null), 3500);
  };

  const humanPlayer = gameState.players.find((p) => p.id === 'player') || gameState.players[0];
  const isHumanTurn =
    gameState.stage !== 'idle' &&
    gameState.stage !== 'ended' &&
    !gameState.isDealing &&
    gameState.players[gameState.currentPlayerIndex]?.id === 'player';
  const callNeeded = humanPlayer ? Math.max(0, gameState.currentBet - humanPlayer.currentBet) : 0;
  const canCallOrCheck = Boolean(isHumanTurn && humanPlayer && !humanPlayer.folded && !humanPlayer.isAllIn);

  // Live hand rank evaluation for human player
  const humanHandEval = React.useMemo(() => {
    if (!humanPlayer || !humanPlayer.holeCards || humanPlayer.holeCards.length < 2) return null;
    return evaluate7CardHand([...humanPlayer.holeCards, ...gameState.communityCards]);
  }, [humanPlayer, gameState.communityCards]);

  const toggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
    sound.playPop();
  };

  // Keep custom raise amount synced
  useEffect(() => {
    setCustomRaiseAmount(gameState.currentBet + gameState.bigBlindAmount);
  }, [gameState.currentBet, gameState.bigBlindAmount]);

  // Auto-next hand countdown during showdown
  useEffect(() => {
    if (gameState.stage !== 'ended') {
      setNextHandCountdown(6);
      return;
    }

    const timer = setInterval(() => {
      setNextHandCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onNextHand) onNextHand();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, onNextHand]);

  return (
    <div className="w-full max-w-md mx-auto flex flex-col justify-start gap-1 bg-[#080d0a] border-4 border-black p-2 relative overflow-hidden select-none font-mono text-white shadow-[0_0_25px_rgba(0,0,0,0.95)] rounded-xl min-h-[550px]">
      
      {/* 1. TOP HEADER CONTROL BAR */}
      <header className="flex justify-between items-center bg-slate-950 border border-black px-2.5 py-1 z-20 rounded">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReturnToLobby}
            className="px-2 py-0.5 bg-red-950 border border-red-500/40 hover:bg-red-900 text-red-300 text-[8px] font-black uppercase flex items-center gap-1 pixel-btn-interactive cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>LOBBY</span>
          </button>
          <span className="text-[8px] font-black text-[#00ff66] uppercase bg-black px-1.5 py-0.5 border border-black">
            POKER HOLD'EM ({gameState.mode.toUpperCase()})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black text-[#ffcc00] flex items-center gap-1 bg-black px-1.5 py-0.5 border border-black">
            <ChipStackIcon className="w-3 h-3" />
            <span>{gameState.stake === 0 ? 'FREE' : `${gameState.stake}TKT`}</span>
          </span>

          <button
            type="button"
            onClick={toggleMute}
            className={`p-1 border border-black pixel-btn-interactive cursor-pointer ${
              muted ? 'bg-red-950/40 text-red-400' : 'bg-slate-900 text-[#00ff66]'
            }`}
          >
            {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
        </div>
      </header>

      {/* 2. OVAL POKER FELT TABLE CANVAS */}
      <div className="w-full h-[385px] min-[380px]:h-[415px] bg-gradient-to-b from-[#0a3822] to-[#041a0f] border-4 border-[#1c130c] rounded-[50px] relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.9)] flex flex-col items-center justify-center z-10 shrink-0">
        
        {/* Felt Watermark Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none rounded-[45px] bg-[radial-gradient(#00ff66_1px,transparent_1px)] [background-size:10px_10px]" />

        {/* POT & STAGE DISPLAY (Top-center) */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
          <motion.div
            key={gameState.pot}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className="bg-slate-950/95 border-2 border-[#ffcc00] px-3 py-0.5 rounded-full shadow-[0_0_12px_rgba(255,204,0,0.4)] flex items-center gap-1.5"
          >
            <ChipStackIcon className="w-3.5 h-3.5" />
            <div className="flex items-center gap-1 text-[9.5px] font-black text-[#ffcc00] uppercase tracking-wide">
              <span>POT:</span>
              <span>{gameState.pot}</span>
            </div>
          </motion.div>
          {gameState.stage !== 'idle' && gameState.stage !== 'ended' && (
            <span className="text-[7.5px] font-black text-emerald-400 uppercase mt-0.5 tracking-widest bg-black/70 px-2 py-0.2 rounded border border-emerald-500/30">
              {gameState.stage === 'preflop'
                ? 'PRE-FLOP (DEAL)'
                : gameState.stage === 'flop'
                ? 'FLOP (3 CARDS)'
                : gameState.stage === 'turn'
                ? 'TURN (4TH CARD)'
                : 'RIVER (5TH CARD)'}
            </span>
          )}
        </div>

        {/* DYNAMIC OPPONENTS RENDERING */}
        {(() => {
          if (!humanPlayer) {
            return (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded text-[8px] text-amber-300 font-mono">
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                <span>Connecting table seats...</span>
              </div>
            );
          }
          const opponents = gameState.players.filter((p) => p.id !== humanPlayer.id);
          const renderOpponentView = (opp: typeof gameState.players[0], posClass: string, reverse = false) => {
            const isTurn = gameState.players[gameState.currentPlayerIndex]?.id === opp.id && gameState.stage !== 'ended';
            const isDealer = gameState.players[gameState.dealerIndex]?.id === opp.id;
            return (
              <div key={opp.id} className={`absolute ${posClass} flex flex-col items-center z-30`}>
                <div className={`flex items-center gap-1 ${reverse ? 'flex-row-reverse' : ''}`}>
                  <div className="flex -space-x-4 shrink-0 scale-[0.65] origin-bottom">
                    {(opp.holeCards || []).map((c, cIdx) => (
                      <PokerCardView
                        key={c?.id || cIdx}
                        card={c}
                        hidden={gameState.stage !== 'ended'}
                        isWinning={c && gameState.winningCardIds?.includes(c.id)}
                      />
                    ))}
                  </div>
                  <div
                    className={`relative p-0.5 bg-slate-950 border rounded flex flex-col items-center min-w-[38px] max-w-[42px] scale-[0.75] origin-top ${
                      isTurn ? 'border-[#00ff66] shadow-[0_0_10px_#00ff66]' : 'border-black'
                    } ${opp.folded || opp.eliminated ? 'opacity-40 grayscale' : ''}`}
                  >
                    {isDealer && (
                      <span className="absolute -top-1.5 -right-1.5 bg-[#ffcc00] text-black w-3 h-3 rounded-full text-[6px] font-black flex items-center justify-center border border-black shadow z-10">
                        D
                      </span>
                    )}
                    <Avatar
                      avatarId={opp.avatar || 'rabbit'}
                      emotion={opp.folded ? 'worried' : isTurn ? 'thinking' : 'happy'}
                      size="xs"
                    />
                    <span className="text-[6px] font-black text-white truncate max-w-[36px] leading-tight mt-0.5">
                      {opp.name || 'Player'}
                    </span>
                    <div className="flex items-center gap-0.5 text-[6px] font-bold text-[#ffcc00] leading-tight">
                      <ChipStackIcon className="w-2 h-2" />
                      <span>{opp.chips ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-0.5">
                  {(opp.currentBet || 0) > 0 && <ChipStack amount={opp.currentBet} />}
                  {opp.lastAction && (
                    <div className="px-1.5 py-0.2 bg-black border border-[#00ff66] text-[#00ff66] text-[7px] font-black rounded uppercase shadow-sm leading-none">
                      {opp.lastAction}
                    </div>
                  )}
                </div>
              </div>
            );
          };

          const POSITIONS = [
            'left-[-4px] top-[45%]',
            'left-[-4px] top-[18%]',
            'left-[4px] top-[0%]',
            'top-[-4px] left-[30%]',
            'top-[-6px] left-1/2 -translate-x-1/2',
            'top-[-4px] right-[30%]',
            'right-[4px] top-[0%]',
            'right-[-4px] top-[18%]',
            'right-[-4px] top-[45%]',
          ];

          return (
            <>
              {opponents.map((opp, idx) => {
                const pos = POSITIONS[idx % POSITIONS.length];
                const isReverse = pos.includes('right-');
                return renderOpponentView(opp, pos, isReverse);
              })}
            </>
          );
        })()}

        {/* CENTER TABLE: 3D CARD DECK + COMMUNITY CARDS + TIMER */}
        <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-20">
          
          <div className="flex items-center gap-2">
            {/* 3D VISUAL CARD DECK IN CENTER-LEFT OF FELT */}
            <div className="relative w-6 h-9 shrink-0 opacity-85 select-none pointer-events-none">
              <div className="absolute inset-0 bg-slate-950 border border-black rounded translate-x-0.5 translate-y-0.5 overflow-hidden shadow">
                <img src="/card-thumbs/back.jpeg" alt="Deck" className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-slate-950 border-2 border-black rounded overflow-hidden shadow-md">
                <img src="/card-thumbs/back.jpeg" alt="Deck" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* 5 COMMUNITY CARDS */}
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((slotIdx) => {
                const card = gameState.communityCards[slotIdx];
                return (
                  <div
                    key={slotIdx}
                    className="w-8 h-11 min-[380px]:w-9 min-[380px]:h-13 border-2 border-dashed border-emerald-700/80 rounded-md flex items-center justify-center bg-black/40 shrink-0 shadow-inner"
                  >
                    {card ? (
                      <PokerCardView
                        card={card}
                        isWinning={gameState.winningCardIds?.includes(card.id)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* PROMINENT BLINKING TURN TIMER OR WAITING BANNER DIRECTLY UNDER COMMUNITY CARDS */}
          {gameState.waitingForPlayers ? (
            <div className="bg-slate-950/95 border-2 border-amber-400 px-3 py-1.5 rounded-xl shadow-[0_0_15px_rgba(255,204,0,0.4)] flex items-center gap-2 animate-pulse select-none">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span className="text-[9px] font-black text-amber-300 uppercase tracking-wider">
                WAITING FOR PLAYERS TO CONNECT...
              </span>
            </div>
          ) : (
            gameState.stage !== 'idle' && gameState.stage !== 'ended' && (
              <motion.div
                animate={{
                  scale: turnTimeLeft <= 5 ? [1, 1.1, 1] : [1, 1.03, 1],
                  boxShadow: turnTimeLeft <= 5
                    ? ['0 0 10px #ff3333', '0 0 25px #ff3333', '0 0 10px #ff3333']
                    : isHumanTurn
                    ? ['0 0 10px #00ff66', '0 0 20px #00ff66', '0 0 10px #00ff66']
                    : ['0 0 6px #00d2ff', '0 0 14px #00d2ff', '0 0 6px #00d2ff'],
                }}
                transition={{ repeat: Infinity, duration: turnTimeLeft <= 5 ? 0.45 : 0.9 }}
                className={`px-3 py-1 rounded-full border-2 font-black text-[9px] min-[380px]:text-[9.5px] flex items-center gap-1.5 tracking-wider uppercase backdrop-blur-md select-none ${
                  turnTimeLeft <= 5
                    ? 'bg-red-950 border-red-500 text-red-300 animate-pulse'
                    : isHumanTurn
                    ? 'bg-black/95 border-[#00ff66] text-[#00ff66]'
                    : 'bg-black/95 border-[#00d2ff] text-[#00d2ff]'
                }`}
              >
                <Timer className={`w-3.5 h-3.5 ${turnTimeLeft <= 5 ? 'text-red-400 animate-spin' : ''}`} />
                <span>
                  {isHumanTurn
                    ? `YOUR TURN: ${turnTimeLeft}S`
                    : `${gameState.players[gameState.currentPlayerIndex]?.name || 'PLAYER'}: ${turnTimeLeft}S`}
                </span>
              </motion.div>
            )
          )}
        </div>

        {/* HUMAN PLAYER (BOTTOM CENTER) */}
        {humanPlayer && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex flex-col items-center z-30">
            {/* LIVE HAND RANK BADGE */}
            {humanHandEval && (
              <div className="mb-0.5 bg-black/95 border border-emerald-400 px-2 py-0.5 rounded text-[7.5px] font-black text-emerald-300 uppercase tracking-wider shadow flex items-center gap-1">
                <span>{humanHandEval.description}</span>
              </div>
            )}

            {/* Action / Chip Stack */}
            <div className="flex items-center gap-1 mb-0.5">
              {humanPlayer.currentBet > 0 && <ChipStack amount={humanPlayer.currentBet} />}
              {humanPlayer.lastAction && (
                <div className="px-1.5 py-0.2 bg-black border border-[#00ff66] text-[#00ff66] text-[7px] font-black rounded uppercase shadow-sm leading-none">
                  {humanPlayer.lastAction}
                </div>
              )}
            </div>

            {/* Hole Cards + Avatar Pill */}
            <div className="flex items-end gap-1.5">
              {/* Hole Cards (Prominent & Large) */}
              <div className="flex -space-x-3 shrink-0">
                {(humanPlayer.holeCards || []).map((c, cIdx) => (
                  <PokerCardView
                    key={c?.id || cIdx}
                    card={c}
                    isLarge
                    isWinning={c && gameState.winningCardIds?.includes(c.id)}
                  />
                ))}
              </div>

              {/* Avatar Pill */}
              <div
                className={`relative p-0.5 bg-slate-950 border rounded flex flex-col items-center min-w-[46px] max-w-[50px] ${
                  isHumanTurn ? 'border-[#00ff66] shadow-[0_0_12px_#00ff66]' : 'border-black'
                } ${humanPlayer.folded || humanPlayer.eliminated ? 'opacity-40 grayscale' : ''}`}
              >
                <AnimatePresence>
                  {activeEmoji && <EmojiDisplayBadge emoji={activeEmoji.emoji} key={activeEmoji.key} />}
                </AnimatePresence>
                {gameState.players[gameState.dealerIndex]?.id === humanPlayer.id && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#ffcc00] text-black w-3.5 h-3.5 rounded-full text-[7px] font-black flex items-center justify-center border border-black shadow z-10">
                    D
                  </span>
                )}
                <Avatar
                  avatarId={humanPlayer.avatar || 'rabbit'}
                  emotion={humanPlayer.folded ? 'worried' : isHumanTurn ? 'thinking' : 'happy'}
                  size="xs"
                />
                <span className="text-[7px] font-black text-white truncate max-w-[44px] leading-tight mt-0.5">
                  {humanPlayer.name || 'Player'}
                </span>
                <div className="flex items-center gap-0.5 text-[6.5px] font-bold text-[#ffcc00] leading-tight">
                  <ChipStackIcon className="w-2.5 h-2.5" />
                  <span>{humanPlayer.chips ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. SHOWDOWN / HAND ENDED / WINNER MODAL */}
      <AnimatePresence>
        {gameState.stage === 'ended' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-3 backdrop-blur-md overflow-y-auto"
          >
            <div className="bg-slate-950 border-2 border-[#00ff66] p-3.5 rounded-xl max-w-xs w-full text-center space-y-2.5 shadow-[0_0_35px_#00ff66] my-auto">
              
              {/* Winner Header */}
              <div className="space-y-1">
                <Trophy className="w-8 h-8 text-[#ffcc00] mx-auto animate-bounce" />
                <h2 className="text-xs font-black text-[#00ff66] uppercase tracking-wider">
                  {gameState.winnerIds.includes('player')
                    ? '🎉 YOU WON THE POT!'
                    : `🏆 WINNER: ${gameState.players.find((p) => gameState.winnerIds.includes(p.id))?.name || 'PLAYER'}`}
                </h2>
                <div className="bg-[#ffcc00]/20 border border-[#ffcc00] text-[#ffcc00] font-black text-[11px] py-1 px-3 rounded-full inline-flex items-center gap-1.5 shadow-sm">
                  <ChipStackIcon className="w-3.5 h-3.5" />
                  <span>POT WON: +{gameState.pot}</span>
                </div>
              </div>

              {/* Winning Combination Info */}
              {gameState.winningHandDesc && (
                <div className="bg-slate-900 border border-slate-700 p-2 rounded text-left space-y-1">
                  <div className="text-[7.5px] uppercase font-bold text-slate-400">Winning Hand:</div>
                  <div className="text-[9.5px] text-[#ffcc00] font-black leading-tight">
                    {gameState.winningHandDesc}
                  </div>
                </div>
              )}

              {/* Players Summary List */}
              <div className="bg-black/80 border border-black rounded p-1.5 space-y-1 text-left max-h-[120px] overflow-y-auto">
                <div className="text-[7px] font-bold text-slate-400 uppercase">Showdown Results:</div>
                {gameState.players.map((p) => {
                  const isWinner = gameState.winnerIds.includes(p.id);
                  const evalRes = p.holeCards.length === 2 ? evaluate7CardHand([...p.holeCards, ...gameState.communityCards]) : null;
                  return (
                    <div
                      key={p.id}
                      className={`flex justify-between items-center text-[8px] p-1 rounded ${
                        isWinner ? 'bg-[#00ff66]/20 border border-[#00ff66]/50 text-[#00ff66] font-black' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Avatar avatarId={p.avatar} size="xs" />
                        <span className="truncate max-w-[65px]">{p.name}</span>
                        {isWinner && <span className="text-[7px] text-[#ffcc00]">★</span>}
                      </div>
                      <div className="text-[7.5px] text-right flex items-center gap-1">
                        {p.folded ? (
                          <span className="text-slate-500">FOLDED</span>
                        ) : evalRes?.description ? (
                          <span>{evalRes.description}</span>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <ChipStackIcon className="w-2 h-2" />
                            <span>{p.chips}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons: Next Hand & Lobby */}
              <div className="space-y-1.5 pt-1">
                {!gameState.isMatchOver && (
                  <button
                    type="button"
                    onClick={onNextHand}
                    className="w-full py-2.5 bg-[#00ff66] text-black border-2 border-black font-black text-[10px] uppercase pixel-btn-interactive shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-black text-black" />
                    <span>NEXT HAND ({nextHandCountdown}S)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className={`w-full py-1.5 border border-black font-bold text-[8.5px] uppercase pixel-btn-interactive cursor-pointer ${
                    gameState.isMatchOver ? 'bg-[#00ff66] text-black font-black' : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  RETURN TO LOBBY
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. RAISE SELECTION DRAWER POPUP */}
      <AnimatePresence>
        {showRaisePanel && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-slate-950 border-2 border-[#ffcc00] p-3 rounded-lg z-30 space-y-2.5 font-mono shadow-[0_0_20px_rgba(255,204,0,0.35)]"
          >
            <div className="flex justify-between items-center text-[9px] font-black text-[#ffcc00]">
              <span>ADJUST RAISE AMOUNT</span>
              <div className="flex items-center gap-1 text-[10px] bg-black px-2 py-0.5 border border-[#ffcc00] rounded">
                <span>TOTAL:</span>
                <ChipStackIcon className="w-3 h-3" />
                <strong>{customRaiseAmount}</strong>
              </div>
            </div>

            {/* Quick Multiplier Presets */}
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: '+2 MIN', amt: gameState.currentBet + gameState.bigBlindAmount },
                { label: '+5', amt: gameState.currentBet + 5 },
                { label: '+10', amt: gameState.currentBet + 10 },
                { label: 'POT', amt: Math.max(gameState.currentBet + gameState.bigBlindAmount, gameState.pot) },
                { label: 'ALL-IN', amt: humanPlayer.chips + humanPlayer.currentBet },
              ].map((preset, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => {
                    sound.playPop();
                    setCustomRaiseAmount(Math.min(humanPlayer.chips + humanPlayer.currentBet, preset.amt));
                  }}
                  className="py-1.5 bg-black border border-amber-400/60 hover:border-amber-400 text-[8px] font-black text-slate-100 uppercase rounded cursor-pointer active:scale-95 transition-transform"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Stepper with - / Slider / + */}
            <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded border border-black">
              <button
                type="button"
                onClick={() => {
                  sound.playPop();
                  setCustomRaiseAmount((prev) =>
                    Math.max(gameState.currentBet + gameState.bigBlindAmount, prev - 1)
                  );
                }}
                className="w-7 h-7 bg-black border border-amber-400/50 text-white rounded flex items-center justify-center font-black active:scale-90"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min={gameState.currentBet + gameState.bigBlindAmount}
                max={humanPlayer.chips + humanPlayer.currentBet}
                step={1}
                value={customRaiseAmount}
                onChange={(e) => setCustomRaiseAmount(Number(e.target.value))}
                className="w-full accent-[#ffcc00] cursor-pointer"
              />

              <button
                type="button"
                onClick={() => {
                  sound.playPop();
                  setCustomRaiseAmount((prev) =>
                    Math.min(humanPlayer.chips + humanPlayer.currentBet, prev + 1)
                  );
                }}
                className="w-7 h-7 bg-black border border-amber-400/50 text-white rounded flex items-center justify-center font-black active:scale-90"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setShowRaisePanel(false)}
                className="w-1/3 py-2.5 bg-slate-900 border border-black text-slate-300 text-[9px] font-bold uppercase rounded cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRaisePanel(false);
                  onRaise(customRaiseAmount);
                }}
                className="w-2/3 py-2.5 bg-[#ffcc00] text-black border-2 border-black font-black text-[10px] uppercase rounded pixel-btn-interactive shadow cursor-pointer flex items-center justify-center gap-1"
              >
                <span>CONFIRM RAISE</span>
                <div className="flex items-center gap-0.5 bg-black/20 px-1.5 py-0.2 rounded text-[9px]">
                  <ChipStackIcon className="w-2.5 h-2.5" />
                  <span>{customRaiseAmount}</span>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. PLAYER TURN ACTION CONTROLS */}
      {gameState.stage !== 'idle' && gameState.stage !== 'ended' && gameState.stage !== 'match_ended' && !gameState.isMatchOver && !showRaisePanel && (
        <div className="bg-slate-950 border border-black p-2 rounded-lg z-20 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[8.5px] font-bold">
            <span className={isHumanTurn ? 'text-[#00ff66] font-black' : 'text-slate-400'}>
              {isHumanTurn ? 'YOUR TURN · CHOOSE ACTION' : 'WAITING FOR OPPONENTS…'}
            </span>
            {callNeeded > 0 && (
              <div className="flex items-center gap-1 text-[#ffcc00]">
                <span>CALL:</span>
                <ChipStackIcon className="w-2.5 h-2.5" />
                <strong>{callNeeded}</strong>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {/* FOLD */}
            <button
              type="button"
              disabled={!canCallOrCheck}
              onClick={onFold}
              className="py-2.5 bg-red-950 border border-red-500/40 text-red-300 font-black text-[9px] uppercase rounded pixel-btn-interactive disabled:opacity-40 disabled:pointer-events-none min-h-[44px] cursor-pointer"
            >
              FOLD
            </button>

            {/* CHECK / CALL */}
            <button
              type="button"
              disabled={!canCallOrCheck}
              onClick={onCallOrCheck}
              className="py-2.5 bg-[#00ff66]/20 border border-[#00ff66] text-[#00ff66] font-black text-[9px] uppercase rounded pixel-btn-interactive disabled:opacity-40 disabled:pointer-events-none min-h-[44px] flex items-center justify-center gap-1 cursor-pointer"
            >
              {callNeeded === 0 ? (
                <span>CHECK</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span>CALL</span>
                  <ChipStackIcon className="w-2.5 h-2.5" />
                  <span>{callNeeded}</span>
                </div>
              )}
            </button>

            {/* RAISE BUTTON */}
            <button
              type="button"
              disabled={!canCallOrCheck || humanPlayer.chips <= callNeeded}
              onClick={() => {
                sound.playPop();
                setCustomRaiseAmount(gameState.currentBet + gameState.bigBlindAmount);
                setShowRaisePanel(true);
              }}
              className="py-2.5 bg-[#ffcc00]/20 border border-[#ffcc00] text-[#ffcc00] font-black text-[9px] uppercase rounded pixel-btn-interactive disabled:opacity-40 disabled:pointer-events-none min-h-[44px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>RAISE</span>
              <ArrowUpRight className="w-3 h-3 text-[#ffcc00]" />
            </button>
          </div>
        </div>
      )}

      {/* 6. MATCH CHAMPION / ROUND END CONTROLS */}
      {(gameState.stage === 'match_ended' || gameState.isMatchOver) && (
        <div className="bg-slate-950/95 border-2 border-[#ffcc00] p-3 rounded-lg z-20 flex flex-col gap-2 shadow-2xl">
          <div className="text-center">
            <span className="text-[10px] font-black text-[#ffcc00] uppercase tracking-wider block">
              🏆 {gameState.matchWinnerName ? `${gameState.matchWinnerName.toUpperCase()} WON THE MATCH!` : 'POKER MATCH CONCLUDED'}
            </span>
            {gameState.winningHandDesc && (
              <span className="text-[8px] text-slate-300 font-mono block mt-0.5">
                {gameState.winningHandDesc}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onReturnToLobby}
            className="w-full py-2.5 bg-[#00ff66] text-black border-2 border-black font-black text-[10px] uppercase rounded pixel-btn-interactive shadow cursor-pointer active:translate-y-0.5"
          >
            RETURN TO LOBBY ➔
          </button>
        </div>
      )}

      {gameState.stage === 'ended' && !gameState.isMatchOver && (
        <div className="bg-slate-950/90 border border-emerald-500/50 p-2 rounded-lg z-20 flex flex-col gap-1.5 shadow">
          <div className="text-center text-[8.5px] font-bold text-emerald-300">
            <span>{gameState.winningHandDesc || 'Round completed! Dealing next hand...'}</span>
          </div>
          {gameState.mode === 'offline' && onNextHand && (
            <button
              type="button"
              onClick={onNextHand}
              className="w-full py-2 bg-[#ffcc00] text-black border border-black font-black text-[9px] uppercase rounded pixel-btn-interactive cursor-pointer"
            >
              NEXT HAND ➔
            </button>
          )}
        </div>
      )}
      <QuickEmojiPanel onSendEmoji={handleSendEmoji} className="absolute bottom-2 left-2 z-40" />
    </div>
  );
}
