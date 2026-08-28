/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '../utils/api';
import { useUserProfile } from '../hooks/useUserProfile';
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
import { useMatchEmoji } from '../hooks/useMatchEmoji';
import { useTableVisualEvents } from '../hooks/useTableVisualEvents';

interface BlackjackGameProps {
  gameState: BlackjackGameState;
  turnTimeLeft: number;
  selectedBet?: number;
  onPlaceBet?: (amount: number) => void;
  onHit: () => void;
  onStand: () => void;
  onDoubleDown: () => void;
  onSplit: () => void;
  onSurrender: () => void;
  onInsurance: () => void;
  onNextHand: () => void;
  onReturnToLobby: () => void;
  onInvite?: () => void;
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
  onSplit,
  onSurrender,
  onInsurance,
  onNextHand,
  onReturnToLobby,
  onInvite,
}: BlackjackGameProps) {
  const { playback, revealedCardIds, isReplaying } = useTableVisualEvents(gameState.visualEvents, gameState.visualEpoch);
  const [muted, setMuted] = useState(sound.getMuted());
  const [nextHandCountdown, setNextHandCountdown] = useState(6);
  const [currentBetAmount, setCurrentBetAmount] = useState<number>(selectedBet);
  const [showFlyingChips, setShowFlyingChips] = useState(false);

  const toggleMute = () => {
    sound.toggleMute();
    setMuted(sound.getMuted());
  };

  const isSpectator = !gameState.players.find((p) => p.id === 'player');
  const humanPlayer = gameState.players.find((p) => p.id === 'player') || gameState.players[0] || {
    id: 'spectator',
    name: 'Spectator',
    avatar: 'rabbit',
    chips: 0,
    bet: 0,
    score: 0,
    cards: [],
    isBusted: false,
    hasStood: true,
    isEliminated: false,
    isAi: false,
    isConnected: true
  } as any;
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState(100);
  const [exchangeAmount, setExchangeAmount] = useState(1);
  const [isExchanging, setIsExchanging] = useState(false);
  const [isJoiningSeat, setIsJoiningSeat] = useState(false);
  const [seatJoinError, setSeatJoinError] = useState('');
  const seatRequestIdRef = useRef('');
  const { profile, fetchProfile } = useUserProfile();

  const handleTakeSeat = async () => {
    setSeatJoinError('');
    setShowBuyInModal(true);
  };

  const handleExchange = async () => {
    if (isExchanging) return;
    setIsExchanging(true);
    try {
      const res = await apiRequest<{success: boolean}>('/api/casino/exchange', {
        method: 'POST',
        body: JSON.stringify({ direction: 'tkt_to_chips', amount: exchangeAmount })
      });
      if (res.success) {
        await fetchProfile();
        setExchangeAmount(1);
      } else {
        alert('Exchange failed');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExchanging(false);
    }
  };

  const handleConfirmBuyIn = async (requestedChips = buyInAmount) => {
    if (isJoiningSeat) return;
    setIsJoiningSeat(true);
    setSeatJoinError('');
    if (!seatRequestIdRef.current) seatRequestIdRef.current = `seat-${gameState.matchId}-${crypto.randomUUID()}`;
    try {
      const res = await apiRequest<{success: boolean; tableId: string; joined?: boolean; message?: string}>('/api/casino/join-table', {
        method: 'POST',
        retryOnNetworkError: true,
        networkAttempts: 1,
        timeoutMs: 20_000,
        body: JSON.stringify({ tableId: gameState.matchId, chips: requestedChips, idempotencyKey: seatRequestIdRef.current })
      });
      if (res.success) {
        setShowBuyInModal(false);
        seatRequestIdRef.current = '';
        await fetchProfile();
        window.dispatchEvent(new CustomEvent('redoapp:casino-seat-taken', { detail: { tableId: gameState.matchId } }));
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '';
      if (/timed out|interrupted/i.test(message) && gameState.matchId) {
        setSeatJoinError('Checking whether your seat was reserved…');
        try {
          const recovered = await apiRequest<{ seated: boolean }>(`/api/casino/my-seat/${encodeURIComponent(gameState.matchId)}`, {
            timeoutMs: 8_000,
            retryOnNetworkError: true,
            networkAttempts: 1,
          });
          if (recovered.seated) {
            setShowBuyInModal(false);
            seatRequestIdRef.current = '';
            await fetchProfile();
            window.dispatchEvent(new CustomEvent('redoapp:casino-seat-taken', { detail: { tableId: gameState.matchId } }));
            return;
          }
        } catch (recoveryError) {
          console.error('Blackjack seat reconciliation failed', recoveryError);
        }
      }
      setSeatJoinError(err instanceof Error ? err.message.replace(/\s*\[[^\]]+\]$/, '') : 'Could not take a seat. Please retry.');
    } finally {
      setIsJoiningSeat(false);
    }
  };

  const maxAvailableBet = humanPlayer?.chips ? humanPlayer.chips + (humanPlayer.bet || 0) : 100;

  const [activeEmoji, setActiveEmoji] = useState<{ emoji: EmojiItem | string; senderUserId?: string; key: number } | null>(null);
  const handleMatchEmoji = useCallback((event: { emojiId: string; senderUserId: string; sentAt: number }) => {
    setActiveEmoji({ emoji: event.emojiId, senderUserId: event.senderUserId, key: event.sentAt });
    window.setTimeout(() => setActiveEmoji(null), 3500);
  }, []);
  const sendMatchEmoji = useMatchEmoji(gameState.matchId, Boolean(gameState.matchId), handleMatchEmoji);

  const handleSendEmoji = (emoji: EmojiItem) => {
    if (!gameState.matchId) {
      setActiveEmoji({ emoji, key: Date.now() });
      setTimeout(() => setActiveEmoji(null), 3500);
      return;
    }
    void sendMatchEmoji(emoji).catch(() => undefined);
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

    const update = () => {
      if (gameState.nextRoundStartsAt) {
        setNextHandCountdown(Math.max(0, Math.ceil((gameState.nextRoundStartsAt - Date.now()) / 1000)));
      } else if (gameState.mode === 'offline') {
        setNextHandCountdown((prev) => {
          if (prev <= 1) {
            onNextHand();
            return 0;
          }
          return prev - 1;
        });
      }
    };
    update();
    const timer = setInterval(update, gameState.nextRoundStartsAt ? 250 : 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, gameState.nextRoundStartsAt, gameState.mode, onNextHand]);

  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const isHumanActiveTurn = gameState.stage === 'player_turn' && !gameState.isDealing && activePlayer?.id === 'player';
  const canPlay = isHumanActiveTurn && !activePlayer?.eliminated;
  const canDouble = canPlay && activePlayer && activePlayer.cards.length === 2 && activePlayer.chips >= activePlayer.bet;
  const canSplit = canPlay && activePlayer && !activePlayer.hasSplit && activePlayer.activeHand !== 2 && activePlayer.cards.length === 2 && activePlayer.cards[0]?.rank === activePlayer.cards[1]?.rank && activePlayer.chips >= activePlayer.bet;
  const canSurrender = canPlay && activePlayer && ((activePlayer.activeHand || 1) === 1) && activePlayer.cards.length === 2;
  const canInsurance = canPlay && activePlayer && !activePlayer.isInsured && gameState.dealer.cards[0]?.rank === 14 && activePlayer.chips >= activePlayer.bet / 2;

  // Calculate chip leader
  const sortedByChips = [...gameState.players].sort((a, b) => (b.chips - a.chips) || (b.wins - a.wins));
  const chipLeader = sortedByChips[0];

  return (
    <div className="w-full max-w-md mx-auto flex flex-col justify-start gap-1 bg-[#080d0a] border-4 border-black p-2 relative overflow-hidden select-none font-mono text-white shadow-[0_0_25px_rgba(0,0,0,0.95)] rounded-xl min-h-[560px]">
      <AnimatePresence>
        {playback && (
          <motion.div
            key={playback.key}
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-10 left-1/2 -translate-x-1/2 z-[70] max-w-[85%] bg-black/95 border-2 border-[#ffcc00] px-3 py-1.5 rounded-full text-center text-[9px] font-black uppercase text-[#ffcc00] shadow-[0_0_18px_rgba(255,204,0,0.65)]"
          >
            {playback.message}
          </motion.div>
        )}
      </AnimatePresence>
      
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
          {onInvite && <button type="button" onClick={onInvite} className="px-2 py-0.5 bg-[#1da1f2] text-white border border-black text-[8px] font-black uppercase pixel-btn-interactive">INVITE</button>}
          <span className="text-[8px] font-black text-[#00ff66] uppercase bg-black px-1.5 py-0.5 border border-black">
            {gameState.isPersistentTable ? 'LIVE TABLE' : `HAND ${gameState.currentHand || 1}/${gameState.maxHands || 5}`}
          </span>
          <span className="text-[7.5px] font-black text-[#ffcc00] uppercase bg-black px-1.5 py-0.5 border border-black">
            {gameState.isPersistentTable
              ? (gameState.stake === 0 ? 'FREE · 2 ENERGY ENTRY' : 'CASH TABLE · CASH OUT CHIPS')
              : `PRIZE: ${gameState.stake === 0 ? 'XP' : `${(gameState.stake * Math.max(2, gameState.players.length) * 0.96).toFixed(2)} TKT`}`}
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
      {isSpectator && <div className="bg-[#ffcc00] text-black text-center text-[8px] font-black py-1 border border-black">👁 SPECTATING · CARDS HIDDEN</div>}

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
                  hidden={c.hidden === true || (idx === 1 && gameState.stage === 'player_turn') || (idx >= 2 && Boolean(gameState.visualEvents) && !revealedCardIds.has(c.id))}
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
                {gameState.waitingForOpponent ? 'WAITING FOR ONE MORE PLAYER...' : 'WAITING FOR PLAYERS TO CONNECT...'}
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

        {/* BOTTOM / SEATS: 4 SEATED PLAYERS TABLE LAYOUT */}
        <div className="w-full grid grid-cols-4 gap-1.5 min-[380px]:gap-2 z-30 pb-2 px-1">
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
                  style={{ flex: '1 1 0', minWidth: 0 }}
                >
                  <div className="scale-[0.95] origin-bottom flex flex-col items-center w-full">
                  {/* CHIPS BADGE */}
                  <div className="absolute -top-3 bg-amber-400 text-black px-1.5 py-0.2 rounded text-[7px] font-black uppercase shadow tracking-tight">
                    💰 {p.chips ?? 0} CHIPS
                  </div>

                  {/* Floating Profit Notification on Round End */}
                  <AnimatePresence>
                    {activeEmoji && (!activeEmoji.senderUserId || activeEmoji.senderUserId === (p as any).userId) && <EmojiDisplayBadge emoji={activeEmoji.emoji} key={activeEmoji.key} />}
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
                  <div className="flex flex-col mb-1 shrink-0 min-h-[50px] items-center justify-center gap-1">
                    {isEliminated ? (
                      <div className="text-[8px] font-black text-red-400 flex items-center gap-0.5 bg-black/80 px-1.5 py-1 rounded border border-red-900">
                        <Skull className="w-3 h-3" />
                        <span>BUSTED OUT</span>
                      </div>
                    ) : isSpectator ? (
                      <button onClick={handleTakeSeat} className="bg-[#00ff66] text-black border-2 border-black px-4 py-2 rounded shadow hover:bg-green-400 font-black uppercase text-[10px]">
                        TAKE A SEAT
                      </button>
                    ) : playerCards.length === 0 ? (
                      <div className="bg-black/80 border border-[#00ff66] px-3 py-1 rounded text-[8px] text-[#00ff66] font-black uppercase tracking-widest flex items-center justify-center whitespace-nowrap min-w-[80px]">
                        Waiting for next hand...
                      </div>
                    ) : (
                      <>
                        <div className="flex -space-x-3">
                          {playerCards.map((c, cIdx) => <BlackjackCardView key={c.id || cIdx} card={c} />)}
                        </div>
                        {p.hasSplit && p.splitCards && (
                          <div className={`flex -space-x-3 border-t pt-1 ${p.activeHand === 2 ? 'border-violet-400' : 'border-slate-700'}`}>
                            {p.splitCards.map((c, cIdx) => <BlackjackCardView key={`split-${c.id || cIdx}`} card={c} />)}
                          </div>
                        )}
                      </>
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
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. COMPACT & SEMI-TRANSPARENT ROUND ENDED / MATCH STANDINGS MODAL */}
      <AnimatePresence>
        {(gameState.stage === 'round_ended' || gameState.stage === 'match_ended') && !isReplaying && (
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
                    : gameState.isPersistentTable ? 'ROUND RESULTS' : `HAND ${gameState.currentHand || 1}/${gameState.maxHands || 5} RESULTS`}
                </h2>
              </div>

              {/* Compact result: hand value, winner and what happens next. */}
              <div className="space-y-0.5 bg-black/60 border border-slate-800 p-1.5 rounded text-[7.5px] font-bold max-h-[90px] overflow-y-auto">
                <div className="text-slate-400 text-[6.5px] uppercase tracking-wider flex justify-between border-b border-slate-800 pb-0.5">
                  <span>PLAYER</span>
                  <span>HAND</span>
                </div>
                {sortedByChips.map((p, rankIdx) => (
                  <div key={p.id} className="flex justify-between items-center py-0.5">
                    <span className="text-white truncate max-w-[110px]">
                      {rankIdx === 0 ? '🥇 ' : rankIdx === 1 ? '🥈 ' : rankIdx === 2 ? '🥉 ' : '4. '}
                      {p.name} {p.id === 'player' ? '(You)' : ''}
                    </span>
                    <span className={p.isBusted ? "text-red-400 font-black" : "text-[#ffcc00] font-black"}>
                      {p.isBusted ? 'BUST' : p.hasBlackjack ? 'BLACKJACK' : p.score}
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
                {gameState.mode === 'offline' && gameState.stage === 'round_ended' && (
                  <button
                    type="button"
                    onClick={onNextHand}
                    className="w-full py-1.5 bg-[#00ff66] text-black border border-black font-black text-[9px] uppercase pixel-btn-interactive shadow flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-black text-black" />
                    <span>NEXT HAND ({nextHandCountdown}S)</span>
                  </button>
                )}

                {gameState.mode !== 'offline' && gameState.stage === 'round_ended' && (
                  <div className="w-full py-1.5 bg-cyan-950/60 border border-cyan-400/60 text-cyan-200 font-black text-[8px] uppercase rounded">
                    {gameState.nextRoundStartsAt ? `NEXT HAND STARTS IN ${nextHandCountdown}S` : 'WAITING FOR AN OPPONENT TO START THE NEXT HAND'}
                  </div>
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
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={!canSplit}
              onClick={onSplit}
              className="py-2 px-1 bg-violet-950/70 border border-violet-400/70 text-violet-200 font-black rounded pixel-btn-interactive disabled:opacity-30 disabled:pointer-events-none min-h-[44px] text-[9px]"
            >
              SPLIT <span className="block text-[6.5px] font-normal">pair → 2 hands</span>
            </button>
            <button
              type="button"
              disabled={!canSurrender}
              onClick={onSurrender}
              className="py-2 px-1 bg-slate-900 border border-slate-500 text-slate-200 font-black rounded pixel-btn-interactive disabled:opacity-30 disabled:pointer-events-none min-h-[44px] text-[9px]"
            >
              SURRENDER <span className="block text-[6.5px] font-normal">return 50%</span>
            </button>
            <button
              type="button"
              disabled={!canInsurance}
              onClick={onInsurance}
              className="py-2 px-1 bg-blue-950/70 border border-blue-400/70 text-blue-200 font-black rounded pixel-btn-interactive disabled:opacity-30 disabled:pointer-events-none min-h-[44px] text-[9px]"
            >
              INSURE <span className="block text-[6.5px] font-normal">dealer Ace</span>
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
      {/* BUY IN MODAL */}
      <AnimatePresence>
        {showBuyInModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 font-mono"
          >
            <div className="bg-[#18181c] border-2 border-[#00ff66] pixel-box-sm p-4 flex flex-col items-center gap-3 w-72 shadow-[0_0_20px_rgba(0,255,102,0.3)]">
              <h2 className="text-[#00ff66] font-black text-xs uppercase text-center w-full border-b border-[#00ff66]/30 pb-2">Buy In</h2>
              <div className="text-center w-full space-y-1">
                <div className="text-[9px] text-slate-300">Balance: <span className="text-[#00ff66] font-bold">{(profile?.casinoChips || 0).toFixed(0)} Chips</span></div>
                <div className="text-[9px] text-slate-300">Tickets: <span className="text-pink-400 font-bold">{(profile?.availableTickets || 0).toFixed(2)} TKT</span></div>
              </div>

              {gameState.matchId.includes('-free-') ? (
                <div className="flex flex-col gap-1 w-full bg-slate-900/50 p-3 rounded border border-slate-800 text-center">
                  <p className="text-white text-[10px]">
                    Cost: <span className="text-[#00ff66] font-black">⚡ 2 Energy</span>
                  </p>
                  <p className="text-white text-[10px]">
                    You receive: <span className="text-[#00ff66] font-black">100 Free Chips</span>
                  </p>
                </div>
              ) : gameState.matchId.includes('-practice-') ? (
                <div className="flex flex-col gap-1 w-full bg-slate-900/50 p-3 rounded border border-slate-800 text-center">
                  <p className="text-white text-[10px]">
                    Cost: <span className="text-[#00ff66] font-black">Free</span>
                  </p>
                  <p className="text-white text-[10px]">
                    You receive: <span className="text-[#00ff66] font-black">1000 Practice Chips</span>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1 w-full bg-slate-900/50 p-2 rounded border border-slate-800">
                  <div className="text-[8px] text-slate-400 mb-1 font-bold">Convert TKT to Chips (1 TKT = 100 Chips):</div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={exchangeAmount}
                      onChange={e => setExchangeAmount(Number(e.target.value))}
                      className="bg-black border border-pink-500/50 text-pink-400 font-bold px-2 py-1 text-center text-[10px] w-full"
                    />
                    <button 
                      onClick={handleExchange} 
                      disabled={isExchanging}
                      className="px-2 py-1 bg-pink-900 text-pink-200 text-[8px] border border-pink-700 font-bold uppercase hover:bg-pink-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      Convert
                    </button>
                  </div>
                </div>
              )}

              {gameState.matchId.includes('-public-') && (
                <div className="flex flex-col gap-1 w-full mt-2">
                  <div className="text-[8px] text-slate-400 font-bold">Chips to Bring to Table:</div>
                  <input
                    type="number"
                    min={50}
                    step={50}
                    value={buyInAmount}
                    onChange={e => setBuyInAmount(Number(e.target.value))}
                    className="bg-black border border-[#00ff66] text-[#00ff66] font-bold px-2 py-1.5 text-center text-[10px] w-full"
                  />
                </div>
              )}
              <div className="flex gap-2 w-full mt-2">
                <button onClick={() => setShowBuyInModal(false)} className="flex-1 px-2 py-2 bg-slate-700 text-white text-[9px] border border-black font-bold uppercase hover:bg-slate-600">{isJoiningSeat ? 'Continue in background' : 'Cancel'}</button>
                <button 
                  disabled={isJoiningSeat}
                  onClick={() => {
                    let chipsToBuyIn = buyInAmount;
                    if (gameState.matchId.includes('-free-')) chipsToBuyIn = 100;
                    if (gameState.matchId.includes('-practice-')) chipsToBuyIn = 1000;
                    void handleConfirmBuyIn(chipsToBuyIn);
                  }}
                  className="flex-1 px-2 py-2 bg-[#00ff66] text-black text-[9px] border border-black font-bold uppercase hover:bg-green-400 disabled:opacity-60"
                >
                  {isJoiningSeat ? <><Loader2 className="inline w-3 h-3 animate-spin mr-1" />JOINING…</> : 'Join Table'}
                </button>
              </div>
              {seatJoinError && <div className="w-full text-center text-[8px] text-red-300">{seatJoinError}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
