import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { Request, Response, NextFunction } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTicketingService, type DepositIntent, type TicketLedgerEntry, type WithdrawalRequest } from './server/tickets';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const MARKETING_WALLET = process.env.MARKETING_WALLET || 'UQAihtS9I5lalYn9G8aRgyBq8UNLNC7N-aODCJJUdX4zKGDj';
const TICKET_PRICE_TON = Number(process.env.TICKET_PRICE_TON || '1');
const MIN_WITHDRAW_TICKETS = 5;
const ENABLE_CHAIN_VERIFICATION = process.env.ENABLE_CHAIN_VERIFICATION === 'true';
const TON_VERIFICATION_MODE = process.env.TON_VERIFICATION_MODE || 'manual';
const TON_API_BASE_URL = process.env.TON_API_BASE_URL || 'https://tonapi.io/v2';
const TON_API_KEY = process.env.TON_API_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'redo_appbot';
const TELEGRAM_APP_SHORT_NAME = process.env.TELEGRAM_APP_SHORT_NAME || 'app';
const TELEGRAM_INITDATA_MAX_AGE_SEC = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC || '86400');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || TELEGRAM_BOT_TOKEN || SUPABASE_SERVICE_ROLE_KEY || 'local-dev-session-secret';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || 'app_state';
const SUPABASE_STATE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID || 'runtime-state';
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
const MIN_MATCH_PLAYERS = 2;
const MAX_MATCH_PLAYERS = 4;
const MATCHMAKING_TIMEOUT_MS = 5_000;

// Authentication is token-based and the API does not use cookies. Reflecting the
// caller origin is safe here and supports Telegram iOS WebViews that send `null`
// or a Telegram-managed origin instead of the public Mini App URL.
app.use(cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-token', 'x-telegram-init-data', 'x-admin-api-key'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

type MatchMode = 'pvp' | 'private';
type CardColor = 'red' | 'blue' | 'yellow' | 'green' | 'wild';
type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild_draw4';
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
  createRequestId?: string;
  stake: number;
  targetPlayers: number;
  hostUserId: string;
  players: QueuePlayer[];
  createdAt: number;
  status: 'waiting' | 'ready' | 'started';
  matchId?: string;
}

interface MatchmakingStatusPayload {
  status: 'idle' | 'searching' | 'ready';
  queueLength?: number;
  playersNeeded?: number;
  countdownSec?: number;
  matchId?: string;
  players?: QueuePlayer[];
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
const supabaseAdmin: SupabaseClient | null = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function buildTelegramMiniAppLink(startParam: string) {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}/${TELEGRAM_APP_SHORT_NAME}?startapp=${encodeURIComponent(startParam)}`;
}

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

async function persistStateNow() {
  const snapshot = buildPersistedState();
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from(SUPABASE_STATE_TABLE)
      .upsert({
        id: SUPABASE_STATE_ROW_ID,
        payload: snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (error) {
      throw new Error(`Supabase persist failed: ${error.message}`);
    }
    return;
  }
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(snapshot), 'utf8');
}

function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistStateNow().catch((error) => {
      console.error('Failed to persist runtime state', error);
    });
  }, 100);
}

function applySnapshot(snapshot: PersistedState) {
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
}

async function loadPersistedState() {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from(SUPABASE_STATE_TABLE)
      .select('payload')
      .eq('id', SUPABASE_STATE_ROW_ID)
      .maybeSingle();
    if (error) {
      console.error('Failed to load runtime state from Supabase', error);
    } else if (data?.payload) {
      applySnapshot(data.payload as PersistedState);
      return;
    }
  }

  if (!existsSync(STATE_FILE)) {
    return;
  }

  try {
    const snapshot = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as PersistedState;
    applySnapshot(snapshot);
  } catch (error) {
    console.error('Failed to load persisted runtime state', error);
  }
}

function getUser(userId: string, walletAddress?: string): UserState {
  const existing = users.get(userId);
  if (existing) {
    if (walletAddress && existing.walletAddress !== walletAddress) {
      existing.walletAddress = walletAddress;
      schedulePersist();
    }
    hydrateUser(existing);
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
    user.energyUpdatedAt += restored * DEFAULT_ENERGY_REGEN_INTERVAL_SEC * 1000;
    if (user.energy >= user.maxEnergy) {
      user.energy = user.maxEnergy;
      user.energyUpdatedAt = now;
    }
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

function buildBootstrapProfileResponse(user: UserState) {
  return {
    userId: user.userId,
    telegramUsername: user.telegramUsername || null,
    telegramPhotoUrl: user.telegramPhotoUrl || null,
    walletAddress: user.walletAddress || null,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    xp: user.xp,
    energy: getEnergyState(user),
    referralCode: user.referralCode,
    referralLink: buildTelegramMiniAppLink(`ref_${user.referralCode}`),
  };
}

function buildProfileResponse(user: UserState) {
  const claimedQuestIds = claimCompletedQuests(user);
  return {
    ...buildBootstrapProfileResponse(user),
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
  const progressMap = new Map(progressList.map((entry) => [entry.questId, entry]));
  return QUEST_DEFINITIONS.map((quest) => {
    const progress = progressMap.get(quest.id);
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

interface SessionTokenPayload {
  userId: string;
  issuedAt: number;
}

function createSessionToken(userId: string) {
  const payload: SessionTokenPayload = {
    userId,
    issuedAt: Date.now(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', APP_SESSION_SECRET).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token: string | null | undefined): SessionTokenPayload | null {
  if (!token) return null;
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return null;
  const expectedSignature = crypto.createHmac('sha256', APP_SESSION_SECRET).update(encodedPayload).digest('base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionTokenPayload;
    return payload.userId ? payload : null;
  } catch {
    return null;
  }
}

function extractSessionToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const xSessionToken = req.headers['x-session-token'];
  if (typeof xSessionToken === 'string') {
    return xSessionToken;
  }
  if (typeof req.query.sessionToken === 'string') {
    return req.query.sessionToken;
  }
  return null;
}

function extractTelegramInitData(req: Request) {
  const headerValue = req.headers['x-telegram-init-data'];
  if (typeof headerValue === 'string' && headerValue) {
    return headerValue;
  }
  if (typeof req.query.telegramInitData === 'string' && req.query.telegramInitData) {
    return req.query.telegramInitData;
  }
  const body = req.body as { telegramInitData?: string } | undefined;
  if (typeof body?.telegramInitData === 'string' && body.telegramInitData) {
    return body.telegramInitData;
  }
  return '';
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const session = verifySessionToken(extractSessionToken(req));
  if (session) {
    req.authUserId = session.userId;
    return next();
  }
  const auth = verifyTelegramInitData(extractTelegramInitData(req));
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.authUserId = `tg:${auth.id}`;
  const user = getUser(req.authUserId);
  applyTelegramAuth(user, auth);
  return next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ error: 'Admin API key is not configured.' });
  }
  if (req.headers['x-admin-api-key'] !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Admin authorization required.' });
  }
  next();
}

function applyTelegramAuth(user: UserState, auth: TelegramAuthPayload) {
  const changed =
    user.telegramId !== auth.id ||
    user.telegramChatId !== auth.id ||
    user.telegramUsername !== auth.username ||
    user.telegramFirstName !== auth.first_name ||
    user.telegramLastName !== auth.last_name ||
    user.telegramPhotoUrl !== auth.photo_url ||
    user.telegramAuthAt !== auth.auth_date;
  user.telegramId = auth.id;
  user.telegramChatId = auth.id;
  user.telegramUsername = auth.username;
  user.telegramFirstName = auth.first_name;
  user.telegramLastName = auth.last_name;
  user.telegramPhotoUrl = auth.photo_url;
  user.telegramAuthAt = auth.auth_date;
  if (changed) {
    schedulePersist();
  }
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

function getAuthenticatedUserId(req: AuthenticatedRequest) {
  if (!req.authUserId) {
    throw new Error('Authentication required.');
  }
  return req.authUserId;
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

function applyReferralMatchBonus(user: UserState, payoutAmount: number) {
  if (!user.referredByUserId || payoutAmount <= 0) {
    return {
      inviterBonus: 0,
      netPayout: payoutAmount,
    };
  }

  const inviter = users.get(user.referredByUserId);
  if (!inviter || inviter.userId === user.userId) {
    return {
      inviterBonus: 0,
      netPayout: payoutAmount,
    };
  }

  const referralBonus = round2(payoutAmount * 0.01);
  if (referralBonus <= 0) {
    return {
      inviterBonus: 0,
      netPayout: payoutAmount,
    };
  }

  const netPayout = round2(Math.max(0, payoutAmount - referralBonus));
  inviter.availableTickets = round2(inviter.availableTickets + referralBonus);
  createLedgerEntry(inviter, {
    event: 'Referral Match Bonus',
    value: `+${referralBonus.toFixed(2)} TKT`,
    type: 'referral_bonus',
    amount: referralBonus,
  });
  queueTelegramNotification(
    inviter,
    `Referral bonus: ${user.telegramUsername ? '@' + user.telegramUsername : user.userId} finished a public match. You received +${referralBonus.toFixed(2)} TKT.`
  );
  schedulePersist();
  return {
    inviterBonus: referralBonus,
    netPayout,
  };
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

const ticketingService = createTicketingService({
  createLedgerEntry,
  depositIntents,
  getUser,
  requireAdmin,
  round2,
  schedulePersist,
  withdrawalRequests,
}, {
  backgroundRecheckIntervalMs: 15_000,
  depositIntentTtlMs: 15 * 60 * 1000,
  enableChainVerification: ENABLE_CHAIN_VERIFICATION,
  marketingWallet: MARKETING_WALLET,
  minWithdrawTickets: MIN_WITHDRAW_TICKETS,
  ticketPriceTon: TICKET_PRICE_TON,
  tonApiBaseUrl: TON_API_BASE_URL,
  tonApiKey: TON_API_KEY,
  tonVerificationMode: TON_VERIFICATION_MODE,
});

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
    if (state.players.length === 2) {
      skipCount = 2;
    }
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

function buildRankOrder(playerCount: number): number[] {
  return Array.from({ length: playerCount }, (_, index) => index + 1);
}

function buildPayoutByRank(playerCount: number, netPrizePool: number): Record<number, number> {
  const shares = playerCount <= 2
    ? [0.90, 0.10]
    : playerCount === 3
      ? [0.65, 0.25, 0.10]
      : [0.55, 0.25, 0.10, 0.10];
  const payouts = shares.map((share, index) => index === 0
    ? 0
    : Math.floor((netPrizePool * share + Number.EPSILON) * 100) / 100);
  payouts[0] = round2(netPrizePool - payouts.slice(1).reduce((sum, payout) => sum + payout, 0));
  return Object.fromEntries(payouts.map((payout, index) => [index + 1, payout]));
}

function tryActivateQueuedMatch(userId: string): MatchmakingStatusPayload | null {
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

  const similarPlayers = matchmakingQueue
    .filter((entry) => entry.stake === player.stake && entry.mode === player.mode)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const matchGroup = similarPlayers.slice(0, MAX_MATCH_PLAYERS);
  const oldestJoinedAt = matchGroup[0]?.joinedAt ?? player.joinedAt;
  const waitedMs = Date.now() - oldestJoinedAt;
  const shouldStart = matchGroup.length >= MAX_MATCH_PLAYERS
    || (matchGroup.length >= MIN_MATCH_PLAYERS && waitedMs >= MATCHMAKING_TIMEOUT_MS);

  if (shouldStart) {
    const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activateMatch(matchId, player.mode, matchGroup, player.stake);
    const matchUserIds = new Set(matchGroup.map((queuedPlayer) => queuedPlayer.userId));
    matchmakingQueue = matchmakingQueue.filter((queuedPlayer) => !matchUserIds.has(queuedPlayer.userId));
    schedulePersist();
    matchGroup.forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
    return {
      status: 'ready',
      matchId,
      players: matchGroup,
    };
  }

  return {
    status: 'searching',
    queueLength: similarPlayers.length,
    playersNeeded: Math.max(0, MIN_MATCH_PLAYERS - similarPlayers.length),
    countdownSec: Math.max(0, Math.ceil((MATCHMAKING_TIMEOUT_MS - waitedMs) / 1000)),
  };
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
    targetPlayers: room.targetPlayers,
    status: room.status,
    playersCount: room.players.length,
    minPlayers: MIN_MATCH_PLAYERS,
    maxPlayers: MAX_MATCH_PLAYERS,
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
  return tryActivateQueuedMatch(userId) || { status: 'idle' };
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
    service: 'redoapp-backend',
    privateRoomsVersion: 'json-create-free-room-v5',
  });
});

app.post('/api/users/sync', (req, res) => {
  const { walletAddress, telegramInitData, startParam } = req.body as { userId?: string; walletAddress?: string; telegramInitData?: string; startParam?: string };
  const resolved = resolveCanonicalUserId(req.body);
  if (!resolved.userId) {
    return res.status(400).json({ error: 'Missing userId.' });
  }
  const user = getUser(resolved.userId, walletAddress);
  if (resolved.auth) {
    applyTelegramAuth(user, resolved.auth);
  }
  assignReferralIfNeeded(user, startParam || resolved.auth?.start_param);
  return res.json({
    telegramInitDataValid: !!resolved.auth,
    sessionToken: resolved.auth ? createSessionToken(user.userId) : null,
    ...buildBootstrapProfileResponse(user),
  });
});

app.post('/api/xp/daily-checkin', requireAuth, (req: AuthenticatedRequest, res) => {
  const { walletAddress } = req.body;
  const user = getUser(getAuthenticatedUserId(req), walletAddress);
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

app.get('/api/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = getUser(getAuthenticatedUserId(req));
  return res.json(buildProfileResponse(user));
});

app.use('/api/tickets', requireAuth);
ticketingService.registerRoutes(app);

app.post('/api/matchmaker/join', requireAuth, (req: AuthenticatedRequest, res) => {
  const { username, avatarId, stake, mode, walletAddress } = req.body as {
    username: string;
    avatarId: string;
    stake: number;
    mode: MatchMode;
    walletAddress?: string;
  };
  const userId = getAuthenticatedUserId(req);
  if (!stake || !mode) {
    return res.status(400).json({ error: 'Missing stake or mode.' });
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

  const queueStatus = tryActivateQueuedMatch(userId);

  return res.json({
    success: true,
    queueLength: matchmakingQueue.filter(p => p.stake === stakeAmount && p.mode === mode).length,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
    matchmaker: queueStatus,
  });
});

app.get('/api/matchmaker/stream', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = getAuthenticatedUserId(req);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  subscribeToChannel(queueSubscribers, userId, res);
  sendSse(res, 'queue-status', buildQueuePayload(userId));
});

app.get('/api/matchmaker/status', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = getAuthenticatedUserId(req);
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
  return res.json(tryActivateQueuedMatch(userId));
});

function sendPrivateRoomCreateSuccess(req: Request, res: Response, payload: Record<string, unknown>) {
  if (req.body?.responseMode === 'iframe') {
    const message = JSON.stringify({
      source: 'redoapp-room-bridge',
      requestId: String(req.body.bridgeRequestId || ''),
      payload,
    }).replace(/</g, '\\u003c');
    res.setHeader('Cache-Control', 'no-store');
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><script>parent.postMessage(${message}, '*')</script>`);
  }
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="transparent"/></svg>');
  }
  return res.json(payload);
}

function handlePrivateRoomCreate(req: AuthenticatedRequest, res: Response) {
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  const { username, avatarId, stake, targetPlayers, walletAddress, createRequestId, requestedRoomCode } = input as {
    username: string;
    avatarId: string;
    stake: number;
    targetPlayers?: number;
    walletAddress?: string;
    createRequestId?: string;
    requestedRoomCode?: string;
  };
  const userId = getAuthenticatedUserId(req);
  if (!username || !avatarId || stake === undefined || stake === null) {
    return res.status(400).json({ error: 'Missing room creator data.' });
  }

  const stakeAmount = Number(stake);
  if (!Number.isFinite(stakeAmount) || stakeAmount < 0) {
    return res.status(400).json({ error: 'Private room stake must be 0 or greater.' });
  }
  const targetPlayersCount = Number(targetPlayers || MAX_MATCH_PLAYERS);
  if (!Number.isFinite(targetPlayersCount) || targetPlayersCount < MIN_MATCH_PLAYERS || targetPlayersCount > MAX_MATCH_PLAYERS) {
    return res.status(400).json({ error: `targetPlayers must be between ${MIN_MATCH_PLAYERS} and ${MAX_MATCH_PLAYERS}.` });
  }
  const normalizedRequestId = String(createRequestId || '').trim().slice(0, 100);
  const normalizedRequestedCode = String(requestedRoomCode || '').trim().toUpperCase();
  if (normalizedRequestedCode && !/^[A-Z0-9]{8}$/.test(normalizedRequestedCode)) {
    return res.status(400).json({ error: 'Requested room code is invalid.' });
  }
  const existingWaitingRoom = Array.from(privateRooms.values()).find((room) =>
    room.hostUserId === userId &&
    room.status === 'waiting' &&
    room.stake === stakeAmount &&
    room.targetPlayers === targetPlayersCount);
  if (existingWaitingRoom) {
    if (normalizedRequestedCode && existingWaitingRoom.roomCode !== normalizedRequestedCode) {
      const collision = privateRooms.get(normalizedRequestedCode);
      if (collision && collision.hostUserId !== userId) {
        return res.status(409).json({ error: 'Requested room code is already in use.' });
      }
      privateRooms.delete(existingWaitingRoom.roomCode);
      existingWaitingRoom.roomCode = normalizedRequestedCode;
      privateRooms.set(normalizedRequestedCode, existingWaitingRoom);
      schedulePersist();
    }
    const existingUser = getUser(userId, walletAddress);
    return sendPrivateRoomCreateSuccess(req, res, {
      success: true,
      roomCode: existingWaitingRoom.roomCode,
      stake: existingWaitingRoom.stake,
      targetPlayers: existingWaitingRoom.targetPlayers,
      playersCount: existingWaitingRoom.players.length,
      availableTickets: existingUser.availableTickets,
      heldTickets: existingUser.heldTickets,
      energy: getEnergyState(existingUser),
      recovered: true,
    });
  }
  if (normalizedRequestId) {
    const existingRoom = Array.from(privateRooms.values()).find((room) =>
      room.hostUserId === userId && room.createRequestId === normalizedRequestId);
    if (existingRoom) {
      const existingUser = getUser(userId, walletAddress);
      return sendPrivateRoomCreateSuccess(req, res, {
        success: true,
        roomCode: existingRoom.roomCode,
        stake: existingRoom.stake,
        targetPlayers: existingRoom.targetPlayers,
        playersCount: existingRoom.players.length,
        availableTickets: existingUser.availableTickets,
        heldTickets: existingUser.heldTickets,
        energy: getEnergyState(existingUser),
      });
    }
  }

  const user = getUser(userId, walletAddress);
  if (user.availableTickets < stakeAmount) {
    return res.status(400).json({ error: 'Insufficient available tickets for private room stake.' });
  }
  if (stakeAmount > 0) {
    try {
      spendEnergy(user, 1, 'Private Room Energy');
      updateQuestProgress(user.userId, 'spend_energy', 1);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Energy spend failed.' });
    }
  }

  if (stakeAmount > 0) {
    user.availableTickets = round2(user.availableTickets - stakeAmount);
    user.heldTickets = round2(user.heldTickets + stakeAmount);
    createLedgerEntry(user, {
      event: 'Private Room Hold',
      value: `-${stakeAmount.toFixed(2)} TKT`,
      type: 'stake_hold',
      amount: -stakeAmount,
    });
  }

  const hostPlayer: QueuePlayer = {
    userId,
    username,
    avatarId,
    stake: stakeAmount,
    mode: 'private',
    joinedAt: Date.now(),
  };

  let roomCode = normalizedRequestedCode;
  if (roomCode && privateRooms.has(roomCode)) {
    return res.status(409).json({ error: 'Requested room code is already in use.' });
  }
  if (!roomCode) {
    do {
      roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (privateRooms.has(roomCode));
  }

  privateRooms.set(roomCode, {
    roomCode,
    createRequestId: normalizedRequestId || undefined,
    stake: stakeAmount,
    targetPlayers: targetPlayersCount,
    hostUserId: userId,
    players: [hostPlayer],
    createdAt: Date.now(),
    status: 'waiting',
  });
  schedulePersist();
  broadcastPrivateRoom(roomCode);

  return sendPrivateRoomCreateSuccess(req, res, {
    success: true,
    roomCode,
    stake: stakeAmount,
    targetPlayers: targetPlayersCount,
    playersCount: 1,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
}

app.post('/api/private-rooms/create', requireAuth, handlePrivateRoomCreate);
app.get('/api/private-rooms/create-beacon', requireAuth, handlePrivateRoomCreate);

app.post('/api/private-rooms/join', requireAuth, (req: AuthenticatedRequest, res) => {
  const { roomCode, username, avatarId, walletAddress } = req.body as {
    roomCode: string;
    username: string;
    avatarId: string;
    walletAddress?: string;
  };
  const userId = getAuthenticatedUserId(req);

  const room = privateRooms.get(String(roomCode).toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Private room not found.' });
  }
  if (room.players.some((player) => player.userId === userId)) {
    const user = getUser(userId, walletAddress);
    return res.json({
      success: true,
      roomCode: room.roomCode,
      targetPlayers: room.targetPlayers,
      playersCount: room.players.length,
      status: room.status,
      matchId: room.matchId || null,
      players: room.players,
      availableTickets: user.availableTickets,
      heldTickets: user.heldTickets,
      energy: getEnergyState(user),
    });
  }
  if (room.status === 'started') {
    return res.status(400).json({ error: 'Private room has already started.' });
  }
  if (room.players.length >= MAX_MATCH_PLAYERS) {
    return res.status(400).json({ error: 'Private room is already full.' });
  }

  const user = getUser(userId, walletAddress);
  if (room.stake > 0) {
    try {
      spendEnergy(user, 1, 'Private Room Energy');
      updateQuestProgress(user.userId, 'spend_energy', 1);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Energy spend failed.' });
    }
  }
  if (user.availableTickets < room.stake) {
    return res.status(400).json({ error: 'Insufficient available tickets for this private room.' });
  }

  if (room.stake > 0) {
    user.availableTickets = round2(user.availableTickets - room.stake);
    user.heldTickets = round2(user.heldTickets + room.stake);
    createLedgerEntry(user, {
      event: 'Private Room Hold',
      value: `-${room.stake.toFixed(2)} TKT`,
      type: 'stake_hold',
      amount: -room.stake,
    });
  }

  room.players.push({
    userId,
    username,
    avatarId,
    stake: room.stake,
    mode: 'private',
    joinedAt: Date.now(),
  });

  if (room.players.length >= room.targetPlayers) {
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
    targetPlayers: room.targetPlayers,
    playersCount: room.players.length,
    status: room.status,
    matchId: room.matchId || null,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
});

app.get('/api/private-rooms/status/:roomCode', requireAuth, (req, res) => {
  const room = privateRooms.get(String(req.params.roomCode).toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Private room not found.' });
  }

  return res.json({
    roomCode: room.roomCode,
    stake: room.stake,
    targetPlayers: room.targetPlayers,
    status: room.status,
    playersCount: room.players.length,
    minPlayers: MIN_MATCH_PLAYERS,
    maxPlayers: MAX_MATCH_PLAYERS,
    players: room.players,
    matchId: room.matchId || null,
  });
});

app.get('/api/private-rooms/stream/:roomCode', requireAuth, (req, res) => {
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

app.get('/api/matches/state/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const { matchId } = req.params;
  const userId = getAuthenticatedUserId(req);
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

app.get('/api/matches/stream/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const { matchId } = req.params;
  const userId = getAuthenticatedUserId(req);
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

app.post('/api/matches/action', requireAuth, (req: AuthenticatedRequest, res) => {
  const { matchId, action, cardId, chosenColor } = req.body as {
    matchId: string;
    action: 'play' | 'draw' | 'pass';
    cardId?: string;
    chosenColor?: CardColor;
  };
  const userId = getAuthenticatedUserId(req);

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

app.post('/api/matchmaker/leave', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = getAuthenticatedUserId(req);
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

app.post('/api/matches/settle', requireAuth, (req: AuthenticatedRequest, res) => {
  const { matchId } = req.body as { matchId: string };

  if (!matchId) {
    return res.status(400).json({ error: 'Settlement requires matchId.' });
  }

  const requesterUserId = getAuthenticatedUserId(req);
  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    return res.status(404).json({ error: 'Match not found.' });
  }
  if (!activeMatch.players.some((player) => player.userId === requesterUserId)) {
    return res.status(403).json({ error: 'User is not part of this match.' });
  }
  if (activeMatch.gameState.phase !== 'game_over' || !activeMatch.gameState.winnerUserId) {
    return res.status(400).json({ error: 'Match is not ready for settlement.' });
  }
  if (activeMatch.settled) {
    return res.json({
      success: true,
      matchId,
      grossPot: activeMatch.stake * activeMatch.players.length,
      alreadySettled: true,
    });
  }

  const placements = [...activeMatch.gameState.players]
    .sort((a, b) => {
      if (a.userId === activeMatch.gameState.winnerUserId) return -1;
      if (b.userId === activeMatch.gameState.winnerUserId) return 1;
      const aPoints = a.hand.reduce((sum, card) => sum + card.score, 0);
      const bPoints = b.hand.reduce((sum, card) => sum + card.score, 0);
      return aPoints - bPoints;
    })
    .map((player, index) => ({ userId: player.userId, rank: index + 1 }));

  const grossPot = activeMatch.stake * activeMatch.players.length;
  const seasonFund = round2(grossPot * 0.02);
  const burnFund = round2(grossPot * 0.02);
  const netPrizePool = round2(grossPot - seasonFund - burnFund);
  const payoutByRank = buildPayoutByRank(activeMatch.players.length, netPrizePool);

  placements.forEach(({ userId, rank }) => {
    const user = getUser(userId);
    const grossPayout = payoutByRank[rank];
    const referralSettlement = activeMatch.mode === 'pvp'
      ? applyReferralMatchBonus(user, grossPayout)
      : { inviterBonus: 0, netPayout: grossPayout };

    user.heldTickets = round2(Math.max(0, user.heldTickets - activeMatch.stake));
    user.availableTickets = round2(user.availableTickets + referralSettlement.netPayout);
    createLedgerEntry(user, {
      event: `${activeMatch.mode === 'pvp' ? 'PVP Match' : 'Private Match'} Payout`,
      value: `+${referralSettlement.netPayout.toFixed(2)} TKT`,
      type: 'match_payout',
      amount: referralSettlement.netPayout,
    });
    if (activeMatch.mode === 'pvp') {
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

setInterval(() => {
  flushTelegramNotifications().catch((error) => {
    console.error('Telegram notification worker failed', error);
  });
}, 15000);

setInterval(() => {
  const queuedUserIds = [...new Set(matchmakingQueue.map((player) => player.userId))];
  queuedUserIds.forEach((userId) => broadcastQueue(userId));
}, 1000);

async function flushAndExit(signal: string) {
  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await persistStateNow();
  } catch (error) {
    console.error(`Failed to flush runtime state on ${signal}`, error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => {
  flushAndExit('SIGINT').catch((error) => {
    console.error('SIGINT flush failed', error);
    process.exit(1);
  });
});
process.on('SIGTERM', () => {
  flushAndExit('SIGTERM').catch((error) => {
    console.error('SIGTERM flush failed', error);
    process.exit(1);
  });
});
process.on('beforeExit', () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistStateNow().catch((error) => {
    console.error('Failed to flush runtime state on beforeExit', error);
  });
});

async function bootstrap() {
  await loadPersistedState();
  ticketingService.startBackgroundDepositRecheck();
  ticketingService.recheckPendingDeposits().catch((error) => {
    console.error('Initial pending deposit recheck failed', error);
  });
  app.listen(PORT, () => {
    console.log(`Redoapp backend running on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Backend bootstrap failed', error);
  process.exit(1);
});
