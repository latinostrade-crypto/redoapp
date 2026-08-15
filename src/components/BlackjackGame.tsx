/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BlackjackCard, BlackjackGameState } from '../types/blackjack';
import { sound } from '../utils/sound';
import { RotateCcw, Volume2, VolumeX, Trophy, Coins, Play, Timer, Sparkles, Hand, Plus } from 'lucide-react';
import { Avatar } from './Avatars';
import { ChipStackIcon } from './PokerGame';

interface BlackjackGameProps {
  gameState: BlackjackGameState;
  turnTimeLeft?: number;
  onHit: () => void;
  onStand: () => void;
  onDoubleDown: () => void;
  onNextHand: () => void;
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

function ChipStack({ amount, label }: { amount: number; label?: string }) {
  if (amount <= 0) return null;

  return (
    <motion.div
      initial={{ scale: 0, y: 10 }}
      animate={{ scale: 1, y: 0 }}
      className="flex items-center gap-1 bg-black/90 border border-amber-400/80 px-2 py-0.5 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none shrink-0"
    >
      <ChipStackIcon className="w-3.5 h-3.5" />
      <span className="text-[8px] font-black text-[#ffcc00] leading-none">
        {label ? `${label} ${amount}` : amount}
      </span>
    </motion.div>
  );
}

function BlackjackCardView({
  card,
  hidden = false,
}: {
  card?: BlackjackCard;
  hidden?: boolean;
  key?: React.Key;
}) {
  const cardSizeClass = 'w-10 h-14 min-[380px]:w-12 min-[380px]:h-16';

  if (hidden || !card) {
    return (
      <motion.div
        initial={{ scale: 0.3, x: 50, y: -40, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, x: 0, y: 0, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className={`${cardSizeClass} border-2 border-black rounded-lg shadow-lg overflow-hidden bg-slate-950 select-none shrink-0 relative`}
      >
        <img
          src="/card-thumbs/back.jpeg"
          alt="Card Back"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20" />
      </motion.div>
    );
  }

  const suitInfo = SUIT_SYMBOLS[card.suit] || { symbol: '?', color: 'text-black' };
  const rankLabel = RANK_LABELS[card.rank] || String(card.rank);

  return (
    <motion.div
      initial={{ scale: 0.3, x: 50, y: -40, rotate: 20, opacity: 0 }}
      animate={{ scale: 1, x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={`${cardSizeClass} bg-slate-100 border-2 border-black rounded-lg p-1 flex flex-col justify-between select-none shadow-[2px_2px_0_#000] shrink-0 relative overflow-hidden`}
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

export function BlackjackGame({
  gameState,
  turnTimeLeft = 15,
  onHit,
  onStand,
  onDoubleDown,
  onNextHand,
  onReturnToLobby,
}: BlackjackGameProps) {
  const [muted, setMuted] = useState(() => sound.getMuted());
  const [nextHandCountdown, setNextHandCountdown] = useState(5);

  const toggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
    sound.playPop();
  };

  // Auto-next hand timer during round_ended
  useEffect(() => {
    if (gameState.stage !== 'round_ended') {
      setNextHandCountdown(5);
      return;
    }

    const timer = setInterval(() => {
      setNextHandCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onNextHand();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, onNextHand]);

  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const isHumanActiveTurn = gameState.stage === 'player_turn' && !gameState.isDealing && activePlayer?.id === 'player';
  const canPlay = isHumanActiveTurn;
  const humanPlayer = gameState.players.find((p) => p.id === 'player') || gameState.players[0];
  const canDouble = canPlay && activePlayer && activePlayer.cards.length === 2 && activePlayer.chips >= activePlayer.bet;

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
            BLACKJACK 21 ({gameState.mode.toUpperCase()})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black text-[#ffcc00] flex items-center gap-1 bg-black px-1.5 py-0.5 border border-black">
            <ChipStackIcon className="w-3 h-3" />
            <span>{gameState.stake === 0 ? 'FREE' : `${gameState.stake}TKT`}</span>
          </span>

          <span className="text-[8px] font-black text-[#00d2ff] bg-black px-1.5 py-0.5 border border-black">
            TARGET: {gameState.targetWins} WINS
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
      <div className="w-full h-[400px] min-[380px]:h-[430px] bg-gradient-to-b from-[#0a3822] to-[#041a0f] border-4 border-[#1c130c] rounded-[40px] relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.9)] flex flex-col items-center justify-between p-2 z-10 shrink-0">
        
        {/* Felt Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none rounded-[35px] bg-[radial-gradient(#00ff66_1px,transparent_1px)] [background-size:10px_10px]" />

        {/* TOP: DEALER AREA */}
        <div className="w-full flex flex-col items-center z-30 pt-1">
          <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-black/80">
            {/* Dealer Avatar */}
            <div className="relative p-1 bg-slate-950 border border-black rounded flex flex-col items-center min-w-[44px] shadow-md">
              <Avatar avatarId={gameState.dealer.avatar} emotion={gameState.dealer.isBusted ? 'worried' : 'happy'} size="xs" />
              <span className="text-[7px] font-black text-white truncate max-w-[42px] leading-tight mt-0.5">
                DEALER
              </span>
              <span className="text-[7px] font-black text-[#00d2ff] leading-tight">
                {gameState.stage === 'player_turn' ? 'SCORE: ?' : `SCORE: ${gameState.dealer.score}`}
              </span>
            </div>

            {/* Dealer Cards */}
            <div className="flex -space-x-2 shrink-0">
              {gameState.dealer.cards.map((c, idx) => (
                <BlackjackCardView
                  key={c.id || idx}
                  card={c}
                  hidden={idx === 1 && gameState.stage === 'player_turn'}
                />
              ))}
            </div>
          </div>
        </div>

        {/* TABLE CENTER: POT & TURN STATUS */}
        <div className="flex flex-col items-center gap-1 z-20 pointer-events-none my-auto">
          <div className="bg-slate-950/95 border border-[#ffcc00] px-3 py-0.5 rounded-full shadow-[0_0_12px_rgba(255,204,0,0.3)] flex items-center gap-1.5">
            <ChipStack amount={gameState.pot} label="POT" />
            <span className="text-[8.5px] font-black text-[#ffcc00] uppercase">
              POT: {gameState.pot}
            </span>
          </div>

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
              <span>{activePlayer.id === 'player' ? 'YOUR TURN' : `${activePlayer.name.toUpperCase()}'S TURN`}: {turnTimeLeft}S</span>
            </motion.div>
          )}
        </div>

        {/* BOTTOM / SEATS: MULTIPLE SEATED PLAYERS */}
        <div className="w-full flex items-end justify-around gap-1 z-30 pb-1">
          {gameState.players.map((p, idx) => {
            const isTurn = gameState.stage === 'player_turn' && gameState.currentPlayerIndex === idx;
            const isMe = p.id === 'player';
            return (
              <div
                key={p.id || idx}
                className={`relative flex flex-col items-center p-1 rounded-lg transition-all ${
                  isTurn
                    ? 'bg-black/90 border-2 border-[#00ff66] shadow-[0_0_15px_#00ff66]'
                    : isMe
                    ? 'bg-black/70 border border-[#ffcc00]/60'
                    : 'bg-black/60 border border-slate-700'
                }`}
                style={{ maxWidth: `${100 / Math.max(1, gameState.players.length)}%` }}
              >
                {/* WINS BADGE */}
                <div className="absolute -top-3 bg-amber-400 text-black px-1.5 py-0.2 rounded text-[7px] font-black uppercase shadow tracking-tight">
                  ⭐ {p.wins}/{gameState.targetWins} WINS
                </div>

                {/* Cards */}
                <div className="flex -space-x-3 mb-1 shrink-0">
                  {p.cards.map((c, cIdx) => (
                    <BlackjackCardView key={c.id || cIdx} card={c} />
                  ))}
                </div>

                {/* Avatar + Info */}
                <div className="flex flex-col items-center">
                  <Avatar avatarId={p.avatar} emotion={p.isBusted ? 'worried' : isTurn ? 'thinking' : 'happy'} size="xs" />
                  <span className="text-[7px] font-black text-white truncate max-w-[48px] leading-tight mt-0.5">
                    {p.name} {isMe ? '(YOU)' : ''}
                  </span>
                  <div className="text-[7px] font-black text-[#00ff66] leading-tight">
                    {p.isBusted ? <span className="text-red-400">BUST</span> : p.hasBlackjack ? <span className="text-[#ffcc00]">BJ 21</span> : `SCORE: ${p.score}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. ROUND ENDED / MATCH CHAMPION MODAL */}
      <AnimatePresence>
        {(gameState.stage === 'round_ended' || gameState.stage === 'match_ended') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-3 backdrop-blur-sm"
          >
            <div className="bg-slate-950 border-2 border-[#00ff66] p-4 rounded-xl max-w-xs w-full text-center space-y-3 shadow-[0_0_35px_#00ff66]">
              <Trophy className="w-10 h-10 text-[#ffcc00] mx-auto animate-bounce" />
              <h2 className="text-xs font-black uppercase tracking-wider text-[#00ff66]">
                {gameState.stage === 'match_ended'
                  ? `🏆 ${gameState.matchChampion?.name.toUpperCase()} IS THE CHAMPION!`
                  : 'ROUND COMPLETED'}
              </h2>

              {gameState.winningHandDesc && (
                <p className="text-[9.5px] text-slate-200 font-bold bg-black/80 border border-black p-2 rounded leading-relaxed">
                  {gameState.winningHandDesc}
                </p>
              )}

              {/* Standings Table */}
              <div className="space-y-1 bg-slate-900 border border-slate-800 p-2 rounded text-[8px] font-bold">
                <div className="text-slate-400 text-[7px] uppercase tracking-wider mb-1">TABLE STANDINGS (TARGET: 2 WINS)</div>
                {gameState.players.map((p) => (
                  <div key={p.id} className="flex justify-between items-center px-1">
                    <span className="text-white truncate max-w-[120px]">{p.name} {p.id === 'player' ? '(You)' : ''}</span>
                    <span className="text-[#ffcc00] font-black">⭐ {p.wins}/{gameState.targetWins} WINS</span>
                  </div>
                ))}
              </div>

              {gameState.stage === 'match_ended' && gameState.winningPayout && gameState.winningPayout > 0 && (
                <div className="bg-amber-950/60 border border-amber-500/50 p-1.5 rounded text-[9px] font-black text-[#ffcc00] flex items-center justify-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  <span>TOTAL PRIZE: +{gameState.winningPayout} TKT</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-1.5 pt-1">
                {gameState.stage === 'round_ended' && (
                  <button
                    type="button"
                    onClick={onNextHand}
                    className="w-full py-2 bg-[#00ff66] text-black border-2 border-black font-black text-[10px] uppercase pixel-btn-interactive shadow flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-black text-black" />
                    <span>NEXT HAND ({nextHandCountdown}S)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="w-full py-2 bg-red-950 text-red-200 border border-red-500 font-bold text-[9px] uppercase pixel-btn-interactive cursor-pointer"
                >
                  RETURN TO LOBBY
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. PLAYER ACTION CONTROLS (HIT / STAND / DOUBLE) */}
      {gameState.stage === 'player_turn' && !gameState.isDealing && (
        <div className="bg-slate-950 border border-black p-2 rounded-lg z-20 flex flex-col gap-1.5 shadow-lg">
          <div className="flex justify-between items-center text-[8.5px] font-bold text-[#00ff66]">
            <span>{canPlay ? '👉 YOUR TURN - CHOOSE ACTION:' : `⏳ WAITING FOR ${activePlayer?.name.toUpperCase()}...`}</span>
            {humanPlayer && (
              <div className="flex items-center gap-1 text-white">
                <span>YOUR SCORE:</span>
                <strong className="text-[#ffcc00] text-[9.5px]">{humanPlayer.score}</strong>
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
    </div>
  );
}
