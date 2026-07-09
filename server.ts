import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
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
const PUBLIC_FREE_MATCH_ENERGY_COST = 5;
const PUBLIC_STAKE_MATCH_ENERGY_COST = 2;

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
app.use(compression({
  filter: (req, res) => {
    if (res.getHeader('Content-Type') === 'text/event-stream') {
      return false;
    }
    return compression.filter(req, res);
  }
}));

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimitMiddleware(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'global';
    const now = Date.now();
    const client = rateLimitMap.get(key);
    if (!client || now > client.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    client.count++;
    if (client.count > limit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

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
  isConnected?: boolean;
  disconnectedAt?: number | null;
}

interface ServerGameState {
  deck: ServerCard[];
  discardPile: ServerCard[];
  players: ServerGamePlayer[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  activeColor: CardColor;
  activeValue: ServerCard['value'];
  phase: 'playing' | 'game_over';
  winnerUserId: string | null;
  logs: Array<{ id: string; timestamp: string; message: string; type: 'info' | 'play' | 'draw' | 'action' | 'win' }>;
  consecutiveDraws: number;
  turnStartedAt?: number;
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
  dailyStreak?: number;
  lootboxClaimedAt?: number | null;
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
  payoutResult?: any;
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
const privateRoomCleanupTimers = new Map<string, NodeJS.Timeout>();
const queueSubscribers = new Map<string, Set<Response>>();
const matchmakerCleanupTimers = new Map<string, NodeJS.Timeout>();
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

const dirtyUsers = new Set<string>();
const dirtyMatches = new Set<string>();
const dirtyPrivateRooms = new Set<string>();
const dirtyDeposits = new Set<string>();
const dirtyWithdrawals = new Set<string>();
const deletedMatches = new Set<string>();
const deletedPrivateRooms = new Set<string>();

async function persistStateNow() {
  if (supabaseAdmin) {
    try {
      // 1. Persist dirty users
      for (const userId of dirtyUsers) {
        const user = users.get(userId);
        if (user) {
          await supabaseAdmin
            .from(SUPABASE_STATE_TABLE)
            .upsert({
              id: `user:${userId}`,
              payload: user,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        }
      }
      dirtyUsers.clear();

      // 2. Persist dirty matches
      for (const matchId of dirtyMatches) {
        const match = activeMatches.get(matchId);
        if (match) {
          await supabaseAdmin
            .from(SUPABASE_STATE_TABLE)
            .upsert({
              id: `match:${matchId}`,
              payload: match,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        }
      }
      dirtyMatches.clear();

      // 3. Persist dirty private rooms
      for (const roomCode of dirtyPrivateRooms) {
        const room = privateRooms.get(roomCode);
        if (room) {
          await supabaseAdmin
            .from(SUPABASE_STATE_TABLE)
            .upsert({
              id: `room:${roomCode}`,
              payload: room,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        }
      }
      dirtyPrivateRooms.clear();

      // 4. Persist dirty deposits
      for (const depositId of dirtyDeposits) {
        const intent = depositIntents.get(depositId);
        if (intent) {
          await supabaseAdmin
            .from(SUPABASE_STATE_TABLE)
            .upsert({
              id: `deposit:${depositId}`,
              payload: intent,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        }
      }
      dirtyDeposits.clear();

      // 5. Persist dirty withdrawals
      for (const withdrawalId of dirtyWithdrawals) {
        const request = withdrawalRequests.get(withdrawalId);
        if (request) {
          await supabaseAdmin
            .from(SUPABASE_STATE_TABLE)
            .upsert({
              id: `withdrawal:${withdrawalId}`,
              payload: request,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        }
      }
      dirtyWithdrawals.clear();

      // 6. Delete removed matches
      for (const matchId of deletedMatches) {
        await supabaseAdmin
          .from(SUPABASE_STATE_TABLE)
          .delete()
          .eq('id', `match:${matchId}`);
      }
      deletedMatches.clear();

      // 7. Delete removed private rooms
      for (const roomCode of deletedPrivateRooms) {
        await supabaseAdmin
          .from(SUPABASE_STATE_TABLE)
          .delete()
          .eq('id', `room:${roomCode}`);
      }
      deletedPrivateRooms.clear();

      // 8. Persist global state (queue, notifications)
      const globalState = {
        matchmakingQueue,
        telegramNotifications,
      };
      await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .upsert({
          id: 'global-state',
          payload: globalState,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    } catch (err) {
      console.error('Supabase granular persist failed:', err);
    }
    return;
  }

  // Fallback local persistence
  const snapshot = buildPersistedState();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(snapshot), 'utf8');
}

function schedulePersist(opts?: {
  userId?: string;
  matchId?: string;
  roomCode?: string;
  depositId?: string;
  withdrawalId?: string;
  deleteMatchId?: string;
  deleteRoomCode?: string;
}) {
  if (opts) {
    if (opts.userId) dirtyUsers.add(opts.userId);
    if (opts.matchId) dirtyMatches.add(opts.matchId);
    if (opts.roomCode) dirtyPrivateRooms.add(opts.roomCode);
    if (opts.depositId) dirtyDeposits.add(opts.depositId);
    if (opts.withdrawalId) dirtyWithdrawals.add(opts.withdrawalId);
    if (opts.deleteMatchId) deletedMatches.add(opts.deleteMatchId);
    if (opts.deleteRoomCode) deletedPrivateRooms.add(opts.deleteRoomCode);
  }

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
    try {
      users.clear();
      depositIntents.clear();
      withdrawalRequests.clear();
      activeMatches.clear();
      activeMatchByUser.clear();
      privateRooms.clear();
      questProgressByUser.clear();
      telegramNotifications.splice(0, telegramNotifications.length);

      // 1. Load global state
      const { data: globalData, error: globalError } = await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .select('payload')
        .eq('id', 'global-state')
        .maybeSingle();

      if (globalError) {
        console.error('Failed to load global state from Supabase', globalError);
      } else if (globalData?.payload) {
        const payload = globalData.payload as any;
        matchmakingQueue = payload.matchmakingQueue || [];
        payload.telegramNotifications?.forEach((entry: any) => telegramNotifications.push(entry));
      }

      // 2. Load users
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .select('payload')
        .like('id', 'user:%');

      if (usersError) {
        console.error('Failed to load users from Supabase', usersError);
      } else if (usersData) {
        usersData.forEach((row) => {
          const user = row.payload as UserState;
          users.set(user.userId, user);
        });
      }

      // 3. Load active matches (non-settled)
      const { data: matchesData, error: matchesError } = await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .select('payload')
        .like('id', 'match:%');

      if (matchesError) {
        console.error('Failed to load active matches from Supabase', matchesError);
      } else if (matchesData) {
        matchesData.forEach((row) => {
          const match = row.payload as ActiveMatch;
          activeMatches.set(match.matchId, match);
          match.players.forEach((p) => {
            if (!match.settled) {
              activeMatchByUser.set(p.userId, match.matchId);
            }
          });
        });
      }

      // 4. Load private rooms
      const { data: roomsData, error: roomsError } = await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .select('payload')
        .like('id', 'room:%');

      if (roomsError) {
        console.error('Failed to load private rooms from Supabase', roomsError);
      } else if (roomsData) {
        roomsData.forEach((row) => {
          const room = row.payload as PrivateRoom;
          privateRooms.set(room.roomCode, room);
        });
      }

      // 5. Load pending deposit intents
      const { data: depositsData, error: depositsError } = await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .select('payload')
        .like('id', 'deposit:%');

      if (depositsError) {
        console.error('Failed to load deposits from Supabase', depositsError);
      } else if (depositsData) {
        depositsData.forEach((row) => {
          const intent = row.payload as DepositIntent;
          depositIntents.set(intent.id, intent);
        });
      }

      // 6. Load pending withdrawal requests
      const { data: withdrawalsData, error: withdrawalsError } = await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .select('payload')
        .like('id', 'withdrawal:%');

      if (withdrawalsError) {
        console.error('Failed to load withdrawals from Supabase', withdrawalsError);
      } else if (withdrawalsData) {
        withdrawalsData.forEach((row) => {
          const request = row.payload as WithdrawalRequest;
          withdrawalRequests.set(request.id, request);
        });
      }

      return;
    } catch (e) {
      console.error('Error during loadPersistedState from Supabase', e);
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
      schedulePersist({ userId: existing.userId });
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
  schedulePersist({ userId });
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
    schedulePersist({ userId: user.userId });
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

function isLootboxAvailable(user: UserState): boolean {
  const now = Date.now();
  const todayStart = getStartOfUtcDay(now);
  if (user.lootboxClaimedAt && getStartOfUtcDay(user.lootboxClaimedAt) === todayStart) {
    return false;
  }
  const progressList = getQuestProgress(user.userId);
  let completedDailyQuestsCount = 0;
  for (const quest of QUEST_DEFINITIONS.filter(q => q.kind === 'daily')) {
    const prog = progressList.find(p => p.questId === quest.id);
    if (prog && getStartOfUtcDay(prog.updatedAt) === todayStart && prog.progress >= quest.target) {
      completedDailyQuestsCount++;
    }
  }
  return completedDailyQuestsCount >= 3;
}

function buildBootstrapProfileResponse(user: UserState) {
  const activeMatchId = activeMatchByUser.get(user.userId);
  let activeMatchInfo = null;
  if (activeMatchId) {
    const match = activeMatches.get(activeMatchId);
    if (match) {
      const associatedRoom = Array.from(privateRooms.values()).find(r => r.matchId === match.matchId);
      activeMatchInfo = {
        matchId: match.matchId,
        mode: match.mode,
        stake: match.stake,
        roomCode: associatedRoom ? associatedRoom.roomCode : null,
        players: match.players.map(p => ({
          userId: p.userId,
          username: p.username,
          avatarId: p.avatarId,
          stake: p.stake
        })),
      };
    }
  }

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
    dailyStreak: user.dailyStreak || 0,
    lootboxClaimedAt: user.lootboxClaimedAt || null,
    lootboxAvailable: isLootboxAvailable(user),
    activeMatch: activeMatchInfo,
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
    value: `-⚡ ${amount}`,
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
    value: `+⚡ ${amount}`,
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
  schedulePersist({ userId });
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
    schedulePersist({ userId: user.userId });
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
    // Expiration check: 2 hours (7200000ms)
    if (Date.now() - payload.issuedAt > 7200000) {
      return null;
    }
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

function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const session = verifySessionToken(extractSessionToken(req));
  if (session) {
    req.authUserId = session.userId;
    return next();
  }
  const auth = verifyTelegramInitData(extractTelegramInitData(req));
  if (auth) {
    req.authUserId = `tg:${auth.id}`;
    const user = getUser(req.authUserId);
    applyTelegramAuth(user, auth);
  }
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
    schedulePersist({ userId: user.userId });
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

function getPrivateRoomUserId(req: AuthenticatedRequest, input: Record<string, unknown>) {
  if (req.authUserId) return req.authUserId;
  const host = req.hostname || '';
  const allowDevFallback = !TELEGRAM_BOT_TOKEN || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!allowDevFallback) return '';
  const bodyUserId = input.userId;
  if (typeof bodyUserId === 'string' && bodyUserId.trim()) {
    return bodyUserId.trim();
  }
  return '';
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
  schedulePersist({ userId: user.userId });
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
  schedulePersist({ userId: user.userId });
  schedulePersist({ userId: inviter.userId });
  return true;
}

function applyReferralMatchBonus(user: UserState, payoutAmount: number) {
  if (payoutAmount <= 0) {
    return {
      inviterBonus: 0,
      netPayout: payoutAmount,
    };
  }

  let totalBonus = 0;
  let inviterBonusL1 = 0;
  let inviterBonusL2 = 0;

  if (user.referredByUserId) {
    const inviterL1 = users.get(user.referredByUserId);
    if (inviterL1 && inviterL1.userId !== user.userId) {
      inviterBonusL1 = round2(payoutAmount * 0.02); // 2% Level 1
      if (inviterBonusL1 > 0) {
        inviterL1.availableTickets = round2(inviterL1.availableTickets + inviterBonusL1);
        createLedgerEntry(inviterL1, {
          event: 'L1 Referral Match Bonus',
          value: `+${inviterBonusL1.toFixed(2)} TKT`,
          type: 'referral_bonus',
          amount: inviterBonusL1,
        });
        queueTelegramNotification(
          inviterL1,
          `L1 Referral bonus: ${user.telegramUsername ? '@' + user.telegramUsername : user.userId} won a match. You received +${inviterBonusL1.toFixed(2)} TKT.`
        );
        totalBonus += inviterBonusL1;
      }

      if (inviterL1.referredByUserId) {
        const inviterL2 = users.get(inviterL1.referredByUserId);
        if (inviterL2 && inviterL2.userId !== user.userId && inviterL2.userId !== inviterL1.userId) {
          inviterBonusL2 = round2(payoutAmount * 0.01); // 1% Level 2
          if (inviterBonusL2 > 0) {
            inviterL2.availableTickets = round2(inviterL2.availableTickets + inviterBonusL2);
            createLedgerEntry(inviterL2, {
              event: 'L2 Referral Match Bonus',
              value: `+${inviterBonusL2.toFixed(2)} TKT`,
              type: 'referral_bonus',
              amount: inviterBonusL2,
            });
            queueTelegramNotification(
              inviterL2,
              `L2 Referral bonus: ${user.telegramUsername ? '@' + user.telegramUsername : user.userId} (via L1 @${inviterL1.telegramUsername || inviterL1.userId}) won a match. You received +${inviterBonusL2.toFixed(2)} TKT.`
            );
            totalBonus += inviterBonusL2;
          }
        }
      }
    }
  }

  const netPayout = round2(Math.max(0, payoutAmount - totalBonus));
  schedulePersist();
  return {
    inviterBonus: round2(totalBonus),
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
  schedulePersist({ userId: user.userId });
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
      name: sourcePlayer.username,
      avatar: sourcePlayer.avatarId,
      hand: visibleHand,
      isAi: sourcePlayer.isAi,
      unoDeclared: sourcePlayer.unoDeclared,
      emotion: sourcePlayer.emotion,
      isConnected: sourcePlayer.isConnected !== false,
      disconnectedAt: sourcePlayer.disconnectedAt || null,
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
      turnStartedAt: match.gameState.turnStartedAt,
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
    schedulePersist({ matchId: match.matchId });
    settleMatchHelper(match);
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
  match.gameState.turnStartedAt = Date.now();
  schedulePersist({ matchId: match.matchId });
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
  if (state.consecutiveDraws > 0) {
    throw new Error('You have already drawn a card this turn.');
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
  match.gameState.turnStartedAt = Date.now();
  schedulePersist({ matchId: match.matchId });
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
  if (state.consecutiveDraws === 0) {
    throw new Error('You must draw a card before passing.');
  }
  const nextState = {
    ...state,
    logs: [createServerLog(`${currentPlayer.username} passed the turn.`, 'info'), ...state.logs].slice(0, 50),
  };
  match.gameState = advanceServerTurn(nextState);
  match.gameState.turnStartedAt = Date.now();
  schedulePersist({ matchId: match.matchId });
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
  activeMatch.gameState.turnStartedAt = Date.now();
  activeMatches.set(matchId, activeMatch);
  players.forEach((queuedPlayer) => {
    activeMatchByUser.set(queuedPlayer.userId, matchId);
  });
  schedulePersist({ matchId });
  broadcastMatch(matchId);
  return activeMatch;
}

function runServerAiTurn(match: ActiveMatch, playerIndex: number) {
  try {
    const state = match.gameState;
    const player = state.players[playerIndex];
    if (!player) return;

    const playableCards = player.hand.filter((card) =>
      card.color === 'wild' || isValidServerMove(card, state.activeColor, state.activeValue)
    );

    if (playableCards.length > 0) {
      const actions = playableCards.filter((c) => c.value === 'wild_draw4' || c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse');
      let selectedCard = playableCards[0];
      if (actions.length > 0) {
        selectedCard = actions[Math.floor(Math.random() * actions.length)];
      } else {
        selectedCard = playableCards.reduce((max, c) => (c.score > max.score ? c : max), playableCards[0]);
      }

      let chosenColor: CardColor = 'red';
      if (selectedCard.color === 'wild') {
        const colors: CardColor[] = ['red', 'blue', 'yellow', 'green'];
        const counts = colors.map(col => ({
          color: col,
          count: player.hand.filter(c => c.color === col).length
        }));
        counts.sort((a, b) => b.count - a.count);
        chosenColor = counts[0].color;
      }

      applyPlayAction(match, player.userId, selectedCard.id, chosenColor);
    } else {
      applyDrawAction(match, player.userId);
      if (match.gameState.currentPlayerIndex === playerIndex && match.gameState.phase === 'playing') {
        const newlyDrawn = player.hand[player.hand.length - 1];
        if (newlyDrawn && (newlyDrawn.color === 'wild' || isValidServerMove(newlyDrawn, match.gameState.activeColor, match.gameState.activeValue))) {
          let chosenColor: CardColor = 'red';
          if (newlyDrawn.color === 'wild') {
            const colors: CardColor[] = ['red', 'blue', 'yellow', 'green'];
            const counts = colors.map(col => ({
              color: col,
              count: player.hand.filter(c => c.color === col).length
            }));
            counts.sort((a, b) => b.count - a.count);
            chosenColor = counts[0].color;
          }
          applyPlayAction(match, player.userId, newlyDrawn.id, chosenColor);
        } else if (match.gameState.currentPlayerIndex === playerIndex && match.gameState.phase === 'playing') {
          applyPassAction(match, player.userId);
        }
      }
    }
  } catch (err) {
    console.error('runServerAiTurn failed', err);
    match.gameState = advanceServerTurn(match.gameState);
    match.gameState.turnStartedAt = Date.now();
    schedulePersist({ matchId: match.matchId });
  }
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

  const similarPlayers = matchmakingQueue.filter(
    (entry) => entry.stake === player.stake && entry.mode === player.mode
  );
  // Sort by joinedAt ASC (oldest first)
  similarPlayers.sort((a, b) => a.joinedAt - b.joinedAt);
  const oldestPlayer = similarPlayers[0] ?? player;
  const waitedMs = Date.now() - oldestPlayer.joinedAt;

  return {
    status: 'searching',
    queueLength: similarPlayers.length,
    playersNeeded: Math.max(0, MIN_MATCH_PLAYERS - similarPlayers.length),
    countdownSec: Math.max(0, Math.ceil((MATCHMAKING_TIMEOUT_MS - waitedMs) / 1000)),
  };
}

function runMatchmakingTick() {
  if (matchmakingQueue.length < MIN_MATCH_PLAYERS) return;

  const groups = new Map<string, QueuePlayer[]>();
  for (const player of matchmakingQueue) {
    const key = `${player.mode}_${player.stake}`;
    const list = groups.get(key) || [];
    list.push(player);
    groups.set(key, list);
  }

  for (const [key, players] of groups.entries()) {
    players.sort((a, b) => a.joinedAt - b.joinedAt);

    let i = 0;
    while (i < players.length) {
      const remaining = players.length - i;
      if (remaining < MIN_MATCH_PLAYERS) break;

      const groupSlice = players.slice(i, i + MAX_MATCH_PLAYERS);
      const oldestPlayer = groupSlice[0];
      const waitedMs = Date.now() - oldestPlayer.joinedAt;

      const shouldMatch = groupSlice.length >= MAX_MATCH_PLAYERS
        || (groupSlice.length >= MIN_MATCH_PLAYERS && waitedMs >= MATCHMAKING_TIMEOUT_MS);

      if (shouldMatch) {
        const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const mode = oldestPlayer.mode;
        const stake = oldestPlayer.stake;

        activateMatch(matchId, mode, groupSlice, stake);

        const matchUserIds = new Set(groupSlice.map(p => p.userId));
        matchmakingQueue = matchmakingQueue.filter(p => !matchUserIds.has(p.userId));

        schedulePersist();

        groupSlice.forEach(p => {
          const timer = matchmakerCleanupTimers.get(p.userId);
          if (timer) {
            clearTimeout(timer);
            matchmakerCleanupTimers.delete(p.userId);
          }
          broadcastQueue(p.userId);
        });

        i += groupSlice.length;
      } else {
        break;
      }
    }
  }
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
  const canIssueSessionToken = !!resolved.auth || resolved.userId.startsWith('guest:');
  const user = getUser(resolved.userId, walletAddress);
  if (resolved.auth) {
    applyTelegramAuth(user, resolved.auth);
  }
  assignReferralIfNeeded(user, startParam || resolved.auth?.start_param);
  return res.json({
    telegramInitDataValid: !!resolved.auth,
    sessionToken: canIssueSessionToken ? createSessionToken(user.userId) : null,
    ...buildBootstrapProfileResponse(user),
  });
});

app.post('/api/xp/daily-checkin', requireAuth, (req: AuthenticatedRequest, res) => {
  const { walletAddress } = req.body;
  const user = getUser(getAuthenticatedUserId(req), walletAddress);
  const now = Date.now();

  const lastDay = user.lastDailyXpAt ? getStartOfUtcDay(user.lastDailyXpAt) : 0;
  const today = getStartOfUtcDay(now);
  const oneDayMs = 24 * 60 * 60 * 1000;

  let streak = user.dailyStreak || 0;
  if (lastDay === 0) {
    streak = 1;
  } else if (today - lastDay === oneDayMs) {
    streak = (streak % 7) + 1; // increase streak and cycle after 7 days
  } else if (today - lastDay > oneDayMs) {
    streak = 1; // reset streak
  } else if (today === lastDay) {
    return res.json({ success: false, alreadyClaimed: true, xp: user.xp });
  }

  user.dailyStreak = streak;
  user.lastDailyXpAt = now;

  const rewards = [
    { xp: 10, tickets: 0, energy: 1 },
    { xp: 15, tickets: 0, energy: 1 },
    { xp: 20, tickets: 0, energy: 2 },
    { xp: 25, tickets: 0, energy: 2 },
    { xp: 30, tickets: 0, energy: 3 },
    { xp: 40, tickets: 0, energy: 3 },
    { xp: 50, tickets: 0, energy: 5 },
  ];
  const reward = rewards[Math.min(6, Math.max(0, streak - 1))];

  rewardXp(user, reward.xp, `Daily Check-in (Day ${streak})`);
  if (reward.energy > 0) {
    rewardEnergy(user, reward.energy, `Daily Streak Day ${streak} Refill`);
  }

  if (!user.lastDailyEnergyAt || now - user.lastDailyEnergyAt >= 24 * 60 * 60 * 1000) {
    user.lastDailyEnergyAt = now;
    rewardEnergy(user, DAILY_ENERGY_REWARD, 'Daily Energy Refill');
  }

  updateQuestProgress(user.userId, 'spend_energy', 0);
  const claimedQuestIds = claimCompletedQuests(user);

  return res.json({
    success: true,
    xpAwarded: reward.xp,
    xp: user.xp,
    energy: getEnergyState(user),
    claimedQuestIds,
    streak,
    rewardTickets: reward.tickets,
    rewardEnergy: reward.energy,
  });
});

app.get('/api/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = getUser(getAuthenticatedUserId(req));
  return res.json(buildProfileResponse(user));
});

app.post('/api/quests/claim-lootbox', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = getUser(getAuthenticatedUserId(req));
  const now = Date.now();
  const todayStart = getStartOfUtcDay(now);

  if (user.lootboxClaimedAt && getStartOfUtcDay(user.lootboxClaimedAt) === todayStart) {
    return res.status(400).json({ error: "You have already claimed today's lootbox." });
  }

  const progressList = getQuestProgress(user.userId);
  let completedDailyQuestsCount = 0;
  for (const quest of QUEST_DEFINITIONS.filter(q => q.kind === 'daily')) {
    const prog = progressList.find(p => p.questId === quest.id);
    if (prog && getStartOfUtcDay(prog.updatedAt) === todayStart && prog.progress >= quest.target) {
      completedDailyQuestsCount++;
    }
  }

  if (completedDailyQuestsCount < 3) {
    return res.status(400).json({ error: `You need to complete at least 3 daily quests. Currently completed: ${completedDailyQuestsCount}` });
  }

  const roll = Math.random();
  let rewardType: 'xp' | 'energy' | 'jackpot' = 'xp';
  let rewardXpAmount = 0;
  let rewardEnergyAmount = 0;
  let message = '';

  if (roll < 0.60) {
    rewardType = 'xp';
    rewardXpAmount = Math.floor(50 + Math.random() * 101);
    rewardXp(user, rewardXpAmount, 'Daily Lootbox XP Reward');
    message = `🎁 You opened today's lootbox and found +${rewardXpAmount} XP!`;
  } else if (roll < 0.95) {
    rewardType = 'energy';
    rewardEnergyAmount = Math.floor(2 + Math.random() * 5);
    rewardEnergyAmount = Math.max(2, Math.min(6, rewardEnergyAmount));
    rewardEnergy(user, rewardEnergyAmount, 'Daily Lootbox Energy Reward');
    message = `🎁 You opened today's lootbox and found +${rewardEnergyAmount} Energy!`;
  } else {
    rewardType = 'jackpot';
    rewardXpAmount = 300;
    rewardEnergyAmount = 10;
    rewardXp(user, rewardXpAmount, 'Daily Lootbox JACKPOT XP Reward');
    rewardEnergy(user, rewardEnergyAmount, 'Daily Lootbox JACKPOT Energy Reward');
    message = `🎉 JACKPOT! You opened today's lootbox and found +300 XP and +10 Energy!`;
  }

  user.lootboxClaimedAt = now;
  schedulePersist();

  return res.json({
    success: true,
    rewardType,
    rewardTickets: 0,
    rewardEnergy: rewardEnergyAmount,
    rewardXp: rewardXpAmount,
    message,
    availableTickets: user.availableTickets,
    energy: getEnergyState(user),
    lootboxClaimedAt: user.lootboxClaimedAt,
  });
});

app.use('/api/tickets', requireAuth, rateLimitMiddleware(15, 60000));
ticketingService.registerRoutes(app);

app.post('/api/matchmaker/join', requireAuth, rateLimitMiddleware(10, 60000), (req: AuthenticatedRequest, res) => {
  const { username, avatarId, stake, mode, walletAddress } = req.body as {
    username: string;
    avatarId: string;
    stake: number;
    mode: MatchMode;
    walletAddress?: string;
  };
  const userId = getAuthenticatedUserId(req);
  if (stake === undefined || stake === null || !mode) {
    return res.status(400).json({ error: 'Missing stake or mode.' });
  }
  const stakeAmount = Number(stake);
  if (!Number.isFinite(stakeAmount) || stakeAmount < 0) {
    return res.status(400).json({ error: 'Public match stake must be 0 or greater.' });
  }

  const user = getUser(userId, walletAddress);
  const energyCost = stakeAmount === 0 ? PUBLIC_FREE_MATCH_ENERGY_COST : PUBLIC_STAKE_MATCH_ENERGY_COST;
  if (stakeAmount > 0 && user.availableTickets < stakeAmount) {
    return res.status(400).json({ error: 'Insufficient available tickets for stake.' });
  }

  try {
    spendEnergy(user, energyCost, stakeAmount === 0 ? 'Free Public Match Energy' : 'Online Match Energy');
    updateQuestProgress(user.userId, 'spend_energy', energyCost);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Energy spend failed.' });
  }

  if (stakeAmount > 0) {
    user.availableTickets = round2(user.availableTickets - stakeAmount);
    user.heldTickets = round2(user.heldTickets + stakeAmount);
    createLedgerEntry(user, {
      event: `${mode === 'pvp' ? 'PVP Queue Hold' : 'Private Room Hold'}`,
      value: `-${stakeAmount.toFixed(2)} TKT`,
      type: 'stake_hold',
      amount: -stakeAmount,
    });
  }

  const activeTimer = matchmakerCleanupTimers.get(userId);
  if (activeTimer) {
    clearTimeout(activeTimer);
    matchmakerCleanupTimers.delete(userId);
  }

  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
  matchmakingQueue.push({
    userId,
    username,
    avatarId,
    stake: stakeAmount,
    mode,
    joinedAt: Date.now(),
  });

  runMatchmakingTick();

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

  const activeTimer = matchmakerCleanupTimers.get(userId);
  if (activeTimer) {
    clearTimeout(activeTimer);
    matchmakerCleanupTimers.delete(userId);
  }

  subscribeToChannel(queueSubscribers, userId, res);
  sendSse(res, 'queue-status', buildQueuePayload(userId));

  res.on('close', () => {
    const activeSubs = queueSubscribers.get(userId);
    if (!activeSubs || activeSubs.size === 0) {
      if (!matchmakerCleanupTimers.has(userId)) {
        const timer = setTimeout(() => {
          matchmakerCleanupTimers.delete(userId);
          const stillNoSubs = !queueSubscribers.get(userId) || queueSubscribers.get(userId)!.size === 0;
          const player = matchmakingQueue.find(p => p.userId === userId);
          if (stillNoSubs && player) {
            matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
            const user = getUser(userId);
            if (player.stake > 0) {
              user.heldTickets = round2(user.heldTickets - player.stake);
              user.availableTickets = round2(user.availableTickets + player.stake);
              createLedgerEntry(user, {
                event: 'Queue Timeout Release',
                value: `+${player.stake.toFixed(2)} TKT`,
                type: 'stake_release',
                amount: player.stake,
              });
            }
            schedulePersist();
            matchmakingQueue
              .filter(p => p.stake === player.stake && p.mode === player.mode)
              .forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
          }
        }, 15000); // 15 seconds grace period
        matchmakerCleanupTimers.set(userId, timer);
      }
    }
  });
});

app.get('/api/matchmaker/status', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = getAuthenticatedUserId(req);

  const activeTimer = matchmakerCleanupTimers.get(userId);
  if (activeTimer) {
    clearTimeout(activeTimer);
    matchmakerCleanupTimers.delete(userId);
  }

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
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  if (input?.responseMode === 'iframe') {
    const message = JSON.stringify({
      source: 'redoapp-room-bridge',
      requestId: String(input.bridgeRequestId || ''),
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
  const userId = getPrivateRoomUserId(req, input);
  if (!userId) {
    return res.status(400).json({ error: 'Missing room creator user id.' });
  }
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

  const hostPlayer: QueuePlayer = {
    userId,
    username,
    avatarId,
    stake: stakeAmount,
    mode: 'private',
    joinedAt: Date.now(),
  };
  const existingWaitingRoom = Array.from(privateRooms.values()).find((room) =>
    room.hostUserId === userId &&
    room.stake === stakeAmount &&
    room.targetPlayers === targetPlayersCount &&
    (room.status === 'waiting' || room.status === 'started'));
  if (existingWaitingRoom) {
    if (normalizedRequestedCode && existingWaitingRoom.roomCode !== normalizedRequestedCode) {
      const collision = privateRooms.get(normalizedRequestedCode);
      if (collision && collision.hostUserId !== userId) {
        return res.status(409).json({ error: 'Requested room code is already in use.' });
      }
      const oldRoomCode = existingWaitingRoom.roomCode;
      privateRooms.delete(oldRoomCode);
      existingWaitingRoom.roomCode = normalizedRequestedCode;
      privateRooms.set(normalizedRequestedCode, existingWaitingRoom);
      schedulePersist({ roomCode: normalizedRequestedCode, deleteRoomCode: oldRoomCode });
    }

    // Upgrade legacy waiting status to started and provision match with placeholders
    if (!existingWaitingRoom.matchId) {
      const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      existingWaitingRoom.matchId = matchId;
      existingWaitingRoom.status = 'started';
      
      const matchPlayers: QueuePlayer[] = [hostPlayer];
      for (let i = 1; i < targetPlayersCount; i++) {
        matchPlayers.push({
          userId: `waiting_for_player_${i}`,
          username: 'Waiting...',
          avatarId: 'koala',
          stake: stakeAmount,
          mode: 'private',
          joinedAt: Date.now(),
        });
      }
      activateMatch(matchId, 'private', matchPlayers, stakeAmount);
    }

    const existingUser = getUser(userId, walletAddress);
    return sendPrivateRoomCreateSuccess(req, res, {
      success: true,
      roomCode: existingWaitingRoom.roomCode,
      telegramLink: buildTelegramMiniAppLink(`room_${existingWaitingRoom.roomCode}`),
      stake: existingWaitingRoom.stake,
      targetPlayers: existingWaitingRoom.targetPlayers,
      status: 'started',
      matchId: existingWaitingRoom.matchId,
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
        telegramLink: buildTelegramMiniAppLink(`room_${existingRoom.roomCode}`),
        stake: existingRoom.stake,
        targetPlayers: existingRoom.targetPlayers,
        status: existingRoom.status,
        matchId: existingRoom.matchId || null,
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



  let roomCode = normalizedRequestedCode;
  if (roomCode && privateRooms.has(roomCode)) {
    return res.status(409).json({ error: 'Requested room code is already in use.' });
  }
  if (!roomCode) {
    do {
      roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (privateRooms.has(roomCode));
  }

  const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  // Set up match players with placeholders
  const matchPlayers: QueuePlayer[] = [hostPlayer];
  for (let i = 1; i < targetPlayersCount; i++) {
    matchPlayers.push({
      userId: `waiting_for_player_${i}`,
      username: 'Waiting...',
      avatarId: 'koala',
      stake: stakeAmount,
      mode: 'private',
      joinedAt: Date.now(),
    });
  }

  activateMatch(matchId, 'private', matchPlayers, stakeAmount);

  privateRooms.set(roomCode, {
    roomCode,
    createRequestId: normalizedRequestId || undefined,
    stake: stakeAmount,
    targetPlayers: targetPlayersCount,
    hostUserId: userId,
    players: [hostPlayer],
    createdAt: Date.now(),
    status: 'started',
    matchId,
  });
  schedulePersist({ roomCode });
  broadcastPrivateRoom(roomCode);

  return sendPrivateRoomCreateSuccess(req, res, {
    success: true,
    roomCode,
    telegramLink: buildTelegramMiniAppLink(`room_${roomCode}`),
    stake: stakeAmount,
    targetPlayers: targetPlayersCount,
    status: 'started',
    matchId,
    playersCount: 1,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
}

app.post('/api/private-rooms/create', optionalAuth, rateLimitMiddleware(10, 60000), handlePrivateRoomCreate);
app.get('/api/private-rooms/create-beacon', optionalAuth, handlePrivateRoomCreate);

const joinFailuresMap = new Map<string, { count: number; lockedUntil: number }>();

app.post('/api/private-rooms/join', optionalAuth, rateLimitMiddleware(10, 60000), (req: AuthenticatedRequest, res) => {
  const { roomCode, username, avatarId, walletAddress } = req.body as {
    roomCode: string;
    userId?: string;
    username: string;
    avatarId: string;
    walletAddress?: string;
  };
  const userId = getPrivateRoomUserId(req, req.body as Record<string, unknown>);
  if (!userId) {
    return res.status(400).json({ error: 'Missing private room user id.' });
  }

  const lockoutKey = req.ip || userId || 'global';
  const failure = joinFailuresMap.get(lockoutKey);
  if (failure && Date.now() < failure.lockedUntil) {
    return res.status(403).json({ error: 'Too many failed attempts. Try again later.' });
  }

  const room = privateRooms.get(String(roomCode).toUpperCase());
  if (!room) {
    const cur = failure && Date.now() > failure.lockedUntil ? { count: 0, lockedUntil: 0 } : (failure || { count: 0, lockedUntil: 0 });
    cur.count++;
    if (cur.count >= 5) {
      cur.lockedUntil = Date.now() + 900000; // 15 minutes lockout
    }
    joinFailuresMap.set(lockoutKey, cur);
    return res.status(404).json({ error: 'Private room not found.' });
  }

  joinFailuresMap.delete(lockoutKey);
  if (room.players.some((player) => player.userId === userId)) {
    const user = getUser(userId, walletAddress);
    return res.json({
      success: true,
      roomCode: room.roomCode,
      telegramLink: buildTelegramMiniAppLink(`room_${room.roomCode}`),
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
  // Find the match to check for placeholders
  const match = room.matchId ? activeMatches.get(room.matchId) : null;
  const hasPlaceholders = !!match && match.players.some(p => p.userId.startsWith('waiting_for_player_'));

  if (room.status === 'started' && !hasPlaceholders) {
    return res.status(400).json({ error: 'Private room has already started.' });
  }
  if (room.players.length >= room.targetPlayers) {
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

  const newPlayer: QueuePlayer = {
    userId,
    username,
    avatarId,
    stake: room.stake,
    mode: 'private',
    joinedAt: Date.now(),
  };

  room.players.push(newPlayer);

  if (match) {
    // Replace the first placeholder in match.players
    const placeholderIdx = match.players.findIndex(p => p.userId.startsWith('waiting_for_player_'));
    if (placeholderIdx !== -1) {
      const placeholderUserId = match.players[placeholderIdx].userId;
      match.players[placeholderIdx] = newPlayer;
      
      // Also replace in match.gameState.players
      const gsPlayerIdx = match.gameState.players.findIndex(p => p.userId === placeholderUserId);
      if (gsPlayerIdx !== -1) {
        match.gameState.players[gsPlayerIdx].userId = userId;
        match.gameState.players[gsPlayerIdx].username = username;
        match.gameState.players[gsPlayerIdx].avatarId = avatarId;
      }

      activeMatchByUser.set(userId, match.matchId);

      const anyLeft = match.players.some(p => p.userId.startsWith('waiting_for_player_'));
      if (!anyLeft) {
        match.gameState.turnStartedAt = Date.now();
      }
    }
  }

  privateRooms.set(room.roomCode, room);
  schedulePersist({ roomCode: room.roomCode, matchId: room.matchId || undefined });
  if (match) {
    broadcastMatch(match.matchId);
  }
  broadcastPrivateRoom(room.roomCode);

  return res.json({
    success: true,
    roomCode: room.roomCode,
    telegramLink: buildTelegramMiniAppLink(`room_${room.roomCode}`),
    targetPlayers: room.targetPlayers,
    playersCount: room.players.length,
    status: room.status,
    matchId: room.matchId || null,
    players: room.players,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
});

app.get('/api/private-rooms/status/:roomCode', optionalAuth, (req, res) => {
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

app.get('/api/private-rooms/stream/:roomCode', optionalAuth, (req, res) => {
  const roomCode = String(req.params.roomCode).toUpperCase();
  const room = privateRooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Private room not found.' });
  }
  const userId = getPrivateRoomUserId(req, req.query);
  res.locals.userId = userId;

  // Clear cleanup timer for this room/player if they reconnected
  if (room.hostUserId === userId) {
    const hostTimer = privateRoomCleanupTimers.get(roomCode);
    if (hostTimer) {
      clearTimeout(hostTimer);
      privateRoomCleanupTimers.delete(roomCode);
    }
  } else {
    const playerTimerKey = `${roomCode}_${userId}`;
    const playerTimer = privateRoomCleanupTimers.get(playerTimerKey);
    if (playerTimer) {
      clearTimeout(playerTimer);
      privateRoomCleanupTimers.delete(playerTimerKey);
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  subscribeToChannel(privateRoomSubscribers, roomCode, res);
  sendSse(res, 'private-room', buildPrivateRoomPayload(room));

  res.on('close', () => {
    const currentRoom = privateRooms.get(roomCode);
    if (currentRoom && currentRoom.status === 'waiting') {
      const activeSubs = privateRoomSubscribers.get(roomCode);
      const isStillConnected = !!activeSubs && Array.from(activeSubs).some(
        (sub) => sub.locals.userId === userId && sub !== res
      );

      if (!isStillConnected) {
        const playerInRoom = currentRoom.players.find((p) => p.userId === userId);
        if (playerInRoom) {
          if (currentRoom.hostUserId === userId) {
            // Schedule disbanding after 60 seconds
            if (!privateRoomCleanupTimers.has(roomCode)) {
              const timer = setTimeout(() => {
                const roomToDisband = privateRooms.get(roomCode);
                if (roomToDisband && roomToDisband.status === 'waiting') {
                  roomToDisband.players.forEach(p => {
                    if (p.stake > 0) {
                      const user = getUser(p.userId);
                      user.heldTickets = round2(user.heldTickets - p.stake);
                      user.availableTickets = round2(user.availableTickets + p.stake);
                      createLedgerEntry(user, {
                        event: 'Private Room Host Leave Release',
                        value: `+${p.stake.toFixed(2)} TKT`,
                        type: 'stake_release',
                        amount: p.stake,
                      });
                    }
                  });
                  privateRooms.delete(roomCode);
                  privateRoomCleanupTimers.delete(roomCode);
                  schedulePersist({ deleteRoomCode: roomCode });
                  broadcastPrivateRoom(roomCode);
                }
              }, 60000); // 60 seconds grace period
              privateRoomCleanupTimers.set(roomCode, timer);
            }
          } else {
            // Schedule player boot after 60 seconds
            const playerTimerKey = `${roomCode}_${userId}`;
            if (!privateRoomCleanupTimers.has(playerTimerKey)) {
              const timer = setTimeout(() => {
                const roomToUpdate = privateRooms.get(roomCode);
                if (roomToUpdate && roomToUpdate.status === 'waiting') {
                  const playerToBoot = roomToUpdate.players.find(p => p.userId === userId);
                  if (playerToBoot) {
                    roomToUpdate.players = roomToUpdate.players.filter(p => p.userId !== userId);
                    schedulePersist({ roomCode });
                    if (playerToBoot.stake > 0) {
                      const user = getUser(userId);
                      user.heldTickets = round2(user.heldTickets - playerToBoot.stake);
                      user.availableTickets = round2(user.availableTickets + playerToBoot.stake);
                      createLedgerEntry(user, {
                        event: 'Private Room Leave Release',
                        value: `+${playerToBoot.stake.toFixed(2)} TKT`,
                        type: 'stake_release',
                        amount: playerToBoot.stake,
                      });
                    }
                    broadcastPrivateRoom(roomCode);
                  }
                }
                privateRoomCleanupTimers.delete(playerTimerKey);
              }, 60000);
              privateRoomCleanupTimers.set(playerTimerKey, timer);
            }
          }
        }
      }
    }
  });
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

  // Mark player as connected immediately
  const player = activeMatch.gameState.players.find(p => p.userId === userId);
  if (player) {
    const previouslyDisconnected = player.isConnected === false;
    player.isConnected = true;
    player.disconnectedAt = null;
    if (previouslyDisconnected) {
      activeMatch.gameState.logs = [createServerLog(`🔌 ${player.username} reconnected.`, 'info'), ...activeMatch.gameState.logs].slice(0, 50);
      schedulePersist({ matchId });
      setTimeout(() => broadcastMatch(matchId), 100);
    }
  }

  subscribeToChannel(matchSubscribers, matchId, res);
  sendSse(res, 'match-state', state);

  res.on('close', () => {
    const subscribers = matchSubscribers.get(matchId);
    const isStillConnected = !!subscribers && Array.from(subscribers).some(
      (sub) => sub.locals.userId === userId && sub !== res
    );

    if (!isStillConnected) {
      const match = activeMatches.get(matchId);
      if (match) {
        const player = match.gameState.players.find(p => p.userId === userId);
        if (player && player.isConnected !== false) {
          player.isConnected = false;
          player.disconnectedAt = Date.now();
          match.gameState.logs = [createServerLog(`🔌 ${player.username} disconnected.`, 'info'), ...match.gameState.logs].slice(0, 50);
          schedulePersist({ matchId });
          broadcastMatch(matchId);
        }
      }
    }
  });
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
    if (player.stake > 0) {
      user.heldTickets = round2(user.heldTickets - player.stake);
      user.availableTickets = round2(user.availableTickets + player.stake);
      createLedgerEntry(user, {
        event: 'Stake Hold Released',
        value: `+${player.stake.toFixed(2)} TKT`,
        type: 'stake_release',
        amount: player.stake,
      });
    }
    matchmakingQueue
      .filter(p => p.stake === player.stake && p.mode === player.mode)
      .forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
  }
  schedulePersist();
  broadcastQueue(userId);
  res.json({ success: true });
});

function scheduleMatchCleanup(matchId: string) {
  setTimeout(() => {
    activeMatches.delete(matchId);
    if (supabaseAdmin) {
      supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .delete()
        .eq('id', `match:${matchId}`)
        .then(({ error }) => {
          if (error) console.error(`Failed to delete match ${matchId} from DB:`, error);
        });
    } else {
      schedulePersist({ deleteMatchId: matchId });
    }
  }, 300000); // 5 minutes
}

function settleMatchHelper(activeMatch: ActiveMatch) {
  if (activeMatch.settled) return;

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
    maybeActivateReferral(user, activeMatch.matchId);
    claimCompletedQuests(user);
  });

  activeMatch.settled = true;
  activeMatch.players.forEach((player) => {
    activeMatchByUser.delete(player.userId);
  });

  activeMatch.payoutResult = {
    grossPot,
    seasonFund,
    burnFund,
    netPrizePool,
    payoutByRank,
  };

  schedulePersist({ matchId: activeMatch.matchId });
  flushTelegramNotifications().catch((error) => {
    console.error('Telegram notification flush failed', error);
  });

  scheduleMatchCleanup(activeMatch.matchId);
}

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

  settleMatchHelper(activeMatch);

  const { grossPot, seasonFund, burnFund, netPrizePool, payoutByRank } = activeMatch.payoutResult;

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
  runMatchmakingTick();
  const queuedUserIds = [...new Set(matchmakingQueue.map((player) => player.userId))];
  queuedUserIds.forEach((userId) => broadcastQueue(userId));
}, 1000);

setInterval(() => {
  const now = Date.now();
  for (const [matchId, match] of activeMatches.entries()) {
    if (match.gameState.phase !== 'playing') continue;

    const state = match.gameState;
    const hasPlaceholders = match.players.some(p => p.userId.startsWith('waiting_for_player_'));

    if (hasPlaceholders) {
      state.turnStartedAt = Date.now();
      state.players.forEach((player) => {
        player.isConnected = true;
        player.disconnectedAt = null;
      });
      continue;
    }

    const isNewMatch = (now - match.createdAt) < 15000;

    // Evaluate connection status
    state.players.forEach((player) => {
      if (isNewMatch) {
        player.isConnected = true;
        player.disconnectedAt = null;
        return;
      }

      const subscribers = matchSubscribers.get(matchId);
      const isConnected = !!subscribers && Array.from(subscribers).some(
        (res) => res.locals.userId === player.userId
      );

      if (isConnected) {
        if (player.isConnected === false) {
          player.isConnected = true;
          player.disconnectedAt = null;
          state.logs = [createServerLog(`🔌 ${player.username} reconnected.`, 'info'), ...state.logs].slice(0, 50);
          broadcastMatch(matchId);
        }
      } else {
        if (player.isConnected !== false && !player.isAi) {
          player.isConnected = false;
          player.disconnectedAt = now;
          state.logs = [createServerLog(`🔌 ${player.username} disconnected.`, 'info'), ...state.logs].slice(0, 50);
          broadcastMatch(matchId);
        }
      }
    });

    if (isNewMatch) {
      state.turnStartedAt = now;
      continue;
    }

    const currentPlayerIndex = state.currentPlayerIndex;
    const currentPlayer = state.players[currentPlayerIndex];
    if (!currentPlayer) continue;

    if (!state.turnStartedAt) {
      state.turnStartedAt = now;
    }

    const elapsedSec = Math.floor((now - state.turnStartedAt) / 1000);
    const turnLimit = 20;
    const disconnectedWaitDelay = 4;
    const graceLimit = 30;

    if (currentPlayer.isConnected !== false) {
      if (elapsedSec >= turnLimit) {
        state.logs = [createServerLog(`⏰ ${currentPlayer.username}'s turn timed out. Auto-playing.`, 'info'), ...state.logs].slice(0, 50);
        runServerAiTurn(match, currentPlayerIndex);
        broadcastMatch(matchId);
        schedulePersist({ matchId });
      }
    } else {
      if (elapsedSec >= disconnectedWaitDelay) {
        state.logs = [createServerLog(`🤖 ${currentPlayer.username} is offline. Auto-playing.`, 'info'), ...state.logs].slice(0, 50);
        runServerAiTurn(match, currentPlayerIndex);
        broadcastMatch(matchId);
        schedulePersist({ matchId });
      }
    }

    state.players.forEach((player) => {
      if (player.isConnected === false && !player.isAi && player.disconnectedAt) {
        const secsDisconnected = (now - player.disconnectedAt) / 1000;
        if (secsDisconnected >= graceLimit) {
          player.isAi = true;
          state.logs = [createServerLog(`🤖 ${player.username} has been permanently replaced by a bot.`, 'info'), ...state.logs].slice(0, 50);
          broadcastMatch(matchId);
          schedulePersist({ matchId });
        }
      }
    });
  }
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
