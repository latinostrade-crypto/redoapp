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
import { RotateCcw, Volume2, VolumeX, ArrowUpRight, Play, Plus, Minus, History, UserPlus } from 'lucide-react';
import { evaluate7CardHand } from '../utils/pokerEvaluator';
import { QuickEmojiPanel, EmojiDisplayBadge, EmojiItem } from './QuickEmojiPanel';
import { useMatchEmoji } from '../hooks/useMatchEmoji';
import { usePokerReactions } from '../hooks/usePokerReactions';
import { useTelegramSafeArea } from '../hooks/useTelegramSafeArea';
import { playPokerFeedback } from '../utils/pokerFeedback';
import { ResistanceAvatar, ResistanceAvatarState } from './poker/ResistanceAvatar';
import { TapPixelDust } from './poker/TapPixelDust';
import { ResistancePlayerSeat } from './poker/ResistancePlayerSeat';
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
import { ActionButton, BetControls, RaiseControl, PokerDialog } from './poker/PokerControls';
import {
  ConnectionStatus,
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
  onPracticeRebuy?: () => void;
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
  onPracticeRebuy,
  onReturnToLobby,
  onInvite,
}: PokerGameProps) {
  const { t, tr, renderMessage, renderError } = useLanguage();
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = forceReducedMotion || systemReduceMotion;
  const presentation = usePokerPresentation(gameState, Boolean(reduceMotion));
  const chipView = useChipTimeline(gameState, Boolean(reduceMotion), presentation.payoutAt);
  const telegramSafeArea = useTelegramSafeArea();
  const [audioMode, setAudioMode] = useState(() => sound.getPokerAudioMode());
  const [showRaisePanel, setShowRaisePanel] = useState(false);
  const [showHandHistory, setShowHandHistory] = useState(false);
  const [showPreviousHand, setShowPreviousHand] = useState(false);
  const [previousHand, setPreviousHand] = useState<PokerGameState | null>(null);
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
  const completedHandSignatureRef = useRef('');
  const lastSoundEventSequenceRef = useRef<number | null>(null);
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
  const [isRebuy, setIsRebuy] = useState(false);
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState(200);
  const [isJoiningSeat, setIsJoiningSeat] = useState(false);
  const [seatJoinError, setSeatJoinError] = useState<UiMessage>('');
  const seatRequestIdRef = useRef('');
  const { profile, fetchProfile } = useUserProfile();
  const telegramPhotoUrl = humanPlayer.photoUrl
    || profile?.telegramPhotoUrl
    || (window as typeof window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { photo_url?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url
    || null;
  const isPersistentCashTable = String(gameState.matchId || gameState.tableId || '').startsWith('table-poker-');
  const isPracticeGame = gameState.mode === 'offline' && !gameState.matchId && !gameState.tableId;
  const canRebuy = !isSpectator && humanPlayer.chips === 0 && !humanPlayer.rebuyPending
    && humanPlayer.isConnected !== false
    && (gameState.stage === 'idle' || gameState.stage === 'ended' || humanPlayer.eliminated);
  const canOfferRebuy = canRebuy && (isPersistentCashTable || (isPracticeGame && Boolean(onPracticeRebuy)));
  const stakeUsesChips = isPersistentCashTable;
  const isFreeChipTable = stakeUsesChips && String(gameState.matchId || gameState.tableId).includes('-free-');
  const rebuyUnaffordable = isRebuy && Boolean(profile) && (
    (isFreeChipTable && (profile?.energy?.energy || 0) < 2)
    || (!isFreeChipTable && (profile?.casinoChips || 0) < buyInAmount)
  );

  useEffect(() => () => {
    sequenceTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (preActionNoticeTimerRef.current !== null) window.clearTimeout(preActionNoticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!['ended', 'match_ended'].includes(gameState.stage)) return;
    const signature = `${gameState.visualEpoch || 0}:${gameState.roundEndTimestamp || 0}:${gameState.winnerIds.join(',')}`;
    if (completedHandSignatureRef.current === signature) return;
    completedHandSignatureRef.current = signature;
    setPreviousHand(gameState);
  }, [gameState]);

  useEffect(() => {
    const events = gameState.visualEvents || [];
    const newestSequence = events.reduce((max, event) => Math.max(max, event.sequence), -1);
    if (lastSoundEventSequenceRef.current === null) {
      lastSoundEventSequenceRef.current = newestSequence;
      return;
    }
    const fresh = events.filter(event => event.sequence > (lastSoundEventSequenceRef.current ?? -1)).sort((a, b) => a.sequence - b.sequence);
    for (const event of fresh) {
      const source = event.playerId === humanPlayer.id || event.playerId === humanPlayer.userId ? 'self' : event.playerId ? 'opponent' : 'system';
      const message = event.message.toLowerCase();
      if (source === 'self' && (event.type === 'action' || event.type === 'fold')) continue;
      if (event.type === 'fold') playPokerFeedback('fold', source);
      else if (event.type === 'deal' || event.type === 'community_card') playPokerFeedback('card_deal', source);
      else if (event.type === 'showdown') playPokerFeedback('showdown', source);
      else if (event.type === 'action' && message.includes('all-in')) playPokerFeedback('all_in', source);
      else if (event.type === 'action' && /(raise|raised|call|called|bet)/.test(message)) playPokerFeedback('bet_move', source);
      else if (event.type === 'action') playPokerFeedback('ui_confirm', source);
    }
    lastSoundEventSequenceRef.current = newestSequence;
  }, [gameState.visualEvents, humanPlayer.id, humanPlayer.userId]);

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
        playPokerFeedback('player_join', 'opponent');
        return;
      }
      if (before.connected && !after.connected) playPokerFeedback('player_disconnect', 'opponent');
      if (!before.connected && after.connected) playPokerFeedback('player_join', 'opponent');
      if (!before.eliminated && after.eliminated) playPokerFeedback('player_eliminated', 'opponent');
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
    setIsRebuy(false);
    setShowBuyInModal(true);
    void fetchProfile();
  };

  const handleStartRebuy = useCallback(() => {
    if (!isPersistentCashTable && !isPracticeGame) return;
    if (!isPersistentCashTable) {
      onPracticeRebuy?.();
      return;
    }
    try {
      const pending = JSON.parse(localStorage.getItem('redoapp_poker_rebuy_' + gameState.matchId) || 'null');
      seatRequestIdRef.current = pending?.key || '';
      if (pending?.chips) setBuyInAmount(pending.chips);
    } catch { /* Storage is optional. */ }
    setIsRebuy(true);
    setSeatJoinError('');
    setShowBuyInModal(true);
    void fetchProfile();
  }, [fetchProfile, gameState.matchId, isPersistentCashTable, isPracticeGame, onPracticeRebuy]);

  const handleCloseBuyInModal = useCallback(() => {
    playPokerFeedback('ui_cancel');
    setShowBuyInModal(false);
  }, []);

  const handleConfirmBuyIn = async (requestedChips = buyInAmount) => {
    if (isJoiningSeat) return;
    setIsJoiningSeat(true);
    setSeatJoinError('');
    if (isRebuy) {
      try {
        const pending = JSON.parse(localStorage.getItem('redoapp_poker_rebuy_' + gameState.matchId) || 'null');
        if (pending?.key) { seatRequestIdRef.current = pending.key; requestedChips = pending.chips; }
      } catch { /* Storage is optional; the current request still remains idempotent. */ }
    }
    if (!seatRequestIdRef.current) seatRequestIdRef.current = `seat-${gameState.matchId}-${crypto.randomUUID()}`;
    if (isRebuy) {
      try { localStorage.setItem('redoapp_poker_rebuy_' + gameState.matchId, JSON.stringify({key: seatRequestIdRef.current, chips: requestedChips})); } catch {}
    }
    try {
      const res = await apiRequest<{success: boolean; tableId: string; joined?: boolean; message?: string}>(isRebuy ? '/api/casino/poker-rebuy' : '/api/casino/join-table', {
        method: 'POST',
        retryOnNetworkError: true,
        networkAttempts: 1,
        timeoutMs: 20_000,
        body: JSON.stringify({ tableId: gameState.matchId, chips: requestedChips, idempotencyKey: seatRequestIdRef.current })
      });
      if (res.success) {
        setShowBuyInModal(false);
        seatRequestIdRef.current = '';
        if (isRebuy) { try { localStorage.removeItem('redoapp_poker_rebuy_' + gameState.matchId); } catch {} }
        await fetchProfile();
        window.dispatchEvent(new CustomEvent('redoapp:casino-seat-taken', { detail: { tableId: gameState.matchId } }));
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '';
      if (isRebuy && /Not enough|Buy-in must|Rebuy is available|Invalid poker rebuy|request has expired/i.test(message)) {
        seatRequestIdRef.current = '';
        try { localStorage.removeItem('redoapp_poker_rebuy_' + gameState.matchId); } catch {}
      }
      if (!isRebuy && /timed out|interrupted/i.test(message) && gameState.matchId) {
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
      setSeatJoinError(
        /Not enough energy/i.test(message) ? uiMessage('pokerNotEnoughEnergy')
          : /Not enough casino chips/i.test(message) ? uiMessage('pokerNotEnoughChips')
          : /request has expired/i.test(message) ? uiMessage('pokerRebuyExpired')
          : /Rebuy is available|Invalid poker rebuy/i.test(message) ? uiMessage('pokerRebuyUnavailable')
          : err instanceof Error ? err.message.replace(/\s*\[[^\]]+\]$/, '') : uiMessage('seatTakeFailed')
      );
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
  const maxRaiseTotal = humanPlayer.chips + humanPlayer.currentBet;
  const minRaiseTotal = Math.min(maxRaiseTotal, gameState.currentBet + gameState.minRaise);
  useEffect(() => {
    setShowRaisePanel(false);
  }, [canCallOrCheck, gameState.matchId, gameState.turnStartedAt]);
  useEffect(() => {
    setCustomRaiseAmount((amount) => Math.max(minRaiseTotal, Math.min(maxRaiseTotal, amount)));
  }, [minRaiseTotal, maxRaiseTotal]);
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

  const cycleAudioMode = () => {
    const next = audioMode === 'all' ? 'self' : audioMode === 'self' ? 'muted' : 'all';
    sound.setPokerAudioMode(next);
    setAudioMode(next);
    if (next !== 'muted') playPokerFeedback('ui_click', 'ui');
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
      className={`resistance-poker${reduceMotion ? ' resistance-poker--reduced-motion' : ''} w-full max-w-md mx-auto flex flex-col justify-start gap-1 border-4 border-black p-2 relative overflow-hidden select-none text-white shadow-[0_0_25px_rgba(0,0,0,0.95)]`}
      style={{
        ...pixelMaskStyle,
        '--tg-safe-top': `${telegramSafeArea.top}px`,
        '--tg-safe-right': `${telegramSafeArea.right}px`,
        '--tg-safe-bottom': `${telegramSafeArea.bottom}px`,
        '--tg-safe-left': `${telegramSafeArea.left}px`,
      } as React.CSSProperties}
    >
      <TapPixelDust />
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
      <header className="rp-header z-20" aria-label={t('Poker table controls')}>
        <div className="rp-header-nav">
          <button
            type="button"
            onClick={handleReturnToLobby}
            className="rp-header-action rp-header-action--icon cursor-pointer"
            aria-label={tr('lobby')}
            title={tr('lobby')}
          >
            <RotateCcw />
          </button>
          {onInvite && <button type="button" onClick={onInvite} className="rp-header-action rp-header-action--icon" aria-label={tr('invite')} title={tr('invite')}><UserPlus /></button>}
          <button type="button" onClick={() => setShowHandHistory(true)} className="rp-header-action rp-header-action--icon" aria-label={t("Hand history")} title={t("Hand history")}>
            <History />
          </button>
        </div>

        <span className="rp-mode-label">
          <strong>HOLD'EM</strong>
          <small>{tr(gameState.mode === 'offline' ? 'modePractice' : gameState.mode === 'private' ? 'privateRoom' : 'tabPvp')}</small>
        </span>

        <div className="rp-header-tools">
          <span className="rp-stake-label text-[8px] font-black flex items-center gap-1 px-1.5 py-0.5">
            {stakeUsesChips ? (
              <ChipValue
                amount={gameState.stake}
                iconClassName="w-3 h-3"
                prefix={isFreeChipTable ? <span>{tr("freePrefix")}</span> : null}
                suffix={!isFreeChipTable ? <span>{tr('minimumShort')}</span> : null}
              />
            ) : gameState.stake === 0 ? <span>{tr("freeUpper")}</span> : <span className="inline-flex items-center gap-1"><ChipStackIcon />{Math.round(gameState.stake * 100)}</span>}
          </span>

          <button
            type="button"
            onClick={cycleAudioMode}
            aria-label={audioMode === 'all' ? t('All poker sounds. Switch to my sounds only.') : audioMode === 'self' ? t('My sounds only. Switch to mute.') : t('Poker muted. Switch to all sounds.')}
            aria-pressed={audioMode === 'muted'}
            data-audio-mode={audioMode}
            title={audioMode === 'all' ? t('All sounds') : audioMode === 'self' ? t('My sounds only') : t('Muted')}
            className={`rp-header-sound pixel-btn-interactive cursor-pointer ${
              audioMode === 'muted' ? 'bg-red-950/40 text-red-400' : audioMode === 'self' ? 'bg-amber-950/40 text-amber-300' : 'bg-slate-900 text-slate-200'
            }`}
          >
            {audioMode === 'muted' ? <VolumeX /> : <Volume2 />}
            <span>{audioMode === 'muted' ? 'OFF' : audioMode === 'self' ? 'ME' : 'ALL'}</span>
          </button>
          <LanguageSwitch compact />
        </div>
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

          const practiceSlotMap: Record<number, number[]> = {
            1: [4],
            2: [2, 6],
            3: [1, 4, 7],
            4: [0, 3, 5, 8],
            5: [0, 2, 4, 6, 8],
            6: [0, 1, 3, 5, 7, 8],
            7: [0, 1, 2, 4, 6, 7, 8],
            8: [0, 1, 2, 3, 5, 6, 7, 8],
            9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
          };
          const visiblePositions = gameState.mode === 'offline' && !isSpectator
            ? (practiceSlotMap[opponents.length] || practiceSlotMap[9])
            : Array.from({ length: isSpectator ? 10 : 9 }, (_, index) => index);

          return (
            <>
              {visiblePositions.map((seatSlot, opponentIndex) => {
                const opponent = opponents[opponentIndex];
                if (opponent) return renderOpponentView(opponent, seatSlot);
                return null;
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
            <QuickEmojiPanel onSendEmoji={handleSendEmoji} className="rp-avatar-reaction-control" resistance iconOnly />
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
          <PokerHandResult state={gameState} countdown={nextHandCountdown} onNextHand={onNextHand}
            onRebuy={canOfferRebuy ? handleStartRebuy : undefined} onLobby={handleReturnToLobby} />
        )}
      </PokerTable>

      {/* 4. RAISE SELECTION DRAWER POPUP */}
      <AnimatePresence>
        {showRaisePanel && canCallOrCheck && (
          <RaiseControl onClose={() => setShowRaisePanel(false)} label={tr("raiseControl")} safeBottom={telegramSafeArea.bottom}>
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
                    setCustomRaiseAmount(Math.max(minRaiseTotal, Math.min(maxRaiseTotal, preset.amt)));
                  }}
                  className="rp-raise-preset py-1.5 text-[8px] font-black uppercase cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Stepper with - / Slider / + */}
            <div className="rp-stepper flex items-center gap-1.5 p-1 border">
              <button
                type="button"
                onClick={() => {
                  sound.playPop();
                  setCustomRaiseAmount((prev) =>
                    Math.max(minRaiseTotal, prev - 1)
                  );
                }}
                className="rp-stepper-button w-10 h-10 flex items-center justify-center font-black"
                aria-label={tr("decreaseRaise")}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min={minRaiseTotal}
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
                className="rp-stepper-button w-10 h-10 flex items-center justify-center font-black"
                aria-label={tr("increaseRaise")}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <label className="rp-direct-raise-label" htmlFor="poker-direct-raise">{tr("directAmount")}<input
                id="poker-direct-raise"
                type="number"
                min={minRaiseTotal}
                max={humanPlayer.chips + humanPlayer.currentBet}
                step={1}
                value={customRaiseAmount}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setCustomRaiseAmount(Math.max(
                    minRaiseTotal,
                    Math.min(maxRaiseTotal, Math.floor(value))
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

      {canOfferRebuy && (
        <BetControls>
          <p className="text-[10px] text-center">{tr('pokerStackEmpty')}</p>
          <button type="button" className="rp-primary-button w-full px-3 py-2 text-[10px] font-black"
            onClick={handleStartRebuy}>
            {tr(isPersistentCashTable ? 'pokerRebuy' : 'pokerPracticeRefill')}
          </button>
        </BetControls>
      )}
      {humanPlayer.rebuyPending && <div className="rp-system-module p-3 text-center text-[10px]" role="status">{tr('pokerRebuyQueued')}</div>}

      {/* Seating remains available while waiting and between hands. */}
      {isSpectator && isPersistentCashTable && <BetControls>
        <button type="button" onClick={handleTakeSeat} disabled={isJoiningSeat}
          className="rp-primary-button rp-spectator-join w-full px-4 py-2.5 font-black uppercase text-[10px]">
          {tr("takeSeat")}
        </button>
      </BetControls>}

      {/* 5. PLAYER TURN ACTION CONTROLS */}
      {gameState.stage !== 'idle' && gameState.stage !== 'ended' && gameState.stage !== 'match_ended' && !gameState.isMatchOver && !showRaisePanel && (isHumanTurn || canQueuePreAction || (isSpectator && !isPersistentCashTable)) && (
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
                setCustomRaiseAmount(minRaiseTotal);
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
      <AnimatePresence>
        {showHandHistory && <PokerDialog label={t("Hand history")} onClose={() => setShowHandHistory(false)} safeBottom={telegramSafeArea.bottom}>
          <section className="rp-modal rp-hand-history" aria-labelledby="poker-history-title">
            <header>
              <h2 id="poker-history-title">{t("HAND HISTORY")}</h2>
              <div>
                <button type="button" className="rp-hand-history__previous" disabled={!previousHand} onClick={() => { setShowHandHistory(false); setShowPreviousHand(true); }}>{t("PREVIOUS HAND")}</button>
                <button type="button" onClick={() => setShowHandHistory(false)} aria-label={t("Close hand history")}>×</button>
              </div>
            </header>
            <ol>{gameState.logs.length ? gameState.logs.map(log => {
              const message = translateGameLabel(log.message, tr);
              const playerIndex = gameState.players.findIndex(player => message.toLocaleLowerCase().startsWith(player.name.toLocaleLowerCase()));
              const player = playerIndex >= 0 ? gameState.players[playerIndex] : null;
              return <li key={log.id} data-kind={log.type}>
                <time>{new Date(log.timestamp).toString() === 'Invalid Date' ? log.timestamp : new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                <span>{player ? <><strong data-player-color={playerIndex % 6}>{player.name}</strong>{message.slice(player.name.length)}</> : message}</span>
              </li>;
            }) : <li><span>{t("No hand events yet.")}</span></li>}</ol>
          </section>
        </PokerDialog>}
      </AnimatePresence>
      {showPreviousHand && previousHand && <PokerHandResult state={previousHand} countdown={0} reviewOnly onLobby={() => setShowPreviousHand(false)} />}

      {/* BUY IN MODAL */}
      <AnimatePresence>
        {showBuyInModal && (
          <PokerDialog label={tr(isRebuy ? 'pokerRebuy' : 'secureEntry')} onClose={handleCloseBuyInModal} safeBottom={telegramSafeArea.bottom}>
            <div className="rp-modal flex flex-col items-center gap-3 w-full p-3">
              <h2 id="poker-buy-in-title" className="rp-modal__header rp-panel-heading font-black text-xs uppercase text-center w-full border-b border-slate-700 pb-2">{tr(isRebuy ? "pokerRebuy" : "secureEntry")}</h2>
              {isRebuy && <p className="text-[10px] text-center">{tr('pokerRebuyQueued')}</p>}
              <div className="rp-modal__content text-center w-full space-y-1">
                {isFreeChipTable && <div className="text-[10px] inline-flex items-center gap-1" aria-label={tr('pokerEnergyBalance', { amount: profile?.energy?.energy || 0 })}><span aria-hidden="true">⚡</span>{profile?.energy?.energy || 0}</div>}
                <div className="text-[9px] text-slate-300">{tr("balance")}{' '}<span className="text-white font-bold inline-flex items-center gap-1"><ChipStackIcon className="w-3 h-3" />{(profile?.casinoChips || 0).toFixed(0)}</span></div>
              </div>
              
              {gameState.matchId.includes('-free-') ? (
                <div className="rp-modal__content rp-info-module flex flex-col gap-1 w-full p-3 text-center">
                  <p className="text-white text-[10px]">{tr("cost")}{' '}<span className="text-white font-black">⚡ 2</span>
                  </p>
                  <p className="text-white text-[10px]">{tr("youReceive")}{' '}<span className="text-[#ff6a61] font-black inline-flex items-center gap-1">100 <ChipStackIcon className="w-3 h-3" /></span>
                  </p>
                </div>
              ) : gameState.matchId.includes('-practice-') ? (
                <div className="rp-modal__content rp-info-module flex flex-col gap-1 w-full p-3 text-center">
                  <p className="text-white text-[10px]">{tr("cost")}{' '}<span className="text-white font-black">{tr("free")}</span>
                  </p>
                  <p className="text-white text-[10px]">{tr("youReceive")}{' '}<span className="text-[#ff6a61] font-black inline-flex items-center gap-1">1000 <ChipStackIcon className="w-3 h-3" /></span>
                  </p>
                </div>
              ) : null}

              {gameState.matchId.includes('-public-') && (
                <div className="rp-modal__content flex flex-col gap-1 w-full mt-2">
                  <label htmlFor="poker-buy-in-amount" className="text-[8px] text-slate-400 font-bold inline-flex items-center gap-1">{tr("bringToTable")} <ChipStackIcon className="w-3 h-3" /></label>
                  <input
                    id="poker-buy-in-amount"
                    disabled={isJoiningSeat || (isRebuy && Boolean(seatRequestIdRef.current))}
                    type="number"
                    min={50}
                    max={100000}
                    step={1}
                    value={buyInAmount}
                    onChange={e => setBuyInAmount(Number(e.target.value))}
                    className="rp-number-input bg-black border font-bold px-2 py-1.5 text-center text-[10px] w-full"
                  />
                </div>
              )}
              <div className="rp-modal__actions flex gap-2 w-full mt-2">
                <button data-modal-cancel onClick={handleCloseBuyInModal} className="rp-secondary-button flex-1 px-2 py-2 text-[9px] font-bold uppercase">{isJoiningSeat ? tr("background") : tr("cancelSentence")}</button>
                <button 
                  disabled={isJoiningSeat || rebuyUnaffordable}
                  onClick={() => {
                    let chipsToBuyIn = buyInAmount;
                    if (gameState.matchId.includes('-free-')) chipsToBuyIn = 100;
                    if (gameState.matchId.includes('-practice-')) chipsToBuyIn = 1000;
                    void handleConfirmBuyIn(chipsToBuyIn);
                  }}
                  className="rp-primary-button flex-1 px-2 py-2 text-[9px] font-bold uppercase disabled:opacity-60"
                >
                  {isJoiningSeat ? <PixelLoader label={tr("pokerRebuyProcessing")} /> : tr(isRebuy ? "pokerRebuy" : "joinTable")}
                </button>
              </div>
              {seatJoinError && <div className="w-full text-center text-[8px] text-red-300">{renderError(seatJoinError)}</div>}
            </div>
          </PokerDialog>
        )}
      </AnimatePresence>
    </ScreenShake>
  );
}
