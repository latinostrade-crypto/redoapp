import { translateTableEvent } from '../i18n/tableEvent';
import { translateGameLabel } from '../i18n/gameLabels';
import { describePokerHand } from '../i18n/pokerHand';
import { message as uiMessage, type UiMessage } from '../i18n/message';
import { LanguageSwitch, useLanguage } from '../i18n/LanguageProvider';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PokerGameState, PokerPlayer } from '../types/poker';
import { apiRequest } from '../utils/api';
import { useUserProfile } from '../hooks/useUserProfile';
import { sound } from '../utils/sound';
import { RotateCcw, Volume2, VolumeX, ArrowUpRight, Play, Plus, Minus } from 'lucide-react';
import { evaluate7CardHand } from '../utils/pokerEvaluator';
import { QuickEmojiPanel, EmojiDisplayBadge, EmojiItem } from './QuickEmojiPanel';
import { useMatchEmoji } from '../hooks/useMatchEmoji';
import { usePokerReactions } from '../hooks/usePokerReactions';
import { useTelegramSafeArea } from '../hooks/useTelegramSafeArea';
import { getPokerHapticsEnabled, playPokerFeedback, setPokerHapticsEnabled } from '../utils/pokerFeedback';
import { ResistanceAvatar, ResistanceAvatarState } from './poker/ResistanceAvatar';
import { EmptyPlayerSeat, ResistancePlayerSeat } from './poker/ResistancePlayerSeat';
import {
  PixelCounter,
  PixelLoader,
  PixelSnap,
  PixelTextReveal,
  PixelToast,
  ScreenShake,
} from './poker/PixelPrimitives';
import { canQueuePokerPreCheck, PokerPreAction, resolvePokerPreAction } from './poker/preActions';
import { ChipStackIcon, ChipValue, CommunityCards, HoleCards, PokerTable, Pot } from './poker/PokerTable';
import { ChipField } from './poker/chips/ChipField';
import { useChipTimeline } from './poker/chips/useChipTimeline';
import { PokerHandResult } from './poker/PokerHandResult';
import { getPokerHandWinners } from './poker/handResult';
import { usePokerPresentation } from './poker/motion/usePokerPresentation';
import { transitionResistanceScene } from './poker/motion/sceneTransition';
import { pixelMaskStyle } from './poker/motion/pixelMasks';
import { isFinished } from './poker/motion/presentation';
import { LocalPokerHand } from './poker/LocalPokerHand';
import { ActionButton, BetControls, RaiseControl } from './poker/PokerControls';
import {
  ConnectionStatus,
  PixelModal,
} from './poker/PokerOverlays';
import './poker/poker-resistance.css';
import './poker/poker-layout.css';
import './poker/motion/resistance-motion.css';

interface PokerGameProps {
  gameState: PokerGameState;
  turnTimeLeft?: number;
  forceReducedMotion?: boolean;
  onFold: () => void;
  onCallOrCheck: () => void;
  onRaise: (amount: number) => void;
  onNextHand?: () => void;
  onReturnToLobby: () => void;
  onInvite?: () => void;
}

function getResistanceAvatarState(player: PokerPlayer, isWinner: boolean): ResistanceAvatarState {
  if (player.eliminated) return 'eliminated';
  if (player.isConnected === false) return 'disconnected';
  if (isWinner) return 'winner';
  if (player.folded) return 'folded';
  return 'online';
}

export function PokerGame({
  gameState,
  turnTimeLeft = 15,
  forceReducedMotion = false,
  onFold,
  onCallOrCheck,
  onRaise,
  onNextHand,
  onReturnToLobby,
  onInvite,
}: PokerGameProps) {
  const { tr, renderMessage, renderError } = useLanguage();
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = forceReducedMotion || systemReduceMotion;
  const presentation = usePokerPresentation(gameState, Boolean(reduceMotion));
  const chipView = useChipTimeline(gameState, Boolean(reduceMotion), presentation.payoutAt);
  const telegramSafeArea = useTelegramSafeArea();
  const [muted, setMuted] = useState(() => sound.getMuted());
  const [hapticsEnabled, setHapticsEnabled] = useState(getPokerHapticsEnabled);
  const [showRaisePanel, setShowRaisePanel] = useState(false);
  const [customRaiseAmount, setCustomRaiseAmount] = useState(gameState.currentBet + gameState.bigBlindAmount);
  const [nextHandCountdown, setNextHandCountdown] = useState(6);
  const [sceneClosing, setSceneClosing] = useState(false);
  const [preAction, setPreAction] = useState<PokerPreAction | null>(null);
  const [preActionNotice, setPreActionNotice] = useState<{ key: number; message: UiMessage; tone: 'signal' | 'danger' | 'neutral' } | null>(null);
  const resultRevealReady = presentation.resultReady;
  const { reactions, show: showReaction, optimistic: showOptimisticReaction } = usePokerReactions(gameState.matchId || 'practice');
  const announcedResultRef = useRef('');
  const sequenceTimersRef = useRef<number[]>([]);
  const previousHumanTurnRef = useRef(false);
  const timerWarningRef = useRef('');
  const preActionExecutionRef = useRef('');
  const preActionNoticeTimerRef = useRef<number | null>(null);
  const previousPotRef = useRef(gameState.pot);
  const previousPlayerStatesRef = useRef<Map<string, { connected: boolean; eliminated: boolean }> | null>(null);
  const autoNextTriggeredRef = useRef(false);
  const handleMatchEmoji = useCallback((event: { emojiId: string; senderUserId: string; sentAt: number }) => {
    showReaction(event.senderUserId, event.emojiId);
  }, [showReaction]);
  const sendMatchEmoji = useMatchEmoji(gameState.matchId, Boolean(gameState.matchId), handleMatchEmoji);

  const handleSendEmoji = (emoji: EmojiItem) => {
    playPokerFeedback('ui_click');
    const player = gameState.players.find(p => p.id === 'player');
    if (!player) return;
    const undo = showOptimisticReaction(player.userId || player.id, emoji.id);
    if (!gameState.matchId) return;
    void sendMatchEmoji(emoji).catch(() => {
      if (undo()) showPreActionNotice(uiMessage('reactionRetry'), 'danger');
    });
  };

  const seatedHumanPlayer = gameState.players.find((p) => p.id === 'player');
  const isSpectator = !seatedHumanPlayer;
  const humanPlayer = seatedHumanPlayer || {
    id: 'spectator',
    name: 'Spectator',
    avatar: 'rabbit',
    chips: 0,
    currentBet: 0,
    totalMatchInvested: 0,
    holeCards: [],
    folded: true,
    isAllIn: false,
    eliminated: false,
    isAi: false,
    isBusted: false,
    isConnected: true
  } as any;
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState(200);
  const [exchangeAmount, setExchangeAmount] = useState(1);
  const [isExchanging, setIsExchanging] = useState(false);
  const [isJoiningSeat, setIsJoiningSeat] = useState(false);
  const [seatJoinError, setSeatJoinError] = useState<UiMessage>('');
  const seatRequestIdRef = useRef('');
  const { profile, fetchProfile } = useUserProfile();
  const telegramPhotoUrl = humanPlayer.photoUrl
    || profile?.telegramPhotoUrl
    || (window as typeof window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { photo_url?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url
    || null;
  const isPersistentCashTable = String(gameState.matchId || gameState.tableId || '').startsWith('table-poker-');
  const stakeUsesChips = isPersistentCashTable;
  const isFreeChipTable = stakeUsesChips && String(gameState.matchId || gameState.tableId).includes('-free-');

  useEffect(() => () => {
    sequenceTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (preActionNoticeTimerRef.current !== null) window.clearTimeout(preActionNoticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!resultRevealReady || chipView.busy || !['ended', 'match_ended'].includes(gameState.stage)) return;
    const signature = `${gameState.visualEpoch}:${gameState.stage}:${gameState.winnerIds.join(',')}`;
    if (announcedResultRef.current === signature) return;
    announcedResultRef.current = signature;
    playPokerFeedback('winner');
  }, [chipView.busy, resultRevealReady, gameState.visualEpoch, gameState.stage, gameState.winnerIds]);

  useEffect(() => {
    const visiblePot = chipView.pots.reduce((sum, amount) => sum + amount, 0);
    if (visiblePot > previousPotRef.current) playPokerFeedback('pot_receive');
    previousPotRef.current = visiblePot;
  }, [chipView.pots]);

  useEffect(() => {
    const current = new Map(gameState.players.map((player) => [player.id, {
      connected: player.isConnected !== false,
      eliminated: Boolean(player.eliminated),
    }]));
    const previous = previousPlayerStatesRef.current;
    previousPlayerStatesRef.current = current;
    if (!previous) return;

    gameState.players.forEach((player) => {
      const before = previous.get(player.id);
      const after = current.get(player.id)!;
      if (!before) {
        playPokerFeedback('player_join');
        return;
      }
      if (before.connected && !after.connected) playPokerFeedback('player_disconnect');
      if (!before.connected && after.connected) playPokerFeedback('player_join');
      if (!before.eliminated && after.eliminated) playPokerFeedback('player_eliminated');
    });
  }, [gameState.players]);

  const handleReturnToLobby = useCallback(() => {
    if (sceneClosing) return;
    playPokerFeedback('scene_transition');
    setSceneClosing(true);
    transitionResistanceScene(onReturnToLobby, Boolean(reduceMotion));
  }, [onReturnToLobby, sceneClosing, reduceMotion]);

  const handleTakeSeat = async () => {
    playPokerFeedback('ui_confirm');
    setSeatJoinError('');
    setShowBuyInModal(true);
  };

  const handleCloseBuyInModal = useCallback(() => {
    playPokerFeedback('ui_cancel');
    setShowBuyInModal(false);
  }, []);

  const handleExchange = async () => {
    if (isExchanging) return;
    setIsExchanging(true);
    try {
      const res = await apiRequest<{success: boolean}>('/api/casino/exchange', {
        method: 'POST',
        body: JSON.stringify({ direction: 'tkt_to_chips', amount: exchangeAmount })
      });
      if (res.success) {
        playPokerFeedback('player_join');
        await fetchProfile();
        setExchangeAmount(1);
      } else {
        setSeatJoinError(uiMessage('seatExchangeFailed'));
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
        setSeatJoinError(uiMessage('seatReservationChecking'));
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
          console.error('Poker seat reconciliation failed', recoveryError);
        }
      }
      setSeatJoinError(err instanceof Error ? err.message.replace(/\s*\[[^\]]+\]$/, '') : uiMessage('seatTakeFailed'));
    } finally {
      setIsJoiningSeat(false);
    }
  };

  const isHumanTurn =
    gameState.stage !== 'idle' &&
    gameState.stage !== 'ended' &&
    gameState.stage !== 'match_ended' &&
    !gameState.isMatchOver &&
    !gameState.isDealing &&
    gameState.players[gameState.currentPlayerIndex]?.id === 'player';
  const callNeeded = humanPlayer ? Math.max(0, gameState.currentBet - humanPlayer.currentBet) : 0;
  const canCallOrCheck = Boolean(isHumanTurn && humanPlayer && !humanPlayer.folded && !humanPlayer.isAllIn);
  const canQueuePreCheck = canQueuePokerPreCheck(callNeeded);
  const canRemainPreActionQueued = Boolean(
    !isSpectator &&
    gameState.stage !== 'idle' &&
    gameState.stage !== 'ended' &&
    gameState.stage !== 'match_ended' &&
    !gameState.isMatchOver &&
    !humanPlayer.folded &&
    !humanPlayer.eliminated &&
    !humanPlayer.isAllIn &&
    humanPlayer.isConnected !== false
  );
  const canQueuePreAction = canRemainPreActionQueued && !isHumanTurn;
  const handWinnerIds = new Set(presentation.winnerReady ? getPokerHandWinners(gameState).map(w => w.player.id) : []);
  const humanAvatarState = getResistanceAvatarState(humanPlayer, handWinnerIds.has(humanPlayer.id));
  const humanTurnProgress = isHumanTurn ? Math.max(0, Math.min(1, turnTimeLeft / (gameState.turnTimeoutSec || 15))) : 1;

  useEffect(() => {
    if (isHumanTurn && !previousHumanTurnRef.current) playPokerFeedback('player_turn');
    previousHumanTurnRef.current = isHumanTurn;

    const warningSignature = `${gameState.turnStartedAt || 0}:${gameState.currentPlayerIndex}`;
    if (isHumanTurn && turnTimeLeft === 5 && timerWarningRef.current !== warningSignature) {
      timerWarningRef.current = warningSignature;
      playPokerFeedback('timer_warning');
    }
  }, [gameState.currentPlayerIndex, gameState.turnStartedAt, isHumanTurn, turnTimeLeft]);

  const showPreActionNotice = useCallback((message: UiMessage, tone: 'signal' | 'danger' | 'neutral' = 'neutral') => {
    if (preActionNoticeTimerRef.current !== null) window.clearTimeout(preActionNoticeTimerRef.current);
    const key = Date.now();
    setPreActionNotice({ key, message, tone });
    preActionNoticeTimerRef.current = window.setTimeout(() => {
      setPreActionNotice((current) => current?.key === key ? null : current);
      preActionNoticeTimerRef.current = null;
    }, 1_800);
  }, []);

  useEffect(() => {
    const resolution = resolvePokerPreAction({
      queued: preAction,
      canRemainQueued: canRemainPreActionQueued,
      isHumanTurn,
      canAct: canCallOrCheck,
      callNeeded,
    });

    if (resolution === 'none' || resolution === 'wait') return;

    const signature = `${gameState.matchId || 'practice'}:${gameState.turnStartedAt || 0}:${gameState.currentPlayerIndex}:${preAction}:${resolution}`;
    if (preActionExecutionRef.current === signature) return;
    preActionExecutionRef.current = signature;
    setPreAction(null);

    if (resolution === 'fold') {
      playPokerFeedback('fold');
      showPreActionNotice(uiMessage('preFoldExecuted'), 'danger');
      onFold();
      return;
    }

    if (resolution === 'check') {
      playPokerFeedback('ui_confirm');
      showPreActionNotice(uiMessage('preCheckExecuted'), 'signal');
      onCallOrCheck();
      return;
    }

    if (preAction === 'check' && callNeeded > 0) {
      playPokerFeedback('ui_cancel');
      showPreActionNotice(uiMessage('preCheckCancelledBet'), 'danger');
    }
  }, [
    callNeeded,
    canCallOrCheck,
    canRemainPreActionQueued,
    gameState.currentPlayerIndex,
    gameState.matchId,
    gameState.turnStartedAt,
    isHumanTurn,
    onCallOrCheck,
    onFold,
    preAction,
    showPreActionNotice,
  ]);

  const togglePreAction = (action: PokerPreAction) => {
    if (action === 'check' && !canQueuePreCheck) {
      playPokerFeedback('ui_cancel');
      showPreActionNotice(uiMessage('preCheckUnavailableBet'), 'danger');
      return;
    }
    playPokerFeedback(preAction === action ? 'ui_cancel' : 'ui_click');
    preActionExecutionRef.current = '';
    setPreAction((current) => current === action ? null : action);
  };

  const clearPreAction = () => {
    preActionExecutionRef.current = '';
    setPreAction(null);
  };

  // Live hand rank evaluation for human player
  const humanHandEval = React.useMemo(() => {
    // A spectator is intentionally given masked hole cards by the server.
    // Never evaluate those rank-0 placeholders or leak a nonsensical hand
    // label such as "Pair of undefineds" into the table UI.
    if (isSpectator) return null;
    if (!humanPlayer || !humanPlayer.holeCards || humanPlayer.holeCards.length < 2) return null;
    return evaluate7CardHand([...humanPlayer.holeCards, ...gameState.communityCards]);
  }, [isSpectator, humanPlayer, gameState.communityCards]);

  const toggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
    playPokerFeedback('ui_click');
  };

  const toggleHaptics = () => {
    const next = !hapticsEnabled;
    setPokerHapticsEnabled(next);
    setHapticsEnabled(next);
    playPokerFeedback('ui_click');
  };

  // Keep custom raise amount synced
  useEffect(() => {
    setCustomRaiseAmount(gameState.currentBet + gameState.bigBlindAmount);
  }, [gameState.currentBet, gameState.bigBlindAmount]);

  // Auto-next hand countdown during showdown
  useEffect(() => {
    if (gameState.stage !== 'ended' || gameState.isMatchOver) {
      autoNextTriggeredRef.current = false;
      setNextHandCountdown(6);
      return;
    }
    if (!resultRevealReady || chipView.busy) return;
    if (gameState.mode === 'offline') setNextHandCountdown(6);
    const update = () => {
      if (gameState.nextRoundStartsAt) {
        setNextHandCountdown(Math.max(0, Math.ceil((gameState.nextRoundStartsAt - Date.now()) / 1000)));
      } else if (gameState.mode === 'offline' && onNextHand) {
        setNextHandCountdown((previous) => Math.max(0, previous - 1));
      }
    };
    if (gameState.nextRoundStartsAt) update();
    const timer = setInterval(update, gameState.nextRoundStartsAt ? 250 : 1000);

    return () => clearInterval(timer);
  }, [gameState.stage, gameState.isMatchOver, gameState.mode, gameState.nextRoundStartsAt, resultRevealReady, chipView.busy, onNextHand]);

  useEffect(() => {
    if (
      gameState.stage !== 'ended' ||
      gameState.isMatchOver ||
      gameState.mode !== 'offline' ||
      !onNextHand ||
      nextHandCountdown > 0 ||
      autoNextTriggeredRef.current
    ) return;
    autoNextTriggeredRef.current = true;
    onNextHand();
  }, [gameState.mode, gameState.stage, gameState.isMatchOver, nextHandCountdown, onNextHand]);

  return (
    <ScreenShake
      active={false}
      className={`resistance-poker${reduceMotion ? ' resistance-poker--reduced-motion' : ''} w-full max-w-md mx-auto flex flex-col justify-start gap-1 border-4 border-black p-2 relative overflow-hidden select-none text-white shadow-[0_0_25px_rgba(0,0,0,0.95)] min-h-[550px]`}
      style={{
        ...pixelMaskStyle,
        '--tg-safe-top': `${telegramSafeArea.top}px`,
        '--tg-safe-right': `${telegramSafeArea.right}px`,
        '--tg-safe-bottom': `${telegramSafeArea.bottom}px`,
        '--tg-safe-left': `${telegramSafeArea.left}px`,
      } as React.CSSProperties}
    >
      <AnimatePresence>
        {preActionNotice && (
          <motion.div
            key={preActionNotice.key}
            className="rp-pre-action-toast-slot"
            initial={false}
            animate={reduceMotion ? undefined : { clipPath: 'inset(0)' }}
            exit={reduceMotion ? undefined : { clipPath: 'inset(0 100% 0 0)' }}
            transition={{ duration: reduceMotion ? 0 : 0.12 }}
          >
            <PixelToast message={renderMessage(preActionNotice.message)} tone={preActionNotice.tone} />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* 1. TOP HEADER CONTROL BAR */}
      <header className="rp-header flex justify-between items-center border px-2.5 py-1 z-20 flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReturnToLobby}
            className="rp-header-action px-2 py-0.5 text-[8px] font-black uppercase flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{tr("lobby")}</span>
          </button>
          {onInvite && <button type="button" onClick={onInvite} className="rp-header-action px-2 py-0.5 text-[8px] font-black uppercase">{tr("invite")}</button>}
          <span className="rp-mode-label text-[8px] font-black uppercase px-1.5 py-0.5">
            HOLD'EM · {tr(gameState.mode === 'offline' ? 'modePractice' : gameState.mode === 'private' ? 'privateRoom' : 'tabPvp')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rp-stake-label text-[8px] font-black flex items-center gap-1 px-1.5 py-0.5">
            {stakeUsesChips ? (
              <ChipValue
                amount={gameState.stake}
                iconClassName="w-3 h-3"
                prefix={isFreeChipTable ? <span>{tr("freePrefix")}</span> : null}
                suffix={!isFreeChipTable ? <span>{tr('minimumShort')}</span> : null}
              />
            ) : gameState.stake === 0 ? <span>{tr("freeUpper")}</span> : <span>{gameState.stake} TKT</span>}
          </span>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={tr(muted ? 'unmutePoker' : 'mutePoker')}
            className={`min-w-[44px] p-1 border border-black pixel-btn-interactive cursor-pointer ${
              muted ? 'bg-red-950/40 text-red-400' : 'bg-slate-900 text-slate-200'
            }`}
          >
            {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={toggleHaptics}
            className={`rp-header-toggle px-1 text-[7px] font-black ${hapticsEnabled ? 'text-slate-100' : 'text-slate-500'}`}
            aria-pressed={hapticsEnabled}
            aria-label={tr(hapticsEnabled ? 'disablePokerHaptics' : 'enablePokerHaptics')}
            title={tr("haptics")}
          >
            {hapticsEnabled ? 'H' : 'H×'}
          </button>
        </div>
      <LanguageSwitch />
      </header>

      {/* 2. RESISTANCE SIGNAL TABLE */}
      <PokerTable bankCount={chipView.pots.length}>
        <div className="rp-event-stage" aria-live="polite" aria-atomic="true">
          {presentation.cue && <div key={presentation.cue.id} className={`rp-event-cue rp-pixel-build${presentation.cue.impact ? ' rp-event-cue--impact' : ''}`}>
            <span>{['READY?', 'GAME START!', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN', 'POT CAPTURED'].includes(presentation.cue.label) ? translateTableEvent(translateGameLabel(presentation.cue.detail, tr), tr) : presentation.cue.detail}</span><strong>{translateGameLabel(presentation.cue.label, tr)}</strong>
          </div>}
        </div>

        {/* POT & STAGE DISPLAY (Top-center) */}
        <div className="rp-pot-position absolute flex flex-col items-center z-20">
          <Pot amount={chipView.pots.reduce((sum, amount) => sum + amount, 0)} />
          {['preflop', 'flop', 'turn', 'river', 'showdown'].includes(gameState.stage) && (
            <span className="rp-stage-label text-[7.5px] font-black uppercase mt-0.5 tracking-widest px-2 py-0.5 border">
              {gameState.stage === 'preflop'
                ? tr("preFlop")
                : gameState.stage === 'flop'
                ? tr("flop")
                : gameState.stage === 'turn'
                ? tr("turn")
                : gameState.stage === 'river'
                ? tr("river")
                : tr("showdown")}
            </span>
          )}
        </div>

        {/* DYNAMIC OPPONENTS RENDERING */}
        {(() => {
          const opponents = isSpectator
            ? gameState.players
            : gameState.players.filter((p) => p.id !== humanPlayer.id);
          const renderOpponentView = (opp: typeof gameState.players[0], positionIndex: number) => {
            const isTurn = gameState.players[gameState.currentPlayerIndex]?.id === opp.id && !isFinished(gameState);
            const isDealer = gameState.players[gameState.dealerIndex]?.id === opp.id;
            const isWinner = handWinnerIds.has(opp.id);
            const avatarState = getResistanceAvatarState(opp, isWinner);
            const turnProgress = isTurn ? Math.max(0, Math.min(1, turnTimeLeft / (gameState.turnTimeoutSec || 15))) : 1;
            return (
              <div key={opp.id} className="rp-opponent-position absolute z-30" data-seat-slot={positionIndex}>
                <ResistancePlayerSeat
                  player={opp}
                  state={avatarState}
                  active={isTurn}
                  dealer={isDealer}
                  blind={gameState.players[gameState.smallBlindIndex]?.id === opp.id ? 'SB' : gameState.players[gameState.bigBlindIndex]?.id === opp.id ? 'BB' : undefined}
                  turnProgress={turnProgress}
                  turnSeconds={turnTimeLeft}
                  photoUrl={opp.photoUrl}
                  revealCards={presentation.revealedPlayers.has(opp.id) && !opp.folded && !opp.mucked}
                  dealAt={presentation.dealAt}
                  dealIndex={positionIndex}
                  reaction={reactions[opp.userId || opp.id] ? <EmojiDisplayBadge emoji={reactions[opp.userId || opp.id].emojiId} key={reactions[opp.userId || opp.id].key} resistance /> : null}
                  displayBalance={chipView.balances[opp.id]}
                />
              </div>
            );
          };

          const visiblePositions = Array.from({ length: isSpectator ? 10 : 9 }, (_, index) => index);

          return (
            <>
              {visiblePositions.map((index) => {
                const opponent = opponents[index];
                if (opponent) return renderOpponentView(opponent, index);
                return (
                  <div key={`open-seat-${index}`} className="rp-opponent-position absolute z-30" data-seat-slot={index}>
                    <EmptyPlayerSeat seatNumber={index + 1} />
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* CENTER TABLE: COMMUNITY BOARD + ACTIVE SIGNAL */}
        <div className="rp-board-position absolute flex flex-col items-center gap-2 z-35">
          
          <CommunityCards
            cards={gameState.communityCards}
            revealedCardIds={presentation.boardIds}
            winningCardIds={presentation.winnerReady ? gameState.winningCardIds : []}
          />

          {/* Compact table status; the countdown itself also consumes the active seat border. */}
          {gameState.waitingForPlayers ? (
            <ConnectionStatus waitingForOpponent={gameState.waitingForOpponent} />
          ) : (
            gameState.stage !== 'idle' && !isFinished(gameState) && (
              <div className={`rp-table-signal${turnTimeLeft <= 5 ? ' rp-table-signal--danger' : ''}`}>
                <span>{tr("signal")}</span>
                <strong>{isHumanTurn ? tr("yourTurn") : gameState.players[gameState.currentPlayerIndex]?.name || 'PLAYER'}</strong>
                <span className="rp-turn-seconds" aria-label={tr('secondsRemainingLabel', { count: turnTimeLeft })}>{turnTimeLeft}S</span>
              </div>
            )
          )}
        </div>

        {/* HUMAN PLAYER (BOTTOM CENTER) */}
        {!isSpectator && humanPlayer && (
          <div className="rp-local-position absolute z-30" data-seat-slot={9}>
            {humanHandEval && (
              <div className="rp-hand-rank px-2 py-0.5 text-[7.5px] font-black uppercase tracking-wider">
                <span>{describePokerHand(humanHandEval, tr)}</span>
              </div>
            )}
            {/* Own cards and identity are the strongest visual layer. */}
            <div className="rp-local-player flex items-end gap-2">
              <div className="rp-local-cards">
                <LocalPokerHand cards={humanPlayer.holeCards || []} folded={humanPlayer.folded} eliminated={humanPlayer.eliminated} reduced={Boolean(reduceMotion)} winningCardIds={presentation.winnerReady ? gameState.winningCardIds : []} />
              </div>

              <ResistancePlayerSeat
                player={humanPlayer}
                state={humanAvatarState}
                active={isHumanTurn}
                dealer={gameState.players[gameState.dealerIndex]?.id === humanPlayer.id}
                blind={gameState.players[gameState.smallBlindIndex]?.id === humanPlayer.id ? 'SB' : gameState.players[gameState.bigBlindIndex]?.id === humanPlayer.id ? 'BB' : undefined}
                turnProgress={humanTurnProgress}
                turnSeconds={turnTimeLeft}
                photoUrl={telegramPhotoUrl}
                compact={false}
                showCards={false}
                reaction={reactions[humanPlayer.userId || humanPlayer.id] ? <EmojiDisplayBadge emoji={reactions[humanPlayer.userId || humanPlayer.id].emojiId} key={reactions[humanPlayer.userId || humanPlayer.id].key} resistance /> : null}
                displayBalance={chipView.balances[humanPlayer.id]}
              />
            </div>
          </div>
        )}

        <ChipField state={gameState} view={chipView} />
        {['ended', 'match_ended'].includes(gameState.stage) && resultRevealReady && !chipView.busy && (
          <PokerHandResult state={gameState} countdown={nextHandCountdown} onNextHand={onNextHand} onLobby={handleReturnToLobby} />
        )}
      </PokerTable>

      {/* 4. RAISE SELECTION DRAWER POPUP */}
      <AnimatePresence>
        {showRaisePanel && (
          <RaiseControl>
            <div className="rp-panel-heading flex justify-between items-center text-[9px] font-black">
              <span>{tr("raiseControl")}</span>
              <div className="rp-control-packet flex items-center gap-1 text-[10px] px-2 py-0.5 border">
                <span>{tr("total")}</span>
                <ChipStackIcon className="w-3 h-3" />
                <PixelCounter value={customRaiseAmount} />
              </div>
            </div>

            {/* Quick Multiplier Presets */}
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: `+${gameState.minRaise} MIN`, amt: gameState.currentBet + gameState.minRaise },
                { label: '1/2 POT', amt: gameState.currentBet + Math.max(gameState.bigBlindAmount, Math.ceil(gameState.pot / 2)) },
                { label: '3/4 POT', amt: gameState.currentBet + Math.max(gameState.bigBlindAmount, Math.ceil(gameState.pot * 0.75)) },
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
                  className="rp-raise-preset py-1.5 text-[8px] font-black uppercase cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Stepper with - / Slider / + */}
            <div className="rp-stepper flex items-center gap-2 p-1.5 border">
              <button
                type="button"
                onClick={() => {
                  sound.playPop();
                  setCustomRaiseAmount((prev) =>
                    Math.max(gameState.currentBet + gameState.minRaise, prev - 1)
                  );
                }}
                className="rp-stepper-button w-11 h-11 flex items-center justify-center font-black"
                aria-label={tr("decreaseRaise")}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min={gameState.currentBet + gameState.minRaise}
                max={humanPlayer.chips + humanPlayer.currentBet}
                step={1}
                value={customRaiseAmount}
                onChange={(e) => setCustomRaiseAmount(Number(e.target.value))}
                className="rp-raise-range w-full cursor-pointer"
                aria-label={tr("raiseAmount")}
              />

              <button
                type="button"
                onClick={() => {
                  sound.playPop();
                  setCustomRaiseAmount((prev) =>
                    Math.min(humanPlayer.chips + humanPlayer.currentBet, prev + 1)
                  );
                }}
                className="rp-stepper-button w-11 h-11 flex items-center justify-center font-black"
                aria-label={tr("increaseRaise")}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <label className="rp-direct-raise-label" htmlFor="poker-direct-raise">{tr("directAmount")}<input
                id="poker-direct-raise"
                type="number"
                min={gameState.currentBet + gameState.minRaise}
                max={humanPlayer.chips + humanPlayer.currentBet}
                step={1}
                value={customRaiseAmount}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setCustomRaiseAmount(Math.max(
                    gameState.currentBet + gameState.minRaise,
                    Math.min(humanPlayer.chips + humanPlayer.currentBet, value)
                  ));
                }}
                className="rp-number-input bg-black border px-2 text-center"
              />
            </label>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  playPokerFeedback('ui_cancel');
                  setShowRaisePanel(false);
                }}
                className="rp-secondary-button w-1/3 py-2.5 text-[9px] font-bold uppercase cursor-pointer"
              >{tr("cancel")}</button>
              <button
                type="button"
                onClick={() => {
                  clearPreAction();
                  setShowRaisePanel(false);
                  playPokerFeedback('bet_move');
                  showPreActionNotice(uiMessage('raiseTransmitted', { amount: customRaiseAmount }), 'signal');
                  onRaise(customRaiseAmount);
                }}
                className="rp-primary-button w-2/3 py-2.5 font-black text-[10px] uppercase cursor-pointer flex items-center justify-center gap-1"
              >
                <span>{tr("confirmRaise")}</span>
                <div className="flex items-center gap-0.5 bg-black/30 px-1.5 py-0.5 text-[9px]">
                  <ChipStackIcon className="w-2.5 h-2.5" />
                  <span>{customRaiseAmount}</span>
                </div>
              </button>
            </div>
          </RaiseControl>
        )}
      </AnimatePresence>

      {/* 5. PLAYER TURN ACTION CONTROLS */}
      {gameState.stage !== 'idle' && gameState.stage !== 'ended' && gameState.stage !== 'match_ended' && !gameState.isMatchOver && !showRaisePanel && (isHumanTurn || canQueuePreAction || isSpectator) && (
        <BetControls>
          {isHumanTurn && <div className="flex justify-between items-center text-[8.5px] font-bold">
            <span className="text-white font-black">
              {tr('turnSeconds', { seconds: turnTimeLeft })}
            </span>
            {callNeeded > 0 && (
              <div className="flex items-center gap-1 text-[#ff8a82]">
                <span>CALL:</span>
                <ChipStackIcon className="w-2.5 h-2.5" />
                <strong>{callNeeded}</strong>
              </div>
            )}
          </div>}

          {canQueuePreAction && (
            <div className="rp-pre-actions" aria-label={tr("preliminaryActions")}>
              <span className="rp-pre-actions__label"><PixelTextReveal>{tr("queueNextMove")}</PixelTextReveal></span>
              <div className="rp-pre-actions__buttons">
                <button
                  type="button"
                  aria-pressed={preAction === 'fold'}
                  onClick={() => togglePreAction('fold')}
                  className={`rp-pre-action rp-pre-action--fold${preAction === 'fold' ? ' rp-pre-action--selected' : ''}`}
                >
                  <PixelSnap>PRE-FOLD</PixelSnap>
                </button>
                <button
                  type="button"
                  aria-pressed={preAction === 'check'}
                  disabled={!canQueuePreCheck}
                  onClick={() => togglePreAction('check')}
                  className={`rp-pre-action rp-pre-action--check${preAction === 'check' ? ' rp-pre-action--selected' : ''}`}
                >
                  <PixelSnap>PRE-CHECK</PixelSnap>
                </button>
              </div>
              <span className="rp-pre-actions__hint">
                {!canQueuePreCheck ? tr("preCheckLocked") : tr("preCheckCancels")}
              </span>
            </div>
          )}

          {isSpectator && isPersistentCashTable && (
            <button
              type="button"
              onClick={handleTakeSeat}
              className="rp-primary-button rp-spectator-join w-full px-4 py-2.5 font-black uppercase text-[10px]"
            >{tr("takeSeat")}</button>
          )}

          {isSpectator && !isPersistentCashTable && (
            <div className="rp-system-module w-full px-3 py-2 text-center font-black uppercase text-[9px]">{tr("spectatingLocked")}</div>
          )}

          {isHumanTurn && <div className="grid grid-cols-3 gap-1.5">
            {/* FOLD */}
            <ActionButton
              tone="fold"
              disabled={!canCallOrCheck}
              onClick={() => {
                clearPreAction();
                playPokerFeedback('fold');
                showPreActionNotice(uiMessage('foldTransmitted'), 'danger');
                onFold();
              }}
            >
              FOLD
            </ActionButton>

            {/* CHECK / CALL */}
            <ActionButton
              tone="primary"
              disabled={!canCallOrCheck}
              onClick={() => {
                clearPreAction();
                playPokerFeedback(callNeeded === 0 ? 'ui_confirm' : 'bet_move');
                showPreActionNotice(callNeeded === 0 ? uiMessage('checkLocked') : uiMessage('callTransmitted', { amount: callNeeded }), 'signal');
                onCallOrCheck();
              }}
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
            </ActionButton>

            {/* RAISE BUTTON */}
            <ActionButton
              tone="raise"
              disabled={!canCallOrCheck || humanPlayer.chips <= callNeeded}
              onClick={() => {
                clearPreAction();
                playPokerFeedback('ui_click');
                setCustomRaiseAmount(gameState.currentBet + gameState.minRaise);
                setShowRaisePanel(true);
              }}
            >
              <span>RAISE</span>
              <ArrowUpRight className="w-3 h-3" />
            </ActionButton>
          </div>}
        </BetControls>
      )}

      {/* 6. MATCH CHAMPION / ROUND END CONTROLS */}
      {resultRevealReady && !chipView.busy && (gameState.stage === 'match_ended' || gameState.isMatchOver) && (
        <div className="rp-result-panel border-2 p-3 z-20 flex flex-col gap-2">
          <div className="text-center">
            <span className="rp-panel-heading text-[10px] font-black uppercase tracking-wider block">
              {gameState.matchWinnerName ? tr('wonMatchName', { name: gameState.matchWinnerName }) : tr("pokerConcluded")}
            </span>
            {gameState.winningHandDesc && (
              <span className="text-[9px] text-slate-300 block mt-0.5">
                {translateTableEvent(gameState.winningHandDesc, tr)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleReturnToLobby}
            className="rp-primary-button w-full py-2.5 font-black text-[10px] uppercase cursor-pointer"
          >{tr("returnLobbyArrow")}</button>
        </div>
      )}

      {resultRevealReady && !chipView.busy && gameState.stage === 'ended' && !gameState.isMatchOver && (
        <div className="rp-result-panel border p-2 z-20 flex flex-col gap-1.5">
          <div className="text-center text-[8.5px] font-bold text-slate-200">
            <span>{translateTableEvent(gameState.winningHandDesc || 'Round completed! Dealing next hand...', tr)}</span>
          </div>
          {gameState.mode === 'offline' && onNextHand && (
            <button
              type="button"
              onClick={onNextHand}
              className="rp-primary-button w-full py-2 font-black text-[9px] uppercase cursor-pointer"
            >{tr("nextHandArrow")}</button>
          )}
          {gameState.mode !== 'offline' && (
            <div className="rp-system-module w-full py-2 text-center font-black text-[9px] uppercase">
              {gameState.nextRoundStartsAt ? tr('nextHandSeconds', { seconds: nextHandCountdown }) : tr("waitingOpponent")}
            </div>
          )}
        </div>
      )}
      <QuickEmojiPanel onSendEmoji={handleSendEmoji} className="absolute bottom-2 left-2 z-40" resistance />

      {/* BUY IN MODAL */}
      <AnimatePresence>
        {showBuyInModal && (
          <motion.div
            initial={reduceMotion ? false : { clipPath: 'inset(50% 50%)' }} animate={reduceMotion ? undefined : { clipPath: 'inset(0 0)' }} exit={reduceMotion ? undefined : { clipPath: 'inset(50% 50%)' }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'linear' }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80"
          >
            <PixelModal
              labelledBy="poker-buy-in-title"
              onRequestClose={handleCloseBuyInModal}
              className="flex flex-col items-center gap-3 w-72"
            >
              <h2 id="poker-buy-in-title" className="rp-modal__header rp-panel-heading font-black text-xs uppercase text-center w-full border-b border-slate-700 pb-2">{tr("secureEntry")}</h2>
              <div className="rp-modal__content text-center w-full space-y-1">
                <div className="text-[9px] text-slate-300">{tr("balance")}{' '}<span className="text-white font-bold">{(profile?.casinoChips || 0).toFixed(0)}{' '}{tr("chips")}</span></div>
                <div className="text-[9px] text-slate-300">{tr("tickets")}{' '}<span className="text-slate-100 font-bold">{(profile?.availableTickets || 0).toFixed(2)} TKT</span></div>
              </div>
              
              {gameState.matchId.includes('-free-') ? (
                <div className="rp-modal__content rp-info-module flex flex-col gap-1 w-full p-3 text-center">
                  <p className="text-white text-[10px]">{tr("cost")}{' '}<span className="text-white font-black">{tr("twoEnergy")}</span>
                  </p>
                  <p className="text-white text-[10px]">{tr("youReceive")}{' '}<span className="text-[#ff6a61] font-black">{tr("freeChips")}</span>
                  </p>
                </div>
              ) : gameState.matchId.includes('-practice-') ? (
                <div className="rp-modal__content rp-info-module flex flex-col gap-1 w-full p-3 text-center">
                  <p className="text-white text-[10px]">{tr("cost")}{' '}<span className="text-white font-black">{tr("free")}</span>
                  </p>
                  <p className="text-white text-[10px]">{tr("youReceive")}{' '}<span className="text-[#ff6a61] font-black">{tr("practiceChips")}</span>
                  </p>
                </div>
              ) : (
                <div className="rp-modal__content rp-info-module flex flex-col gap-1 w-full p-2">
                  <div className="text-[8px] text-slate-400 mb-1 font-bold">{tr("convertDescription")}</div>
                  <div className="flex gap-2">
                    <input
                      aria-label={tr("ticketsToConvert")}
                      type="number"
                      min={1}
                      step={1}
                      value={exchangeAmount}
                      onChange={e => setExchangeAmount(Number(e.target.value))}
                      className="rp-number-input bg-black border font-bold px-2 py-1 text-center text-[10px] w-full"
                    />
                    <button 
                      onClick={handleExchange} 
                      disabled={isExchanging}
                      className="rp-secondary-button px-2 py-1 text-[8px] font-bold uppercase disabled:opacity-50 whitespace-nowrap"
                    >{tr("convert")}</button>
                  </div>
                </div>
              )}

              {gameState.matchId.includes('-public-') && (
                <div className="rp-modal__content flex flex-col gap-1 w-full mt-2">
                  <label htmlFor="poker-buy-in-amount" className="text-[8px] text-slate-400 font-bold">{tr("tableChips")}</label>
                  <input
                    id="poker-buy-in-amount"
                    type="number"
                    min={100}
                    step={50}
                    value={buyInAmount}
                    onChange={e => setBuyInAmount(Number(e.target.value))}
                    className="rp-number-input bg-black border font-bold px-2 py-1.5 text-center text-[10px] w-full"
                  />
                </div>
              )}
              <div className="rp-modal__actions flex gap-2 w-full mt-2">
                <button data-modal-cancel onClick={handleCloseBuyInModal} className="rp-secondary-button flex-1 px-2 py-2 text-[9px] font-bold uppercase">{isJoiningSeat ? tr("background") : tr("cancelSentence")}</button>
                <button 
                  disabled={isJoiningSeat}
                  onClick={() => {
                    let chipsToBuyIn = buyInAmount;
                    if (gameState.matchId.includes('-free-')) chipsToBuyIn = 100;
                    if (gameState.matchId.includes('-practice-')) chipsToBuyIn = 1000;
                    void handleConfirmBuyIn(chipsToBuyIn);
                  }}
                  className="rp-primary-button flex-1 px-2 py-2 text-[9px] font-bold uppercase disabled:opacity-60"
                >
                  {isJoiningSeat ? <PixelLoader label="JOINING TABLE" /> : tr("joinTable")}
                </button>
              </div>
              {seatJoinError && <div className="w-full text-center text-[8px] text-red-300">{renderError(seatJoinError)}</div>}
            </PixelModal>
          </motion.div>
        )}
      </AnimatePresence>
    </ScreenShake>
  );
}
