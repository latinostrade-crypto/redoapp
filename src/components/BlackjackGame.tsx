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

  // Auto-next hand timer during showdown
  useEffect(() => {
    if (gameState.stage !== 'ended') {
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

  const canPlay = gameState.stage === 'player_turn' && !gameState.isDealing;
  const canDouble = canPlay && gameState.player.cards.length === 2 && gameState.player.chips >= gameState.player.bet;

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

      {/* 2. OVAL CASINO FELT TABLE */}
      <div className="w-full h-[380px] min-[380px]:h-[410px] bg-gradient-to-b from-[#0a3822] to-[#041a0f] border-4 border-[#1c130c] rounded-[50px] relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.9)] flex flex-col items-center justify-center z-10 shrink-0">
        
        {/* Felt Watermark Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none rounded-[45px] bg-[radial-gradient(#00ff66_1px,transparent_1px)] [background-size:10px_10px]" />

        {/* 3D VISUAL DECK STACK AT CENTER-LEFT OF FELT */}
        <div className="absolute left-3 top-[44%] -translate-y-1/2 flex flex-col items-center z-20 opacity-85 pointer-events-none">
          <div className="relative w-7 h-10">
            <div className="absolute inset-0 bg-slate-950 border border-black rounded translate-x-0.5 translate-y-0.5 overflow-hidden shadow">
              <img src="/card-thumbs/back.jpeg" alt="Deck" className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 bg-slate-950 border-2 border-black rounded overflow-hidden shadow-md">
              <img src="/card-thumbs/back.jpeg" alt="Deck" className="w-full h-full object-cover" />
            </div>
          </div>
          <span className="text-[6px] font-black text-[#00ff66] mt-0.5 uppercase tracking-tighter">
            DECK
          </span>
        </div>

        {/* BET AMOUNT DISPLAY (Top Center) */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
          <div className="bg-slate-950/95 border-2 border-[#ffcc00] px-3 py-0.5 rounded-full shadow-[0_0_12px_rgba(255,204,0,0.4)] flex items-center gap-1.5">
            <ChipStack amount={gameState.player.bet} label="BET" />
            <div className="flex items-center gap-1 text-[9.5px] font-black text-[#ffcc00] uppercase tracking-wide">
              <ChipStackIcon className="w-3 h-3" />
              <span>{gameState.player.bet}</span>
            </div>
          </div>
        </div>


        {/* DEALER AREA (TOP FELT) */}
        <div className="absolute top-11 left-1/2 -translate-x-1/2 flex flex-col items-center z-30">
          <div className="flex items-center gap-1.5">
            {/* Dealer Cards */}
            <div className="flex -space-x-3 shrink-0">
              {gameState.dealer.cards.map((c, idx) => (
                <BlackjackCardView
                  key={c.id || idx}
                  card={c}
                  hidden={idx === 1 && gameState.stage === 'player_turn'}
                />
              ))}
            </div>

            {/* Dealer Avatar & Score */}
            <div className="relative p-1 bg-slate-950 border border-black rounded flex flex-col items-center min-w-[48px] shadow-md">
              <Avatar avatarId={gameState.dealer.avatar} emotion={gameState.dealer.isBusted ? 'worried' : 'happy'} size="xs" />
              <span className="text-[7px] font-black text-white truncate max-w-[44px] leading-tight mt-0.5">
                DEALER
              </span>
              <span className="text-[7px] font-black text-[#00d2ff] leading-tight">
                {gameState.stage === 'player_turn' ? 'SCORE: ?' : `SCORE: ${gameState.dealer.score}`}
              </span>
            </div>
          </div>
        </div>

        {/* TABLE CENTER BRAND WATERMARK & BLINKING TIMER */}
        <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20 pointer-events-none">
          <div className="text-xl font-black text-[#00ff66]/30 uppercase tracking-widest drop-shadow">
            BLACKJACK 21
          </div>

          {/* TURN TIMER BADGE */}
          {gameState.stage === 'player_turn' && !gameState.isDealing && (
            <motion.div
              animate={{
                scale: turnTimeLeft <= 5 ? [1, 1.1, 1] : [1, 1.03, 1],
                boxShadow: turnTimeLeft <= 5
                  ? ['0 0 10px #ff3333', '0 0 25px #ff3333', '0 0 10px #ff3333']
                  : ['0 0 10px #00ff66', '0 0 20px #00ff66', '0 0 10px #00ff66'],
              }}
              transition={{ repeat: Infinity, duration: turnTimeLeft <= 5 ? 0.45 : 0.9 }}
              className={`px-3 py-1 rounded-full border-2 font-black text-[9.5px] flex items-center gap-1.5 tracking-wider uppercase backdrop-blur-md ${
                turnTimeLeft <= 5 ? 'bg-red-950 border-red-500 text-red-300 animate-pulse' : 'bg-black/95 border-[#00ff66] text-[#00ff66]'
              }`}
            >
              <Timer className={`w-3.5 h-3.5 ${turnTimeLeft <= 5 ? 'text-red-400 animate-spin' : ''}`} />
              <span>YOUR TURN: {turnTimeLeft}S</span>
            </motion.div>
          )}
        </div>

        {/* PLAYER AREA (BOTTOM FELT) */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center z-30">
          {/* LIVE HAND STATUS BADGE */}
          <div className="mb-1 bg-black/95 border border-[#00ff66] px-2.5 py-0.5 rounded text-[8px] font-black text-[#00ff66] uppercase tracking-wider shadow flex items-center gap-1">
            {gameState.player.hasBlackjack ? (
              <>
                <Sparkles className="w-3 h-3 text-[#ffcc00] animate-spin" />
                <span className="text-[#ffcc00]">NATURAL BLACKJACK 21!</span>
              </>
            ) : gameState.player.isBusted ? (
              <span className="text-red-400">BUSTED ({gameState.player.score})</span>
            ) : (
              <span>SCORE: {gameState.player.score}{gameState.player.isSoft ? ' (SOFT)' : ''}</span>
            )}
          </div>

          <div className="flex items-end gap-1.5">
            {/* Player Cards */}
            <div className="flex -space-x-3 shrink-0">
              {gameState.player.cards.map((c, idx) => (
                <BlackjackCardView key={c.id || idx} card={c} />
              ))}
            </div>

            {/* Player Avatar Pill */}
            <div className={`relative p-1 bg-slate-950 border rounded flex flex-col items-center min-w-[50px] max-w-[54px] ${
              gameState.stage === 'player_turn' ? 'border-[#00ff66] shadow-[0_0_12px_#00ff66]' : 'border-black'
            }`}>
              <Avatar
                avatarId={gameState.player.avatar}
                emotion={gameState.player.isBusted ? 'worried' : gameState.stage === 'player_turn' ? 'thinking' : 'happy'}
                size="xs"
              />
              <span className="text-[7px] font-black text-white truncate max-w-[46px] leading-tight mt-0.5">
                {gameState.player.name}
              </span>
              <div className="flex items-center gap-0.5 text-[7px] font-black text-[#ffcc00] leading-tight">
                <ChipStackIcon className="w-2.5 h-2.5" />
                <span>{gameState.player.chips}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SHOWDOWN / HAND ENDED MODAL */}
      <AnimatePresence>
        {gameState.stage === 'ended' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 z-50 flex flex-col items-center justify-center p-3 backdrop-blur-sm"
          >
            <div className="bg-slate-950 border-2 border-[#00ff66] p-4 rounded-xl max-w-xs w-full text-center space-y-3 shadow-[0_0_35px_#00ff66]">
              <Trophy className="w-9 h-9 text-[#ffcc00] mx-auto animate-bounce" />
              <h2 className="text-xs font-black uppercase tracking-wider text-[#00ff66]">
                {gameState.winner === 'player'
                  ? '🎉 YOU WON THE HAND!'
                  : gameState.winner === 'push'
                  ? 'PUSH (TIE)'
                  : 'DEALER WINS'}
              </h2>

              <div className="grid grid-cols-2 gap-2 bg-slate-900 border border-slate-700 p-2 rounded text-[9px] font-bold">
                <div className="text-center">
                  <span className="block text-slate-400 text-[7.5px] uppercase">YOUR SCORE</span>
                  <span className="text-[#00ff66] font-black text-sm">{gameState.player.score}</span>
                </div>
                <div className="text-center">
                  <span className="block text-slate-400 text-[7.5px] uppercase">DEALER SCORE</span>
                  <span className="text-[#00d2ff] font-black text-sm">{gameState.dealer.score}</span>
                </div>
              </div>

              {gameState.winningHandDesc && (
                <p className="text-[9.5px] text-slate-200 font-bold bg-black/80 border border-black p-2 rounded leading-relaxed">
                  {gameState.winningHandDesc}
                </p>
              )}

              {/* Action Buttons: Next Hand & Lobby */}
              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={onNextHand}
                  className="w-full py-2.5 bg-[#00ff66] text-black border-2 border-black font-black text-[10px] uppercase pixel-btn-interactive shadow flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-black text-black" />
                  <span>NEXT HAND ({nextHandCountdown}S)</span>
                </button>

                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="w-full py-1.5 bg-slate-900 text-slate-300 border border-black font-bold text-[8.5px] uppercase pixel-btn-interactive cursor-pointer"
                >
                  RETURN TO LOBBY
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. PLAYER ACTION CONTROLS */}
      {gameState.stage === 'player_turn' && !gameState.isDealing && (
        <div className="bg-slate-950 border border-black p-2 rounded-lg z-20 flex flex-col gap-1.5 shadow-lg">
          <div className="flex justify-between items-center text-[8.5px] font-bold text-[#00ff66]">
            <span>CHOOSE ACTION:</span>
            <div className="flex items-center gap-1 text-white">
              <span>YOUR SCORE:</span>
              <strong className="text-[#ffcc00] text-[9.5px]">{gameState.player.score}</strong>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {/* HIT (+1 CARD) */}
            <button
              type="button"
              disabled={!canPlay}
              onClick={onHit}
              className="py-2 px-1 bg-[#00ff66]/20 border border-[#00ff66] hover:bg-[#00ff66]/30 text-[#00ff66] font-black rounded pixel-btn-interactive disabled:opacity-40 disabled:pointer-events-none min-h-[46px] flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
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
              className="py-2 px-1 bg-red-950 border border-red-500/50 hover:bg-red-900/50 text-red-300 font-black rounded pixel-btn-interactive disabled:opacity-40 disabled:pointer-events-none min-h-[46px] flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
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
              className="py-2 px-1 bg-[#ffcc00]/20 border border-[#ffcc00] hover:bg-[#ffcc00]/30 text-[#ffcc00] font-black rounded pixel-btn-interactive disabled:opacity-40 disabled:pointer-events-none min-h-[46px] flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-1 text-[9.5px]">
                <Coins className="w-3 h-3" />
                <span>DOUBLE (2X)</span>
              </div>
              <span className="text-[6.5px] text-amber-300/80 font-normal mt-0.5">double bet</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
