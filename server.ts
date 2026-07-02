import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { Response } from 'express';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const MARKETING_WALLET = process.env.MARKETING_WALLET || 'UQAihtS9I5lalYn9G8aRgyBq8UNLNC7N-aODCJJUdX4zKGDj';
const TICKET_PRICE_TON = Number(process.env.TICKET_PRICE_TON || '1');
const MIN_WITHDRAW_TICKETS = 5;
const ENABLE_CHAIN_VERIFICATION = process.env.ENABLE_CHAIN_VERIFICATION === 'true';
const TON_VERIFICATION_MODE = process.env.TON_VERIFICATION_MODE || 'manual';
const TON_API_BASE_URL = process.env.TON_API_BASE_URL || '';
const TON_API_KEY = process.env.TON_API_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'redo_appbot';
const TELEGRAM_INITDATA_MAX_AGE_SEC = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC || '86400');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'runtime-state.json');
const DEFAULT_MAX_ENERGY = 10;
const DEFAULT_ENERGY_REGEN_INTERVAL_SEC = 30 * 60;
const DAILY_ENERGY_REWARD = 3;
const DAILY_XP_REWARD = 20;
const REFERRER_REWARD_XP = 100;
const REFERRER_REWARD_ENERGY = 3;
const REFERRED_REWARD_XP = 50;
const REFERRED_REWARD_ENERGY = 2;

app.use(cors());
app.use(express.json());

type MatchMode = 'pvp' | 'private';
type CardColor = 'red' | 'blue' | 'yellow' | 'green' | 'wild';
type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild_draw4';
type LedgerType =
  | 'wallet'
  | 'reward'
  | 'purchase'
  | 'stake_hold'
  | 'stake_release'
  | 'match_payout'
  | 'fund_season'
  | 'fund_burn'
  | 'withdraw_pending'
  | 'withdraw_completed';

interface TicketLedgerEntry {
  id: string;
  userId: string;
  event: string;
  value: string;
  type: LedgerType;
  amount: number;
  createdAt: number;
}

interface ServerCard {
  id: string;
  color: CardColor;
  value: CardValue;
  score: number;
}

interface ServerGamePlayer {
  userId: string;
  username: string;
  avatarId: string;
  hand: ServerCard[];
  isAi: boolean;
  unoDeclared: boolean;
  emotion: 'happy' | 'thinking' | 'worried' | 'angry' | 'celebrating';
}

interface ServerGameState {
  deck: ServerCard[];
  discardPile: ServerCard[];
  players: ServerGamePlayer[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  activeColor: CardColor;
  activeValue: CardValue;
  phase: 'playing' | 'game_over';
  winnerUserId: string | null;
  logs: Array<{ id: string; timestamp: string; message: string; type: 'info' | 'play' | 'draw' | 'action' | 'win' }>;
  consecutiveDraws: number;
}

interface UserState {
  userId: string;
  telegramId?: number;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  telegramPhotoUrl?: string;
  telegramChatId?: number;
  telegramAuthAt?: number;
  walletAddress?: string;
  availableTickets: number;
  heldTickets: number;
  xp: number;
  lastDailyXpAt: number | null;
  lastDailyEnergyAt: number | null;
  energy: number;
  maxEnergy: number;
  energyUpdatedAt: number;
  referralCode: string;
  referredByUserId?: string;
  referralStatus?: 'pending' | 'activated' | 'rejected';
  referralAssignedAt?: number | null;
  referralActivatedAt?: number | null;
  referralActivationMatchId?: string | null;
  referralsActivated: number;
  completedQuestIds: string[];
  transactions: TicketLedgerEntry[];
}

interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  kind: 'daily' | 'weekly';
  metric: 'play_online' | 'play_private' | 'win_any' | 'spend_energy' | 'invite_referral';
  target: number;
  rewardXp: number;
  rewardEnergy: number;
}

interface UserQuestProgress {
  questId: string;
  progress: number;
  claimed: boolean;
  updatedAt: number;
}

interface TelegramNotification {
  id: string;
  userId: string;
  telegramChatId: number;
  message: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: number;
  sentAt?: number;
  error?: string;
}

interface TelegramAuthPayload {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date: number;
  start_param?: string;
}

interface DepositIntent {
  id: string;
  userId: string;
  walletAddress: string;
  ticketAmount: number;
  tonAmount: number;
  status: 'pending' | 'confirmed';
  createdAt: number;
}

interface WithdrawalRequest {
  id: string;
  userId: string;
  walletAddress: string;
  ticketAmount: number;
  status: 'pending' | 'completed';
  createdAt: number;
}

interface QueuePlayer {
  userId: string;
  username: string;
  avatarId: string;
  stake: number;
  mode: MatchMode;
  joinedAt: number;
}

interface ActiveMatch {
  matchId: string;
  mode: MatchMode;
  stake: number;
  players: QueuePlayer[];
  createdAt: number;
  settled: boolean;
  gameState: ServerGameState;
}

interface PrivateRoom {
  roomCode: string;
  stake: number;
  hostUserId: string;
  players: QueuePlayer[];
  createdAt: number;
  status: 'waiting' | 'ready' | 'started';
  matchId?: string;
}

interface PersistedState {
  users: UserState[];
  depositIntents: DepositIntent[];
  withdrawalRequests: WithdrawalRequest[];
  matchmakingQueue: QueuePlayer[];
  activeMatches: ActiveMatch[];
  activeMatchByUser: Array<[string, string]>;
  privateRooms: PrivateRoom[];
  questProgressByUser?: Array<[string, UserQuestProgress[]]>;
  telegramNotifications?: TelegramNotification[];
}

interface TonVerificationResult {
  ok: boolean;
  provider: string;
  reason?: string;
  normalizedTxHash?: string;
}

const users = new Map<string, UserState>();
const depositIntents = new Map<string, DepositIntent>();
const withdrawalRequests = new Map<string, WithdrawalRequest>();
let matchmakingQueue: QueuePlayer[] = [];
const activeMatches = new Map<string, ActiveMatch>();
const activeMatchByUser = new Map<string, string>();
const privateRooms = new Map<string, PrivateRoom>();
const questProgressByUser = new Map<string, UserQuestProgress[]>();
const telegramNotifications: TelegramNotification[] = [];
const matchSubscribers = new Map<string, Set<Response>>();
const privateRoomSubscribers = new Map<string, Set<Response>>();
const queueSubscribers = new Map<string, Set<Response>>();
let persistTimer: NodeJS.Timeout | null = null;

const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'daily_online_1',
    title: 'Public Queue',
    description: 'Play 1 online queue match.',
    kind: 'daily',
    metric: 'play_online',
    target: 1,
    rewardXp: 25,
    rewardEnergy: 1,
  },
  {
    id: 'daily_private_1',
    title: 'Private Room',
    description: 'Play 1 private room match.',
    kind: 'daily',
    metric: 'play_private',
    target: 1,
    rewardXp: 25,
    rewardEnergy: 1,
  },
  {
    id: 'daily_win_1',
    title: 'Win Once',
    description: 'Win any 1 match.',
    kind: 'daily',
    metric: 'win_any',
    target: 1,
    rewardXp: 40,
    rewardEnergy: 1,
  },
  {
    id: 'daily_spend_energy_3',
    title: 'Burn Energy',
    description: 'Spend 3 energy.',
    kind: 'daily',
    metric: 'spend_energy',
    target: 3,
    rewardXp: 30,
    rewardEnergy: 0,
  },
  {
    id: 'weekly_invite_1',
    title: 'First Referral',
    description: 'Activate 1 referral.',
    kind: 'weekly',
    metric: 'invite_referral',
    target: 1,
    rewardXp: 100,
    rewardEnergy: 2,
  },
];

function buildPersistedState(): PersistedState {
  return {
    users: Array.from(users.values()),
    depositIntents: Array.from(depositIntents.values()),
    withdrawalRequests: Array.from(withdrawalRequests.values()),
    matchmakingQueue,
    activeMatches: Array.from(activeMatches.values()),
    activeMatchByUser: Array.from(activeMatchByUser.entries()),
    privateRooms: Array.from(privateRooms.values()),
    questProgressByUser: Array.from(questProgressByUser.entries()),
    telegramNotifications,
  };
}

function persistStateNow() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(buildPersistedState()), 'utf8');
}

function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      persistStateNow();
    } catch (error) {
      console.error('Failed to persist runtime state', error);
    }
  }, 100);
}

function loadPersistedState() {
  if (!existsSync(STATE_FILE)) {
    return;
  }

  try {
    const snapshot = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as PersistedState;
    users.clear();
    depositIntents.clear();
    withdrawalRequests.clear();
    activeMatches.clear();
    activeMatchByUser.clear();
    privateRooms.clear();
    questProgressByUser.clear();
    telegramNotifications.splice(0, telegramNotifications.length);

    snapshot.users?.forEach((user) => users.set(user.userId, user));
    snapshot.depositIntents?.forEach((intent) => depositIntents.set(intent.id, intent));
    snapshot.withdrawalRequests?.forEach((request) => withdrawalRequests.set(request.id, request));
    matchmakingQueue = snapshot.matchmakingQueue || [];
    snapshot.activeMatches?.forEach((match) => activeMatches.set(match.matchId, match));
    snapshot.activeMatchByUser?.forEach(([userId, matchId]) => activeMatchByUser.set(userId, matchId));
    snapshot.privateRooms?.forEach((room) => privateRooms.set(room.roomCode, room));
    snapshot.questProgressByUser?.forEach(([userId, progress]) => questProgressByUser.set(userId, progress));
    snapshot.telegramNotifications?.forEach((entry) => telegramNotifications.push(entry));
  } catch (error) {
    console.error('Failed to load persisted runtime state', error);
  }
}

function getUser(userId: string, walletAddress?: string): UserState {
  const existing = users.get(userId);
  if (existing) {
    if (walletAddress) existing.walletAddress = walletAddress;
    hydrateUser(existing);
    schedulePersist();
    return existing;
  }

  const created: UserState = {
    userId,
    walletAddress,
    lastDailyEnergyAt: null,
    availableTickets: 0,
    heldTickets: 0,
    xp: 0,
    lastDailyXpAt: null,
    energy: DEFAULT_MAX_ENERGY,
    maxEnergy: DEFAULT_MAX_ENERGY,
    energyUpdatedAt: Date.now(),
    referralCode: createReferralCode(),
    referralsActivated: 0,
    completedQuestIds: [],
    transactions: [],
  };
  users.set(userId, created);
  schedulePersist();
  return created;
}

function createReferralCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function hydrateUser(user: UserState) {
  user.energy = Math.max(0, Number.isFinite(user.energy) ? user.energy : DEFAULT_MAX_ENERGY);
  user.maxEnergy = Math.max(1, Number.isFinite(user.maxEnergy) ? user.maxEnergy : DEFAULT_MAX_ENERGY);
  user.energyUpdatedAt = Number.isFinite(user.energyUpdatedAt) ? user.energyUpdatedAt : Date.now();
  user.referralCode = user.referralCode || createReferralCode();
  user.completedQuestIds = Array.isArray(user.completedQuestIds) ? user.completedQuestIds : [];
  user.referralsActivated = Number.isFinite(user.referralsActivated) ? user.referralsActivated : 0;
  user.lastDailyEnergyAt ??= null;
}

function getStartOfUtcDay(ts: number) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function getStartOfUtcWeek(ts: number) {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + diff);
  return start.getTime();
}

function recalculateEnergy(user: UserState, now = Date.now()) {
  hydrateUser(user);
  if (user.energy >= user.maxEnergy) {
    user.energy = user.maxEnergy;
    user.energyUpdatedAt = now;
    return user;
  }
  const elapsedSec = Math.max(0, Math.floor((now - user.energyUpdatedAt) / 1000));
  const restored = Math.floor(elapsedSec / DEFAULT_ENERGY_REGEN_INTERVAL_SEC);
  if (restored > 0) {
    user.energy = Math.min(user.maxEnergy, user.energy + restored);
    user.energyUpdatedAt = now;
    schedulePersist();
  }
  return user;
}

function getEnergyState(user: UserState) {
  const hydrated = recalculateEnergy(user);
  const nextEnergyAt = hydrated.energy >= hydrated.maxEnergy
    ? null
    : hydrated.energyUpdatedAt + DEFAULT_ENERGY_REGEN_INTERVAL_SEC * 1000;
  return {
    energy: hydrated.energy,
    maxEnergy: hydrated.maxEnergy,
    nextEnergyAt,
    regenIntervalSec: DEFAULT_ENERGY_REGEN_INTERVAL_SEC,
  };
}

function spendEnergy(user: UserState, amount: number, reason: string) {
  recalculateEnergy(user);
  if (user.energy < amount) {
    throw new Error('Not enough energy.');
  }
  user.energy -= amount;
  user.energyUpdatedAt = Date.now();
  createLedgerEntry(user, {
    event: reason,
    value: `-${amount} ENG`,
    type: 'reward',
    amount: -amount,
  });
}

function rewardEnergy(user: UserState, amount: number, reason: string) {
  recalculateEnergy(user);
  user.energy = Math.min(user.maxEnergy, user.energy + amount);
  user.energyUpdatedAt = Date.now();
  createLedgerEntry(user, {
    event: reason,
    value: `+${amount} ENG`,
    type: 'reward',
    amount,
  });
}

function rewardXp(user: UserState, amount: number, reason: string) {
  user.xp += amount;
  createLedgerEntry(user, {
    event: reason,
    value: `+${amount} XP`,
    type: 'reward',
    amount,
  });
}

function getQuestProgress(userId: string) {
  if (!questProgressByUser.has(userId)) {
    questProgressByUser.set(userId, []);
  }
  return questProgressByUser.get(userId)!;
}

function updateQuestProgress(userId: string, metric: QuestDefinition['metric'], delta = 1) {
  const now = Date.now();
  const questProgress = getQuestProgress(userId);
  for (const quest of QUEST_DEFINITIONS.filter((entry) => entry.metric === metric)) {
    const resetBoundary = quest.kind === 'daily' ? getStartOfUtcDay(now) : getStartOfUtcWeek(now);
    let progress = questProgress.find((entry) => entry.questId === quest.id);
    if (!progress) {
      progress = { questId: quest.id, progress: 0, claimed: false, updatedAt: resetBoundary };
      questProgress.push(progress);
    }
    const existingBoundary = quest.kind === 'daily' ? getStartOfUtcDay(progress.updatedAt) : getStartOfUtcWeek(progress.updatedAt);
    if (existingBoundary !== resetBoundary) {
      progress.progress = 0;
      progress.claimed = false;
      progress.updatedAt = now;
    }
    progress.progress = Math.min(quest.target, progress.progress + delta);
    progress.updatedAt = now;
  }
  schedulePersist();
}

function claimCompletedQuests(user: UserState) {
  const progressList = getQuestProgress(user.userId);
  const claimed: string[] = [];
  for (const quest of QUEST_DEFINITIONS) {
    const progress = progressList.find((entry) => entry.questId === quest.id);
    if (!progress || progress.claimed || progress.progress < quest.target) {
      continue;
    }
    progress.claimed = true;
    if (quest.rewardXp) rewardXp(user, quest.rewardXp, `Quest: ${quest.title}`);
    if (quest.rewardEnergy) rewardEnergy(user, quest.rewardEnergy, `Quest: ${quest.title}`);
    claimed.push(quest.id);
  }
  if (claimed.length) {
    user.completedQuestIds = Array.from(new Set([...user.completedQuestIds, ...claimed]));
    schedulePersist();
  }
  return claimed;
}

function buildQuestView(userId: string) {
  const progressList = getQuestProgress(userId);
  const now = Date.now();
  return QUEST_DEFINITIONS.map((quest) => {
    const progress = progressList.find((entry) => entry.questId === quest.id);
    const boundary = progress ? (quest.kind === 'daily' ? getStartOfUtcDay(progress.updatedAt) : getStartOfUtcWeek(progress.updatedAt)) : null;
    const currentBoundary = quest.kind === 'daily' ? getStartOfUtcDay(now) : getStartOfUtcWeek(now);
    const currentProgress = boundary === currentBoundary && progress ? progress.progress : 0;
    const claimed = boundary === currentBoundary && !!progress?.claimed;
    return {
      ...quest,
      progress: currentProgress,
      claimed,
      completed: currentProgress >= quest.target,
    };
  });
}

function findUserByReferralCode(code: string) {
  const normalized = String(code || '').trim().toUpperCase();
  return Array.from(users.values()).find((user) => user.referralCode === normalized);
}

function queueTelegramNotification(user: UserState, message: string) {
  if (!user.telegramChatId) {
    return;
  }
  telegramNotifications.push({
    id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: user.userId,
    telegramChatId: user.telegramChatId,
    message,
    status: 'pending',
    createdAt: Date.now(),
  });
  schedulePersist();
}

async function flushTelegramNotifications() {
  if (!TELEGRAM_BOT_TOKEN) return;
  const pending = telegramNotifications.filter((item) => item.status === 'pending').slice(0, 5);
  for (const item of pending) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: item.telegramChatId,
          text: item.message,
        }),
      });
      if (!response.ok) {
        const payload = await response.text();
        item.status = 'failed';
        item.error = payload;
      } else {
        item.status = 'sent';
        item.sentAt = Date.now();
      }
    } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : 'Notification failed';
    }
  }
  schedulePersist();
}

function verifyTelegramInitData(initData: string): TelegramAuthPayload | null {
  if (!initData || !TELEGRAM_BOT_TOKEN) {
    return null;
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const sorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
  const calculated = crypto.createHmac('sha256', secret).update(sorted).digest('hex');
  if (calculated !== hash) {
    return null;
  }
  const authDate = Number(params.get('auth_date') || '0');
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || nowSec - authDate > TELEGRAM_INITDATA_MAX_AGE_SEC) {
    return null;
  }
  const rawUser = params.get('user');
  if (!rawUser) {
    return null;
  }
  const user = JSON.parse(rawUser) as { id: number; username?: string; first_name?: string; last_name?: string; photo_url?: string };
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    photo_url: user.photo_url,
    auth_date: authDate,
    start_param: params.get('start_param') || params.get('tgWebAppStartParam') || undefined,
  };
}

function applyTelegramAuth(user: UserState, auth: TelegramAuthPayload) {
  user.telegramId = auth.id;
  user.telegramChatId = auth.id;
  user.telegramUsername = auth.username;
  user.telegramFirstName = auth.first_name;
  user.telegramLastName = auth.last_name;
  user.telegramPhotoUrl = auth.photo_url;
  user.telegramAuthAt = auth.auth_date;
}

function resolveCanonicalUserId(body: { userId?: string; telegramInitData?: string; walletAddress?: string }) {
  const auth = body.telegramInitData ? verifyTelegramInitData(body.telegramInitData) : null;
  if (auth) {
    return {
      userId: `tg:${auth.id}`,
      auth,
    };
  }
  return {
    userId: body.userId || '',
    auth: null,
  };
}

function assignReferralIfNeeded(user: UserState, startParam?: string) {
  if (!startParam || user.referredByUserId || !startParam.startsWith('ref_')) {
    return;
  }
  const referralCode = startParam.replace(/^ref_/i, '').trim().toUpperCase();
  const inviter = findUserByReferralCode(referralCode);
  if (!inviter || inviter.userId === user.userId) {
    user.referralStatus = 'rejected';
    return;
  }
  user.referredByUserId = inviter.userId;
  user.referralStatus = 'pending';
  user.referralAssignedAt = Date.now();
  schedulePersist();
}

function maybeActivateReferral(user: UserState, matchId: string) {
  if (!user.referredByUserId || user.referralStatus === 'activated') {
    return false;
  }
  const inviter = users.get(user.referredByUserId);
  if (!inviter || inviter.userId === user.userId) {
    user.referralStatus = 'rejected';
    return false;
  }
  user.referralStatus = 'activated';
  user.referralActivatedAt = Date.now();
  user.referralActivationMatchId = matchId;
  user.referralsActivated += 0;
  inviter.referralsActivated += 1;
  rewardXp(user, REFERRED_REWARD_XP, 'Referral Activated');
  rewardEnergy(user, REFERRED_REWARD_ENERGY, 'Referral Activated');
  rewardXp(inviter, REFERRER_REWARD_XP, 'Referral Reward');
  rewardEnergy(inviter, REFERRER_REWARD_ENERGY, 'Referral Reward');
  updateQuestProgress(inviter.userId, 'invite_referral', 1);
  claimCompletedQuests(inviter);
  queueTelegramNotification(inviter, `Referral activated: ${user.telegramUsername ? '@' + user.telegramUsername : user.userId}. Rewards: +${REFERRER_REWARD_ENERGY} energy, +${REFERRER_REWARD_XP} XP.`);
  queueTelegramNotification(user, `Referral confirmed. Rewards: +${REFERRED_REWARD_ENERGY} energy, +${REFERRED_REWARD_XP} XP.`);
  schedulePersist();
  return true;
}

function createLedgerEntry(user: UserState, entry: Omit<TicketLedgerEntry, 'id' | 'createdAt' | 'userId'>) {
  const ledgerEntry: TicketLedgerEntry = {
    id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    userId: user.userId,
    ...entry,
  };
  user.transactions = [ledgerEntry, ...user.transactions].slice(0, 50);
  schedulePersist();
  return ledgerEntry;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function verifyTonDeposit(intent: DepositIntent, txHash: string): Promise<TonVerificationResult> {
  const normalizedTxHash = String(txHash || '').trim();
  if (!normalizedTxHash) {
    return {
      ok: false,
      provider: TON_VERIFICATION_MODE,
      reason: 'Missing txHash.',
    };
  }

  if (TON_VERIFICATION_MODE === 'manual') {
    return {
      ok: true,
      provider: 'manual',
      normalizedTxHash,
    };
  }

  if (!TON_API_BASE_URL) {
    return {
      ok: false,
      provider: TON_VERIFICATION_MODE,
      reason: 'TON_API_BASE_URL is not configured.',
    };
  }

  try {
    const requestUrl = `${TON_API_BASE_URL.replace(/\/$/, '')}/verify-transaction`;
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(TON_API_KEY ? { Authorization: `Bearer ${TON_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        txHash: normalizedTxHash,
        expectedWallet: MARKETING_WALLET,
        expectedAmountTon: intent.tonAmount,
        expectedSender: intent.walletAddress,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        provider: TON_VERIFICATION_MODE,
        reason: `Verification provider returned HTTP ${response.status}.`,
      };
    }

    const payload = await response.json() as {
      ok?: boolean;
      matched?: boolean;
      reason?: string;
      normalizedTxHash?: string;
    };

    if (!payload.ok && !payload.matched) {
      return {
        ok: false,
        provider: TON_VERIFICATION_MODE,
        reason: payload.reason || 'Provider did not confirm the transfer.',
      };
    }

    return {
      ok: true,
      provider: TON_VERIFICATION_MODE,
      normalizedTxHash: payload.normalizedTxHash || normalizedTxHash,
    };
  } catch (error) {
    return {
      ok: false,
      provider: TON_VERIFICATION_MODE,
      reason: error instanceof Error ? error.message : 'Unknown verification failure.',
    };
  }
}

function generateServerDeck(): ServerCard[] {
  const deck: ServerCard[] = [];
  let idCounter = 0;
  const colors: CardColor[] = ['red', 'blue', 'yellow', 'green'];

  colors.forEach((color) => {
    deck.push({ id: `card-${idCounter++}`, color, value: '0', score: 0 });
    for (let num = 1; num <= 9; num++) {
      const value = String(num) as CardValue;
      deck.push({ id: `card-${idCounter++}`, color, value, score: num });
      deck.push({ id: `card-${idCounter++}`, color, value, score: num });
    }
    (['skip', 'reverse', 'draw2'] as CardValue[]).forEach((value) => {
      deck.push({ id: `card-${idCounter++}`, color, value, score: 20 });
      deck.push({ id: `card-${idCounter++}`, color, value, score: 20 });
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ id: `card-${idCounter++}`, color: 'wild', value: 'wild', score: 50 });
    deck.push({ id: `card-${idCounter++}`, color: 'wild', value: 'wild_draw4', score: 50 });
  }

  return deck;
}

function shuffleServerDeck(cards: ServerCard[]) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isValidServerMove(card: ServerCard, activeColor: CardColor, activeValue: CardValue) {
  return card.color === 'wild' || card.color === activeColor || card.value === activeValue;
}

function createServerLog(message: string, type: 'info' | 'play' | 'draw' | 'action' | 'win' = 'info') {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    message,
    type,
  };
}

function advanceServerTurn(state: ServerGameState, skipCount = 1): ServerGameState {
  const numPlayers = state.players.length;
  let nextIndex = state.currentPlayerIndex + state.direction * skipCount;
  nextIndex = (nextIndex % numPlayers + numPlayers) % numPlayers;
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    consecutiveDraws: 0,
  };
}

function ensureServerDeck(state: ServerGameState, countNeeded: number): ServerGameState {
  let deck = [...state.deck];
  let discardPile = [...state.discardPile];

  if (deck.length >= countNeeded) {
    return state;
  }

  const topOfDiscard = discardPile.pop();
  if (!topOfDiscard) {
    return {
      ...state,
      deck: shuffleServerDeck(generateServerDeck()),
    };
  }

  deck = shuffleServerDeck([...deck, ...discardPile]);
  discardPile = [topOfDiscard];

  return {
    ...state,
    deck,
    discardPile,
  };
}

function createInitialMatchState(players: QueuePlayer[]): ServerGameState {
  let deck = shuffleServerDeck(generateServerDeck());
  const serverPlayers: ServerGamePlayer[] = players.map((player) => ({
    userId: player.userId,
    username: player.username,
    avatarId: player.avatarId,
    hand: [],
    isAi: false,
    unoDeclared: false,
    emotion: 'happy',
  }));

  for (let c = 0; c < 7; c++) {
    serverPlayers.forEach((player) => {
      const drawn = deck.pop();
      if (drawn) {
        player.hand.push(drawn);
      }
    });
  }

  let startingCardIndex = deck.findIndex((card) => card.color !== 'wild');
  if (startingCardIndex === -1) {
    startingCardIndex = 0;
  }
  const startingCard = deck.splice(startingCardIndex, 1)[0];

  return {
    deck,
    discardPile: [startingCard],
    players: serverPlayers,
    currentPlayerIndex: 0,
    direction: 1,
    activeColor: startingCard.color,
    activeValue: startingCard.value,
    phase: 'playing',
    winnerUserId: null,
    logs: [createServerLog('Match started. Stake table is live.', 'info')],
    consecutiveDraws: 0,
  };
}

function buildPerspectiveState(match: ActiveMatch, userId: string) {
  const userIndex = match.gameState.players.findIndex((player) => player.userId === userId);
  if (userIndex === -1) {
    return null;
  }

  const rotatedPlayers = match.gameState.players.map((_, offset) => {
    const originalIndex = (userIndex + offset) % match.gameState.players.length;
    const sourcePlayer = match.gameState.players[originalIndex];
    const localId = offset === 0 ? 'player' : `ai${offset}` as 'ai1' | 'ai2' | 'ai3';
    const revealFullHand = match.gameState.phase === 'game_over';
    const visibleHand = offset === 0 || revealFullHand
      ? sourcePlayer.hand
      : sourcePlayer.hand.map((card, cardIndex) => ({
          id: `${sourcePlayer.userId}-hidden-${cardIndex}`,
          color: 'wild' as CardColor,
          value: 'wild' as CardValue,
          score: 0,
        }));

    return {
      id: localId,
      name: offset === 0 ? sourcePlayer.username : `Player ${offset + 1}`,
      avatar: sourcePlayer.avatarId,
      hand: visibleHand,
      isAi: offset !== 0,
      unoDeclared: sourcePlayer.unoDeclared,
      emotion: sourcePlayer.emotion,
    };
  });

  const currentPlayerIndex = ((match.gameState.currentPlayerIndex - userIndex) % match.gameState.players.length + match.gameState.players.length) % match.gameState.players.length;
  const winnerIndex = match.gameState.winnerUserId
    ? match.gameState.players.findIndex((player) => player.userId === match.gameState.winnerUserId)
    : -1;
  const localWinnerId = winnerIndex === -1
    ? null
    : (winnerIndex === userIndex ? 'player' : `ai${((winnerIndex - userIndex + match.gameState.players.length) % match.gameState.players.length)}` as 'ai1' | 'ai2' | 'ai3');

  return {
    matchId: match.matchId,
    mode: match.mode,
    stake: match.stake,
    gameState: {
      deck: match.gameState.deck.map((card, index) => ({
        id: `deck-${index}`,
        color: 'wild' as CardColor,
        value: 'wild' as CardValue,
        score: 0,
      })),
      discardPile: match.gameState.discardPile,
      players: rotatedPlayers,
      currentPlayerIndex,
      direction: match.gameState.direction,
      activeColor: match.gameState.activeColor,
      activeValue: match.gameState.activeValue,
      phase: match.gameState.phase,
      winnerId: localWinnerId,
      logs: match.gameState.logs,
      drawCountAccumulator: 0,
      unoShoutCooldown: {},
      dealerId: 'ai1',
      consecutiveDraws: match.gameState.consecutiveDraws,
      accusablePlayers: [],
    },
  };
}

function applyPlayAction(match: ActiveMatch, userId: string, cardId: string, chosenColor?: CardColor) {
  const state = match.gameState;
  if (state.phase !== 'playing') {
    throw new Error('Match is already finished.');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.userId !== userId) {
    throw new Error('It is not your turn.');
  }
  const card = currentPlayer.hand.find((entry) => entry.id === cardId);
  if (!card) {
    throw new Error('Card not found in hand.');
  }
  if (!isValidServerMove(card, state.activeColor, state.activeValue)) {
    throw new Error('Invalid move for the current table state.');
  }

  currentPlayer.hand = currentPlayer.hand.filter((entry) => entry.id !== cardId);
  const finalColor = card.color === 'wild' ? (chosenColor || 'red') : card.color;

  let nextState: ServerGameState = {
    ...state,
    discardPile: [...state.discardPile, card],
    activeColor: finalColor,
    activeValue: card.value,
  };

  if (currentPlayer.hand.length === 0) {
    nextState = {
      ...nextState,
      phase: 'game_over',
      winnerUserId: userId,
      logs: [createServerLog(`${currentPlayer.username} won the match.`, 'win'), ...nextState.logs].slice(0, 50),
    };
    match.gameState = nextState;
    schedulePersist();
    return;
  }

  let skipCount = 1;

  if (card.value === 'reverse') {
    nextState.direction = nextState.direction === 1 ? -1 : 1;
  } else if (card.value === 'skip') {
    skipCount = 2;
  } else if (card.value === 'draw2' || card.value === 'wild_draw4') {
    const drawCount = card.value === 'draw2' ? 2 : 4;
    nextState = ensureServerDeck(nextState, drawCount);
    const victimIndex = (state.currentPlayerIndex + state.direction + state.players.length) % state.players.length;
    const victim = nextState.players[victimIndex];
    const drawnCards = nextState.deck.splice(Math.max(nextState.deck.length - drawCount, 0), drawCount);
    victim.hand = [...victim.hand, ...drawnCards];
    victim.emotion = 'worried';
    skipCount = 2;
  }

  const colorLabel = card.color === 'wild' ? `wild -> ${finalColor}` : `${card.color} ${card.value}`;
  nextState.logs = [createServerLog(`${currentPlayer.username} played ${colorLabel}`, card.color === 'wild' || card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2' ? 'action' : 'play'), ...nextState.logs].slice(0, 50);
  match.gameState = advanceServerTurn(nextState, skipCount);
  schedulePersist();
}

function applyDrawAction(match: ActiveMatch, userId: string) {
  const state = match.gameState;
  if (state.phase !== 'playing') {
    throw new Error('Match is already finished.');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.userId !== userId) {
    throw new Error('It is not your turn.');
  }

  let nextState = ensureServerDeck(state, 1);
  const drawnCard = nextState.deck.pop();
  if (!drawnCard) {
    throw new Error('Deck is empty.');
  }
  currentPlayer.hand = [...currentPlayer.hand, drawnCard];
  nextState = {
    ...nextState,
    consecutiveDraws: nextState.consecutiveDraws + 1,
    logs: [createServerLog(`${currentPlayer.username} drew a card.`, 'draw'), ...nextState.logs].slice(0, 50),
  };

  const playable = isValidServerMove(drawnCard, nextState.activeColor, nextState.activeValue);
  match.gameState = playable ? nextState : advanceServerTurn(nextState);
  schedulePersist();
}

function applyPassAction(match: ActiveMatch, userId: string) {
  const state = match.gameState;
  if (state.phase !== 'playing') {
    throw new Error('Match is already finished.');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.userId !== userId) {
    throw new Error('It is not your turn.');
  }
  const nextState = {
    ...state,
    logs: [createServerLog(`${currentPlayer.username} passed the turn.`, 'info'), ...state.logs].slice(0, 50),
  };
  match.gameState = advanceServerTurn(nextState);
  schedulePersist();
}

function activateMatch(matchId: string, mode: MatchMode, players: QueuePlayer[], stake: number) {
  const activeMatch: ActiveMatch = {
    matchId,
    mode,
    stake,
    players,
    createdAt: Date.now(),
    settled: false,
    gameState: createInitialMatchState(players),
  };
  activeMatches.set(matchId, activeMatch);
  players.forEach((queuedPlayer) => {
    activeMatchByUser.set(queuedPlayer.userId, matchId);
  });
  schedulePersist();
  broadcastMatch(matchId);
  return activeMatch;
}

function sendSse(response: Response, event: string, payload: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function subscribeToChannel(store: Map<string, Set<Response>>, key: string, response: Response) {
  const existing = store.get(key) || new Set<Response>();
  existing.add(response);
  store.set(key, existing);
  response.on('close', () => {
    const channel = store.get(key);
    if (!channel) return;
    channel.delete(response);
    if (channel.size === 0) {
      store.delete(key);
    }
  });
}

function buildPrivateRoomPayload(room: PrivateRoom) {
  return {
    roomCode: room.roomCode,
    stake: room.stake,
    status: room.status,
    playersCount: room.players.length,
    players: room.players,
    matchId: room.matchId || null,
  };
}

function broadcastPrivateRoom(roomCode: string) {
  const room = privateRooms.get(roomCode);
  const subscribers = privateRoomSubscribers.get(roomCode);
  if (!room || !subscribers) return;
  const payload = buildPrivateRoomPayload(room);
  subscribers.forEach((response) => sendSse(response, 'private-room', payload));
}

function broadcastMatch(matchId: string) {
  const activeMatch = activeMatches.get(matchId);
  const subscribers = matchSubscribers.get(matchId);
  if (!activeMatch || !subscribers) return;
  subscribers.forEach((response) => {
    const userId = response.locals.userId as string | undefined;
    if (!userId) return;
    const payload = buildPerspectiveState(activeMatch, userId);
    if (payload) {
      sendSse(response, 'match-state', payload);
    }
  });
}

function buildQueuePayload(userId: string) {
  const activeMatchId = activeMatchByUser.get(userId);
  if (activeMatchId) {
    const activeMatch = activeMatches.get(activeMatchId);
    if (activeMatch) {
      return {
        status: 'ready',
        matchId: activeMatch.matchId,
        players: activeMatch.players,
      };
    }
  }

  const player = matchmakingQueue.find((entry) => entry.userId === userId);
  if (!player) {
    return { status: 'idle' };
  }
  const similarPlayers = matchmakingQueue.filter((entry) => entry.stake === player.stake && entry.mode === player.mode);
  return {
    status: 'searching',
    queueLength: similarPlayers.length,
  };
}

function broadcastQueue(userId: string) {
  const subscribers = queueSubscribers.get(userId);
  if (!subscribers) return;
  const payload = buildQueuePayload(userId);
  subscribers.forEach((response) => sendSse(response, 'queue-status', payload));
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    time: new Date().toISOString(),
    walletConfig: {
      marketingWallet: MARKETING_WALLET,
      ticketPriceTon: TICKET_PRICE_TON,
      minWithdrawTickets: MIN_WITHDRAW_TICKETS,
      chainVerificationEnabled: ENABLE_CHAIN_VERIFICATION,
      verificationMode: TON_VERIFICATION_MODE,
      tonApiConfigured: !!TON_API_BASE_URL,
    },
  });
});

app.post('/api/users/sync', (req, res) => {
  const { walletAddress, telegramInitData } = req.body as { userId?: string; walletAddress?: string; telegramInitData?: string };
  const resolved = resolveCanonicalUserId(req.body);
  if (!resolved.userId) {
    return res.status(400).json({ error: 'Missing userId.' });
  }
  const user = getUser(resolved.userId, walletAddress);
  if (resolved.auth) {
    applyTelegramAuth(user, resolved.auth);
    assignReferralIfNeeded(user, resolved.auth.start_param);
  }
  const energy = getEnergyState(user);
  const claimedQuestIds = claimCompletedQuests(user);
  return res.json({
    userId: user.userId,
    telegramInitDataValid: !!resolved.auth,
    telegramUsername: user.telegramUsername || null,
    telegramPhotoUrl: user.telegramPhotoUrl || null,
    walletAddress: user.walletAddress || null,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    xp: user.xp,
    energy,
    referralCode: user.referralCode,
    referralLink: `https://t.me/${TELEGRAM_BOT_USERNAME}/app?startapp=ref_${user.referralCode}`,
    quests: buildQuestView(user.userId),
    claimedQuestIds,
  });
});

app.post('/api/xp/daily-checkin', (req, res) => {
  const { walletAddress } = req.body;
  const resolved = resolveCanonicalUserId(req.body);
  if (!resolved.userId) {
    return res.status(400).json({ error: 'Missing userId.' });
  }
  const user = getUser(resolved.userId, walletAddress);
  if (resolved.auth) {
    applyTelegramAuth(user, resolved.auth);
  }
  const now = Date.now();
  if (user.lastDailyXpAt && now - user.lastDailyXpAt < 24 * 60 * 60 * 1000) {
    return res.json({ success: false, alreadyClaimed: true, xp: user.xp });
  }
  user.lastDailyXpAt = now;
  rewardXp(user, DAILY_XP_REWARD, 'Daily Check-in');
  if (!user.lastDailyEnergyAt || now - user.lastDailyEnergyAt >= 24 * 60 * 60 * 1000) {
    user.lastDailyEnergyAt = now;
    rewardEnergy(user, DAILY_ENERGY_REWARD, 'Daily Energy Refill');
  }
  updateQuestProgress(user.userId, 'spend_energy', 0);
  const claimedQuestIds = claimCompletedQuests(user);
  return res.json({ success: true, xpAwarded: DAILY_XP_REWARD, xp: user.xp, energy: getEnergyState(user), claimedQuestIds });
});

app.get('/api/me/:userId', (req, res) => {
  const user = getUser(req.params.userId);
  const claimedQuestIds = claimCompletedQuests(user);
  return res.json({
    userId: user.userId,
    telegramUsername: user.telegramUsername || null,
    telegramPhotoUrl: user.telegramPhotoUrl || null,
    walletAddress: user.walletAddress || null,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    xp: user.xp,
    energy: getEnergyState(user),
    referralCode: user.referralCode,
    referralLink: `https://t.me/${TELEGRAM_BOT_USERNAME}/app?startapp=ref_${user.referralCode}`,
    referrals: {
      referredByUserId: user.referredByUserId || null,
      status: user.referralStatus || null,
      activatedAt: user.referralActivatedAt || null,
      referralsActivated: user.referralsActivated,
      invitedUsers: Array.from(users.values())
        .filter((entry) => entry.referredByUserId === user.userId)
        .map((entry) => ({
          userId: entry.userId,
          username: entry.telegramUsername || entry.telegramFirstName || entry.userId,
          photoUrl: entry.telegramPhotoUrl || null,
          status: entry.referralStatus || 'pending',
          assignedAt: entry.referralAssignedAt || null,
          activatedAt: entry.referralActivatedAt || null,
        })),
    },
    quests: buildQuestView(user.userId),
    claimedQuestIds,
  });
});

app.get('/api/tickets/balance/:userId', (req, res) => {
  const user = getUser(req.params.userId);
  return res.json({
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    totalTickets: round2(user.availableTickets + user.heldTickets),
  });
});

app.get('/api/tickets/ledger/:userId', (req, res) => {
  const user = getUser(req.params.userId);
  return res.json({ transactions: user.transactions });
});

app.post('/api/tickets/deposit-intent', (req, res) => {
  const { userId, walletAddress, ticketAmount } = req.body;
  if (!userId || !walletAddress || !ticketAmount || Number(ticketAmount) < 1) {
    return res.status(400).json({ error: 'Deposit requires userId, walletAddress and at least 1 ticket.' });
  }
  const user = getUser(userId, walletAddress);
  const intent: DepositIntent = {
    id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    walletAddress,
    ticketAmount: Number(ticketAmount),
    tonAmount: round2(Number(ticketAmount) * TICKET_PRICE_TON),
    status: 'pending',
    createdAt: Date.now(),
  };
  depositIntents.set(intent.id, intent);
  schedulePersist();
  return res.json({
    intentId: intent.id,
    marketingWallet: MARKETING_WALLET,
    ticketAmount: intent.ticketAmount,
    tonAmount: intent.tonAmount,
    status: intent.status,
  });
});

app.post('/api/tickets/deposit-confirm', async (req, res) => {
  const { intentId, txHash } = req.body;
  const intent = depositIntents.get(intentId);
  if (!intent) {
    return res.status(404).json({ error: 'Deposit intent not found.' });
  }
  if (ENABLE_CHAIN_VERIFICATION && !txHash) {
    return res.status(400).json({ error: 'txHash is required when chain verification is enabled.' });
  }
  if (intent.status === 'confirmed') {
    const user = getUser(intent.userId, intent.walletAddress);
    return res.json({ success: true, availableTickets: user.availableTickets, status: intent.status });
  }

  if (ENABLE_CHAIN_VERIFICATION) {
    const verification = await verifyTonDeposit(intent, txHash);
    if (!verification.ok) {
      return res.status(400).json({
        error: verification.reason || 'Transaction verification failed.',
        verificationProvider: verification.provider,
      });
    }
  }

  intent.status = 'confirmed';
  schedulePersist();
  const user = getUser(intent.userId, intent.walletAddress);
  user.availableTickets = round2(user.availableTickets + intent.ticketAmount);
  createLedgerEntry(user, {
    event: 'Deposit Confirmed',
    value: `+${intent.ticketAmount.toFixed(2)} TKT`,
    type: 'purchase',
    amount: intent.ticketAmount,
  });
  return res.json({
    success: true,
    txHash: txHash || null,
    status: intent.status,
    availableTickets: user.availableTickets,
  });
});

app.post('/api/tickets/withdraw-request', (req, res) => {
  const { userId, walletAddress, ticketAmount } = req.body;
  if (!userId || !walletAddress || !ticketAmount) {
    return res.status(400).json({ error: 'Withdrawal requires userId, walletAddress and ticketAmount.' });
  }
  const amount = Number(ticketAmount);
  if (amount < MIN_WITHDRAW_TICKETS) {
    return res.status(400).json({ error: `Minimum withdrawal is ${MIN_WITHDRAW_TICKETS} tickets.` });
  }
  const user = getUser(userId, walletAddress);
  if (user.availableTickets < amount) {
    return res.status(400).json({ error: 'Insufficient available tickets.' });
  }
  user.availableTickets = round2(user.availableTickets - amount);
  const request: WithdrawalRequest = {
    id: `wd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    walletAddress,
    ticketAmount: amount,
    status: 'pending',
    createdAt: Date.now(),
  };
  withdrawalRequests.set(request.id, request);
  createLedgerEntry(user, {
    event: 'Withdrawal Requested',
    value: `-${amount.toFixed(2)} TKT`,
    type: 'withdraw_pending',
    amount: -amount,
  });
  return res.json({ success: true, requestId: request.id, status: request.status });
});

app.post('/api/tickets/withdraw-complete', (req, res) => {
  const { requestId } = req.body;
  const request = withdrawalRequests.get(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Withdrawal request not found.' });
  }
  request.status = 'completed';
  schedulePersist();
  const user = getUser(request.userId, request.walletAddress);
  createLedgerEntry(user, {
    event: 'Withdrawal Completed',
    value: `${request.ticketAmount.toFixed(2)} TKT`,
    type: 'withdraw_completed',
    amount: request.ticketAmount,
  });
  return res.json({ success: true, status: request.status });
});

app.post('/api/matchmaker/join', (req, res) => {
  const { userId, username, avatarId, stake, mode, walletAddress } = req.body as {
    userId: string;
    username: string;
    avatarId: string;
    stake: number;
    mode: MatchMode;
    walletAddress?: string;
  };
  if (!userId || !stake || !mode) {
    return res.status(400).json({ error: 'Missing userId, stake or mode.' });
  }

  const user = getUser(userId, walletAddress);
  try {
    spendEnergy(user, 2, 'Online Match Energy');
    updateQuestProgress(user.userId, 'spend_energy', 2);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Energy spend failed.' });
  }
  const stakeAmount = Number(stake);
  if (user.availableTickets < stakeAmount) {
    return res.status(400).json({ error: 'Insufficient available tickets for stake.' });
  }

  user.availableTickets = round2(user.availableTickets - stakeAmount);
  user.heldTickets = round2(user.heldTickets + stakeAmount);
  createLedgerEntry(user, {
    event: `${mode === 'pvp' ? 'PVP Queue Hold' : 'Private Room Hold'}`,
    value: `-${stakeAmount.toFixed(2)} TKT`,
    type: 'stake_hold',
    amount: -stakeAmount,
  });

  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
  matchmakingQueue.push({
    userId,
    username,
    avatarId,
    stake: stakeAmount,
    mode,
    joinedAt: Date.now(),
  });

  matchmakingQueue
    .filter(p => p.stake === stakeAmount && p.mode === mode)
    .forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
  schedulePersist();

  return res.json({
    success: true,
    queueLength: matchmakingQueue.filter(p => p.stake === stakeAmount && p.mode === mode).length,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
});

app.get('/api/matchmaker/stream/:userId', (req, res) => {
  const { userId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  subscribeToChannel(queueSubscribers, userId, res);
  sendSse(res, 'queue-status', buildQueuePayload(userId));
});

app.get('/api/matchmaker/status/:userId', (req, res) => {
  const { userId } = req.params;
  const activeMatchId = activeMatchByUser.get(userId);
  if (activeMatchId) {
    const activeMatch = activeMatches.get(activeMatchId);
    if (activeMatch) {
      return res.json({
        status: 'ready',
        matchId: activeMatch.matchId,
        players: activeMatch.players,
      });
    }
  }

  const player = matchmakingQueue.find(p => p.userId === userId);
  if (!player) {
    return res.json({ status: 'idle' });
  }
  const similarPlayers = matchmakingQueue.filter(p => p.stake === player.stake && p.mode === player.mode);
  if (similarPlayers.length >= 4) {
    const matchGroup = similarPlayers.slice(0, 4);
    const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activateMatch(matchId, player.mode, matchGroup, player.stake);
    const matchUserIds = new Set(matchGroup.map(p => p.userId));
    matchmakingQueue = matchmakingQueue.filter(p => !matchUserIds.has(p.userId));
    schedulePersist();
    matchGroup.forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
    return res.json({
      status: 'ready',
      matchId,
      players: matchGroup,
    });
  }
  return res.json({ status: 'searching', queueLength: similarPlayers.length });
});

app.post('/api/private-rooms/create', (req, res) => {
  const { userId, username, avatarId, stake, walletAddress } = req.body as {
    userId: string;
    username: string;
    avatarId: string;
    stake: number;
    walletAddress?: string;
  };

  if (!userId || !username || !avatarId || !stake) {
    return res.status(400).json({ error: 'Missing room creator data.' });
  }

  const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const user = getUser(userId, walletAddress);
  try {
    spendEnergy(user, 1, 'Private Room Energy');
    updateQuestProgress(user.userId, 'spend_energy', 1);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Energy spend failed.' });
  }
  const stakeAmount = Number(stake);
  if (user.availableTickets < stakeAmount) {
    return res.status(400).json({ error: 'Insufficient available tickets for private room stake.' });
  }

  user.availableTickets = round2(user.availableTickets - stakeAmount);
  user.heldTickets = round2(user.heldTickets + stakeAmount);
  createLedgerEntry(user, {
    event: 'Private Room Hold',
    value: `-${stakeAmount.toFixed(2)} TKT`,
    type: 'stake_hold',
    amount: -stakeAmount,
  });

  const hostPlayer: QueuePlayer = {
    userId,
    username,
    avatarId,
    stake: stakeAmount,
    mode: 'private',
    joinedAt: Date.now(),
  };

  privateRooms.set(roomCode, {
    roomCode,
    stake: stakeAmount,
    hostUserId: userId,
    players: [hostPlayer],
    createdAt: Date.now(),
    status: 'waiting',
  });
  schedulePersist();
  broadcastPrivateRoom(roomCode);

  return res.json({
    success: true,
    roomCode,
    stake: stakeAmount,
    playersCount: 1,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
});

app.post('/api/private-rooms/join', (req, res) => {
  const { roomCode, userId, username, avatarId, walletAddress } = req.body as {
    roomCode: string;
    userId: string;
    username: string;
    avatarId: string;
    walletAddress?: string;
  };

  const room = privateRooms.get(String(roomCode).toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Private room not found.' });
  }
  if (room.status === 'started') {
    return res.status(400).json({ error: 'Private room has already started.' });
  }
  if (room.players.some((player) => player.userId === userId)) {
    return res.json({
      success: true,
      roomCode: room.roomCode,
      playersCount: room.players.length,
      status: room.status,
      matchId: room.matchId || null,
    });
  }
  if (room.players.length >= 4) {
    return res.status(400).json({ error: 'Private room is already full.' });
  }

  const user = getUser(userId, walletAddress);
  try {
    spendEnergy(user, 1, 'Private Room Energy');
    updateQuestProgress(user.userId, 'spend_energy', 1);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Energy spend failed.' });
  }
  if (user.availableTickets < room.stake) {
    return res.status(400).json({ error: 'Insufficient available tickets for this private room.' });
  }

  user.availableTickets = round2(user.availableTickets - room.stake);
  user.heldTickets = round2(user.heldTickets + room.stake);
  createLedgerEntry(user, {
    event: 'Private Room Hold',
    value: `-${room.stake.toFixed(2)} TKT`,
    type: 'stake_hold',
    amount: -room.stake,
  });

  room.players.push({
    userId,
    username,
    avatarId,
    stake: room.stake,
    mode: 'private',
    joinedAt: Date.now(),
  });

  if (room.players.length >= 4) {
    const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activateMatch(matchId, 'private', room.players, room.stake);
    room.status = 'started';
    room.matchId = matchId;
  } else {
    room.status = 'waiting';
  }

  privateRooms.set(room.roomCode, room);
  schedulePersist();
  broadcastPrivateRoom(room.roomCode);

  return res.json({
    success: true,
    roomCode: room.roomCode,
    playersCount: room.players.length,
    status: room.status,
    matchId: room.matchId || null,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
});

app.get('/api/private-rooms/status/:roomCode', (req, res) => {
  const room = privateRooms.get(String(req.params.roomCode).toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Private room not found.' });
  }

  return res.json({
    roomCode: room.roomCode,
    stake: room.stake,
    status: room.status,
    playersCount: room.players.length,
    players: room.players,
    matchId: room.matchId || null,
  });
});

app.get('/api/private-rooms/stream/:roomCode', (req, res) => {
  const roomCode = String(req.params.roomCode).toUpperCase();
  const room = privateRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Private room not found.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  subscribeToChannel(privateRoomSubscribers, roomCode, res);
  sendSse(res, 'private-room', buildPrivateRoomPayload(room));
});

app.get('/api/matches/state/:matchId/:userId', (req, res) => {
  const { matchId, userId } = req.params;
  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    return res.status(404).json({ error: 'Match not found.' });
  }
  const state = buildPerspectiveState(activeMatch, userId);
  if (!state) {
    return res.status(403).json({ error: 'User is not part of this match.' });
  }
  return res.json(state);
});

app.get('/api/matches/stream/:matchId/:userId', (req, res) => {
  const { matchId, userId } = req.params;
  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    return res.status(404).json({ error: 'Match not found.' });
  }
  const state = buildPerspectiveState(activeMatch, userId);
  if (!state) {
    return res.status(403).json({ error: 'User is not part of this match.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.locals.userId = userId;

  subscribeToChannel(matchSubscribers, matchId, res);
  sendSse(res, 'match-state', state);
});

app.post('/api/matches/action', (req, res) => {
  const { matchId, userId, action, cardId, chosenColor } = req.body as {
    matchId: string;
    userId: string;
    action: 'play' | 'draw' | 'pass';
    cardId?: string;
    chosenColor?: CardColor;
  };

  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  try {
    if (action === 'play') {
      if (!cardId) {
        return res.status(400).json({ error: 'Missing cardId for play action.' });
      }
      applyPlayAction(activeMatch, userId, cardId, chosenColor);
    } else if (action === 'draw') {
      applyDrawAction(activeMatch, userId);
    } else if (action === 'pass') {
      applyPassAction(activeMatch, userId);
    } else {
      return res.status(400).json({ error: 'Unsupported action.' });
    }

    const perspective = buildPerspectiveState(activeMatch, userId);
    broadcastMatch(matchId);
    return res.json({
      success: true,
      ...perspective,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Match action failed.',
    });
  }
});

app.post('/api/matchmaker/leave', (req, res) => {
  const { userId } = req.body;
  const player = matchmakingQueue.find(p => p.userId === userId);
  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
  if (player) {
    const user = getUser(player.userId);
    user.heldTickets = round2(user.heldTickets - player.stake);
    user.availableTickets = round2(user.availableTickets + player.stake);
    createLedgerEntry(user, {
      event: 'Stake Hold Released',
      value: `+${player.stake.toFixed(2)} TKT`,
      type: 'stake_release',
      amount: player.stake,
    });
    matchmakingQueue
      .filter(p => p.stake === player.stake && p.mode === player.mode)
      .forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
  }
  schedulePersist();
  broadcastQueue(userId);
  res.json({ success: true });
});

app.post('/api/matches/settle', (req, res) => {
  const { matchId, mode, stake, placements } = req.body as {
    matchId: string;
    mode: MatchMode;
    stake: number;
    placements: Array<{ userId: string; rank: 1 | 2 | 3 | 4; walletAddress?: string }>;
  };

  if (!matchId || !mode || !stake || !placements || placements.length !== 4) {
    return res.status(400).json({ error: 'Settlement requires matchId, mode, stake and four placements.' });
  }

  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    return res.status(404).json({ error: 'Match not found.' });
  }
  if (activeMatch.settled) {
    return res.json({
      success: true,
      matchId,
      grossPot: stake * 4,
      alreadySettled: true,
    });
  }

  const grossPot = stake * 4;
  const seasonFund = round2(grossPot * 0.025);
  const burnFund = round2(grossPot * 0.035);
  const netPrizePool = round2(grossPot - seasonFund - burnFund);

  const payoutByRank: Record<number, number> = {
    1: round2(netPrizePool * 0.52),
    2: round2(netPrizePool * 0.23),
    3: round2(netPrizePool * 0.15),
    4: round2(netPrizePool * 0.10),
  };

  placements.forEach(({ userId, rank, walletAddress }) => {
    const user = getUser(userId, walletAddress);
    user.heldTickets = round2(Math.max(0, user.heldTickets - stake));
    user.availableTickets = round2(user.availableTickets + payoutByRank[rank]);
    createLedgerEntry(user, {
      event: `${mode === 'pvp' ? 'PVP Match' : 'Private Match'} Payout`,
      value: `+${payoutByRank[rank].toFixed(2)} TKT`,
      type: 'match_payout',
      amount: payoutByRank[rank],
    });
    if (mode === 'pvp') {
      updateQuestProgress(user.userId, 'play_online', 1);
    } else {
      updateQuestProgress(user.userId, 'play_private', 1);
    }
    if (rank === 1) {
      updateQuestProgress(user.userId, 'win_any', 1);
    }
    maybeActivateReferral(user, matchId);
    claimCompletedQuests(user);
  });

  activeMatch.settled = true;
  activeMatch.players.forEach((player) => {
    activeMatchByUser.delete(player.userId);
  });
  activeMatches.set(matchId, activeMatch);
  schedulePersist();
  flushTelegramNotifications().catch((error) => {
    console.error('Telegram notification flush failed', error);
  });

  return res.json({
    success: true,
    matchId,
    grossPot,
    seasonFund,
    burnFund,
    netPrizePool,
    payoutByRank,
  });
});

loadPersistedState();
setInterval(() => {
  flushTelegramNotifications().catch((error) => {
    console.error('Telegram notification worker failed', error);
  });
}, 15000);

function flushAndExit(signal: string) {
  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistStateNow();
  } catch (error) {
    console.error(`Failed to flush runtime state on ${signal}`, error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => flushAndExit('SIGINT'));
process.on('SIGTERM', () => flushAndExit('SIGTERM'));
process.on('beforeExit', () => {
  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistStateNow();
  } catch (error) {
    console.error('Failed to flush runtime state on beforeExit', error);
  }
});

app.listen(PORT, () => {
  console.log(`Redoapp backend running on port ${PORT}`);
});
