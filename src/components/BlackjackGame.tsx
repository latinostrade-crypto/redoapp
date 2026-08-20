/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  RotateCcw,
  Volume2,
  VolumeX,
  Coins,
  Timer,
  Plus,
  Hand,
  Play,
  Loader2,
  Skull,
  Minus,
  Sparkles,
} from 'lucide-react';
import {
  BlackjackCard,
  BlackjackGameState,
} from '../types/blackjack';
import { Avatar } from './Avatars';
import { sound } from '../utils/sound';
import { QuickEmojiPanel, EmojiDisplayBadge, EmojiItem } from './QuickEmojiPanel';

interface BlackjackGameProps {
  gameState: BlackjackGameState;
  turnTimeLeft: number;
  selectedBet?: number;
  onPlaceBet?: (amount: number) => void;
  onHit: () => void;
  onStand: () => void;
  onDoubleDown: () => void;
  onNextHand: () => void;
  onReturnToLobby: () => void;
}

function ChipStackIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="6" rx="8" ry="3" fill="#ffcc00" stroke="#000" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" fill="#e6b800" stroke="#000" />
      <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" fill="#cca300" stroke="#000" />
    </svg>
  );
}

function ChipStack({ amount, label }: { amount: number; label?: string }) {
  return (
    <div className="flex items-center gap-1 bg-black/80 px-2 py-0.5 rounded border border-[#ffcc00]/60 shadow-[0_0_8px_rgba(255,204,0,0.3)]">
      <ChipStackIcon className="w-3.5 h-3.5 text-[#ffcc00]" />
      <span className="text-[8.5px] font-black text-[#ffcc00] uppercase tracking-wider">
        {amount} {label || 'CHIPS'}
      </span>
    </div>
  );
}

function BlackjackCardView({
  card,
  hidden,
  isDealerHoleCard,
}: {
  card: BlackjackCard;
  hidden?: boolean;
  isDealerHoleCard?: boolean;
  key?: string | number;
}) {
  if (hidden || card.hidden) {
    return (
      <div className="w-9 h-13 min-[380px]:w-10 min-[380px]:h-14 bg-[#e63946] border-2 border-black rounded-md shadow-md flex items-center justify-center relative overflow-hidden select-none shrink-0">
        <img
          src="/card-thumbs/back.jpeg"
          alt="Card Back"
          className="w-full h-full object-cover select-none pointer-events-none rounded-[3px]"
          style={{ imageRendering: 'pixelated' }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (!img.src.includes('./card-thumbs')) {
              img.src = './card-thumbs/back.jpeg';
            }
          }}
        />
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol =
    card.suit === 'spades' ? '♠' : card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : '♣';
  const rankDisplay =
    card.rank === 14 ? 'A' : card.rank === 13 ? 'K' : card.rank === 12 ? 'Q' : card.rank === 11 ? 'J' : card.rank;

  return (
    <motion.div
      initial={isDealerHoleCard ? { rotateY: 180, scale: 0.9 } : { scale: 0.8, y: -12, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`w-9 h-13 min-[380px]:w-10 min-[380px]:h-14 bg-white border-2 border-black rounded-md shadow-md flex flex-col justify-between p-0.5 select-none relative ${
        isRed ? 'text-red-600' : 'text-slate-950'
      }`}
    >
      <div className="text-[8px] font-black leading-none">{rankDisplay}</div>
      <div className="text-sm font-black leading-none text-center">{suitSymbol}</div>
      <div className="text-[8px] font-black leading-none text-right rotate-180">{rankDisplay}</div>
    </motion.div>
  );
}

export function BlackjackGame({
  gameState,
  turnTimeLeft,
  selectedBet = 10,
  onPlaceBet,
  onHit,
  onStand,
  onDoubleDown,
  onNextHand,
  onReturnToLobby,
}: BlackjackGameProps) {
  const [muted, setMuted] = useState(sound.getMuted());
  const [nextHandCountdown, setNextHandCountdown] = useState(6);
  const [currentBetAmount, setCurrentBetAmount] = useState<number>(selectedBet);
  const [showFlyingChips, setShowFlyingChips] = useState(false);

  const toggleMute = () => {
    sound.toggleMute();
    setMuted(sound.getMuted());
  };

  const humanPlayer = gameState.players.find((p) => p.id === 'player') || gameState.players[0];
  const maxAvailableBet = humanPlayer?.chips ? humanPlayer.chips + (humanPlayer.bet || 0) : 100;

  const [activeEmoji, setActiveEmoji] = useState<{ emoji: EmojiItem | string; key: number } | null>(null);

  const handleSendEmoji = (emoji: EmojiItem) => {
    setActiveEmoji({ emoji, key: Date.now() });
    setTimeout(() => setActiveEmoji(null), 3500);
  };

  const handleBetChange = (newAmount: number) => {
    const clamped = Math.max(5, Math.min(maxAvailableBet, newAmount));
    setCurrentBetAmount(clamped);
    onPlaceBet?.(clamped);
  };

  // Trigger flying chips animation when round ends with winners
  useEffect(() => {
    if (gameState.stage === 'round_ended' || gameState.stage === 'match_ended') {
      setShowFlyingChips(true);
      const timer = setTimeout(() => setShowFlyingChips(false), 2400);
      return () => clearTimeout(timer);
    }
    setShowFlyingChips(false);
  }, [gameState.stage]);

  // Next Hand Auto-Countdown Timer when round ends
  useEffect(() => {
    if (gameState.stage !== 'round_ended') {
      setNextHandCountdown(6);
      return;
    }

    const timer = setInterval(() => {
      setNextHandCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (gameState.mode === 'offline') {
            onNextHand();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, gameState.nextRoundStartsAt, gameState.mode, onNextHand]);

  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const isHumanActiveTurn = gameState.stage === 'player_turn' && !gameState.isDealing && activePlayer?.id === 'player';
  const canPlay = isHumanActiveTurn && !activePlayer?.eliminated;
  const canDouble = canPlay && activePlayer && activePlayer.cards.length === 2 && activePlayer.chips >= activePlayer.bet;

  // Calculate chip leader
  const sortedByChips = [...gameState.players].sort((a, b) => (b.chips - a.chips) || (b.wins - a.wins));
  const chipLeader = sortedByChips[0];

  return (
    <div className="w-full max-w-md mx-auto flex flex-col justify-start gap-1 bg-[#080d0a] border-4 border-black p-2 relative overflow-hidden select-none font-mono text-white shadow-[0_0_25px_rgba(0,0,0,0.95)] rounded-xl min-h-[560px]">
      
      {/* 1. TOP HEADER CONTROL BAR */}
      <header className="flex justify-between items-center bg-slate-950 border border-black px-2 py-1 z-20 rounded">
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
            HAND {gameState.currentHand || 1}/{gameState.maxHands || 5}
          </span>
          <span className="text-[7.5px] font-black text-[#ffcc00] uppercase bg-black px-1.5 py-0.5 border border-black">
            PRIZE: {gameState.stake === 0 ? 'XP' : `${(gameState.stake * Math.max(2, gameState.players.length) * 0.96).toFixed(2)} TKT`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-black text-[#00d2ff] bg-black px-1.5 py-0.5 border border-black">
            BANKROLL: {humanPlayer?.chips ?? 100} 💰
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

      {/* 2. CASINO FELT TABLE WITH MULTI-SEAT PLAYERS */}
      <div className="w-full h-[410px] min-[380px]:h-[440px] bg-gradient-to-b from-[#0a3822] to-[#041a0f] border-4 border-[#1c130c] rounded-[40px] relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.9)] flex flex-col items-center justify-between p-2 z-10 shrink-0">
        
        {/* Felt Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none rounded-[35px] bg-[radial-gradient(#00ff66_1px,transparent_1px)] [background-size:10px_10px]" />

        {/* TOP: DEALER AREA */}
        <div className="w-full flex flex-col items-center z-30 pt-1">
          <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-black/80">
            {/* Dealer Avatar */}
            <div className="relative p-1 bg-slate-950 border border-black rounded flex flex-col items-center min-w-[44px] shadow-md">
              <Avatar id={gameState.dealer.avatar} emotion={gameState.dealer.isBusted ? 'worried' : 'happy'} size={24} />
              <span className="text-[7px] font-black text-white truncate max-w-[42px] leading-tight mt-0.5">
                DEALER
              </span>
              <span className="text-[7px] font-black text-[#00d2ff] leading-tight">
                {gameState.stage === 'player_turn' ? 'SCORE: ?' : `SCORE: ${gameState.dealer.score}`}
              </span>
            </div>

            {/* Dealer Cards (With animated Hole Card flip on dealer turn) */}
            <div className="flex -space-x-2 shrink-0">
              {gameState.dealer.cards.map((c, idx) => (
                <BlackjackCardView
                  key={c.id || idx}
                  card={c}
                  hidden={c.hidden === true || (idx === 1 && gameState.stage === 'player_turn')}
                  isDealerHoleCard={idx === 1 && gameState.stage !== 'player_turn'}
                />
              ))}
            </div>

            {/* Visual Casino Deck Shoe */}
            <div className="relative w-6 h-9 min-[380px]:w-7 min-[380px]:h-11 bg-slate-950 border border-black rounded shadow-md overflow-hidden shrink-0 ml-1">
              <div className="absolute inset-0 bg-slate-900 translate-x-0.5 translate-y-0.5 rounded" />
              <img src="/card-thumbs/back.jpeg" alt="Deck" className="w-full h-full object-cover relative z-10 rounded-[2px]" />
            </div>
          </div>
        </div>

        {/* TABLE CENTER: POT & TURN STATUS / WAITING BANNER */}
        <div className="flex flex-col items-center gap-1 z-20 pointer-events-none my-auto relative">
          {gameState.waitingForPlayers ? (
            <div className="bg-slate-950/95 border-2 border-amber-400 px-3 py-1.5 rounded-xl shadow-[0_0_15px_rgba(255,204,0,0.4)] flex items-center gap-2 animate-pulse">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span className="text-[9px] font-black text-amber-300 uppercase tracking-wider">
                WAITING FOR PLAYERS TO CONNECT...
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <ChipStack amount={gameState.pot} label="ROUND POT" />
                {chipLeader && (
                  <span className="bg-black/90 border border-amber-400/80 px-2 py-0.5 rounded text-[8px] font-black text-amber-300">
                    👑 LEADER: {chipLeader.name} ({chipLeader.chips} 💰)
                  </span>
                )}
              </div>

              {/* FLYING CHIPS ANIMATION WHEN ROUND ENDS */}
              {showFlyingChips && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                      animate={{
                        scale: [0.5, 1.2, 0.8],
                        x: (i % 2 === 0 ? 1 : -1) * (30 + i * 18),
                        y: 40 + i * 12,
                        opacity: [1, 1, 0],
                      }}
                      transition={{ duration: 1.2, delay: i * 0.12, ease: 'easeOut' }}
                      className="absolute"
                    >
                      <ChipStackIcon className="w-5 h-5 text-[#ffcc00] drop-shadow-[0_0_8px_#ffcc00]" />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* TURN TIMER BADGE */}
              {gameState.stage === 'player_turn' && !gameState.isDealing && activePlayer && (
                <motion.div
                  animate={{
                    scale: turnTimeLeft <= 5 ? [1, 1.08, 1] : [1, 1.02, 1],
                    boxShadow: turnTimeLeft <= 5
                      ? ['0 0 8px #ff3333', '0 0 16px #ff3333', '0 0 8px #ff3333']
                      : ['0 0 8px #00ff66', '0 0 16px #00ff66', '0 0 8px #00ff66'],
                  }}
                  transition={{ repeat: Infinity, duration: turnTimeLeft <= 5 ? 0.45 : 0.9 }}
                  className={`px-3 py-0.5 rounded-full border font-black text-[9px] flex items-center gap-1 uppercase backdrop-blur-md ${
                    turnTimeLeft <= 5 ? 'bg-red-950 border-red-500 text-red-300' : 'bg-black/95 border-[#00ff66] text-[#00ff66]'
                  }`}
                >
                  <Timer className={`w-3 h-3 ${turnTimeLeft <= 5 ? 'text-red-400 animate-spin' : ''}`} />
                  <span>{activePlayer?.id === 'player' ? 'YOUR TURN' : `${(activePlayer?.name || 'PLAYER').toUpperCase()}'S TURN`}: {turnTimeLeft}S</span>
                </motion.div>
              )}

              {gameState.stage === 'dealer_turn' && (
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="px-3 py-0.5 rounded-full border border-blue-400 bg-blue-950/90 font-black text-[9px] text-blue-300 flex items-center gap-1 uppercase backdrop-blur-md shadow-[0_0_12px_rgba(0,180,255,0.4)]"
                >
                  <Sparkles className="w-3 h-3 animate-spin" />
                  <span>DEALER IS DRAWING CARDS...</span>
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* BOTTOM / SEATS: MULTIPLE SEATED PLAYERS (UP TO 4) */}
        <div className="w-full flex items-end justify-around gap-1 z-30 pb-1">
          {gameState.players.length === 0 ? (
            <div className="w-full py-4 text-center text-[9px] font-black text-amber-300 animate-pulse">
              CONNECTING SEATS TO CASINO TABLE...
            </div>
          ) : (
            gameState.players.map((p, idx) => {
              const isTurn = gameState.stage === 'player_turn' && gameState.currentPlayerIndex === idx;
              const isMe = p.id === 'player';
              const isEliminated = p.eliminated || (typeof p.chips === 'number' && p.chips <= 0);
              const playerCards = Array.isArray(p.cards) ? p.cards : [];
              return (
                <div
                  key={p.id || idx}
                  className={`relative flex flex-col items-center p-1 rounded-lg transition-all ${
                    isEliminated
                      ? 'bg-black/40 border border-slate-800 opacity-60'
                      : isTurn
                      ? 'bg-black/90 border-2 border-[#00ff66] shadow-[0_0_15px_#00ff66]'
                      : isMe
                      ? 'bg-black/70 border border-[#ffcc00]/60'
                      : 'bg-black/60 border border-slate-700'
                  }`}
                  style={{ maxWidth: `${100 / Math.max(1, gameState.players.length)}%` }}
                >
                  {/* CHIPS BADGE */}
                  <div className="absolute -top-3 bg-amber-400 text-black px-1.5 py-0.2 rounded text-[7px] font-black uppercase shadow tracking-tight">
                    💰 {p.chips ?? 0} CHIPS
                  </div>

                  {/* Floating Profit Notification on Round End */}
                  <AnimatePresence>
                    {p.id === 'player' && activeEmoji && <EmojiDisplayBadge emoji={activeEmoji.emoji} key={activeEmoji.key} />}
                  </AnimatePresence>
                  {typeof p.lastProfit === 'number' && (gameState.stage === 'round_ended' || gameState.stage === 'match_ended') && (
                    <motion.div
                      initial={{ opacity: 0, y: 0, scale: 0.8 }}
                      animate={{ opacity: 1, y: -16, scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className={`absolute -top-7 px-1.5 py-0.5 rounded text-[8px] font-black shadow-lg border z-40 ${
                        p.lastProfit > 0
                          ? 'bg-emerald-950 border-emerald-400 text-emerald-300 shadow-[0_0_10px_#00ff66]'
                          : p.lastProfit < 0
                          ? 'bg-rose-950 border-rose-500 text-rose-300'
                          : 'bg-slate-900 border-slate-500 text-slate-300'
                      }`}
                    >
                      {p.lastProfit > 0 ? `+${p.lastProfit} 💰` : p.lastProfit < 0 ? `${p.lastProfit} 💸` : 'PUSH 🤝'}
                    </motion.div>
                  )}

                  {/* Cards */}
                  <div className="flex -space-x-3 mb-1 shrink-0 min-h-[50px] items-center justify-center">
                    {isEliminated ? (
                      <div className="text-[8px] font-black text-red-400 flex items-center gap-0.5 bg-black/80 px-1.5 py-1 rounded border border-red-900">
                        <Skull className="w-3 h-3" />
                        <span>BUSTED OUT</span>
                      </div>
                    ) : (
                      playerCards.map((c, cIdx) => (
                        <BlackjackCardView key={c.id || cIdx} card={c} />
                      ))
                    )}
                  </div>

                  {/* Avatar + Info */}
                  <div className="flex flex-col items-center">
                    <Avatar id={p.avatar || 'rabbit'} emotion={isEliminated ? 'worried' : p.isBusted ? 'worried' : p.hasBlackjack ? 'happy' : isTurn ? 'thinking' : 'happy'} size={24} />
                    <span className="text-[7px] font-black text-white truncate max-w-[48px] leading-tight mt-0.5">
                      {p.name || 'Player'} {isMe ? '(YOU)' : ''}
                    </span>
                    <div className="text-[7px] font-black leading-tight">
                      {isEliminated ? (
                        <span className="text-slate-500">OUT</span>
                      ) : p.isBusted ? (
                        <span className="text-red-400 bg-red-950/80 px-1 py-0.2 rounded border border-red-500/40">
                          💥 BUST ({p.score ?? 0})
                        </span>
                      ) : p.hasBlackjack ? (
                        <span className="text-[#ffcc00] bg-amber-950/80 px-1 py-0.2 rounded border border-amber-400/60 shadow-[0_0_8px_rgba(255,204,0,0.5)] animate-pulse">
                          🔥 21 (+15)
                        </span>
                      ) : (
                        <span className="text-[#00ff66]">SCORE: {p.score ?? 0} (BET: {p.bet ?? 0})</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. COMPACT & SEMI-TRANSPARENT ROUND ENDED / MATCH STANDINGS MODAL */}
      <AnimatePresence>
        {(gameState.stage === 'round_ended' || gameState.stage === 'match_ended') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-12 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[290px] pointer-events-auto"
          >
            <div className="bg-slate-950/85 backdrop-blur-md border-2 border-[#00ff66]/70 p-2.5 rounded-xl text-center space-y-2 shadow-[0_0_25px_rgba(0,255,102,0.4)]">
              <div className="flex items-center justify-center gap-1 text-[#ffcc00]">
                <Trophy className="w-4 h-4 text-[#ffcc00] animate-bounce" />
                <h2 className="text-[10px] font-black uppercase tracking-wider text-[#00ff66]">
                  {gameState.stage === 'match_ended'
                    ? `🏆 ${gameState.matchChampion?.name?.toUpperCase() || gameState.winner?.toUpperCase() || 'PLAYER'} WINS!`
                    : `HAND ${gameState.currentHand || 1}/${gameState.maxHands || 5} RESULTS`}
                </h2>
              </div>

              {gameState.winningHandDesc && (
                <p className="text-[8px] text-slate-200 font-bold bg-black/70 border border-slate-800 p-1.5 rounded leading-relaxed">
                  {gameState.winningHandDesc}
                </p>
              )}

              {/* Standings Table sorted by Chips */}
              <div className="space-y-0.5 bg-black/60 border border-slate-800 p-1.5 rounded text-[7.5px] font-bold max-h-[90px] overflow-y-auto">
                <div className="text-slate-400 text-[6.5px] uppercase tracking-wider flex justify-between border-b border-slate-800 pb-0.5">
                  <span>PLAYER</span>
                  <span>CHIPS</span>
                </div>
                {sortedByChips.map((p, rankIdx) => (
                  <div key={p.id} className="flex justify-between items-center py-0.5">
                    <span className="text-white truncate max-w-[110px]">
                      {rankIdx === 0 ? '🥇 ' : rankIdx === 1 ? '🥈 ' : rankIdx === 2 ? '🥉 ' : '4. '}
                      {p.name} {p.id === 'player' ? '(You)' : ''}
                    </span>
                    <span className={p.chips > 0 ? "text-[#ffcc00] font-black" : "text-red-400 font-black"}>
                      {p.chips > 0 ? `💰 ${p.chips}` : '💀 OUT'}
                    </span>
                  </div>
                ))}
              </div>

              {gameState.stage === 'match_ended' && gameState.winningPayout && gameState.winningPayout > 0 && (
                <div className="bg-amber-950/70 border border-amber-500/50 p-1 rounded text-[8px] font-black text-[#ffcc00] flex items-center justify-center gap-1">
                  <Coins className="w-3 h-3" />
                  <span>CHAMPION PRIZE: +{gameState.winningPayout} TKT</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-1 pt-0.5">
                {gameState.stage === 'round_ended' && (
                  <button
                    type="button"
                    onClick={onNextHand}
                    className="w-full py-1.5 bg-[#00ff66] text-black border border-black font-black text-[9px] uppercase pixel-btn-interactive shadow flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-black text-black" />
                    <span>NEXT HAND ({nextHandCountdown}S)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="w-full py-1 bg-red-950/80 text-red-200 border border-red-500/60 font-bold text-[8px] uppercase pixel-btn-interactive cursor-pointer"
                >
                  RETURN TO LOBBY
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. BET ADJUSTMENT & PLAYER ACTION CONTROLS */}
      {gameState.stage === 'player_turn' && !gameState.isDealing && (
        <div className="bg-slate-950 border border-black p-2 rounded-lg z-20 flex flex-col gap-1.5 shadow-lg">
          <div className="flex justify-between items-center text-[8.5px] font-bold text-[#00ff66]">
            <span>{canPlay ? '👉 YOUR TURN - CHOOSE ACTION:' : `⏳ WAITING FOR ${activePlayer?.name?.toUpperCase()}...`}</span>
            {humanPlayer && (
              <div className="flex items-center gap-1 text-white">
                <span>CHIPS:</span>
                <strong className="text-[#ffcc00] text-[9.5px]">💰 {humanPlayer.chips}</strong>
                <span className="ml-1">SCORE:</span>
                <strong className="text-[#00d2ff] text-[9.5px]">{humanPlayer.score}</strong>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {/* HIT (+1 CARD) */}
            <button
              type="button"
              disabled={!canPlay}
              onClick={onHit}
              className="py-2 px-1 bg-[#00ff66]/20 border border-[#00ff66] hover:bg-[#00ff66]/30 text-[#00ff66] font-black rounded pixel-btn-interactive disabled:opacity-30 disabled:pointer-events-none min-h-[44px] flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-1 text-[9.5px]">
                <Plus className="w-3 h-3" />
                <span>HIT</span>
              </div>
              <span className="text-[6.5px] text-emerald-300/80 font-normal mt-0.5">+1 card</span>
            </button>

            {/* STAND (STOP) */}
            <button
              type="button"
              disabled={!canPlay}
              onClick={onStand}
              className="py-2 px-1 bg-red-950 border border-red-500/50 hover:bg-red-900/50 text-red-300 font-black rounded pixel-btn-interactive disabled:opacity-30 disabled:pointer-events-none min-h-[44px] flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-1 text-[9.5px]">
                <Hand className="w-3 h-3" />
                <span>STAND</span>
              </div>
              <span className="text-[6.5px] text-red-300/80 font-normal mt-0.5">hold score</span>
            </button>

            {/* DOUBLE DOWN (2X BET) */}
            <button
              type="button"
              disabled={!canDouble}
              onClick={onDoubleDown}
              className="py-2 px-1 bg-[#ffcc00]/20 border border-[#ffcc00] hover:bg-[#ffcc00]/30 text-[#ffcc00] font-black rounded pixel-btn-interactive disabled:opacity-30 disabled:pointer-events-none min-h-[44px] flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-1 text-[9.5px]">
                <Coins className="w-3 h-3" />
                <span>DOUBLE</span>
              </div>
              <span className="text-[6.5px] text-amber-300/80 font-normal mt-0.5">2x bet</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. INTERACTIVE BET ADJUSTER (Available when round is ended / setting up next hand) */}
      {(gameState.stage === 'round_ended' || gameState.stage === 'idle') && humanPlayer && !humanPlayer.eliminated && (
        <div className="bg-slate-950/90 border border-[#ffcc00]/50 p-2 rounded-lg z-20 flex flex-col gap-1 shadow-md">
          <div className="flex justify-between items-center text-[8px] font-black text-amber-300">
            <span>⚙️ ADJUST BET FOR NEXT HAND:</span>
            <span className="text-[#ffcc00]">CURRENT BET: {currentBetAmount} 💰</span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => handleBetChange(currentBetAmount - 5)}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-[8px] font-black rounded cursor-pointer"
            >
              <Minus className="w-2.5 h-2.5 inline mr-0.5" />5
            </button>

            <div className="flex items-center gap-1">
              {[5, 10, 25, 50].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleBetChange(preset)}
                  className={`px-2 py-1 border text-[8px] font-black rounded cursor-pointer ${
                    currentBetAmount === preset
                      ? 'bg-[#ffcc00] text-black border-black font-black'
                      : 'bg-black text-slate-300 border-slate-800'
                  }`}
                >
                  {preset}
                </button>
              ))}

              <button
                type="button"
                onClick={() => handleBetChange(maxAvailableBet)}
                className="px-2 py-1 bg-amber-950 border border-amber-500 text-amber-300 text-[8px] font-black rounded cursor-pointer hover:bg-amber-900"
              >
                MAX
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleBetChange(currentBetAmount + 5)}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white text-[8px] font-black rounded cursor-pointer"
            >
              <Plus className="w-2.5 h-2.5 inline mr-0.5" />5
            </button>
          </div>
        </div>
      )}
      <QuickEmojiPanel onSendEmoji={handleSendEmoji} className="absolute bottom-2 left-2 z-40" />
    </div>
  );
}
