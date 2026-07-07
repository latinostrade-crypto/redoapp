import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import {
  Wallet,
  Coins,
  Sparkles,
  Check,
  Loader2,
  Gift,
  Play,
  History,
  Globe,
  Lock,
  Trophy,
  Ticket,
} from 'lucide-react';
import { sound } from '../utils/sound';
import { Avatar } from './Avatars';
import { AvatarId, GameStats, PendingDepositView, PlayerProfile } from '../types';
import { apiRequest, buildAuthenticatedUrl, getSessionToken, setSessionToken, wakeBackend } from '../utils/api';
import { calculateTicketPayouts } from '../utils/rewardEconomy';

const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'redo_appbot';
const TELEGRAM_APP_SHORT_NAME = import.meta.env.VITE_TELEGRAM_APP_SHORT_NAME || 'app';
const MIN_MATCH_PLAYERS = 2;
const MAX_MATCH_PLAYERS = 4;
const MATCHMAKING_TIMEOUT_SEC = 5;
const PUBLIC_FREE_MATCH_ENERGY_COST = 5;
const STAKE_OPTIONS = [0.3, 0.5, 1, 5, 10, 30] as const;
const PUBLIC_STAKE_OPTIONS = [0, ...STAKE_OPTIONS] as const;
const PRIVATE_STAKE_OPTIONS = [0, ...STAKE_OPTIONS] as const;
type PublicStakeOption = typeof PUBLIC_STAKE_OPTIONS[number];
type PrivateStakeOption = typeof PRIVATE_STAKE_OPTIONS[number];
const FIRST_FREE_GAME_WALLET_PROMPT_KEY = 'redoapp_prompt_connect_wallet_after_free_game';
const PROFILE_CACHE_STORAGE_KEY = 'redoapp_profile_cache';
const FULL_PROFILE_CACHE_STORAGE_KEY = 'redoapp_full_profile_cache';
const DEFAULT_ENERGY_STATE: PlayerProfile['energy'] = { energy: 0, maxEnergy: 10, nextEnergyAt: null, regenIntervalSec: 1800 };
function normalizeProfile(profile: Partial<PlayerProfile> | null | undefined): PlayerProfile | null {
  if (!profile?.userId) return null;
  return {
    userId: profile.userId,
    telegramUsername: profile.telegramUsername ?? null,
    telegramPhotoUrl: profile.telegramPhotoUrl ?? null,
    walletAddress: profile.walletAddress ?? null,
    availableTickets: Number(profile.availableTickets) || 0,
    heldTickets: Number(profile.heldTickets) || 0,
    xp: Number(profile.xp) || 0,
    energy: profile.energy ?? DEFAULT_ENERGY_STATE,
    referralCode: profile.referralCode ?? '',
    referralLink: profile.referralLink ?? '',
    referrals: {
      referredByUserId: profile.referrals?.referredByUserId ?? null,
      status: profile.referrals?.status ?? null,
      activatedAt: profile.referrals?.activatedAt ?? null,
      referralsActivated: profile.referrals?.referralsActivated ?? 0,
      invitedUsers: profile.referrals?.invitedUsers ?? [],
    },
    quests: profile.quests ?? [],
    claimedQuestIds: profile.claimedQuestIds ?? [],
  };
}

function buildTelegramMiniAppLink(startParam: string) {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}/${TELEGRAM_APP_SHORT_NAME}?startapp=${encodeURIComponent(startParam)}`;
}

function buildTelegramMiniAppSchemeLink(startParam: string) {
  return `tg://resolve?domain=${encodeURIComponent(TELEGRAM_BOT_USERNAME)}&appname=${encodeURIComponent(TELEGRAM_APP_SHORT_NAME)}&startapp=${encodeURIComponent(startParam)}`;
}

function buildPrivateRoomSharePayload(roomCode: string) {
  return {
    telegramLink: buildTelegramMiniAppLink(`room_${roomCode}`),
    telegramSchemeLink: buildTelegramMiniAppSchemeLink(`room_${roomCode}`),
  };
}

function getTelegramStartParam() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const telegramWebApp = (window as any).Telegram?.WebApp;
  return (
    params.get('tgWebAppStartParam') ||
    params.get('startapp') ||
    params.get('startApp') ||
    hashParams.get('tgWebAppStartParam') ||
    hashParams.get('startapp') ||
    hashParams.get('startApp') ||
    telegramWebApp?.initDataUnsafe?.start_param ||
    ''
  );
}

function getReferralStartParam() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const explicitRef = params.get('ref') || hashParams.get('ref');
  if (explicitRef) {
    return `ref_${explicitRef.trim().toUpperCase()}`;
  }
  return getTelegramStartParam();
}

interface Web3DashboardProps {
  userName: string;
  selectedAvatar: AvatarId;
  AVATAR_LIST: { id: AvatarId; emoji: string; bg: string; description: string }[];
  stats: GameStats;
  playerLevel: number;
  currentLevelXp: number;
  xpNeeded: number;
  xpProgressPercentage: number;
  playerXp: number;
  resetStats: () => void;
  onStartGame: (mode: 'offline' | 'pvp' | 'private', stake: number) => void;
  onNameChange?: (name: string) => void;
  onAvatarSelect?: (id: AvatarId) => void;
  onOpenRules?: () => void;
  goldenTickets: number;
  setGoldenTickets: React.Dispatch<React.SetStateAction<number>>;
  transactions: any[];
  setTransactions: React.Dispatch<React.SetStateAction<any[]>>;
}

type DepositFlowStatus = 'idle' | 'creating' | 'awaiting_wallet' | 'waiting_chain' | 'confirmed' | 'failed';

interface PendingDepositState {
  intentId: string;
  signedBoc: string;
  ticketAmount: number;
  tonAmount: number;
  createdAt: number;
}

const PENDING_DEPOSIT_STORAGE_KEY = 'redoapp_pending_deposit';
type BootstrapProfile = Pick<PlayerProfile, 'userId' | 'telegramUsername' | 'telegramPhotoUrl' | 'walletAddress' | 'availableTickets' | 'heldTickets' | 'xp' | 'energy' | 'referralCode' | 'referralLink'>;
type PrivateRoomPlayer = { userId: string; username: string; avatarId: string; stake: number };
type PrivateRoomResponse = {
  roomCode: string;
  telegramLink?: string;
  playersCount: number;
  targetPlayers?: number;
  status: 'waiting' | 'started';
  matchId?: string;
  players?: PrivateRoomPlayer[];
  availableTickets: number;
  heldTickets: number;
};

export function Web3Dashboard({
  userName,
  selectedAvatar,
  AVATAR_LIST,
  stats,
  playerLevel,
  currentLevelXp,
  xpNeeded,
  xpProgressPercentage,
  playerXp,
  resetStats,
  onStartGame,
  onNameChange,
  onAvatarSelect,
  onOpenRules,
  goldenTickets,
  setGoldenTickets,
  transactions,
  setTransactions,
}: Web3DashboardProps) {
  const initialLaunchRoomCodeRef = useRef('');
  if (!initialLaunchRoomCodeRef.current) {
    const startApp = getTelegramStartParam();
    const roomFromSearch = new URLSearchParams(window.location.search).get('room');
    initialLaunchRoomCodeRef.current = (roomFromSearch || (startApp?.startsWith('room_') ? startApp.replace('room_', '') : '')).toUpperCase();
  }
  const [currentTab, setCurrentTab] = useState<'profile' | 'tournaments' | 'pvp' | 'rewards'>('profile');
  const [pvpSubMode, setPvpSubMode] = useState<'public' | 'private' | 'practice'>('public');
  const [showPayoutDetails, setShowPayoutDetails] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const rawAddress = useTonAddress();
  const walletConnected = !!rawAddress;
  const telegramInitData = (window as any).Telegram?.WebApp?.initData || '';
  
  const walletAddress = walletConnected 
    ? `${rawAddress.substring(0, 6)}...${rawAddress.substring(rawAddress.length - 4)}` 
    : '';
  const [profile, setProfile] = useState<PlayerProfile | null>(() => {
    try {
      return normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_CACHE_STORAGE_KEY) || 'null'));
    } catch {
      return null;
    }
  });
  const [fullProfile, setFullProfile] = useState<PlayerProfile | null>(() => {
    try {
      return normalizeProfile(JSON.parse(localStorage.getItem(FULL_PROFILE_CACHE_STORAGE_KEY) || 'null'));
    } catch {
      return null;
    }
  });
  const [fullProfileLoading, setFullProfileLoading] = useState(false);
  const [bootstrapState, setBootstrapState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [bootstrapError, setBootstrapError] = useState('');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [tgPhotoFailed, setTgPhotoFailed] = useState(false);

  const [isConnecting, setIsConnecting] = useState(false);

  // Track wallet connection changes to add transaction logs
  const prevConnectedRef = useRef(walletConnected);
  useEffect(() => {
    if (walletConnected && !prevConnectedRef.current) {
      const newTx = {
        id: `tx-connect-${Date.now()}`,
        event: 'Wallet Connected',
        value: 'TON Wallet',
        time: 'Just now',
        type: 'claim'
      };
      setTransactions((prev) => {
        if (prev.some(t => t.event === 'Wallet Connected' && t.time === 'Just now')) return prev;
        return [newTx, ...prev].slice(0, 10);
      });
    } else if (!walletConnected && prevConnectedRef.current) {
      const newTx = {
        id: `tx-disconnect-${Date.now()}`,
        event: 'Wallet Disconnected',
        value: 'TON Wallet',
        time: 'Just now',
        type: 'disconnect'
      };
      setTransactions((prev) => {
        if (prev.some(t => t.event === 'Wallet Disconnected' && t.time === 'Just now')) return prev;
        return [newTx, ...prev].slice(0, 10);
      });
    }
    prevConnectedRef.current = walletConnected;
  }, [walletConnected, setTransactions]);

  const [lastDailyCheckIn, setLastDailyCheckIn] = useState<number>(() => {
    const saved = localStorage.getItem('redoapp_last_daily_xp_checkin');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [dailyXpClaimedToday, setDailyXpClaimedToday] = useState(false);

  const [selectedStake, setSelectedStake] = useState<PublicStakeOption>(0);
  const [matchmakingState, setMatchmakingState] = useState<'idle' | 'searching' | 'success'>('idle');
  const [matchmakingTimer, setMatchmakingTimer] = useState(MATCHMAKING_TIMEOUT_SEC);
  const [queueLength, setQueueLength] = useState(1);
  const [buyingTickets, setBuyingTickets] = useState(false);
  const [depositFlowStatus, setDepositFlowStatus] = useState<DepositFlowStatus>('idle');
  const [depositStatusMessage, setDepositStatusMessage] = useState('');
  const [pendingDeposits, setPendingDeposits] = useState<PendingDepositView[]>([]);

  const [privateRoomStake, setPrivateRoomStake] = useState<PrivateStakeOption>(0);
  const [privateRoomTargetPlayers, setPrivateRoomTargetPlayers] = useState<2 | 3 | 4>(4);
  const [generatedLink, setGeneratedLink] = useState('');
  const [showRoomDisclaimer, setShowRoomDisclaimer] = useState(false);
  const [privateRoomCode, setPrivateRoomCode] = useState('');
  const [privateJoinCode, setPrivateJoinCode] = useState(() => initialLaunchRoomCodeRef.current);
  const [privateRoomStatus, setPrivateRoomStatus] = useState<'idle' | 'waiting' | 'ready'>('idle');
  const [privateRoomCreateState, setPrivateRoomCreateState] = useState<'idle' | 'creating' | 'waiting' | 'error'>('idle');
  const [privateRoomError, setPrivateRoomError] = useState('');
  const [privateRoomPlayersCount, setPrivateRoomPlayersCount] = useState(0);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const privateRoomStreamRef = useRef<EventSource | null>(null);
  const queueStreamRef = useRef<EventSource | null>(null);
  const syncRequestKeyRef = useRef<string>('');
  const launchRoomConsumedRef = useRef(false);
  const createRequestCounterRef = useRef(0);
  const bootstrapUserId = rawAddress || localStorage.getItem('redoapp_current_user_id') || `guest:${userName.toLowerCase()}`;
  const activeProfile = fullProfile ?? profile;
  const currentUserId = activeProfile?.userId || bootstrapUserId;
  const [heldTickets, setHeldTickets] = useState(0);
  const [depositAmount, setDepositAmount] = useState('1');
  const [withdrawAmount, setWithdrawAmount] = useState('5');
  const [energyNow, setEnergyNow] = useState(() => Date.now());
  const effectiveXp = Math.max(activeProfile?.xp ?? 0, playerXp ?? 0);
  const displayXpNeeded = 400;
  const displayLevel = Math.floor(effectiveXp / displayXpNeeded) + 1;
  const displayCurrentLevelXp = effectiveXp % displayXpNeeded;
  const displayXpProgressPercentage = Math.min(100, Math.floor((displayCurrentLevelXp / displayXpNeeded) * 100));
  const energy = activeProfile?.energy ?? DEFAULT_ENERGY_STATE;
  const updateProfileEnergy = (nextEnergy: PlayerProfile['energy']) => {
    setProfile((prev) => prev ? { ...prev, energy: nextEnergy } : prev);
    setFullProfile((prev) => prev ? { ...prev, energy: nextEnergy } : prev);
  };
  const quests = fullProfile?.quests ?? [];
  const referralInvites = fullProfile?.referrals?.invitedUsers ?? [];
  const referralTicketEarnings = transactions
    .filter((tx: any) => tx.type === 'referral_bonus')
    .reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
  const energyCountdownSeconds = energy.nextEnergyAt ? Math.max(0, Math.ceil((energy.nextEnergyAt - energyNow) / 1000)) : 0;
  const tgProfileName = activeProfile?.telegramUsername || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.username || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.first_name || 'guest';
  const tgPhotoUrl = activeProfile?.telegramPhotoUrl || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || '';
  const privateStakeRequiresWallet = privateRoomStake > 0;
  const launchStartParam = getReferralStartParam();
  const authReady = bootstrapState === 'ready';
  const formatPlaceLabel = (place: number) => (place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`);
  const formatPayoutRow = (stake: number, playersCount: 2 | 3 | 4) => {
    const { payouts } = calculateTicketPayouts(stake, playersCount);
    return payouts
      .map((payout, index) => `${formatPlaceLabel(index + 1)} ${payout.toFixed(2)} TKT`)
      .join(' · ');
  };

  useEffect(() => {
    if (!localStorage.getItem(FIRST_FREE_GAME_WALLET_PROMPT_KEY)) return;
    localStorage.removeItem(FIRST_FREE_GAME_WALLET_PROMPT_KEY);
    setCurrentTab('rewards');
    if (!walletConnected) {
      setShowConnectModal(true);
    }
  }, [walletConnected]);

  useEffect(() => {
    if (!activeProfile) return;
    localStorage.setItem(PROFILE_CACHE_STORAGE_KEY, JSON.stringify(activeProfile));
    window.dispatchEvent(new CustomEvent('redoapp:profile-sync', { detail: activeProfile }));
  }, [activeProfile]);

  useEffect(() => {
    if (!fullProfile) return;
    localStorage.setItem(FULL_PROFILE_CACHE_STORAGE_KEY, JSON.stringify(fullProfile));
  }, [fullProfile]);

  useEffect(() => {
    setTgPhotoFailed(false);
  }, [tgPhotoUrl]);

  useEffect(() => {
    const handleProfileSync = (event: Event) => {
      const detail = (event as CustomEvent<Partial<PlayerProfile> & { xp?: number }>).detail;
      if (typeof detail?.xp !== 'number') return;
      setProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          xp: detail.xp,
        };
      });
      setFullProfile((prev) => prev ? { ...prev, xp: detail.xp } : prev);
    };

    window.addEventListener('redoapp:profile-sync', handleProfileSync as EventListener);
    return () => {
      window.removeEventListener('redoapp:profile-sync', handleProfileSync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!energy.nextEnergyAt) return;
    setEnergyNow(Date.now());
    const timer = window.setInterval(() => {
      setEnergyNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [energy.nextEnergyAt]);

  const readPendingDeposit = (): PendingDepositState | null => {
    try {
      const raw = localStorage.getItem(PENDING_DEPOSIT_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PendingDepositState;
    } catch {
      return null;
    }
  };

  const clearPendingDeposit = () => {
    localStorage.removeItem(PENDING_DEPOSIT_STORAGE_KEY);
  };

  const savePendingDeposit = (pending: PendingDepositState) => {
    localStorage.setItem(PENDING_DEPOSIT_STORAGE_KEY, JSON.stringify(pending));
  };

  const refreshPendingDeposits = () => {
    if (!getSessionToken()) {
      setPendingDeposits([]);
      return Promise.resolve([] as PendingDepositView[]);
    }
    return apiRequest<{ deposits: PendingDepositView[] }>('/api/tickets/pending/' + encodeURIComponent(currentUserId))
      .then((result) => {
        setPendingDeposits(result.deposits);
        return result.deposits;
      })
      .catch(() => {
        setPendingDeposits([]);
        return [];
      });
  };

  const applyPrivateRoomJoin = (result: PrivateRoomResponse, roomCodeToUse: string) => {
    setShowRoomDisclaimer(false);
    setPrivateRoomError('');
    setPrivateJoinCode(roomCodeToUse);
    setPrivateRoomCode(result.roomCode);
    setPrivateRoomPlayersCount(result.playersCount);
    if (result.targetPlayers && [2, 3, 4].includes(result.targetPlayers)) {
      setPrivateRoomTargetPlayers(result.targetPlayers as 2 | 3 | 4);
    }
    setGoldenTickets(result.availableTickets);
    setHeldTickets(result.heldTickets);
    if (result.status === 'started' && result.matchId) {
      localStorage.setItem('redoapp_active_match', JSON.stringify({
        matchId: result.matchId,
        mode: 'private',
        stake: privateRoomStake,
        currentUserId,
        players: result.players || [],
        createdAt: Date.now(),
      }));
      setPrivateRoomStatus('ready');
      onStartGame('private', privateRoomStake);
    } else {
      setPrivateRoomStatus('waiting');
      setPrivateRoomCreateState('waiting');
    }
  };

  const joinPrivateRoomByCode = (roomCodeInput?: string) => {
    const roomCodeToUse = (roomCodeInput || privateJoinCode || privateRoomCode).trim().toUpperCase();
    if (!roomCodeToUse) {
      alert('Enter or generate a room code first.');
      return Promise.resolve(false);
    }
    if (!authReady) {
      const message = 'Session is still syncing with the backend. Try again in a moment.';
      setPrivateRoomError(message);
      return Promise.resolve(false);
    }
    setPrivateRoomError('');
    return apiRequest<PrivateRoomResponse>('/api/private-rooms/join', {
      method: 'POST',
      retryOnNetworkError: true,
      body: JSON.stringify({
        roomCode: roomCodeToUse,
        userId: currentUserId,
        username: userName,
        avatarId: selectedAvatar,
        walletAddress: rawAddress || null,
      }),
    }).then((result) => {
      applyPrivateRoomJoin(result, roomCodeToUse);
      return true;
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to join private room.';
      setPrivateRoomError(message);
      alert(message);
      return false;
    });
  };

  const createPrivateRoom = () => {
    if (privateRoomCreateState === 'creating') return;
    if (!authReady) {
      setPrivateRoomError('Session is still syncing with the backend. Try again in a moment.');
      return;
    }
    if (privateStakeRequiresWallet && !walletConnected) {
      connectWallet();
      return;
    }
    sound.playShuffle();
    wakeBackend();
    const createRequestId = `room-${Date.now()}-${createRequestCounterRef.current += 1}-${Math.random().toString(36).slice(2, 8)}`;
    setPrivateRoomCreateState('creating');
    setPrivateRoomError('');
    apiRequest<PrivateRoomResponse>('/api/private-rooms/create', {
      method: 'POST',
      retryOnNetworkError: true,
      body: JSON.stringify({
        userId: currentUserId,
        username: userName,
        avatarId: selectedAvatar,
        walletAddress: rawAddress || null,
        stake: privateRoomStake,
        targetPlayers: privateRoomTargetPlayers,
        createRequestId,
      }),
    }).then((result) => {
      setGoldenTickets(result.availableTickets);
      setHeldTickets(result.heldTickets);
      setPrivateRoomCode(result.roomCode);
      setPrivateJoinCode(result.roomCode);
      setPrivateRoomTargetPlayers(result.targetPlayers as 2 | 3 | 4);
      setPrivateRoomPlayersCount(result.playersCount || 1);
      setPrivateRoomStatus('waiting');
      setPrivateRoomCreateState('waiting');
      const fallbackPayload = buildPrivateRoomSharePayload(result.roomCode);
      setGeneratedLink(result.telegramLink || fallbackPayload.telegramLink);
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to create private room.';
      setPrivateRoomCreateState('error');
      setPrivateRoomError(message);
      alert(message);
    });
  };

  const confirmPendingDeposit = async (pending: PendingDepositState, options?: { silent?: boolean }) => {
    setBuyingTickets(true);
    setDepositFlowStatus('waiting_chain');
    setDepositStatusMessage(`Waiting for TON confirmation of ${pending.ticketAmount.toFixed(2)} tickets...`);
    try {
      const confirmed = await apiRequest<{ availableTickets: number }>('/api/tickets/deposit-confirm', {
        method: 'POST',
        body: JSON.stringify({
          intentId: pending.intentId,
          signedBoc: pending.signedBoc,
        }),
      });
      setGoldenTickets(confirmed.availableTickets);
      const ledger = await apiRequest<{ transactions: any[] }>('/api/tickets/ledger/' + encodeURIComponent(currentUserId));
      setTransactions(ledger.transactions);
      await refreshPendingDeposits();
      clearPendingDeposit();
      setDepositFlowStatus('confirmed');
      setDepositStatusMessage(`Deposit confirmed: +${pending.ticketAmount.toFixed(2)} tickets.`);
      if (!options?.silent) {
        alert(`Deposit confirmed: +${pending.ticketAmount.toFixed(2)} tickets.`);
      }
      return true;
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Ticket purchase failed.';
      setDepositFlowStatus('failed');
      setDepositStatusMessage(message);
      await refreshPendingDeposits();
      if (!options?.silent) {
        alert(message);
      }
      return false;
    } finally {
      setBuyingTickets(false);
    }
  };

  useEffect(() => {
    if (lastDailyCheckIn) {
      const hoursSinceClaim = (Date.now() - lastDailyCheckIn) / (1000 * 60 * 60);
      setDailyXpClaimedToday(hoursSinceClaim < 24);
    }
  }, [lastDailyCheckIn]);

  useEffect(() => {
    const pending = readPendingDeposit();
    if (!pending || !walletConnected || buyingTickets || !getSessionToken()) return;
    setDepositFlowStatus('waiting_chain');
    setDepositStatusMessage(`Pending TON deposit found for ${pending.ticketAmount.toFixed(2)} tickets. Resuming confirmation...`);
    confirmPendingDeposit(pending, { silent: true }).catch(() => undefined);
  }, [walletConnected, currentUserId, buyingTickets]);

  useEffect(() => {
    if (!activeProfile) return;
    refreshPendingDeposits().catch(() => undefined);
    const timer = window.setInterval(() => {
      refreshPendingDeposits().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [currentUserId, activeProfile]);

  const fetchFullProfile = () => {
    if (fullProfileLoading || !getSessionToken()) {
      return Promise.resolve(fullProfile);
    }
    setFullProfileLoading(true);
    return apiRequest<PlayerProfile>('/api/me')
      .then((me) => {
        const normalized = normalizeProfile(me);
        setFullProfile(normalized);
        setProfile((prev) => normalized ?? prev);
        setGoldenTickets(me.availableTickets);
        setHeldTickets(me.heldTickets);
        return normalized;
      })
      .finally(() => {
        setFullProfileLoading(false);
      });
  };

  useEffect(() => {
    localStorage.setItem('redoapp_current_user_id', currentUserId);
    if (rawAddress) {
      localStorage.setItem('redoapp_wallet_address', rawAddress);
    }
    const requestKey = [rawAddress || '', telegramInitData || '', launchStartParam || '', bootstrapAttempt].join('|');
    if (syncRequestKeyRef.current === requestKey) {
      return;
    }
    syncRequestKeyRef.current = requestKey;
    setBootstrapState('loading');
    setBootstrapError('');

    let cancelled = false;

    apiRequest<BootstrapProfile & {
      telegramInitDataValid: boolean;
      sessionToken: string | null;
    }>('/api/users/sync', {
      method: 'POST',
      body: JSON.stringify({
        userId: bootstrapUserId,
        walletAddress: rawAddress || null,
        telegramInitData,
        startParam: launchStartParam || null,
      }),
    }).then(async (synced) => {
      if (cancelled) return;
      setSessionToken(synced.sessionToken);
      localStorage.setItem('redoapp_current_user_id', synced.userId);
      setProfile((prev) => normalizeProfile({ ...prev, ...synced }));
      setFullProfile((prev) => {
        if (!prev?.userId || prev.userId !== synced.userId) {
          return null;
        }
        return normalizeProfile({ ...prev, ...synced });
      });
      setGoldenTickets(synced.availableTickets);
      setHeldTickets(synced.heldTickets);
      // The authoritative sync is enough to unlock the UI. Profile and ledger
      // hydration are optional follow-ups and must not block room actions.
      setBootstrapState('ready');
      const followUps = await Promise.allSettled([
        apiRequest<{ transactions: any[] }>('/api/tickets/ledger/' + encodeURIComponent(synced.userId)),
        (synced.sessionToken || telegramInitData)
          ? apiRequest<PlayerProfile>('/api/me')
          : Promise.resolve(null),
      ]);

      if (cancelled) return;

      const [ledgerResult, profileResult] = followUps;
      if (ledgerResult.status === 'fulfilled') {
        setTransactions(ledgerResult.value.transactions);
      }
      if (profileResult.status === 'fulfilled' && profileResult.value) {
        const normalized = normalizeProfile(profileResult.value);
        setFullProfile(normalized);
        setProfile((prev) => normalized ?? prev);
        setGoldenTickets(profileResult.value.availableTickets);
        setHeldTickets(profileResult.value.heldTickets);
      }
    }).catch((error) => {
      if (cancelled) return;
      setBootstrapState('error');
      setBootstrapError(error instanceof Error ? error.message : 'Failed to initialize the Telegram session.');
    });

    return () => {
      cancelled = true;
    };
  }, [bootstrapUserId, rawAddress, telegramInitData, launchStartParam, bootstrapAttempt]);

  const connectWallet = async () => {
    sound.playPop();
    try {
      if (walletConnected) {
        await tonConnectUI.disconnect();
        const newTx = {
          id: `tx-${Date.now()}`,
          event: 'Wallet Disconnected',
          value: 'TON Wallet',
          time: 'Just now',
          type: 'disconnect'
        };
        setTransactions((prev) => [newTx, ...prev].slice(0, 10));
      } else {
        setShowConnectModal(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleActualConnect = async () => {
    setShowConnectModal(false);
    setIsConnecting(true);
    try {
      sound.playPop();
      await tonConnectUI.openModal();
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  };

  const claimDailyXp = () => {
    if (dailyXpClaimedToday) return;
    sound.playShuffle();
    apiRequest<{ success: boolean }>('/api/xp/daily-checkin', {
      method: 'POST',
      body: JSON.stringify({
        userId: currentUserId,
        walletAddress: rawAddress || null,
        telegramInitData,
      }),
    }).then((result) => {
      if (!result.success) return;
      setLastDailyCheckIn(Date.now());
      setDailyXpClaimedToday(true);
      localStorage.setItem('redoapp_last_daily_xp_checkin', Date.now().toString());
      const newTx = {
        id: `tx-${Date.now()}`,
        event: 'Daily Check-in',
        value: '+20 XP',
        time: 'Just now',
        type: 'claim'
      };
      setTransactions((prev) => [newTx, ...prev].slice(0, 10));
      return apiRequest<PlayerProfile>('/api/me').then((me) => {
        const normalized = normalizeProfile(me);
        setProfile(normalized);
        setFullProfile(normalized);
        setGoldenTickets(me.availableTickets);
        setHeldTickets(me.heldTickets);
      });
    }).catch((error) => {
      alert(error.message);
    });
  };

  const buyTicketsWithTon = async () => {
    if (!walletConnected) {
      alert("Please connect your wallet first.");
      return;
    }
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a deposit amount greater than 0.');
      return;
    }
    sound.playPop();
    setBuyingTickets(true);
    setDepositFlowStatus('creating');
    setDepositStatusMessage('Preparing deposit request...');
    try {
      const intent = await apiRequest<{ intentId: string; marketingWallet: string; tonAmount: number; ticketAmount: number }>('/api/tickets/deposit-intent', {
        method: 'POST',
        body: JSON.stringify({
          userId: currentUserId,
          walletAddress: rawAddress,
          ticketAmount: amount,
        }),
      });
      setDepositFlowStatus('awaiting_wallet');
      setDepositStatusMessage(`Confirm ${intent.tonAmount.toFixed(2)} TON in your wallet for ${intent.ticketAmount.toFixed(2)} tickets.`);
      const transaction = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [{
          address: intent.marketingWallet,
          amount: Math.round(intent.tonAmount * 1_000_000_000).toString(),
        }]
      });
      const pending: PendingDepositState = {
        intentId: intent.intentId,
        signedBoc: transaction.boc,
        ticketAmount: intent.ticketAmount,
        tonAmount: intent.tonAmount,
        createdAt: Date.now(),
      };
      savePendingDeposit(pending);
      await confirmPendingDeposit(pending);
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Ticket purchase failed.';
      setDepositFlowStatus('failed');
      setDepositStatusMessage(message);
      alert(message);
    } finally {
      setBuyingTickets(false);
    }
  };

  useEffect(() => {
    if (matchmakingState !== 'searching') return;
    queueStreamRef.current?.close();
    const stream = new EventSource(buildAuthenticatedUrl('/api/matchmaker/stream'));
    queueStreamRef.current = stream;

    stream.addEventListener('queue-status', (event) => {
      const result = JSON.parse((event as MessageEvent).data) as {
        status: 'idle' | 'searching' | 'ready';
        queueLength?: number;
        countdownSec?: number;
        matchId?: string;
        players?: Array<{ userId: string; username: string; avatarId: string; stake: number }>;
      };
      if (result.status === 'searching') {
        setQueueLength(result.queueLength || 1);
        setMatchmakingTimer(typeof result.countdownSec === 'number' ? result.countdownSec : MATCHMAKING_TIMEOUT_SEC);
      }
      if (result.status === 'ready' && result.matchId) {
        setQueueLength(result.players?.length || 1);
        localStorage.setItem('redoapp_active_match', JSON.stringify({
          matchId: result.matchId,
          mode: 'pvp',
          stake: selectedStake,
          currentUserId,
          players: result.players || [],
          createdAt: Date.now(),
        }));
        setMatchmakingState('success');
        onStartGame('pvp', selectedStake);
      }
    });

    stream.onerror = () => {
      apiRequest<{
        status: 'idle' | 'searching' | 'ready';
        queueLength?: number;
        countdownSec?: number;
        matchId?: string;
        players?: Array<{ userId: string; username: string; avatarId: string; stake: number }>;
      }>('/api/matchmaker/status')
        .then((result) => {
          if (result.status === 'searching') {
            setQueueLength(result.queueLength || 1);
            setMatchmakingTimer(typeof result.countdownSec === 'number' ? result.countdownSec : MATCHMAKING_TIMEOUT_SEC);
          }
          if (result.status === 'ready' && result.matchId) {
            setQueueLength(result.players?.length || 1);
            localStorage.setItem('redoapp_active_match', JSON.stringify({
              matchId: result.matchId,
              mode: 'pvp',
              stake: selectedStake,
              currentUserId,
              players: result.players || [],
              createdAt: Date.now(),
            }));
            setMatchmakingState('success');
            onStartGame('pvp', selectedStake);
          }
        })
        .catch(() => undefined);
    };

    return () => {
      stream.close();
      if (queueStreamRef.current === stream) {
        queueStreamRef.current = null;
      }
    };
  }, [matchmakingState, currentUserId, onStartGame, selectedStake]);

  useEffect(() => {
    const incomingRoomCode = initialLaunchRoomCodeRef.current.trim().toUpperCase();
    if (launchRoomConsumedRef.current || !incomingRoomCode || privateRoomStatus !== 'idle' || !authReady) return;
    launchRoomConsumedRef.current = true;
    setCurrentTab('pvp');
    setPvpSubMode('private');
    setPrivateJoinCode(incomingRoomCode);
    setPrivateRoomError('');
    joinPrivateRoomByCode(incomingRoomCode).then((joined) => {
      if (!joined) {
        setPrivateRoomError(`Failed to auto-join private room ${incomingRoomCode}.`);
      }
    }).catch(() => undefined);
  }, [privateRoomStatus, currentUserId, authReady]);

  useEffect(() => {
    if (privateRoomStatus !== 'waiting' || !privateRoomCode) return;
    privateRoomStreamRef.current?.close();
    const stream = new EventSource(buildAuthenticatedUrl(`/api/private-rooms/stream/${encodeURIComponent(privateRoomCode)}`));
    privateRoomStreamRef.current = stream;

    const applyPrivateRoomState = (result: { status: 'waiting' | 'started'; playersCount: number; targetPlayers?: number; matchId?: string | null; players?: Array<{ userId: string; username: string; avatarId: string; stake: number }> }) => {
      setPrivateRoomPlayersCount(result.playersCount);
      if (result.targetPlayers && [2, 3, 4].includes(result.targetPlayers)) {
        setPrivateRoomTargetPlayers(result.targetPlayers as 2 | 3 | 4);
      }
      if (result.status === 'started' && result.matchId) {
        localStorage.setItem('redoapp_active_match', JSON.stringify({
          matchId: result.matchId,
          mode: 'private',
          stake: privateRoomStake,
          currentUserId,
          players: result.players || [],
          createdAt: Date.now(),
        }));
        setPrivateRoomStatus('ready');
        onStartGame('private', privateRoomStake);
      }
    };

    stream.addEventListener('private-room', (event) => {
      const result = JSON.parse((event as MessageEvent).data) as { status: 'waiting' | 'started'; playersCount: number; targetPlayers?: number; matchId?: string; players?: Array<{ userId: string; username: string; avatarId: string; stake: number }> };
      applyPrivateRoomState(result);
    });

    stream.onerror = () => {
      apiRequest<{ status: 'waiting' | 'started'; playersCount: number; targetPlayers?: number; matchId?: string; players?: Array<{ userId: string; username: string; avatarId: string; stake: number }> }>('/api/private-rooms/status/' + encodeURIComponent(privateRoomCode))
        .then(applyPrivateRoomState)
        .catch(() => undefined);
    };

    const pollTimer = window.setInterval(() => {
      apiRequest<{ status: 'waiting' | 'started'; playersCount: number; targetPlayers?: number; matchId?: string; players?: Array<{ userId: string; username: string; avatarId: string; stake: number }> }>('/api/private-rooms/status/' + encodeURIComponent(privateRoomCode), { timeoutMs: 5000 })
        .then(applyPrivateRoomState)
        .catch(() => undefined);
    }, 3000);

    return () => {
      window.clearInterval(pollTimer);
      stream.close();
      if (privateRoomStreamRef.current === stream) {
        privateRoomStreamRef.current = null;
      }
    };
  }, [currentUserId, onStartGame, privateRoomCode, privateRoomStake, privateRoomStatus]);

  useEffect(() => {
    return () => {
      privateRoomStreamRef.current?.close();
      queueStreamRef.current?.close();
    };
  }, []);

  const winRate = stats.gamesPlayed > 0 
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
    : 0;

  return (
    <div className="w-full bg-[#0c0f12] text-[#f8fafc] pixel-box-lg p-3 sm:p-5 relative overflow-hidden flex flex-col gap-4 select-none pixel-scanlines">
      
      {/* 1. Tabs (Swapped to the top of the card) */}
      <div className="grid grid-cols-4 border-2 border-black bg-slate-950 p-0.5 gap-0.5 z-10">
        {[
          { id: 'profile', label: 'ME' },
          { id: 'tournaments', label: 'TOUR' },
          { id: 'pvp', label: 'PVP' },
          { id: 'rewards', label: 'REWARDS' },
        ].map((tab) => {
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                sound.playPop();
                setCurrentTab(tab.id as any);
              }}
              className={`text-center py-2 text-[8px] sm:text-[9px] font-black uppercase font-mono transition-all cursor-pointer border ${
                active
                  ? 'bg-[#00d2ff] text-black border-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 2. Network Connectivity bar */}
      <div className="flex justify-between items-center bg-[#18181c] p-2.5 pixel-box-sm border-black">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              bootstrapState === 'error' ? 'bg-[#ff4b4b]' : bootstrapState === 'loading' ? 'bg-[#ffcc00]' : 'bg-[#00ff66]'
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              bootstrapState === 'error' ? 'bg-[#ff4b4b]' : bootstrapState === 'loading' ? 'bg-[#ffcc00]' : 'bg-[#00ff66]'
            }`}></span>
          </span>
          <div className="leading-none text-left">
            <div className="text-[8px] font-black uppercase text-slate-200">
              {bootstrapState === 'loading' ? 'Syncing session' : bootstrapState === 'error' ? 'Sync failed' : 'Session ready'}
            </div>
            <div className="text-[7px] text-slate-400">
              {bootstrapState === 'error' ? bootstrapError : authReady ? currentUserId : 'Waiting for backend/auth bootstrap'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenRules && (
            <button
              type="button"
              onClick={() => {
                sound.playPop();
                onOpenRules();
              }}
              className="px-2 py-1.5 bg-black text-[#00d2ff] border-2 border-black pixel-btn-interactive text-[9px] font-black uppercase font-mono tracking-wider"
            >
              Rules
            </button>
          )}
          {walletConnected && !dailyXpClaimedToday && (
            <button
              onClick={claimDailyXp}
              className="p-1 bg-[#00ff66] text-black border-2 border-black pixel-btn-interactive text-[8px] font-black uppercase font-mono tracking-wider flex items-center justify-center gap-1"
              title="Claim daily XP check-in"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>CLAIM</span>
            </button>
          )}
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className={`px-3 py-1.5 pixel-btn-interactive text-[10px] font-black uppercase font-mono tracking-wider flex items-center gap-1.5 ${
              isConnecting
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : walletConnected
                ? 'bg-[#ff4b4b] text-black border-2 border-black shadow-[2px_2px_0_#000]'
                : 'bg-[#00d2ff] text-black border-2 border-black shadow-[2px_2px_0_#000]'
            }`}
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                SYNCING...
              </>
            ) : walletConnected ? (
              <>
                <Check className="w-3 h-3 text-black" />
                {walletAddress}
              </>
            ) : (
              <>
                <Wallet className="w-3 h-3 text-black" />
                CONNECT
              </>
            )}
          </button>
        </div>
      </div>

      {bootstrapState === 'error' && (
        <div className="flex items-center gap-2 bg-[#2a0d0d] border border-black px-3 py-2 text-[8px] leading-relaxed text-[#ffb3b3] font-mono">
          <span className="flex-1">{bootstrapError}</span>
          <button
            type="button"
            onClick={() => {
              setBootstrapError('');
              setBootstrapAttempt((attempt) => attempt + 1);
            }}
            className="shrink-0 bg-[#ffcc00] px-2 py-1 text-black font-black uppercase border border-black"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3. Grid statistics (XP instead of TON Points) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-950 p-2 border border-black pixel-box-sm flex flex-col justify-between text-left font-mono">
          <span className="text-[7px] uppercase font-bold text-slate-400">
            XP POINTS
          </span>
          <span className="block text-xs font-black text-[#00d2ff] mt-1">
            {effectiveXp} XP
          </span>
        </div>

        <div className="bg-slate-950 p-2 border border-black pixel-box-sm flex flex-col justify-between text-left font-mono">
          <span className="text-[7px] uppercase font-bold text-slate-400">
            TICKETS
          </span>
          <span className="block text-xs font-black text-[#ffcc00] mt-1">
            {goldenTickets} TKT
          </span>
        </div>

        <div className="bg-slate-950 p-2 border border-black pixel-box-sm flex flex-col justify-between text-left font-mono">
          <span className="text-[7px] uppercase font-bold text-slate-400">
            RANK
          </span>
          <span className="block text-xs font-black text-[#ec4899] mt-1">
            LVL {displayLevel}
          </span>
        </div>
      </div>

      {/* 4. Tab Content */}
      <div className="flex-1 min-h-[290px] sm:min-h-[320px] flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {currentTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="bg-[#18181c] border border-black pixel-box-sm p-2.5 space-y-2.5 font-mono">
                
                {/* Profile Read-Only Info */}
                <div className="flex items-center gap-3 border-b border-black pb-2">
                  <div className="w-10 h-10 bg-slate-950 border border-black flex items-center justify-center relative overflow-hidden flex-shrink-0">
                    {tgPhotoUrl && !tgPhotoFailed ? (
                      <img 
                        src={tgPhotoUrl} 
                        alt="Telegram Avatar" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={() => {
                          setTgPhotoFailed(true);
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full">
                        <Avatar id={selectedAvatar} emotion="happy" isActive={false} size={28} />
                      </div>
                    )}
                  </div>
                  <div className="text-left font-mono leading-tight">
                    <span className="block text-[6.5px] text-slate-400 uppercase">Telegram Profile</span>
                    <span className="text-[10px] font-black text-[#00ff66] truncate block max-w-[180px]">
                      {tgProfileName ? `@${tgProfileName}` : 'guest'}
                    </span>
                    <span className="block text-[6.5px] text-slate-500 mt-0.5">
                      ID: {currentUserId}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 bg-black p-1.5 border border-black">
                  <div className="flex justify-between items-center text-[7.5px] font-bold">
                    <span className="text-slate-400">XP PROGRESS</span>
                    <span className="text-[#00d2ff]">{displayCurrentLevelXp} / {displayXpNeeded} XP</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 border border-black overflow-hidden relative">
                    <div
                      className="bg-[#00d2ff] h-full transition-all duration-500 ease-out"
                      style={{ width: `${displayXpProgressPercentage}%` }}
                    ></div>
                  </div>
                </div>

                <div className="bg-black p-1.5 border border-black space-y-1">
                  <div className="flex justify-between items-center text-[7.5px] font-bold">
                    <span className="text-slate-400">ENERGY</span>
                    <span className="text-[#00ff66]">{energy.energy} / {energy.maxEnergy}</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 border border-black overflow-hidden relative">
                    <div
                      className="bg-[#00ff66] h-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.round((energy.energy / energy.maxEnergy) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-[6.5px] text-slate-550 text-left">
                    {energy.nextEnergyAt ? `Next +1 in ${Math.floor(energyCountdownSeconds / 60)}m ${energyCountdownSeconds % 60}s` : 'Energy full'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-left text-[8.5px]">
                  <div className="bg-black p-1.5 border border-black">
                    <span className="block text-slate-500 text-[6.5px] uppercase font-bold">MATCHES</span>
                    <span className="text-[10px] font-black text-white">{stats.gamesPlayed}</span>
                  </div>
                  <div className="bg-black p-1.5 border border-black">
                    <span className="block text-slate-500 text-[6.5px] uppercase font-bold">WIN RATE</span>
                    <span className="text-[10px] font-black text-[#00d2ff]">{winRate}%</span>
                  </div>
                  <div className="bg-black p-1.5 border border-black">
                    <span className="block text-slate-500 text-[6.5px] uppercase font-bold">WINS</span>
                    <span className="text-[10px] font-black text-[#00ff66]">{stats.gamesWon}</span>
                  </div>
                  <div className="bg-black p-1.5 border border-black">
                    <span className="block text-slate-500 text-[6.5px] uppercase font-bold">REAL PVP</span>
                    <span className="text-[10px] font-black text-[#ffcc00]">{stats.realPvpGamesWon}</span>
                  </div>
                </div>

                <div className="bg-black p-2 border border-black space-y-1.5">
                  <div className="flex justify-between items-center text-left">
                    <span className="text-[7px] uppercase font-bold text-slate-400">Referral Program</span>
                    <span className="text-[8px] font-black text-[#ffcc00]">{fullProfile?.referrals?.referralsActivated ?? 0} active</span>
                  </div>
                  {!fullProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        fetchFullProfile().catch(() => undefined);
                      }}
                      className="w-full py-1 bg-slate-900 text-[#9ed8ff] border border-black text-[7px] font-black uppercase pixel-btn-interactive cursor-pointer"
                    >
                      {fullProfileLoading ? 'Loading Details...' : 'Load Referrals & Quests'}
                    </button>
                  )}
                  <div className="flex justify-between items-center text-[7.5px] bg-slate-950 border border-black px-2 py-0.5">
                    <span className="text-slate-400 uppercase">Referral Earnings</span>
                    <span className="font-black text-[#00ff66]">{referralTicketEarnings.toFixed(2)} TKT</span>
                  </div>
                  
                  {activeProfile?.referralLink ? (
                    <div className="flex gap-2">
                      <div className="flex-1 bg-slate-950 border border-black px-2 py-0.5 text-[7px] text-slate-400 truncate flex items-center leading-none min-w-0">
                        {activeProfile.referralLink}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeProfile.referralLink);
                          sound.playPop();
                          alert('Referral link copied.');
                        }}
                        className="px-2 py-0.5 bg-[#ffcc00] text-black border border-black text-[7px] font-black uppercase pixel-btn-interactive cursor-pointer flex-shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  ) : (
                    <div className="text-[7px] text-slate-500 text-left">Sync Telegram to generate invite link</div>
                  )}

                  <div className="space-y-1 max-h-[60px] overflow-y-auto custom-scroll pr-0.5">
                    {fullProfileLoading && !fullProfile ? (
                      <div className="text-[7.5px] text-slate-500 text-left">Loading referrals...</div>
                    ) : referralInvites.length === 0 ? (
                      <div className="text-[7.5px] text-slate-500 text-left">No referrals yet.</div>
                    ) : (
                      referralInvites.map((invite) => (
                        <div key={invite.userId} className="flex justify-between items-center text-[7.5px] bg-slate-950 border border-black px-2 py-0.5">
                          <span className="text-slate-200 truncate max-w-[120px]">{invite.username}</span>
                          <span className={invite.status === 'activated' ? 'text-[#00ff66] font-black' : 'text-[#ffcc00] font-black'}>
                            {invite.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-black p-2 border border-black space-y-1.5">
                  <div className="text-[7px] uppercase font-bold text-slate-400 text-left">Quests</div>
                  <div className="space-y-1 max-h-[90px] overflow-y-auto custom-scroll pr-0.5">
                    {fullProfileLoading && !fullProfile ? (
                      <div className="text-[7.5px] text-slate-500 text-left">Loading quests...</div>
                    ) : quests.length === 0 ? (
                      <div className="text-[7.5px] text-slate-500 text-left">No quests loaded.</div>
                    ) : (
                      quests.map((quest) => (
                        <div key={quest.id} className="border border-black bg-slate-950 p-1.5 text-left font-mono">
                          <div className="flex justify-between items-center gap-2 text-[7.5px]">
                            <span className="font-black text-slate-100 truncate max-w-[180px]">{quest.title}</span>
                            <span className={quest.claimed ? 'text-[#00ff66]' : quest.completed ? 'text-[#ffcc00]' : 'text-slate-400'}>
                              {quest.progress}/{quest.target}
                            </span>
                          </div>
                          <div className="text-[6.5px] text-slate-500 mt-0.5 leading-tight">{quest.description}</div>
                          <div className="text-[6.5px] mt-0.5 text-[#00d2ff]">+{quest.rewardXp} XP / +{quest.rewardEnergy} ENG</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-1.5">
                <button
                  type="button"
                  onClick={connectWallet}
                  disabled={isConnecting}
                  className={`w-full py-1.5 border-2 border-black pixel-btn-interactive text-[9px] font-bold uppercase tracking-wider font-mono cursor-pointer ${
                    isConnecting
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : walletConnected
                      ? 'bg-[#ff4b4b]/20 text-[#ff4b4b] border-black hover:bg-[#ff4b4b]/30'
                      : 'bg-[#00d2ff]/20 text-[#00d2ff] border-black hover:bg-[#00d2ff]/30'
                  }`}
                >
                  {isConnecting ? 'SYNCING...' : walletConnected ? 'Disconnect Wallet' : 'Connect Wallet'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Wanna completely reset all stats and XP?')) {
                      sound.playPop();
                      resetStats();
                    }
                  }}
                  className="w-full py-1.5 bg-[#ff4b4b]/10 text-[#ff4b4b]/70 hover:text-[#ff4b4b] border border-black/40 pixel-btn-interactive text-[9px] font-bold uppercase tracking-wider font-mono cursor-pointer"
                >
                  Hard Reset Progress
                </button>
              </div>
            </motion.div>
          )}

          {currentTab === 'rewards' && (
            <motion.div
              key="rewards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 h-full flex flex-col justify-between py-2 text-left"
            >
              {/* Compact Daily XP Check-in */}
              <div className="bg-[#18181c] border border-black pixel-box-sm p-2 flex items-center gap-3 font-mono">
                <div className="flex-shrink-0 w-8 h-8 bg-slate-950 border border-black flex items-center justify-center text-[#00ff66] animate-bounce-subtle">
                  <Gift className="w-4 h-4" />
                </div>
                <div className="flex-1 leading-tight text-left">
                  <h3 className="font-black text-[9px] text-slate-100 uppercase">
                    Daily Check-in
                  </h3>
                  <p className="text-[7.5px] text-slate-400 font-sans mt-0.5">
                    Claim 20 XP daily.
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {!walletConnected ? (
                    <span className="text-[6.5px] text-[#ff4b4b] bg-black px-1.5 py-1 border border-black uppercase font-bold block">
                      No Wallet
                    </span>
                  ) : dailyXpClaimedToday ? (
                    <span className="text-[7px] text-[#00ff66] bg-slate-950 px-1.5 py-1 border border-black/40 uppercase font-black block">
                      Claimed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={claimDailyXp}
                      className="px-2 py-1 bg-[#00ff66] hover:bg-[#00e55b] text-black font-black text-[8px] uppercase pixel-btn-interactive border border-black cursor-pointer"
                    >
                      +20 XP
                    </button>
                  )}
                </div>
              </div>

              {/* Compressed Balance and Withdraw */}
              <div className="bg-[#18181c] border border-black pixel-box-sm p-2.5 space-y-2.5 font-mono">
                <div className="grid grid-cols-2 gap-2 text-[8px]">
                  <div className="bg-black/40 border border-black p-1.5 flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Free:</span>
                    <span className="text-[#ffcc00] font-black">{goldenTickets.toFixed(2)} TKT</span>
                  </div>
                  <div className="bg-black/40 border border-black p-1.5 flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Held:</span>
                    <span className="text-[#00d2ff] font-black">{heldTickets.toFixed(2)} TKT</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-black space-y-1.5">
                  <div className="text-[7.5px] uppercase text-slate-400 font-bold">Withdraw Tickets</div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="flex-1 bg-black border border-black text-slate-200 px-2 py-1 text-[9px] font-mono min-w-0"
                      placeholder="Amount"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const amount = Number(withdrawAmount);
                        if (!walletConnected || !rawAddress) {
                          alert('Connect wallet first.');
                          return;
                        }
                        apiRequest('/api/tickets/withdraw-request', {
                          method: 'POST',
                          body: JSON.stringify({
                            userId: currentUserId,
                            walletAddress: rawAddress,
                            ticketAmount: amount,
                          }),
                        }).then(() => {
                          return apiRequest<{ availableTickets: number; heldTickets: number }>('/api/tickets/balance/' + encodeURIComponent(currentUserId));
                        }).then((balance) => {
                          setGoldenTickets(balance.availableTickets);
                          setHeldTickets(balance.heldTickets);
                          return apiRequest<{ transactions: any[] }>('/api/tickets/ledger/' + encodeURIComponent(currentUserId));
                        }).then((ledger) => {
                          setTransactions(ledger.transactions);
                          alert('Withdrawal request created.');
                        }).catch((error) => {
                          alert(error.message);
                        });
                      }}
                      className="px-3 py-1.5 bg-[#ff4b4b] text-black border border-black text-[8px] font-black uppercase pixel-btn-interactive cursor-pointer"
                    >
                      Withdraw
                    </button>
                  </div>
                  <div className="text-[6.5px] text-slate-500 text-left">
                    * Payouts require marketing wallet confirmation.
                  </div>
                </div>
              </div>

              {/* Activity & Payouts Log */}
              <div className="bg-[#18181c] border border-black pixel-box-sm p-2.5 space-y-1.5 font-mono text-[9px] flex-1 flex flex-col min-h-0">
                <div className="flex justify-between items-center uppercase font-bold text-slate-450 pb-1 border-b border-black">
                  <span className="flex items-center gap-1.5 text-[8.5px]">
                    <History className="w-3.5 h-3.5 text-[#00d2ff]" />
                    Activity Log
                  </span>
                  <Globe className="w-3 h-3 text-slate-655" />
                </div>

                <div className="space-y-1 overflow-y-auto custom-scroll flex-1 max-h-[100px] pr-0.5">
                  {transactions.length === 0 ? (
                    <div className="text-center py-4 text-slate-600 text-[8px] uppercase">
                      No activity recorded yet
                    </div>
                  ) : (
                    transactions.map((tx: any) => (
                      <div key={tx.id} className="flex justify-between items-center p-1 bg-black border border-black leading-tight text-[8px]">
                        <div className="flex items-center gap-1 text-left">
                          <span className={`w-1.5 h-1.5 ${
                            tx.type === 'claim'
                              ? 'bg-[#00d2ff]'
                              : tx.type === 'mint' || tx.type === 'reward' || tx.type === 'match_payout' || tx.type === 'referral_bonus'
                                ? 'bg-[#00ff66]'
                                : 'bg-[#ff4b4b]'
                          }`}></span>
                          <div>
                            <span className="text-slate-300 block">{tx.event}</span>
                            <span className="text-slate-500 text-[7px]">
                              {tx.time || (tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                            </span>
                          </div>
                        </div>
                        <span className="font-extrabold text-slate-200">{tx.value}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {currentTab === 'tournaments' && (
            <motion.div
              key="tournaments"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 h-full flex flex-col justify-center py-4"
            >
              <div className="bg-[#18181c] border border-black pixel-box-sm p-5 text-center space-y-4 relative">
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-950 border border-black px-2 py-0.5 text-[#ffcc00] text-[8px] font-mono">
                  <Lock className="w-2.5 h-2.5" /> COMING SOON
                </div>

                <div className="mx-auto w-10 h-10 bg-slate-950 border border-black flex items-center justify-center text-[#ffcc00]">
                  <Trophy className="w-5 h-5" />
                </div>

                <div className="space-y-1 font-mono">
                  <h3 className="font-black text-xs text-slate-100 uppercase">
                    CHAMPIONSHIPS
                  </h3>
                  <p className="text-[9px] text-slate-455 leading-relaxed font-sans max-w-xs mx-auto">
                    Compete in structured tournament leagues against fellow card players to share massive prize pools of TON tokens.
                  </p>
                </div>

                <div className="bg-black p-3 border border-black text-left text-[8px] font-mono space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Pool:</span>
                    <span className="text-[#00ff66] font-bold">100,000 TON</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Min Tier:</span>
                    <span>Level 3</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="text-[#00d2ff] font-bold">Deploying Contracts</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentTab === 'pvp' && (
            <motion.div
              key="pvp"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 h-full flex flex-col justify-center py-2 text-left"
            >
              {/* Consolidated PVP Sub Mode selector */}
              <div className="grid grid-cols-3 border border-black bg-slate-950 p-0.5 gap-0.5 text-[8px] font-mono font-bold">
                {(['public', 'private', 'practice'] as const).map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => {
                      sound.playPop();
                      setPvpSubMode(sub);
                    }}
                    className={`text-center py-1 uppercase transition-all cursor-pointer border ${
                      pvpSubMode === sub
                        ? 'bg-[#00ff66]/20 text-[#00ff66] border-[#00ff66]/40 shadow-[inset_1px_1px_rgba(255,255,255,0.1)]'
                        : 'text-slate-400 border-transparent hover:text-slate-200'
                    }`}
                  >
                    {sub === 'public' ? 'Public' : sub === 'private' ? 'Private' : 'Practice'}
                  </button>
                ))}
              </div>

              {/* Sub Mode Content */}
              {pvpSubMode === 'public' && (
                <>
                  {matchmakingState === 'searching' ? (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-3 font-mono">
                      <div className="relative flex items-center justify-center mx-auto w-10 h-10 bg-slate-950 border border-black">
                        <span className="text-[10px] font-black text-[#00d2ff]">{matchmakingTimer}S</span>
                      </div>
                      <div className="space-y-0.5">
                        <h3 className="font-black text-[9px] text-[#00ff66] uppercase">
                          QUEUE ACTIVE
                        </h3>
                        <p className="text-[8px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                          Match launches instantly with 4 players, or after the timer with at least 2. Current queue: {queueLength}/{MAX_MATCH_PLAYERS}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playPop();
                          apiRequest('/api/matchmaker/leave', {
                            method: 'POST',
                            body: JSON.stringify({ userId: currentUserId }),
                          }).then(() => {
                            return apiRequest<{ availableTickets: number; heldTickets: number }>('/api/tickets/balance/' + encodeURIComponent(currentUserId));
                          }).then((balance) => {
                            setGoldenTickets(balance.availableTickets);
                            setHeldTickets(balance.heldTickets);
                          }).finally(() => {
                            setMatchmakingState('idle');
                          });
                        }}
                        className="w-full py-1.5 bg-[#ff4b4b] text-black border border-black text-[9px] uppercase font-black pixel-btn-interactive"
                      >
                        Cancel Queue
                      </button>
                    </div>
                  ) : matchmakingState === 'success' ? (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-2 font-mono">
                      <h3 className="font-black text-[10px] text-[#00ff66] uppercase">
                        MATCH READY!
                      </h3>
                      <p className="text-[8px] text-slate-455">
                        {selectedStake === 0
                          ? 'Free public match ready. Energy has been spent.'
                          : `Match ready. Prize pool: ${(selectedStake * Math.max(queueLength, MIN_MATCH_PLAYERS) * 0.96).toFixed(2)} TKT`}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-3 font-mono">
                      <div className="flex justify-between items-center text-[9px]">
                        <h3 className="font-black text-slate-100 uppercase">
                          PUBLIC PVP ARENA
                        </h3>
                        <span className="text-[8px] text-[#ffcc00] bg-black px-1.5 py-0.5 border border-black">
                          {selectedStake === 0 ? (
                            <>ENG: <strong>{energy.energy}</strong> / {energy.maxEnergy}</>
                          ) : (
                            <>BAL: <strong>{goldenTickets.toFixed(2)}</strong> TKT</>
                          )}
                        </span>
                      </div>

                        <div className="grid grid-cols-3 gap-1">
                        {PUBLIC_STAKE_OPTIONS.map((stake) => (
                          <button
                            key={stake}
                            type="button"
                            onClick={() => {
                              sound.playPop();
                              setSelectedStake(stake);
                            }}
                            className={`p-1.5 border transition-all cursor-pointer font-mono text-center flex flex-col items-center justify-center ${
                              selectedStake === stake
                                ? 'bg-[#00d2ff] text-black border-black font-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                                : 'bg-black border-black text-slate-450'
                            }`}
                          >
                            <span className="text-[9px] font-black">{stake === 0 ? 'FREE' : `${stake}TKT`}</span>
                            <span className="text-[6px] block mt-0.5">{stake === 0 ? `${PUBLIC_FREE_MATCH_ENERGY_COST} energy` : 'stake'}</span>
                          </button>
                        ))}
                      </div>
                      <div className="bg-black p-2 border border-black text-[7.5px] leading-relaxed space-y-1.5 text-slate-450">
                        <div className="flex justify-between items-center text-slate-350">
                          <span className="font-bold">{selectedStake === 0 ? 'Free Cost:' : 'Prize Pool:'}</span>
                          <span className="text-[#00ff66] font-bold">
                            {selectedStake === 0
                              ? `${PUBLIC_FREE_MATCH_ENERGY_COST} energy / game`
                              : `${calculateTicketPayouts(selectedStake, MIN_MATCH_PLAYERS).netPrizePool.toFixed(2)} - ${calculateTicketPayouts(selectedStake, MAX_MATCH_PLAYERS).netPrizePool.toFixed(2)} TKT`}
                          </span>
                        </div>
                        {selectedStake === 0 ? (
                          <div className="text-[7px] text-slate-400">
                            Public matchmaking without ticket stake. Rewards are XP and quest progress only.
                          </div>
                        ) : (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playPop();
                              setShowPayoutDetails(!showPayoutDetails);
                            }}
                            className="text-[7px] text-[#00d2ff] hover:underline uppercase font-bold focus:outline-none cursor-pointer"
                          >
                            {showPayoutDetails ? 'Hide Payouts ▲' : 'Show Payouts ▼'}
                          </button>
                        </div>
                        )}
                        {selectedStake > 0 && showPayoutDetails && (
                          <div className="space-y-1 pt-1.5 border-t border-slate-900 animate-fade-in text-[7.5px]">
                            <div className="flex justify-between">
                              <span>2 players:</span>
                              <span className="text-slate-300">{formatPayoutRow(selectedStake, 2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>3 players:</span>
                              <span className="text-slate-300">{formatPayoutRow(selectedStake, 3)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>4 players:</span>
                              <span className="text-slate-300">{formatPayoutRow(selectedStake, 4)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        {/* Deposit Row */}
                        {selectedStake > 0 && (
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.1"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            className="flex-1 bg-black border border-black text-slate-200 px-2 py-1.5 text-[9px] font-mono min-w-0"
                            placeholder="Deposit tickets"
                          />
                          <button
                            type="button"
                            onClick={buyTicketsWithTon}
                            disabled={buyingTickets || !authReady}
                            className="flex-1 py-1.5 bg-black text-slate-300 border border-black text-[9px] font-black uppercase pixel-btn-interactive flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {buyingTickets ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <span>DEPOSIT</span>
                                <span className="text-[#00d2ff] text-[7px]">{Number(depositAmount || 0).toFixed(2)} TKT</span>
                              </>
                            )}
                          </button>
                          {depositFlowStatus === 'failed' && readPendingDeposit() && (
                            <button
                              type="button"
                              onClick={() => {
                                const pending = readPendingDeposit();
                                if (!pending) return;
                                confirmPendingDeposit(pending).catch(() => undefined);
                              }}
                              className="py-1.5 px-2 bg-[#3a1200] text-[#ffcc99] border border-black text-[8px] font-black uppercase"
                            >
                              RETRY
                            </button>
                          )}
                        </div>
                        )}

                        {selectedStake > 0 && !walletConnected && (
                          <div className="bg-[#08131f] border border-black p-2 text-[7.5px] text-slate-300 leading-relaxed">
                            Connect TON wallet for ticket-stake public matches. FREE public uses energy only.
                          </div>
                        )}

                        {/* Matchmaking Queue Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (!authReady) {
                              alert('Session is still syncing with the backend. Try again in a moment.');
                              return;
                            }
                            if (selectedStake > 0 && (!walletConnected || !rawAddress)) {
                              alert('Connect wallet first for ticket-stake public matches.');
                              return;
                            }
                            if (selectedStake === 0 && energy.energy < PUBLIC_FREE_MATCH_ENERGY_COST) {
                              alert(`You need ${PUBLIC_FREE_MATCH_ENERGY_COST} energy to join a free public game.`);
                              return;
                            }
                            if (selectedStake > 0 && goldenTickets < selectedStake) {
                              alert(`You need at least ${selectedStake} tickets to join this queue. Deposit through your wallet first.`);
                              return;
                            }
                            sound.playShuffle();
                            apiRequest<{
                              availableTickets: number;
                              heldTickets: number;
                              energy?: PlayerProfile['energy'];
                              matchmaker?: {
                                status: 'idle' | 'searching' | 'ready';
                                queueLength?: number;
                                countdownSec?: number;
                                matchId?: string;
                                players?: Array<{ userId: string; username: string; avatarId: string; stake: number }>;
                              };
                            }>('/api/matchmaker/join', {
                              method: 'POST',
                              body: JSON.stringify({
                                userId: currentUserId,
                                username: userName,
                                avatarId: selectedAvatar,
                                walletAddress: rawAddress || null,
                                stake: selectedStake,
                                mode: 'pvp',
                              }),
                            }).then((result) => {
                              setGoldenTickets(result.availableTickets);
                              setHeldTickets(result.heldTickets);
                              if (result.energy) {
                                updateProfileEnergy(result.energy);
                              }
                              setQueueLength(result.matchmaker?.players?.length || result.matchmaker?.queueLength || 1);
                              setMatchmakingTimer(result.matchmaker?.countdownSec ?? MATCHMAKING_TIMEOUT_SEC);
                              if (result.matchmaker?.status === 'ready' && result.matchmaker.matchId) {
                                localStorage.setItem('redoapp_active_match', JSON.stringify({
                                  matchId: result.matchmaker.matchId,
                                  mode: 'pvp',
                                  stake: selectedStake,
                                  currentUserId,
                                  players: result.matchmaker.players || [],
                                  createdAt: Date.now(),
                                }));
                                setMatchmakingState('success');
                                onStartGame('pvp', selectedStake);
                                return;
                              }
                              setMatchmakingState('searching');
                            }).catch((error) => {
                              alert(error.message);
                            });
                          }}
                          className="w-full py-2 bg-[#00ff66] text-black font-black text-[10px] uppercase pixel-btn-interactive border border-black shadow-[2px_2px_0_#000] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {selectedStake === 0 ? 'JOIN FREE PUBLIC' : 'JOIN REAL QUEUE'}
                        </button>
                      </div>

                      {depositFlowStatus !== 'idle' && depositStatusMessage && (
                        <div className={`border border-black px-2 py-1.5 text-[7.5px] leading-relaxed ${
                          depositFlowStatus === 'confirmed'
                            ? 'bg-[#062b12] text-[#8dffaf]'
                            : depositFlowStatus === 'failed'
                              ? 'bg-[#2a0d0d] text-[#ff9a9a]'
                              : 'bg-[#08131f] text-[#9ed8ff]'
                        }`}>
                          {depositStatusMessage}
                        </div>
                      )}

                      {pendingDeposits.length > 0 && (
                        <div className="bg-[#12091e] border border-black p-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase text-[#d8a8ff]">Pending blockchain deposits</span>
                            <button
                              type="button"
                              onClick={() => {
                                refreshPendingDeposits().catch(() => undefined);
                              }}
                              className="text-[7px] uppercase text-[#9ed8ff]"
                            >
                              Refresh
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {pendingDeposits.map((deposit) => {
                              const localPending = readPendingDeposit();
                              const canResumeLocal = localPending?.intentId === deposit.id;
                              return (
                                <div key={deposit.id} className="border border-black bg-black/60 px-2 py-1.5 text-[7px] text-slate-250 space-y-1">
                                  <div className="flex justify-between gap-2">
                                    <span>{deposit.ticketAmount.toFixed(2)} TKT / {deposit.tonAmount.toFixed(2)} TON</span>
                                    <span className="text-[#ffcc99]">{deposit.confirmationAttempts} checks</span>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <span>Created: {new Date(deposit.createdAt).toLocaleTimeString()}</span>
                                    <span>Expires: {new Date(deposit.expiresAt).toLocaleTimeString()}</span>
                                  </div>
                                  {deposit.lastVerificationError && (
                                    <div className="text-[#ff9a9a]">{deposit.lastVerificationError}</div>
                                  )}
                                  <div className="flex gap-2">
                                    {canResumeLocal && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!localPending) return;
                                          confirmPendingDeposit(localPending).catch(() => undefined);
                                        }}
                                        className="px-2 py-1 bg-[#17324d] border border-black text-[#9ed8ff] uppercase"
                                      >
                                        Retry now
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {pvpSubMode === 'private' && (
                <>
                  {showRoomDisclaimer ? (
                    <div className="bg-[#0c0f12] border-2 border-[#ff4b4b] pixel-box-sm p-3 text-center space-y-2 font-mono text-[8px]">
                      <h3 className="font-black text-[9px] text-[#ff4b4b] uppercase">
                        {privateStakeRequiresWallet ? 'Private Stake Match' : 'Free Private Match'}
                      </h3>
                      <div className="text-[7.5px] text-slate-355 leading-relaxed text-left bg-black p-2 border border-black space-y-1">
                        <p>
                          <strong>{privateStakeRequiresWallet ? 'You are joining a PRIVATE stake table.' : 'You are joining a FREE private table.'}</strong>
                        </p>
                        {privateStakeRequiresWallet ? (
                          <p className="text-[#ffcc00] font-bold">
                            Rewards are paid for every place. Commission details are listed in the rules.
                          </p>
                        ) : (
                          <p className="text-[#00ff66] font-bold">
                            This room uses 0 TKT stake, so no ticket hold or payout is applied.
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sound.playPop();
                            setShowRoomDisclaimer(false);
                          }}
                          className="flex-1 py-1 bg-black text-slate-455 border border-black uppercase font-bold pixel-btn-interactive text-[8px]"
                        >
                          Exit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (privateStakeRequiresWallet && !walletConnected) {
                              connectWallet();
                              return;
                            }
                            sound.playPop();
                            joinPrivateRoomByCode().catch(() => undefined);
                          }}
                          className="flex-1 py-1 bg-[#ff4b4b] text-black uppercase font-black pixel-btn-interactive border border-black text-[8px]"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-3 font-mono">
                      <div className="flex justify-between items-center text-[9px]">
                        <h3 className="font-black text-slate-100 uppercase">
                          PRIVATE ROOM
                        </h3>
                        <span className="text-[8px] text-[#00d2ff] bg-black px-1.5 py-0.5 border border-black">
                          BAL: <strong>{goldenTickets.toFixed(2)}</strong> TKT
                        </span>
                      </div>

                      {!walletConnected && (
                        <div className={`border border-black p-2 text-[8px] leading-relaxed ${
                          privateStakeRequiresWallet ? 'bg-[#1c1010] text-[#ffb3b3]' : 'bg-[#08131f] text-[#9ed8ff]'
                        }`}>
                          {privateStakeRequiresWallet
                            ? 'Paid private rooms still require a wallet connection. Switch stake to FREE or connect your wallet.'
                            : 'FREE private rooms are open without wallet connection. Invite friends with a room code and play at 0 TKT stake.'}
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-[7px] font-bold text-slate-400 uppercase font-mono">Select Room Stake</label>
                        <div className="grid grid-cols-4 gap-1">
                          {PRIVATE_STAKE_OPTIONS.map((stake) => (
                            <button
                              key={stake}
                              type="button"
                              onClick={() => {
                                sound.playPop();
                                setPrivateRoomStake(stake);
                                setGeneratedLink('');
                                setPrivateRoomCode('');
                                setPrivateRoomStatus('idle');
                                setPrivateRoomCreateState('idle');
                                setPrivateRoomError('');
                                setPrivateRoomPlayersCount(0);
                              }}
                              className={`p-1.5 border transition-all cursor-pointer font-mono text-center flex flex-col items-center justify-center ${
                                privateRoomStake === stake
                                  ? 'bg-[#00d2ff] text-black border-black font-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                                  : 'bg-black border-black text-slate-450'
                              }`}
                            >
                              <span className="text-[9px] font-black">{stake === 0 ? 'FREE' : `${stake}TKT`}</span>
                              <span className="text-[6px] block mt-0.5">{stake === 0 ? '0 stake' : 'stake'}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[7px] font-bold text-slate-400 uppercase font-mono">Players In Room</label>
                        <div className="grid grid-cols-3 gap-1">
                          {([2, 3, 4] as const).map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => {
                                sound.playPop();
                                setPrivateRoomTargetPlayers(count);
                                setGeneratedLink('');
                                setPrivateRoomCode('');
                                setPrivateRoomStatus('idle');
                                setPrivateRoomCreateState('idle');
                                setPrivateRoomError('');
                                setPrivateRoomPlayersCount(0);
                              }}
                              className={`p-1.5 border transition-all cursor-pointer font-mono text-center flex flex-col items-center justify-center ${
                                privateRoomTargetPlayers === count
                                  ? 'bg-[#ffcc00] text-black border-black font-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                                  : 'bg-black border-black text-slate-450'
                              }`}
                            >
                              <span className="text-[9px] font-black">{count}</span>
                              <span className="text-[6px] block mt-0.5">players</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-black p-2 border border-black font-mono text-[8px] leading-relaxed">
                        {privateRoomStake === 0 ? (
                          <div className="flex justify-between text-slate-400">
                            <span>Room reward</span>
                            <span className="font-black text-[#00d2ff]">FREE · XP ONLY</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between mb-1">
                              <span className="text-slate-400">Prize pool</span>
                              <span className="font-black text-[#00ff66]">
                                {calculateTicketPayouts(privateRoomStake, privateRoomTargetPlayers).netPrizePool.toFixed(2)} TKT
                              </span>
                            </div>
                            <div className="text-[#ffcc00] font-bold text-right">
                              {formatPayoutRow(privateRoomStake, privateRoomTargetPlayers)}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[7px] font-bold text-slate-400 uppercase font-mono">Join By Room Code</label>
                        <input
                          type="text"
                          value={privateJoinCode}
                          onChange={(e) => setPrivateJoinCode(e.target.value.toUpperCase())}
                          placeholder="ROOM CODE"
                          className="w-full bg-black border border-black text-slate-200 px-2 py-2 text-[9px] font-mono tracking-widest uppercase"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const normalizedCode = privateJoinCode.trim().toUpperCase();
                          if (!normalizedCode) {
                            alert('Enter a room code first.');
                            return;
                          }
                          sound.playPop();
                          setPrivateRoomCode(normalizedCode);
                          setShowRoomDisclaimer(true);
                        }}
                        className="w-full py-2 bg-[#ffcc00] text-black font-black text-[9px] uppercase pixel-btn-interactive border border-black shadow-[2px_2px_0_#000] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Join By Code
                      </button>

                      {privateRoomError && (
                        <div className="bg-[#2a0d0d] border border-black px-2 py-1.5 text-[7.5px] leading-relaxed text-[#ffb3b3] font-mono">
                          {privateRoomError}
                        </div>
                      )}

                      {!generatedLink ? (
                        <button
                          type="button"
                          onClick={createPrivateRoom}
                          disabled={!authReady || privateRoomCreateState === 'creating'}
                          className="w-full py-2 bg-[#00ff66] text-black font-black text-[9px] uppercase pixel-btn-interactive border border-black shadow-[2px_2px_0_#000] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {!authReady
                            ? 'Syncing Session...'
                            : privateRoomCreateState === 'creating'
                            ? 'Creating Room...'
                            : privateStakeRequiresWallet ? 'Generate Invite Link' : 'Create Free Room'}
                        </button>
                      ) : (
                        <div className="space-y-2 text-[9px]">
                          <div className="flex gap-1">
                            <input
                              type="text"
                              readOnly
                              value={generatedLink}
                              className="flex-1 bg-black border border-black text-slate-350 px-2 py-1.5 text-[7px] font-mono focus:outline-none select-all"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                sound.playPop();
                                navigator.clipboard.writeText(generatedLink);
                                alert("Link copied to clipboard!");
                              }}
                              className="px-2 py-1.5 bg-[#00d2ff] text-black text-[8px] font-black uppercase pixel-btn-interactive border border-black"
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!privateRoomCode) return;
                                sound.playPop();
                                const sharePayload = buildPrivateRoomSharePayload(privateRoomCode);
                                navigator.clipboard.writeText(sharePayload.telegramSchemeLink);
                                alert('Telegram deep link copied.');
                              }}
                              className="px-2 py-1.5 bg-[#ffcc00] text-black text-[8px] font-black uppercase pixel-btn-interactive border border-black"
                            >
                              Tg Link
                            </button>
                          </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (privateStakeRequiresWallet && !walletConnected) {
                              connectWallet();
                              return;
                            }
                            sound.playPop();
                            if (privateRoomStatus === 'waiting') {
                              setCurrentTab('pvp');
                              setPvpSubMode('private');
                              return;
                            }
                            setShowRoomDisclaimer(true);
                          }}
                          className="w-full py-1.5 bg-black text-slate-200 border border-black text-[9px] font-black uppercase pixel-btn-interactive"
                        >
                          Enter Room
                        </button>
                          <div className="bg-black p-2 border border-black text-[8px] text-slate-400">
                            Room code: <span className="text-[#00d2ff] font-black">{privateRoomCode || 'pending'}</span> · Players: <span className="text-[#ffcc00] font-black">{privateRoomPlayersCount}/{privateRoomTargetPlayers}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {pvpSubMode === 'practice' && (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-3 font-mono">
                  <h3 className="font-black text-[10px] text-[#00ff66] uppercase tracking-wider">
                    [ READY TO PRACTICE ]
                  </h3>
                  <p className="text-[8px] text-slate-350 leading-relaxed font-sans max-w-xs mx-auto">
                    Practice card matches against AI bots. Practice gives reduced XP and never touches your ticket balance.
                  </p>
                  
                  <button
                    type="button"
                    onClick={() => {
                      sound.playShuffle();
                      onStartGame('offline', 0);
                    }}
                    className="w-full py-3 bg-[#00ff66] text-black font-black text-[10px] uppercase tracking-wider pixel-btn-interactive border border-black flex items-center justify-center gap-1.5 shadow-[2px_2px_0_#000]"
                  >
                    <Play className="w-3.5 h-3.5 fill-black text-black" />
                    PLAY FOR FREE (VS BOTS)
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* WALLET CONNECT OVERLAY MODAL */}
      <AnimatePresence>
        {showConnectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono select-none"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[#12161a] border-4 border-black p-5 relative shadow-[6px_6px_0_#000] pixel-box-lg flex flex-col gap-4 text-center"
            >
              {/* Retro top decoration bar */}
              <div className="absolute -top-3 left-6 bg-[#00d2ff] text-black text-[7px] font-black uppercase px-2 py-0.5 border-2 border-black">
                SECURE GATEWAY
              </div>

              {/* Large pulsing TON Connect Icon */}
              <div className="mx-auto w-14 h-14 bg-slate-950 border-2 border-black flex items-center justify-center text-[#00d2ff] relative overflow-hidden shadow-[inset_0_0_10px_rgba(0,210,255,0.2)] mt-2">
                <Wallet className="w-7 h-7 text-[#00d2ff]" />
              </div>

              <div className="space-y-2">
                <h3 className="font-black text-xs min-[370px]:text-sm text-slate-100 uppercase tracking-wider">
                  Sync TON Wallet
                </h3>
                <p className="text-[9px] min-[370px]:text-[10px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                  Connect your TON wallet to sync progress, enter stake-based tables, and unlock reward flows that refill your energy through quests.
                </p>
              </div>

              {/* Benefit list */}
              <div className="bg-slate-950 p-3 border border-black text-left text-[8px] min-[370px]:text-[9px] space-y-2 text-slate-300">
                <div className="flex gap-2 items-start">
                  <span className="text-[#00ff66]">✓</span>
                  <span>Access PVP Arena with stakes from 0.3 to 30 tickets.</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-[#00ff66]">✓</span>
                  <span>Instant deposits and secure payout distribution.</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-[#00ff66]">✓</span>
                  <span>Zero passwords needed. Sign transactions directly.</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleActualConnect}
                  className="w-full py-2.5 bg-[#00ff66] hover:bg-[#00e55b] text-black font-black text-xs uppercase tracking-wider pixel-btn-interactive border-2 border-black shadow-[2px_2px_0_#000]"
                >
                  Sync with TON Connect
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playPop();
                    setShowConnectModal(false);
                  }}
                  className="w-full py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 border border-black/40 pixel-btn-interactive text-[10px] font-bold uppercase font-mono"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

