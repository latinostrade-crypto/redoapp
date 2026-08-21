import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTicketingService, type DepositIntent, type TicketLedgerEntry, type WithdrawalRequest } from './server/tickets';
import { distributePlayersIntoTables, type TournamentData, type TournamentParticipant, type TournamentMatch } from './server/tournaments';


dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 10000;
const MARKETING_WALLET = process.env.MARKETING_WALLET || 'UQCQoVn3iML7nn2a6ts97Xo1wGV21r3QCBHfPy51l0UQbXdw';
const WITHDRAWAL_SENDER_WALLET = process.env.WITHDRAWAL_SENDER_WALLET || MARKETING_WALLET;
const TICKET_PRICE_TON = Number(process.env.TICKET_PRICE_TON || '1');
const MIN_WITHDRAW_TICKETS = 0.5;
const ENABLE_CHAIN_VERIFICATION = process.env.ENABLE_CHAIN_VERIFICATION !== 'false';
const TON_VERIFICATION_MODE = process.env.TON_VERIFICATION_MODE || 'tonapi';
const TON_API_BASE_URL = process.env.TON_API_BASE_URL || 'https://tonapi.io/v2';
const TON_API_KEY = process.env.TON_API_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'redo_appbot';
const TELEGRAM_APP_SHORT_NAME = process.env.TELEGRAM_APP_SHORT_NAME || 'app';
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || 'https://yoapp-backend.onrender.com').replace(/\/$/, '');
const WITHDRAWAL_OPERATOR_CHAT_ID = Number(process.env.WITHDRAWAL_OPERATOR_CHAT_ID || '5152039743');
const WITHDRAWAL_OPERATOR_USERNAME = process.env.WITHDRAWAL_OPERATOR_USERNAME || 'allin_gram';
// Telegram initData is a launch credential, not a long-lived session. Keep its
// replay window short (5 minutes default); authenticated players receive a separate signed session.
const TELEGRAM_INITDATA_MAX_AGE_SEC = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC || '86400');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// A dedicated session secret prevents compromise of another integration secret from minting sessions.
if (process.env.NODE_ENV === 'production' && (!process.env.APP_SESSION_SECRET || process.env.APP_SESSION_SECRET.trim().length < 32)) {
  throw new Error('FATAL: APP_SESSION_SECRET must be set and at least 32 characters long in production.');
}
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || crypto.randomBytes(32).toString('base64url');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || 'app_state';
const SUPABASE_STATE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID || 'runtime-state';
const SUPABASE_PAGE_SIZE = 1000;
// Redis is deliberately limited to a short-lived cache for the referral list.
// Supabase remains the durable source of truth for rewards, balances and users.
const UPSTASH_REDIS_REST_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REFERRAL_CACHE_TTL_SEC = Math.min(300, Math.max(5, Number(process.env.REFERRAL_CACHE_TTL_SEC || '30') || 30));
const REDIS_CACHE_NAMESPACE = process.env.REDIS_CACHE_NAMESPACE || 'redoapp:v1';
// Explicit one-time production migration requested on 2026-07-14. The marker
// is stored in Supabase, so restarts and future deploys cannot repeat it.
const REFERRAL_RESET_MIGRATION_ID = 'referrals-reset-2026-07-14';
const BALANCE_REPAIR_MIGRATION_ID = 'balance-repair-v3-2026-08-17';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'runtime-state.json');
const DEFAULT_REFERRER_CODE = (process.env.DEFAULT_REFERRER_CODE || 'FMFVR7').trim().toUpperCase();
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
// A public queue must survive a Render cold start and a Telegram WebView
// reconnect. Five seconds was shorter than either of those normal events: a
// player who joined first could be expired before the second player's request
// reached this process, so a valid 0.3 TKT pair never met in the same queue.
// This is only the no-opponent expiry; as soon as two compatible players are
// present runMatchmakingTick starts their table immediately.
const MATCHMAKING_TIMEOUT_MS = 75_000;
const PUBLIC_FREE_MATCH_ENERGY_COST = 2;
const PUBLIC_STAKE_MATCH_ENERGY_COST = 2;

const ALLOWED_ORIGINS = [
  'https://redoapp.org',
  'https://www.redoapp.org',
  'https://redoapp.website',
  'https://www.redoapp.website',
  'https://redoapp.onrender.com',
  'https://redoapp-backend.onrender.com',
  'https://yoapp-backend.onrender.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// Authentication is token-based and the API does not use cookies.
// Reflecting verified origins or null (Telegram iOS WebViews) protects against arbitrary cross-origin site calls.
app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (
      !origin ||
      origin === 'null' ||
      ALLOWED_ORIGINS.includes(origin) ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('192.168.') ||
      origin.includes('10.') ||
      origin.includes('172.') ||
      origin.includes('.local') ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.redoapp.org') ||
      origin.endsWith('.redoapp.website') ||
      origin.startsWith('https://t.me')
    ) {
      return callback(null, true);
    }
    callback(new Error('CORS request blocked by origin security policy.'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-session-token',
    'x-telegram-init-data',
    'x-admin-api-key',
    'x-user-id',
    'Accept',
    'Origin',
    'X-Requested-With',
  ],
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://telegram.org'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(express.json({ limit: '64kb' }));
app.use(compression({
  filter: (req, res) => {
    if (res.getHeader('Content-Type') === 'text/event-stream') {
      return false;
    }
    return compression.filter(req, res);
  }
}));

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let rateLimitLastCleanupAt = 0;

function pruneExpiredRateLimits(now: number) {
  if (now - rateLimitLastCleanupAt < RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  rateLimitLastCleanupAt = now;
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(key);
  }
}

type RateLimitScope = 'ip' | 'user';

function rateLimitMiddleware(limit: number, windowMs: number, scope: RateLimitScope = 'ip') {
  return (req: Request, res: Response, next: NextFunction) => {
    let authenticatedUserId = (req as AuthenticatedRequest).authUserId;
    if (!authenticatedUserId) {
      try {
        const telegramInitData = extractTelegramInitData(req);
        const auth = verifyTelegramInitData(telegramInitData);
        if (auth) {
          authenticatedUserId = `tg:${auth.id}`;
          (req as AuthenticatedRequest).authUserId = authenticatedUserId;
        } else {
          const sessionToken = extractSessionToken(req);
          const session = verifySessionToken(sessionToken);
          if (session) {
            authenticatedUserId = session.userId;
            (req as AuthenticatedRequest).authUserId = authenticatedUserId;
          }
        }
      } catch {
        // Ignore parsing errors in rate limiter resolution
      }
    }
    const effectiveScope = authenticatedUserId ? 'user' : scope;
    const subject = effectiveScope === 'user' && authenticatedUserId
      ? `user:${authenticatedUserId}`
      : `ip:${req.ip || 'global'}`;
    // Keep independent endpoint budgets. Read-side ticket polling must never
    // consume the budget for a user-initiated deposit or withdrawal.
    const routeKey = `${req.method}:${req.baseUrl}${req.path}`;
    const key = `${effectiveScope}:${subject}:${routeKey}`;
    const now = Date.now();
    pruneExpiredRateLimits(now);
    const client = rateLimitMap.get(key);
    if (!client || now > client.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    client.count++;
    if (client.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((client.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 50 }));

// Apply global baseline rate limiting to all requests
app.use(rateLimitMiddleware(120, 60 * 1000, 'ip'));

function validatePayload(body: any, schema: Record<string, string>) {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request payload.');
  }
  for (const [key, type] of Object.entries(schema)) {
    const value = body[key];
    if (value === undefined || value === null) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    if (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`Invalid parameter type: ${key} must be a number.`);
    }
    if (type === 'string' && typeof value !== 'string') {
      throw new Error(`Invalid parameter type: ${key} must be a string.`);
    }
  }
}

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
  hasConnected?: boolean;
  // A successful state read is also a heartbeat. This keeps games usable in
  // Telegram clients where EventSource is unavailable or intermittently cut.
  lastSeenAt?: number | null;
  disconnectedAt?: number | null;
}

type ServerGameLogType = 'info' | 'play' | 'draw' | 'action' | 'win' | 'bet' | 'fold' | 'deal';

interface ServerGameState {
  deck: ServerCard[];
  discardPile: ServerCard[];
  players: ServerGamePlayer[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  activeColor: CardColor;
  activeValue: ServerCard['value'];
  phase: 'playing' | 'game_over' | 'round_over';
  winnerUserId: string | null;
  logs: Array<{ id: string; timestamp: string; message: string; type: ServerGameLogType }>;
  consecutiveDraws: number;
  turnStartedAt?: number;
}

interface ServerBlackjackCard {
  id: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
  rank: number; // 2-14
  value: number; // 2-10, Face=10, Ace=11 or 1
  hidden?: boolean;
}

interface ServerBlackjackPlayer {
  userId: string;
  username: string;
  avatarId: string;
  isAi: boolean;
  isConnected?: boolean;
  hasConnected?: boolean;
  lastSeenAt?: number | null;
  disconnectedAt?: number | null;
  cards: ServerBlackjackCard[];
  bet: number;
  chips: number;
  score: number;
  isSoft: boolean;
  isBusted: boolean;
  hasBlackjack: boolean;
  status: 'playing' | 'stood' | 'busted' | 'blackjack';
  wins: number;
  eliminated?: boolean;
  lastProfit?: number;
}

interface ServerBlackjackGameState {
  shoe: ServerBlackjackCard[];
  dealer: ServerBlackjackPlayer;
  players: ServerBlackjackPlayer[];
  currentPlayerIndex: number;
  stage: 'player_turn' | 'dealer_turn' | 'round_ended' | 'match_ended';
  pot: number;
  stake: number;
  currentHand: number;
  maxHands: number;
  targetWins?: number;
  winnerUserId?: string | null;
  matchChampionUserId?: string | null;
  roundWinnerUserId?: string | null;
  roundWinnerName?: string | null;
  nextRoundStartsAt?: number | null;
  winningHandDesc?: string;
  winningPayout?: number;
  logs: Array<{ id: string; timestamp: string; message: string; type: ServerGameLogType }>;
  turnStartedAt?: number;
  turnTimeoutSec?: number;
}

interface ServerPokerCard {
  id: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
  rank: number; // 2-14
  hidden?: boolean;
}

interface ServerPokerPlayer {
  userId: string;
  username: string;
  avatarId: string;
  isAi: boolean;
  isConnected?: boolean;
  hasConnected?: boolean;
  lastSeenAt?: number | null;
  disconnectedAt?: number | null;
  chips: number;
  currentBet: number;
  totalMatchInvested: number;
  holeCards: ServerPokerCard[];
  folded: boolean;
  isAllIn: boolean;
  lastAction?: string;
  hasActedThisStage: boolean;
  eliminated: boolean;
  handScore?: number;
  handDesc?: string;
}

interface ServerPokerGameState {
  deck: ServerPokerCard[];
  stage: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended' | 'match_ended';
  pot: number;
  currentBet: number;
  minRaise: number;
  communityCards: ServerPokerCard[];
  players: ServerPokerPlayer[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  currentPlayerIndex: number;
  smallBlindAmount: number;
  bigBlindAmount: number;
  winnerUserIds: string[];
  winningCardIds: string[];
  winningHandDesc?: string;
  matchChampionUserId?: string | null;
  nextRoundStartsAt?: number | null;
  winningPayout?: number;
  logs: Array<{ id: string; timestamp: string; message: string; type: 'info' | 'play' | 'draw' | 'action' | 'win' | 'bet' | 'fold' | 'deal' }>;
  turnStartedAt?: number;
  turnTimeoutSec?: number;
}


interface LootboxClaimRecord {
  claimId: string;
  claimedAt: number;
  rewardType: 'xp' | 'energy' | 'jackpot';
  rewardTickets: number;
  rewardEnergy: number;
  rewardXp: number;
  message: string;
}

interface DailyCheckinRecord {
  claimId: string;
  claimedAt: number;
  streak: number;
  xpAwarded: number;
  rewardTickets: number;
  rewardEnergy: number;
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
  referralResetAt?: number | null;
  completedQuestIds: string[];
  transactions: TicketLedgerEntry[];
  dailyStreak?: number;
  lastDailyCheckin?: DailyCheckinRecord | null;
  lootboxClaimedAt?: number | null;
  lastLootboxClaim?: LootboxClaimRecord | null;
  matchmakingFailureAt?: number | null;
  matchmakingFailureReason?: 'timeout' | null;
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

type PersistedUserState = UserState & {
  questProgress?: UserQuestProgress[];
};

type ReferralStatus = NonNullable<UserState['referralStatus']>;

interface ReferralLevelStats {
  total: number;
  pending: number;
  activated: number;
  rejected: number;
}

interface ReferralStats {
  level1: ReferralLevelStats;
  level2: ReferralLevelStats;
}

type ReferralPayoutLevel = 1 | 2;

interface ReferralPayoutRecord {
  id: string;
  matchId: string;
  level: ReferralPayoutLevel;
  sourceUserId: string;
  recipientUserId: string;
  grossPayout: number;
  rateBps: number;
  amount: number;
  status: 'pending' | 'credited';
  createdAt: number;
  creditedAt: number | null;
}

interface TelegramNotification {
  id: string;
  userId: string;
  telegramChatId: number;
  message: string;
  replyMarkup?: Record<string, unknown>;
  /** Durable business-event key. One key must produce no more than one chat message. */
  dedupeKey?: string;
  /** Telegram has no idempotency key, therefore financial-event notices are at-most-once. */
  deliveryMode?: 'at_most_once';
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown';
  createdAt: number;
  sentAt?: number;
  error?: string;
  attempts?: number;
  nextAttemptAt?: number;
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
  gameType?: 'uno' | 'poker' | 'blackjack';
  joinedAt: number;
  costsCommitted?: boolean | 'held';
  isAi?: boolean;
}

interface ActiveMatch {
  matchId: string;
  mode: MatchMode;
  gameType?: 'uno' | 'poker' | 'blackjack';
  stake: number;
  players: QueuePlayer[];
  createdAt: number;
  connectionDeadlineAt?: number;
  playStartedAt?: number | null;
  costsCommitted?: boolean;
  settled: boolean;
  gameState: ServerGameState;
  blackjackGameState?: ServerBlackjackGameState;
  pokerGameState?: ServerPokerGameState;
  payoutResult?: any;
  turnTimeoutSec?: number;
}


interface PrivateRoom {
  roomCode: string;
  createRequestId?: string;
  stake: number;
  targetPlayers: number;
  hostUserId: string;
  gameType?: 'uno' | 'poker' | 'blackjack';
  players: QueuePlayer[];
  createdAt: number;
  status: 'waiting' | 'ready' | 'started';
  matchId?: string;
}

interface MatchmakingStatusPayload {
  status: 'idle' | 'searching' | 'ready' | 'expired';
  queueLength?: number;
  playersNeeded?: number;
  countdownSec?: number;
  matchId?: string;
  players?: QueuePlayer[];
  stake?: number;
  mode?: MatchMode;
  gameType?: 'uno' | 'poker' | 'blackjack';
  message?: string;
  failedAt?: number;
  // The first player-specific table snapshot travels with `ready`. Mobile
  // Telegram WebViews must not need a second request before rendering cards.
  gameState?: Record<string, unknown>;
  blackjackGameState?: Record<string, unknown>;
  pokerGameState?: Record<string, unknown>;
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
  referralPayouts?: ReferralPayoutRecord[];
  telegramNotifications?: TelegramNotification[];
  pastTournaments?: TournamentData[];
}

type SupabaseStateRow = {
  id: string;
  payload: unknown;
};

const users = new Map<string, UserState>();
const depositIntents = new Map<string, DepositIntent>();
const withdrawalRequests = new Map<string, WithdrawalRequest>();
let matchmakingQueue: QueuePlayer[] = [];
const activeMatches = new Map<string, ActiveMatch>();
const activeMatchByUser = new Map<string, string>();
const privateRooms = new Map<string, PrivateRoom>();
const questProgressByUser = new Map<string, UserQuestProgress[]>();
const telegramNotifications: TelegramNotification[] = [];

let currentTournament: TournamentData | null = null;
let pastTournaments: TournamentData[] = [];

const matchSubscribers = new Map<string, Set<Response>>();
const privateRoomSubscribers = new Map<string, Set<Response>>();
const privateRoomCleanupTimers = new Map<string, NodeJS.Timeout>();
const queueSubscribers = new Map<string, Set<Response>>();
const lastSsePayloadByResponse = new WeakMap<Response, Map<string, string>>();
const realtimeTraffic = {
  framesSent: 0,
  framesDeduplicated: 0,
  payloadBytesSent: 0,
  heartbeatsSent: 0,
};
const matchmakerCleanupTimers = new Map<string, NodeJS.Timeout>();
const referralStatsByInviter = new Map<string, ReferralStats>();
const referralPayouts = new Map<string, ReferralPayoutRecord>();
let telegramFlushPromise: Promise<void> | null = null;
const localDepositPaymentClaims = new Map<string, string>();
// Durable claims are loaded on startup. Keeping this small index in memory
// avoids retrying an intentional duplicate insert for every confirmed deposit
// during each background reconciliation pass.
const durableDepositPaymentClaims = new Map<string, string>();
let persistTimer: NodeJS.Timeout | null = null;
let persistRetryTimer: NodeJS.Timeout | null = null;
const supabaseAdmin: SupabaseClient | null = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

type RedisCommandResponse<T> = { result?: T; error?: string };

const redisCacheEnabled = Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
let redisCacheUnavailableUntil = 0;
let redisCacheHits = 0;
let redisCacheMisses = 0;
let redisCacheFailures = 0;
let redisCacheLastErrorLoggedAt = 0;
const localReferralCacheVersions = new Map<string, number>();
let referralResetStatus: 'not-run' | 'already-applied' | 'applied' = 'not-run';
let referralResetAffectedUsers = 0;

function cacheKeyPart(value: string) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

function redisReferralVersionKey(inviterUserId: string) {
  return `${REDIS_CACHE_NAMESPACE}:referrals:version:${cacheKeyPart(inviterUserId)}`;
}

function isRedisCacheAvailable() {
  return redisCacheEnabled && Date.now() >= redisCacheUnavailableUntil;
}

async function runRedisCommand<T>(command: Array<string | number>): Promise<T | undefined> {
  if (!isRedisCacheAvailable()) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 700);
  try {
    const response = await fetch(UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as RedisCommandResponse<T>;
    if (payload.error) throw new Error(payload.error);
    return payload.result;
  } catch (error) {
    redisCacheFailures += 1;
    // A cache outage must never delay or fail a Mini App request. Briefly
    // opening this circuit also avoids a burst of timed-out Redis requests.
    redisCacheUnavailableUntil = Date.now() + 5_000;
    if (Date.now() - redisCacheLastErrorLoggedAt > 60_000) {
      redisCacheLastErrorLoggedAt = Date.now();
      console.warn('Upstash referral cache unavailable; serving the source response.', error instanceof Error ? error.message : error);
    }
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function getCachedJson<T>(key: string): Promise<T | null> {
  const serialized = await runRedisCommand<string>(['GET', key]);
  if (!serialized) {
    if (isRedisCacheAvailable()) redisCacheMisses += 1;
    return null;
  }
  try {
    const value = JSON.parse(serialized) as T;
    redisCacheHits += 1;
    return value;
  } catch {
    // A malformed cache value is disposable and never reaches a user.
    void runRedisCommand(['DEL', key]);
    redisCacheMisses += 1;
    return null;
  }
}

async function setCachedJson(key: string, value: unknown, ttlSec: number) {
  await runRedisCommand(['SET', key, JSON.stringify(value), 'EX', ttlSec]);
}

async function getReferralCacheVersion(inviterUserId: string) {
  const localVersion = localReferralCacheVersions.get(inviterUserId) || 0;
  const redisVersion = (await runRedisCommand<string>(['GET', redisReferralVersionKey(inviterUserId)])) || '0';
  return `${localVersion}:${redisVersion}`;
}

function invalidateReferralCache(inviterUserId?: string) {
  if (!inviterUserId) return;
  // Advance the process-local version synchronously, so a request immediately
  // following a reward/status mutation cannot read a prior cached page while
  // the Redis INCR is still in flight.
  localReferralCacheVersions.set(inviterUserId, (localReferralCacheVersions.get(inviterUserId) || 0) + 1);
  if (!isRedisCacheAvailable()) return;
  // Versioned keys make invalidation O(1), without wildcard scans or deletion
  // races. Old 30-second keys naturally expire.
  void runRedisCommand(['INCR', redisReferralVersionKey(inviterUserId)]);
}

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
    referralPayouts: Array.from(referralPayouts.values()),
    telegramNotifications,
    pastTournaments,
  };
}

const dirtyUsers = new Set<string>();
const dirtyMatches = new Set<string>();
const dirtyPrivateRooms = new Set<string>();
const dirtyDeposits = new Set<string>();
const dirtyWithdrawals = new Set<string>();
const deletedMatches = new Set<string>();
const deletedPrivateRooms = new Set<string>();
const dirtyUserVersions = new Map<string, number>();
const dirtyMatchVersions = new Map<string, number>();
const dirtyPrivateRoomVersions = new Map<string, number>();
const dirtyDepositVersions = new Map<string, number>();
const dirtyWithdrawalVersions = new Map<string, number>();
const dirtyReferralPayouts = new Set<string>();
const dirtyReferralPayoutVersions = new Map<string, number>();
let persistInFlight: Promise<void> | null = null;

function markDirty(dirty: Set<string>, versions: Map<string, number>, id: string) {
  dirty.add(id);
  versions.set(id, (versions.get(id) || 0) + 1);
}

function acknowledgeDirty(dirty: Set<string>, versions: Map<string, number>, id: string, persistedVersion: number) {
  // A request can update the same record while Supabase is awaiting its write.
  // Only acknowledge the write if nothing newer was queued in the meantime.
  if (versions.get(id) === persistedVersion) {
    dirty.delete(id);
    versions.delete(id);
  }
}

async function upsertStateRow(id: string, payload: unknown) {
  const { error } = await supabaseAdmin!
    .from(SUPABASE_STATE_TABLE)
    .upsert({
      id,
      payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) throw new Error(`Supabase upsert failed for ${id}: ${error.message}`);
}

async function upsertStateRowsBulk(rows: Array<{ id: string; payload: unknown; updated_at: string }>) {
  if (rows.length === 0) return;
  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin!
      .from(SUPABASE_STATE_TABLE)
      .upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Supabase bulk upsert failed for batch of ${batch.length} rows: ${error.message}`);
  }
}

async function persistDirtyRows<T>(
  dirty: Set<string>,
  versions: Map<string, number>,
  rowPrefix: string,
  getValue: (id: string) => T | undefined,
) {
  const ids = Array.from(dirty);
  if (ids.length === 0) return;

  const rowsToUpsert: Array<{ id: string; payload: unknown; updated_at: string }> = [];
  const pendingAcks: Array<{ id: string; version: number }> = [];
  const nowIso = new Date().toISOString();

  for (const id of ids) {
    const version = versions.get(id) || 0;
    const value = getValue(id);
    if (value === undefined) {
      acknowledgeDirty(dirty, versions, id, version);
      continue;
    }
    rowsToUpsert.push({
      id: `${rowPrefix}${id}`,
      payload: value,
      updated_at: nowIso,
    });
    pendingAcks.push({ id, version });
  }

  if (rowsToUpsert.length > 0) {
    await upsertStateRowsBulk(rowsToUpsert);
    for (const ack of pendingAcks) {
      acknowledgeDirty(dirty, versions, ack.id, ack.version);
    }
  }
}

async function persistStateNow() {
  if (persistInFlight) return persistInFlight;
  persistInFlight = persistStateNowInternal().finally(() => {
    persistInFlight = null;
  });
  return persistInFlight;
}

async function persistStateNowInternal() {
  if (supabaseAdmin) {
    try {
      // 1. Persist dirty users
      await persistDirtyRows<PersistedUserState>(dirtyUsers, dirtyUserVersions, 'user:', (userId) => {
        const user = users.get(userId);
        return user
          ? { ...user, questProgress: questProgressByUser.get(userId) || [] }
          : undefined;
      });

      // 2. Persist dirty matches
      await persistDirtyRows(dirtyMatches, dirtyMatchVersions, 'match:', (matchId) => activeMatches.get(matchId));

      // 3. Persist dirty private rooms
      await persistDirtyRows(dirtyPrivateRooms, dirtyPrivateRoomVersions, 'room:', (roomCode) => privateRooms.get(roomCode));

      // 4. Persist dirty deposits
      await persistDirtyRows(dirtyDeposits, dirtyDepositVersions, 'deposit:', (depositId) => depositIntents.get(depositId));

      // 5. Persist dirty withdrawals
      await persistDirtyRows(dirtyWithdrawals, dirtyWithdrawalVersions, 'withdrawal:', (withdrawalId) => withdrawalRequests.get(withdrawalId));

      // 6. Persist the append-only referral payout audit trail separately
      // from the capped in-profile transaction display.
      await persistDirtyRows(dirtyReferralPayouts, dirtyReferralPayoutVersions, 'referral-payout:', (payoutId) => referralPayouts.get(payoutId));

      // 7. Delete removed matches in bulk
      const matchIdsToDelete = Array.from(deletedMatches);
      if (matchIdsToDelete.length > 0) {
        const { error } = await supabaseAdmin
          .from(SUPABASE_STATE_TABLE)
          .delete()
          .in('id', matchIdsToDelete.map(id => `match:${id}`));
        if (error) throw new Error(`Supabase delete failed for matches: ${error.message}`);
        matchIdsToDelete.forEach(id => deletedMatches.delete(id));
      }

      // 8. Delete removed private rooms in bulk
      const roomCodesToDelete = Array.from(deletedPrivateRooms);
      if (roomCodesToDelete.length > 0) {
        const { error } = await supabaseAdmin
          .from(SUPABASE_STATE_TABLE)
          .delete()
          .in('id', roomCodesToDelete.map(code => `room:${code}`));
        if (error) throw new Error(`Supabase delete failed for rooms: ${error.message}`);
        roomCodesToDelete.forEach(code => deletedPrivateRooms.delete(code));
      }

      // 9. Persist global state (queue, notifications)
      const globalState = {
        matchmakingQueue,
        telegramNotifications,
      };
      await upsertStateRow('global-state', globalState);
    } catch (err) {
      console.error('Supabase granular persist failed:', err);
      throw err;
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
  referralPayoutId?: string;
  deleteMatchId?: string;
  deleteRoomCode?: string;
}) {
  if (opts) {
    if (opts.userId) markDirty(dirtyUsers, dirtyUserVersions, opts.userId);
    if (opts.matchId) markDirty(dirtyMatches, dirtyMatchVersions, opts.matchId);
    if (opts.roomCode) markDirty(dirtyPrivateRooms, dirtyPrivateRoomVersions, opts.roomCode);
    if (opts.depositId) markDirty(dirtyDeposits, dirtyDepositVersions, opts.depositId);
    if (opts.withdrawalId) markDirty(dirtyWithdrawals, dirtyWithdrawalVersions, opts.withdrawalId);
    if (opts.referralPayoutId) markDirty(dirtyReferralPayouts, dirtyReferralPayoutVersions, opts.referralPayoutId);
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
      // Keep dirty rows in memory and retry. A transient Supabase outage must
      // not turn referral assignments or balances into acknowledged data loss.
      if (!persistRetryTimer) {
        persistRetryTimer = setTimeout(() => {
          persistRetryTimer = null;
          schedulePersist();
        }, 5_000);
      }
    });
  }, 100);
}

async function claimDepositPayment(claimKey: string, intentId: string) {
  const normalizedKey = claimKey.trim().toLowerCase();
  if (!normalizedKey || !intentId) throw new Error('Deposit payment claim requires a key and intent id.');

  if (supabaseAdmin) {
    const cachedOwner = durableDepositPaymentClaims.get(normalizedKey);
    if (cachedOwner) {
      return { claimed: false, ownerIntentId: cachedOwner };
    }
    const rowId = `payment-claim:${crypto.createHash('sha256').update(normalizedKey).digest('hex')}`;
    const { error } = await supabaseAdmin.from(SUPABASE_STATE_TABLE).insert({
      id: rowId,
      payload: { claimKey: normalizedKey, intentId, createdAt: Date.now() },
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      durableDepositPaymentClaims.set(normalizedKey, intentId);
      return { claimed: true, ownerIntentId: intentId };
    }
    if (error.code !== '23505') {
      throw new Error(`Could not atomically reserve TON payment: ${error.message}`);
    }
    const { data, error: lookupError } = await supabaseAdmin
      .from(SUPABASE_STATE_TABLE)
      .select('payload')
      .eq('id', rowId)
      .single();
    if (lookupError) throw new Error(`Could not read existing TON payment claim: ${lookupError.message}`);
    const payload = data?.payload as { intentId?: string } | undefined;
    const ownerIntentId = payload?.intentId || 'unknown';
    durableDepositPaymentClaims.set(normalizedKey, ownerIntentId);
    return { claimed: false, ownerIntentId };
  }

  const existing = localDepositPaymentClaims.get(normalizedKey);
  if (existing) return { claimed: false, ownerIntentId: existing };
  localDepositPaymentClaims.set(normalizedKey, intentId);
  return { claimed: true, ownerIntentId: intentId };
}

async function loadSupabaseRowsByPrefix(prefix: string): Promise<SupabaseStateRow[]> {
  if (!supabaseAdmin) return [];
  const rows: SupabaseStateRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from(SUPABASE_STATE_TABLE)
      .select('id,payload')
      .like('id', `${prefix}%`)
      .order('id', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }
    const page = (data || []) as SupabaseStateRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) {
      break;
    }
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

function createEmptyLevelStats(): ReferralLevelStats {
  return {
    total: 0,
    pending: 0,
    activated: 0,
    rejected: 0,
  };
}

function createEmptyReferralStats(): ReferralStats {
  return {
    level1: createEmptyLevelStats(),
    level2: createEmptyLevelStats(),
  };
}

function getReferralStats(inviterUserId: string): ReferralStats {
  return referralStatsByInviter.get(inviterUserId) || createEmptyReferralStats();
}

function normalizeReferralStatus(status: UserState['referralStatus']): ReferralStatus {
  return status || 'pending';
}

function adjustReferralStats(
  inviterUserId: string | undefined,
  fromStatus: UserState['referralStatus'] | null,
  toStatus: UserState['referralStatus'] | null,
  level: 1 | 2 = 1,
) {
  if (!inviterUserId || fromStatus === toStatus) return;
  const stats = referralStatsByInviter.get(inviterUserId) || createEmptyReferralStats();
  const levelStats = level === 1 ? stats.level1 : stats.level2;

  if (fromStatus) {
    levelStats.total = Math.max(0, levelStats.total - 1);
    levelStats[normalizeReferralStatus(fromStatus)] = Math.max(0, levelStats[normalizeReferralStatus(fromStatus)] - 1);
  }
  if (toStatus) {
    levelStats.total += 1;
    levelStats[normalizeReferralStatus(toStatus)] += 1;
  }

  if (stats.level1.total === 0 && stats.level2.total === 0) {
    referralStatsByInviter.delete(inviterUserId);
    return;
  }
  referralStatsByInviter.set(inviterUserId, stats);
}

function rebuildReferralStats() {
  referralStatsByInviter.clear();
  users.forEach((user) => {
    if (!user.referredByUserId) return;
    const inviterL1 = users.get(user.referredByUserId);
    if (!inviterL1) return;

    adjustReferralStats(inviterL1.userId, null, normalizeReferralStatus(user.referralStatus), 1);

    if (inviterL1.referredByUserId) {
      const inviterL2 = users.get(inviterL1.referredByUserId);
      if (inviterL2 && inviterL2.userId !== user.userId && inviterL2.userId !== inviterL1.userId) {
        adjustReferralStats(inviterL2.userId, null, normalizeReferralStatus(user.referralStatus), 2);
      }
    }
  });
}

function reconcileReferralStatuses(): number {
  let reconciledCount = 0;
  const sourceUserIdsWithPayouts = new Set<string>();
  for (const payout of referralPayouts.values()) {
    if (payout.sourceUserId && (payout.status === 'credited' || payout.status === 'pending')) {
      sourceUserIdsWithPayouts.add(payout.sourceUserId);
    }
  }

  for (const user of users.values()) {
    if (!user.referredByUserId) continue;
    if (user.referralStatus === 'activated') continue;

    const inviter = users.get(user.referredByUserId);
    if (!inviter || inviter.userId === user.userId) {
      if (user.referralStatus !== 'rejected') {
        adjustReferralStats(user.referredByUserId, user.referralStatus || 'pending', 'rejected', 1);
        user.referralStatus = 'rejected';
        schedulePersist({ userId: user.userId });
        invalidateReferralCache(user.referredByUserId);
      }
      continue;
    }

    const hasActivationMatchId = Boolean(user.referralActivationMatchId);
    const hasGeneratedPayout = sourceUserIdsWithPayouts.has(user.userId);
    const hasReferralLedgerEntry = user.transactions.some((tx) =>
      tx.type === 'referral_bonus' || (tx.event && tx.event.includes('Referral'))
    );
    const hasMatchPayout = user.transactions.some((tx) =>
      tx.type === 'match_payout' || (tx.event && tx.event.includes('Match Payout'))
    );

    if (hasActivationMatchId || hasGeneratedPayout || hasReferralLedgerEntry || hasMatchPayout) {
      const previousStatus = user.referralStatus || 'pending';
      user.referralStatus = 'activated';
      user.referralActivatedAt = user.referralActivatedAt || Date.now();
      user.referralActivationMatchId = user.referralActivationMatchId || 'reconciled-activation';
      inviter.referralsActivated = Math.max(inviter.referralsActivated, (inviter.referralsActivated || 0) + 1);

      adjustReferralStats(inviter.userId, previousStatus, 'activated', 1);
      if (inviter.referredByUserId) {
        const inviterL2 = users.get(inviter.referredByUserId);
        if (inviterL2 && inviterL2.userId !== user.userId && inviterL2.userId !== inviter.userId) {
          adjustReferralStats(inviterL2.userId, previousStatus, 'activated', 2);
          invalidateReferralCache(inviterL2.userId);
        }
      }

      schedulePersist({ userId: user.userId });
      schedulePersist({ userId: inviter.userId });
      invalidateReferralCache(inviter.userId);
      reconciledCount++;
    }
  }

  if (reconciledCount > 0) {
    rebuildReferralStats();
    console.log(`[Referral Reconciliation] Successfully reconciled ${reconciledCount} pending referral statuses to active.`);
  }
  return reconciledCount;
}

function applySnapshot(snapshot: PersistedState) {
  users.clear();
  depositIntents.clear();
  withdrawalRequests.clear();
  activeMatches.clear();
  activeMatchByUser.clear();
  privateRooms.clear();
  questProgressByUser.clear();
  referralPayouts.clear();
  durableDepositPaymentClaims.clear();
  telegramNotifications.splice(0, telegramNotifications.length);

  snapshot.users?.forEach((user) => {
    hydrateUser(user);
    users.set(user.userId, user);
  });
  snapshot.depositIntents?.forEach((intent) => depositIntents.set(intent.id, intent));
  snapshot.withdrawalRequests?.forEach((request) => withdrawalRequests.set(request.id, request));
  matchmakingQueue = snapshot.matchmakingQueue || [];
  snapshot.activeMatches?.forEach((match) => activeMatches.set(match.matchId, match));
  snapshot.activeMatchByUser?.forEach(([userId, matchId]) => activeMatchByUser.set(userId, matchId));
  snapshot.privateRooms?.forEach((room) => privateRooms.set(room.roomCode, room));
  snapshot.questProgressByUser?.forEach(([userId, progress]) => questProgressByUser.set(userId, progress));
  snapshot.referralPayouts?.forEach((payout) => referralPayouts.set(payout.id, payout));
  snapshot.telegramNotifications?.forEach((entry) => appendTelegramNotification(entry));
  pastTournaments = snapshot.pastTournaments || [];
  rebuildReferralStats();
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
      referralPayouts.clear();
      durableDepositPaymentClaims.clear();
      telegramNotifications.splice(0, telegramNotifications.length);

      // Read the legacy snapshot even after granular rows have appeared. The
      // first granular write used to make all users stored only in
      // `runtime-state` disappear on the next Render restart.
      let legacySnapshot: PersistedState | null = null;
      const { data: legacyData, error: legacyError } = await supabaseAdmin
        .from(SUPABASE_STATE_TABLE)
        .select('payload')
        .eq('id', SUPABASE_STATE_ROW_ID)
        .maybeSingle();
      if (legacyError) {
        console.error('Failed to load legacy runtime state from Supabase', legacyError);
      } else if (legacyData?.payload && Array.isArray((legacyData.payload as Partial<PersistedState>).users)) {
        legacySnapshot = legacyData.payload as PersistedState;
        applySnapshot(legacySnapshot);
      }

      // 1. Granular rows are newer than the legacy snapshot and take priority.
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
        payload.telegramNotifications?.forEach((entry: TelegramNotification) => appendTelegramNotification(entry));
      }

      // 2. Load users. Supabase paginates select results; read every page so
      // referral scans are not silently limited to the first 1000 user rows.
      const usersData = await loadSupabaseRowsByPrefix('user:');
      const granularUserIds = new Set<string>();
      usersData.forEach((row) => {
        const persistedUser = row.payload as PersistedUserState;
        const user = persistedUser as UserState;
        hydrateUser(user);
        users.set(user.userId, user);
        if (Array.isArray(persistedUser.questProgress)) {
          questProgressByUser.set(user.userId, persistedUser.questProgress);
        }
        granularUserIds.add(user.userId);
      });

      // 3. Load active matches (non-settled)
      const matchesData = await loadSupabaseRowsByPrefix('match:');
      matchesData.forEach((row) => {
        const match = row.payload as ActiveMatch;
        activeMatches.set(match.matchId, match);
        match.players.forEach((p) => {
          if (!match.settled) {
            activeMatchByUser.set(p.userId, match.matchId);
          }
        });
      });

      // 4. Load private rooms
      const roomsData = await loadSupabaseRowsByPrefix('room:');
      roomsData.forEach((row) => {
        const room = row.payload as PrivateRoom;
        privateRooms.set(room.roomCode, room);
      });

      // 5. Load pending deposit intents
      const depositsData = await loadSupabaseRowsByPrefix('deposit:');
      depositsData.forEach((row) => {
        const intent = row.payload as DepositIntent;
        depositIntents.set(intent.id, intent);
      });

      // 6. Load pending withdrawal requests
      const withdrawalsData = await loadSupabaseRowsByPrefix('withdrawal:');
      withdrawalsData.forEach((row) => {
        const request = row.payload as WithdrawalRequest;
        withdrawalRequests.set(request.id, request);
      });

      // 7. Load the permanent, exportable referral payout audit records.
      const referralPayoutData = await loadSupabaseRowsByPrefix('referral-payout:');
      referralPayoutData.forEach((row) => {
        const payout = row.payload as ReferralPayoutRecord;
        if (payout?.id && payout.status && payout.matchId) {
          referralPayouts.set(payout.id, payout);
        }
      });

      // 8. Load permanent TON payment claims before the background deposit
      // reconciliation starts. Without this index every successful claim was
      // retried as a duplicate INSERT every 15 seconds, generating avoidable
      // 409s and noisy Supabase error telemetry.
      const paymentClaimsData = await loadSupabaseRowsByPrefix('payment-claim:');
      paymentClaimsData.forEach((row) => {
        const claim = row.payload as { claimKey?: string; intentId?: string } | null;
        const claimKey = claim?.claimKey?.trim().toLowerCase();
        const ownerIntentId = claim?.intentId?.trim();
        if (claimKey && ownerIntentId) {
          durableDepositPaymentClaims.set(claimKey, ownerIntentId);
        }
      });

      rebuildReferralStats();
      reconcileReferralStatuses();
      users.forEach((user) => {
        if (reconcileStuckUserBalances(user)) {
          schedulePersist({ userId: user.userId });
        }
      });

      // Migrate each legacy-only user immediately into the granular format.
      // This is idempotent and preserves both referral links and ticket
      // balances before the next deployment or cold restart.
      if (legacySnapshot) {
        let migratedLegacyUser = false;
        legacySnapshot.users?.forEach((legacyUser) => {
          if (!granularUserIds.has(legacyUser.userId) && users.has(legacyUser.userId)) {
            markDirty(dirtyUsers, dirtyUserVersions, legacyUser.userId);
            migratedLegacyUser = true;
          }
        });
        if (migratedLegacyUser || !globalData?.payload) schedulePersist();
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

async function applyOneTimeReferralReset() {
  if (!supabaseAdmin || process.env.NODE_ENV !== 'production') return;

  const markerId = `maintenance:${REFERRAL_RESET_MIGRATION_ID}`;
  const { data, error } = await supabaseAdmin
    .from(SUPABASE_STATE_TABLE)
    .select('id,payload')
    .eq('id', markerId)
    .maybeSingle();
  if (error) throw new Error(`Could not check referral reset marker: ${error.message}`);
  if (data) {
    referralResetStatus = 'already-applied';
    referralResetAffectedUsers = Number((data.payload as { affectedUsers?: number } | null)?.affectedUsers) || 0;
    return;
  }

  const resetAt = Date.now();
  const affectedInviters = new Set<string>();
  for (const user of users.values()) {
    if (user.referredByUserId) affectedInviters.add(user.referredByUserId);
    // Preserve referral codes, wallets, tickets, XP, energy and the immutable
    // financial ledger. Only the relationship and referral-specific progress
    // are reset so every existing player can be invited again.
    user.referredByUserId = undefined;
    user.referralStatus = undefined;
    user.referralAssignedAt = undefined;
    user.referralActivatedAt = undefined;
    user.referralActivationMatchId = undefined;
    user.referralsActivated = 0;
    user.referralResetAt = resetAt;
    user.completedQuestIds = user.completedQuestIds.filter((id) => id !== 'weekly_invite_1');
    const progress = questProgressByUser.get(user.userId);
    if (progress) {
      questProgressByUser.set(user.userId, progress.filter((entry) => entry.questId !== 'weekly_invite_1'));
    }
    schedulePersist({ userId: user.userId });
  }

  rebuildReferralStats();
  affectedInviters.forEach(invalidateReferralCache);
  await persistStateNow();
  await upsertStateRow(markerId, {
    appliedAt: resetAt,
    affectedUsers: users.size,
    preserved: ['wallets', 'tickets', 'xp', 'energy', 'ledger', 'referralCodes'],
  });
  referralResetStatus = 'applied';
  referralResetAffectedUsers = users.size;
  console.log(`[Referral reset] Applied ${REFERRAL_RESET_MIGRATION_ID} to ${users.size} users.`);
}

function findUserByUsernameOrId(query?: string | null): UserState | undefined {
  if (!query) return undefined;
  const raw = String(query).trim();
  const direct = users.get(raw);
  if (direct) return direct;

  const normalized = raw.replace(/^@/, '').toLowerCase();
  for (const user of users.values()) {
    const tg = (user.telegramUsername || '').replace(/^@/, '').toLowerCase();
    if (tg && tg === normalized) return user;
    if (user.userId.toLowerCase() === raw.toLowerCase()) return user;
  }
  return undefined;
}

async function applyOneTimeBalanceRepair() {
  if (!supabaseAdmin) return;

  const markerId = `maintenance:${BALANCE_REPAIR_MIGRATION_ID}`;
  const { data, error } = await supabaseAdmin
    .from(SUPABASE_STATE_TABLE)
    .select('id,payload')
    .eq('id', markerId)
    .maybeSingle();

  if (error) {
    console.error(`Could not check balance repair marker: ${error.message}`);
    return;
  }
  if (data) {
    return;
  }

  // 1. Repair @ebitey: deposited 0.60 TKT, played 6 games (3 wins @ 0.3 = +1.73 TKT, 3 losses @ 0.3 = -0.90 TKT -> net 1.43 TKT)
  const ebiteyUser = findUserByUsernameOrId('ebitey');
  if (ebiteyUser) {
    const oldBal = ebiteyUser.availableTickets;
    ebiteyUser.availableTickets = 1.43;
    ebiteyUser.heldTickets = 0;
    createLedgerEntry(ebiteyUser, {
      id: `balance-repair-ebitey-${Date.now()}`,
      event: 'Balance Recalculation (3W/3L @ 0.3 + 0.6 Dep)',
      value: `1.43 TKT`,
      type: 'reward',
      amount: round2(1.43 - oldBal),
    });
    schedulePersist({ userId: ebiteyUser.userId });
    console.log(`[Balance Repair] Corrected @ebitey balance: was ${oldBal} TKT -> now 1.43 TKT.`);
  }

  // 2. Repair admin @allin_gram: restore admin test balance
  const adminUser = findUserByUsernameOrId('allin_gram');
  if (adminUser) {
    const oldBal = adminUser.availableTickets;
    adminUser.availableTickets = Math.max(100, oldBal);
    adminUser.heldTickets = 0;
    createLedgerEntry(adminUser, {
      id: `balance-repair-admin-${Date.now()}`,
      event: 'Admin Balance Restoration',
      value: `+100.00 TKT`,
      type: 'reward',
      amount: 100,
    });
    schedulePersist({ userId: adminUser.userId });
    console.log(`[Balance Repair] Restored @allin_gram balance: was ${oldBal} TKT -> now ${adminUser.availableTickets} TKT.`);
  }

  await persistStateNow();
  await upsertStateRow(markerId, {
    appliedAt: Date.now(),
    migration: BALANCE_REPAIR_MIGRATION_ID,
  });
  console.log(`[Balance Repair] Applied ${BALANCE_REPAIR_MIGRATION_ID}.`);
}

function getUser(userId: string, walletAddress?: string): UserState {
  const existing = users.get(userId);
  if (existing) {
    if (walletAddress && existing.walletAddress !== walletAddress) {
      existing.walletAddress = walletAddress;
      schedulePersist({ userId: existing.userId });
    }
    if (hydrateUser(existing)) {
      schedulePersist({ userId: existing.userId });
    }
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
    referralCode: createUniqueReferralCode(),
    referralsActivated: 0,
    completedQuestIds: [],
    transactions: [],
  };
  users.set(userId, created);
  schedulePersist({ userId });
  return created;
}

function createReferralCode() {
  // Referral codes carry economic value, so do not derive them from the
  // predictable PRNG used for visual/UI randomness.
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}

function createUniqueReferralCode(ownerUserId?: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = createReferralCode();
    const owner = findUserByReferralCode(code);
    if (!owner || owner.userId === ownerUserId) {
      return code;
    }
  }
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

function hydrateUser(user: UserState): boolean {
  let changed = false;
  const setIfChanged = <K extends keyof UserState>(key: K, value: UserState[K]) => {
    if (user[key] !== value) {
      user[key] = value;
      changed = true;
    }
  };

  setIfChanged('availableTickets', Number.isFinite(user.availableTickets) ? Math.max(0, round2(user.availableTickets)) : 0);
  setIfChanged('heldTickets', Number.isFinite(user.heldTickets) ? Math.max(0, round2(user.heldTickets)) : 0);
  setIfChanged('xp', Number.isFinite(user.xp) ? user.xp : 0);
  const hydratedEnergy = Math.max(0, Number.isFinite(user.energy) ? user.energy : DEFAULT_MAX_ENERGY);
  if (user.energy !== hydratedEnergy) {
    user.energy = hydratedEnergy;
    changed = true;
  }
  const hydratedMaxEnergy = Math.max(1, Number.isFinite(user.maxEnergy) ? user.maxEnergy : DEFAULT_MAX_ENERGY);
  if (user.maxEnergy !== hydratedMaxEnergy) {
    user.maxEnergy = hydratedMaxEnergy;
    changed = true;
  }
  const hydratedEnergyUpdatedAt = Number.isFinite(user.energyUpdatedAt) ? user.energyUpdatedAt : Date.now();
  if (user.energyUpdatedAt !== hydratedEnergyUpdatedAt) {
    user.energyUpdatedAt = hydratedEnergyUpdatedAt;
    changed = true;
  }
  const rawReferralCode = typeof user.referralCode === 'string' ? user.referralCode.trim().toUpperCase() : '';
  const referralCodeOwner = rawReferralCode ? findUserByReferralCode(rawReferralCode) : null;
  if (!rawReferralCode || (referralCodeOwner?.userId && referralCodeOwner.userId !== user.userId)) {
    user.referralCode = createUniqueReferralCode(user.userId);
    changed = true;
  } else if (user.referralCode !== rawReferralCode) {
    user.referralCode = rawReferralCode;
    changed = true;
  }
  if (!Array.isArray(user.completedQuestIds)) {
    user.completedQuestIds = [];
    changed = true;
  }
  if (!Array.isArray(user.transactions)) {
    user.transactions = [];
    changed = true;
  }
  if (!Number.isFinite(user.referralsActivated)) {
    user.referralsActivated = 0;
    changed = true;
  }
  if (user.referralResetAt !== undefined && user.referralResetAt !== null && !Number.isFinite(user.referralResetAt)) {
    user.referralResetAt = null;
    changed = true;
  }
  if (user.lastDailyEnergyAt === undefined) {
    user.lastDailyEnergyAt = null;
    changed = true;
  }
  if (user.lastDailyXpAt === undefined) {
    user.lastDailyXpAt = null;
    changed = true;
  }
  if (user.lastDailyCheckin !== undefined && user.lastDailyCheckin !== null) {
    const checkin = user.lastDailyCheckin;
    const validCheckin = typeof checkin.claimId === 'string'
      && Number.isFinite(checkin.claimedAt)
      && Number.isFinite(checkin.streak)
      && Number.isFinite(checkin.xpAwarded)
      && Number.isFinite(checkin.rewardTickets)
      && Number.isFinite(checkin.rewardEnergy);
    if (!validCheckin) {
      user.lastDailyCheckin = null;
      changed = true;
    }
  }
  if (user.lastLootboxClaim !== undefined && user.lastLootboxClaim !== null) {
    const claim = user.lastLootboxClaim;
    const validClaim = typeof claim.claimId === 'string'
      && Number.isFinite(claim.claimedAt)
      && ['xp', 'energy', 'jackpot'].includes(claim.rewardType)
      && Number.isFinite(claim.rewardTickets)
      && Number.isFinite(claim.rewardEnergy)
      && Number.isFinite(claim.rewardXp)
      && typeof claim.message === 'string';
    if (!validClaim) {
      user.lastLootboxClaim = null;
      changed = true;
    }
  }
  if (reconcileStuckUserBalances(user)) {
    changed = true;
  }
  return changed;
}

function reconcileStuckUserBalances(user: UserState): boolean {
  let changed = false;

  // 1. Clean up legacy artificial audit restore logs from transaction history
  const invalidTxs = user.transactions.filter(
    (tx) => tx.id && (tx.id.startsWith('auto-restore-audit-') || tx.id.startsWith('admin-boost-'))
  );
  if (invalidTxs.length > 0) {
    user.transactions = user.transactions.filter(
      (tx) => !tx.id || (!tx.id.startsWith('auto-restore-audit-') && !tx.id.startsWith('admin-boost-'))
    );
    changed = true;
  }

  // 2. Release orphaned heldTickets (if user is not currently in a live match, room, or queue)
  if (user.heldTickets > 0) {
    const isMatched = activeMatchByUser.has(user.userId);
    const isQueued = matchmakingQueue.some((p) => p.userId === user.userId);
    const isRoomed = Array.from(privateRooms.values()).some((r) => r.players.some((p) => p.userId === user.userId));

    if (!isMatched && !isQueued && !isRoomed) {
      const stuckAmount = round2(user.heldTickets);
      user.availableTickets = round2(user.availableTickets + stuckAmount);
      user.heldTickets = 0;
      createLedgerEntry(user, {
        id: `held-release-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        event: 'Orphaned Held Tickets Released',
        value: `+${stuckAmount.toFixed(2)} TKT`,
        type: 'stake_release',
        amount: stuckAmount,
      });
      changed = true;
      console.log(`[Balance Restoration] Released ${stuckAmount} held TKT for user ${user.userId}.`);
    }
  }

  // 3. Ensure non-negative bounds and correct 2-decimal rounding
  const cleanAvailable = Number.isFinite(user.availableTickets) ? Math.max(0, round2(user.availableTickets)) : 0;
  if (user.availableTickets !== cleanAvailable) {
    user.availableTickets = cleanAvailable;
    changed = true;
  }

  const cleanHeld = Number.isFinite(user.heldTickets) ? Math.max(0, round2(user.heldTickets)) : 0;
  if (user.heldTickets !== cleanHeld) {
    user.heldTickets = cleanHeld;
    changed = true;
  }

  return changed;
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

function getDailyQuestCompletion(userId: string, now = Date.now()) {
  const todayStart = getStartOfUtcDay(now);
  const dailyQuests = QUEST_DEFINITIONS.filter((quest) => quest.kind === 'daily');
  const progressList = getQuestProgress(userId);
  const completed = dailyQuests.filter((quest) => {
    const progress = progressList.find((entry) => entry.questId === quest.id);
    return !!progress
      && getStartOfUtcDay(progress.updatedAt) === todayStart
      && progress.progress >= quest.target;
  }).length;
  return {
    completed,
    total: dailyQuests.length,
    allCompleted: dailyQuests.length > 0 && completed === dailyQuests.length,
  };
}

function isLootboxAvailable(user: UserState): boolean {
  const now = Date.now();
  const todayStart = getStartOfUtcDay(now);
  if (user.lootboxClaimedAt && getStartOfUtcDay(user.lootboxClaimedAt) === todayStart) {
    return false;
  }
  return getDailyQuestCompletion(user.userId, now).allCompleted;
}

function buildReferralsView(user: UserState) {
  const stats = getReferralStats(user.userId);
  const totalActivated = stats.level1.activated + stats.level2.activated;
  const referralsActivated = Math.max(user.referralsActivated, totalActivated);
  const totalInvited = Math.max(stats.level1.total + stats.level2.total, referralsActivated);
  const pendingInvited = stats.level1.pending + stats.level2.pending;
  const rejectedInvited = stats.level1.rejected + stats.level2.rejected;

  return {
    referredByUserId: user.referredByUserId || null,
    status: user.referralStatus || null,
    activatedAt: user.referralActivatedAt || null,
    referralsActivated,
    totalInvited,
    pendingInvited,
    rejectedInvited,
    level1: stats.level1,
    level2: stats.level2,
    invitedUsers: [],
  };
}

function buildBootstrapProfileResponse(user: UserState) {
  const activeMatchId = activeMatchByUser.get(user.userId);
  let activeMatchInfo = null;
  if (activeMatchId) {
    const match = activeMatches.get(activeMatchId);
    const isGameOver = match && (
      match.settled ||
      (match.gameType === 'poker' ? match.pokerGameState?.stage === 'match_ended' :
       match.gameType === 'blackjack' ? match.blackjackGameState?.stage === 'match_ended' :
       match.gameState.phase === 'game_over')
    );
    const isStale = match && (Date.now() - (match.playStartedAt || match.createdAt || 0) > 10 * 60 * 1000);
    if (match && !isGameOver && !isStale) {
      markMatchPlayerConnected(match, user.userId);
      const associatedRoom = Array.from(privateRooms.values()).find(r => r.matchId === match.matchId);
      const perspective = buildPerspectiveState(match, user.userId);
      activeMatchInfo = {
        matchId: match.matchId,
        gameType: match.gameType || 'uno',
        mode: match.mode,
        stake: match.stake,
        status: match.settled ? 'finished' : (match.playStartedAt ? 'started' : 'waiting'),
        playStartedAt: match.playStartedAt || null,
        roomCode: associatedRoom ? associatedRoom.roomCode : null,
        gameState: (perspective as any)?.gameState,
        blackjackGameState: (perspective as any)?.blackjackGameState,
        pokerGameState: (perspective as any)?.pokerGameState,
        players: match.players.map(p => ({
          userId: p.userId,
          username: p.username,
          avatarId: p.avatarId,
          stake: p.stake
        })),
      };
    } else {
      activeMatchByUser.delete(user.userId);
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
    referralResetAt: user.referralResetAt || null,
    referrals: buildReferralsView(user),
    dailyStreak: user.dailyStreak || 0,
    lastDailyXpAt: user.lastDailyXpAt,
    lastDailyCheckin: user.lastDailyCheckin || null,
    lootboxClaimedAt: user.lootboxClaimedAt || null,
    lootboxAvailable: isLootboxAvailable(user),
    activeMatch: activeMatchInfo,
  };
}

function buildProfileResponse(user: UserState) {
  const claimedQuestIds = claimCompletedQuests(user);
  return {
    ...buildBootstrapProfileResponse(user),
    quests: buildQuestView(user.userId),
    claimedQuestIds,
  };
}

function buildReferralInviteView(user: UserState, level: 1 | 2 = 1) {
  const fullName = [user.telegramFirstName, user.telegramLastName].filter(Boolean).join(' ').trim();
  return {
    userId: user.userId,
    username: user.telegramUsername ? `@${user.telegramUsername}` : fullName || 'Telegram player',
    photoUrl: user.telegramPhotoUrl || null,
    status: normalizeReferralStatus(user.referralStatus),
    level,
    assignedAt: user.referralAssignedAt || null,
    activatedAt: user.referralActivatedAt || null,
  };
}

function parseReferralPagination(rawLimit: unknown, rawCursor: unknown) {
  const limitCandidate = Number(rawLimit);
  const limit = Number.isFinite(limitCandidate) ? Math.min(50, Math.max(1, Math.floor(limitCandidate))) : 20;
  let cursor: { assignedAt: number; userId: string } | null = null;
  if (typeof rawCursor === 'string' && rawCursor) {
    try {
      const decoded = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'));
      if (Number.isFinite(decoded?.assignedAt) && typeof decoded?.userId === 'string') {
        cursor = { assignedAt: decoded.assignedAt, userId: decoded.userId };
      }
    } catch {
      // An invalid cursor is treated as the first page, rather than exposing
      // an unbounded data scan or failing the Mini App profile screen.
    }
  }
  return { limit, cursor };
}

function listReferralInvites(inviterUserId: string, rawLimit: unknown, rawCursor: unknown) {
  const { limit, cursor } = parseReferralPagination(rawLimit, rawCursor);

  const entries: Array<{ user: UserState; level: 1 | 2 }> = [];
  users.forEach((candidate) => {
    if (!candidate.referredByUserId) return;
    if (candidate.referredByUserId === inviterUserId) {
      entries.push({ user: candidate, level: 1 });
    } else {
      const inviterL1 = users.get(candidate.referredByUserId);
      if (inviterL1?.referredByUserId === inviterUserId) {
        entries.push({ user: candidate, level: 2 });
      }
    }
  });

  const sorted = entries.sort((a, b) => {
    const byAssignedAt = (b.user.referralAssignedAt || 0) - (a.user.referralAssignedAt || 0);
    return byAssignedAt || a.user.userId.localeCompare(b.user.userId);
  });

  const afterCursor = cursor
    ? sorted.filter((entry) => (
      (entry.user.referralAssignedAt || 0) < cursor!.assignedAt
      || ((entry.user.referralAssignedAt || 0) === cursor!.assignedAt && entry.user.userId > cursor!.userId)
    ))
    : sorted;
  const page = afterCursor.slice(0, limit);
  const last = page[page.length - 1];
  return {
    invites: page.map((entry) => buildReferralInviteView(entry.user, entry.level)),
    nextCursor: afterCursor.length > page.length && last
      ? Buffer.from(JSON.stringify({ assignedAt: last.user.referralAssignedAt || 0, userId: last.user.userId })).toString('base64url')
      : null,
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

function rewardEnergy(user: UserState, amount: number, reason: string, ledgerId?: string) {
  if (ledgerId && user.transactions.some((entry) => entry.id === ledgerId)) return false;
  recalculateEnergy(user);
  user.energy = Math.min(user.maxEnergy, user.energy + amount);
  user.energyUpdatedAt = Date.now();
  createLedgerEntry(user, {
    ...(ledgerId ? { id: ledgerId } : {}),
    event: reason,
    value: `+⚡ ${amount}`,
    type: 'reward',
    amount,
  });
  return true;
}

function rewardXp(user: UserState, amount: number, reason: string, ledgerId?: string) {
  if (ledgerId && user.transactions.some((entry) => entry.id === ledgerId)) return false;
  user.xp += amount;
  createLedgerEntry(user, {
    ...(ledgerId ? { id: ledgerId } : {}),
    event: reason,
    value: `+${amount} XP`,
    type: 'reward',
    amount,
  });
  return true;
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
  const now = Date.now();
  for (const quest of QUEST_DEFINITIONS) {
    const progress = progressList.find((entry) => entry.questId === quest.id);
    const currentBoundary = quest.kind === 'daily' ? getStartOfUtcDay(now) : getStartOfUtcWeek(now);
    const progressBoundary = progress
      ? (quest.kind === 'daily' ? getStartOfUtcDay(progress.updatedAt) : getStartOfUtcWeek(progress.updatedAt))
      : null;
    if (
      !progress
      || progressBoundary !== currentBoundary
      || progress.claimed
      || progress.progress < quest.target
    ) {
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

type TelegramNotificationOptions = {
  dedupeKey: string;
};

function normalizeTelegramNotification(entry: TelegramNotification): TelegramNotification {
  const deliveryMode = 'at_most_once' as const;
  const status = entry.status === 'sending'
    ? 'unknown'
    : entry.status;
  return {
    ...entry,
    deliveryMode,
    status,
    attempts: Number.isFinite(entry.attempts) ? entry.attempts : 0,
    nextAttemptAt: entry.nextAttemptAt,
    ...(entry.status === 'sending'
      ? { error: entry.error || 'Delivery outcome was unknown after restart; not retried to prevent a duplicate Telegram message.' }
      : {}),
  };
}

function appendTelegramNotification(entry: TelegramNotification) {
  const normalized = normalizeTelegramNotification(entry);
  const existingIndex = telegramNotifications.findIndex((item) => (
    item.id === normalized.id
    || (!!normalized.dedupeKey && item.dedupeKey === normalized.dedupeKey)
  ));
  if (existingIndex === -1) {
    telegramNotifications.push(normalized);
    return;
  }

  // `runtime-state` and `global-state` may both contain the same outbox entry
  // during the granular-storage migration. A successful delivery always wins;
  // otherwise preserve the newer payload without creating a second send job.
  const existing = telegramNotifications[existingIndex];
  const merged: TelegramNotification = { ...existing, ...normalized };
  if (existing.status === 'sent' || normalized.status === 'sent') {
    merged.status = 'sent';
    merged.sentAt = Math.max(existing.sentAt || 0, normalized.sentAt || 0) || undefined;
    merged.error = undefined;
    merged.nextAttemptAt = undefined;
  } else if (existing.status === 'unknown' || normalized.status === 'unknown') {
    merged.status = 'unknown';
    merged.nextAttemptAt = undefined;
  }
  telegramNotifications[existingIndex] = merged;
}

function queueTelegramNotification(user: UserState, message: string, options: TelegramNotificationOptions) {
  if (!user.telegramChatId) {
    return;
  }
  queueTelegramMessage(user.userId, user.telegramChatId, message, undefined, options);
}

function queueTelegramMessage(
  userId: string,
  telegramChatId: number,
  message: string,
  replyMarkup: Record<string, unknown> | undefined,
  options: TelegramNotificationOptions,
) {
  if (telegramNotifications.some((item) => item.dedupeKey === options.dedupeKey)) {
    return;
  }
  telegramNotifications.push({
    id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    telegramChatId,
    message,
    replyMarkup,
    dedupeKey: options.dedupeKey,
    deliveryMode: 'at_most_once',
    status: 'pending',
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  schedulePersist();
}

async function performTelegramNotificationFlush() {
  if (!TELEGRAM_BOT_TOKEN) return;
  const now = Date.now();
  const pending = telegramNotifications.filter((item) => (
    (item.status === 'pending' || item.status === 'failed')
    && (item.nextAttemptAt || 0) <= now
  )).slice(0, 5);
  for (const item of pending) {
    item.status = 'sending';
    item.attempts = (item.attempts || 0) + 1;
    item.nextAttemptAt = undefined;
    try {
      // Commit the send intent first. Telegram's sendMessage response returns
      // a Message but accepts no idempotency key, so retrying an ambiguous
      // transport failure can show the same financial notice twice.
      const writeAlreadyInFlight = persistInFlight;
      await persistStateNow();
      // If another write was already under way, it may have captured the
      // global outbox before this item changed to `sending`. Flush once more
      // after it settles so the durable pre-send state is unambiguous.
      if (writeAlreadyInFlight) {
        await persistStateNow();
      }
    } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : 'Could not persist notification send intent';
      item.nextAttemptAt = Date.now() + 15_000;
      console.error(`Telegram notification ${item.id} was not sent because its intent could not be persisted:`, error);
      continue;
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: item.telegramChatId,
          text: item.message,
          disable_web_page_preview: true,
          ...(item.replyMarkup ? { reply_markup: item.replyMarkup } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const payload = await response.text();
        item.status = 'unknown';
        item.error = `Telegram returned HTTP ${response.status}: ${payload}`;
        item.nextAttemptAt = undefined;
        console.error(`Telegram notification ${item.id} failed (attempt ${item.attempts}): ${payload}`);
      } else {
        item.status = 'sent';
        item.sentAt = Date.now();
        item.error = undefined;
        item.nextAttemptAt = undefined;
      }
    } catch (error) {
      item.status = 'unknown';
      item.error = error instanceof Error ? error.message : 'Telegram delivery outcome unknown';
      item.nextAttemptAt = undefined;
      console.error(`Telegram notification ${item.id} transport error (attempt ${item.attempts}):`, error);
    }
  }
  schedulePersist();
}

function flushTelegramNotifications() {
  if (telegramFlushPromise) return telegramFlushPromise;
  telegramFlushPromise = performTelegramNotificationFlush().finally(() => {
    telegramFlushPromise = null;
  });
  return telegramFlushPromise;
}

function verifyTelegramInitData(initData: string, maxAgeSec: number = TELEGRAM_INITDATA_MAX_AGE_SEC): TelegramAuthPayload | null {
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
  if (!authDate || nowSec - authDate > maxAgeSec) {
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
  // Telegram initData is bound to the currently opened Mini App account. When
  // both credentials are present, prefer a fresh valid initData over a cached session token.
  // BUT if initData has expired while staying in the same app session, fall back to checking the session token!
  const telegramInitData = extractTelegramInitData(req);
  const auth = verifyTelegramInitData(telegramInitData);
  if (auth) {
    req.authUserId = `tg:${auth.id}`;
    const user = getUser(req.authUserId);
    applyTelegramAuth(user, auth);
    return next();
  }
  const sessionToken = extractSessionToken(req);
  const session = verifySessionToken(sessionToken);
  if (session) {
    req.authUserId = session.userId;
    return next();
  }
  const host = req.hostname || '';
  const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.') || host.endsWith('.local');
  if (isLocalOrLan) {
    const fallbackId = (req.headers['x-user-id'] as string) || (req.query.userId as string) || (req.body?.userId as string);
    if (fallbackId && typeof fallbackId === 'string' && fallbackId.trim()) {
      req.authUserId = fallbackId.trim();
      return next();
    }
  }
  if (telegramInitData) {
    return res.status(401).json({ error: 'Telegram authentication is invalid or expired.' });
  }
  return res.status(401).json({ error: 'Authentication required.' });
}

function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const telegramInitData = extractTelegramInitData(req);
  const auth = verifyTelegramInitData(telegramInitData);
  if (auth) {
    req.authUserId = `tg:${auth.id}`;
    const user = getUser(req.authUserId);
    applyTelegramAuth(user, auth);
    return next();
  }
  const sessionToken = extractSessionToken(req);
  const session = verifySessionToken(sessionToken);
  if (session) {
    req.authUserId = session.userId;
    return next();
  }
  const host = req.hostname || '';
  const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.') || host.endsWith('.local');
  if (isLocalOrLan) {
    const fallbackId = (req.headers['x-user-id'] as string) || (req.query.userId as string) || (req.body?.userId as string);
    if (fallbackId && typeof fallbackId === 'string' && fallbackId.trim()) {
      req.authUserId = fallbackId.trim();
      return next();
    }
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
    invalidateReferralCache(user.referredByUserId);
  }
}

function resolveCanonicalUserId(
  body: { userId?: string; telegramInitData?: string; walletAddress?: string; sessionToken?: string },
  req?: Request
) {
  let auth = body.telegramInitData ? verifyTelegramInitData(body.telegramInitData) : null;
  if (auth) {
    return {
      userId: `tg:${auth.id}`,
      auth,
      isSessionFallback: false,
    };
  }
  const sessionToken = body.sessionToken || (req ? extractSessionToken(req) : null);
  const session = verifySessionToken(sessionToken);
  if (session) {
    if (body.telegramInitData) {
      auth = verifyTelegramInitData(body.telegramInitData, 86400);
    }
    return {
      userId: session.userId,
      auth: auth && `tg:${auth.id}` === session.userId ? auth : null,
      isSessionFallback: true,
    };
  }
  if (body.telegramInitData) {
    auth = verifyTelegramInitData(body.telegramInitData, 86400);
    if (auth) {
      return {
        userId: `tg:${auth.id}`,
        auth,
        isSessionFallback: false,
      };
    }
  }
  const fallbackUserId = body.userId || (req ? (req.headers['x-user-id'] as string) : '') || '';
  return {
    userId: fallbackUserId,
    auth: null,
    isSessionFallback: false,
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
  const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.') || host.endsWith('.local');
  const allowDevFallback = !TELEGRAM_BOT_TOKEN || isLocalOrLan;
  if (!allowDevFallback) return '';
  const bodyUserId = input.userId || req.headers['x-user-id'];
  if (typeof bodyUserId === 'string' && bodyUserId.trim()) {
    return bodyUserId.trim();
  }
  return '';
}

function ensureDefaultAmbassador(): UserState | null {
  if (!DEFAULT_REFERRER_CODE) return null;
  let ambassador = findUserByReferralCode(DEFAULT_REFERRER_CODE);
  if (!ambassador) {
    const ambassadorUserId = `ambassador:${DEFAULT_REFERRER_CODE.toLowerCase()}`;
    ambassador = getUser(ambassadorUserId);
    ambassador.referralCode = DEFAULT_REFERRER_CODE;
    schedulePersist({ userId: ambassadorUserId });
  }
  return ambassador;
}

function parseReferralCodeFromParam(param?: string): string | null {
  if (!param || typeof param !== 'string') return null;
  let cleaned = param.trim();
  cleaned = cleaned.replace(/^(startapp|start_param|ref)=/i, '').trim();
  cleaned = cleaned.replace(/^ref_?/i, '').trim();
  if (!cleaned) return null;
  return cleaned.toUpperCase();
}

function assignReferralIfNeeded(user: UserState, startParam?: string) {
  const code = parseReferralCodeFromParam(startParam);
  if (!code) return;

  let inviter = findUserByReferralCode(code);
  if (!inviter && code === DEFAULT_REFERRER_CODE) {
    inviter = ensureDefaultAmbassador();
  }

  if (!inviter || inviter.userId === user.userId) {
    return;
  }

  if (user.referredByUserId) {
    if (user.referredByUserId === inviter.userId) return;
    const currentInviterIsAmbassador = user.referredByUserId.startsWith('ambassador:');
    if (currentInviterIsAmbassador && user.referralStatus === 'pending') {
      const ambassadorL1 = users.get(user.referredByUserId);
      adjustReferralStats(user.referredByUserId, 'pending', null, 1);
      if (ambassadorL1?.referredByUserId) {
        adjustReferralStats(ambassadorL1.referredByUserId, 'pending', null, 2);
      }
      invalidateReferralCache(user.referredByUserId);
    } else {
      return;
    }
  }

  user.referredByUserId = inviter.userId;
  user.referralStatus = 'pending';
  user.referralAssignedAt = Date.now();
  adjustReferralStats(inviter.userId, null, 'pending', 1);
  if (inviter.referredByUserId) {
    const inviterL2 = users.get(inviter.referredByUserId);
    if (inviterL2 && inviterL2.userId !== user.userId && inviterL2.userId !== inviter.userId) {
      adjustReferralStats(inviterL2.userId, null, 'pending', 2);
      invalidateReferralCache(inviterL2.userId);
    }
  }
  schedulePersist({ userId: user.userId });
  invalidateReferralCache(inviter.userId);
}

function maybeActivateReferral(user: UserState, matchId: string) {
  if (!user.referredByUserId) {
    return false;
  }
  const inviter = users.get(user.referredByUserId);
  if (!inviter || inviter.userId === user.userId) {
    adjustReferralStats(user.referredByUserId, user.referralStatus || 'pending', 'rejected');
    user.referralStatus = 'rejected';
    schedulePersist({ userId: user.userId });
    invalidateReferralCache(user.referredByUserId);
    return false;
  }
  // An activation belongs to the first qualifying match forever. The profile
  // ledger is intentionally capped to recent history, so it must never be the
  // source of truth for whether this XP/energy event has already happened.
  if (user.referralStatus === 'activated') {
    if (!user.referralActivationMatchId) {
      // Historical activations predate the durable match key. Mark them as
      // legacy-complete instead of guessing and issuing a new reward.
      user.referralActivationMatchId = 'legacy-activation';
      schedulePersist({ userId: user.userId });
    }
    if (user.referralActivationMatchId !== matchId) {
      return false;
    }
  }
  const firstActivation = user.referralStatus !== 'activated';
  if (firstActivation) {
    const previousStatus = user.referralStatus || 'pending';
    user.referralStatus = 'activated';
    user.referralActivatedAt = Date.now();
    user.referralActivationMatchId = matchId;
    inviter.referralsActivated += 1;
    adjustReferralStats(inviter.userId, previousStatus, 'activated', 1);
    if (inviter.referredByUserId) {
      const inviterL2 = users.get(inviter.referredByUserId);
      if (inviterL2 && inviterL2.userId !== user.userId && inviterL2.userId !== inviter.userId) {
        adjustReferralStats(inviterL2.userId, previousStatus, 'activated', 2);
        invalidateReferralCache(inviterL2.userId);
      }
    }
  }

  // Deterministic IDs let a restart safely finish a partially persisted
  // activation without ever issuing XP/energy twice.
  const activationKey = `referral-activation:${matchId}`;
  const sourceXpCredited = rewardXp(user, REFERRED_REWARD_XP, 'Referral Activated', `${activationKey}:source:${user.userId}:xp`);
  const sourceEnergyCredited = rewardEnergy(user, REFERRED_REWARD_ENERGY, 'Referral Activated', `${activationKey}:source:${user.userId}:energy`);
  const inviterXpCredited = rewardXp(inviter, REFERRER_REWARD_XP, 'Referral Reward', `${activationKey}:l1:${inviter.userId}:xp`);
  const inviterEnergyCredited = rewardEnergy(inviter, REFERRER_REWARD_ENERGY, 'Referral Reward', `${activationKey}:l1:${inviter.userId}:energy`);
  if (inviterXpCredited) {
    updateQuestProgress(inviter.userId, 'invite_referral', 1);
    claimCompletedQuests(inviter);
  }
  if (inviterXpCredited || inviterEnergyCredited) {
    queueTelegramNotification(
      inviter,
      `Referral activated: ${user.telegramUsername ? '@' + user.telegramUsername : user.userId}. Rewards: +${REFERRER_REWARD_ENERGY} energy, +${REFERRER_REWARD_XP} XP.`,
      { dedupeKey: `${activationKey}:inviter:${inviter.userId}:notice` },
    );
  }
  if (sourceXpCredited || sourceEnergyCredited) {
    queueTelegramNotification(
      user,
      `Referral confirmed. Rewards: +${REFERRED_REWARD_ENERGY} energy, +${REFERRED_REWARD_XP} XP.`,
      { dedupeKey: `${activationKey}:source:${user.userId}:notice` },
    );
  }
  schedulePersist({ userId: user.userId });
  schedulePersist({ userId: inviter.userId });
  invalidateReferralCache(inviter.userId);
  return firstActivation;
}

function creditReferralPayout(record: ReferralPayoutRecord, recipient: UserState, source: UserState) {
  // Once the durable audit record is credited it is authoritative. The profile
  // only keeps a recent transaction window, so an older ledger line may no
  // longer be present there and must never cause a second credit.
  if (record.status === 'credited') return;
  const ledgerId = `ledger:${record.id}`;
  const ledgerExists = recipient.transactions.some((entry) => entry.id === ledgerId);
  if (!ledgerExists) {
    recipient.availableTickets = round2(recipient.availableTickets + record.amount);
    createLedgerEntry(recipient, {
      id: ledgerId,
      event: `L${record.level} Referral Match Bonus`,
      value: `+${record.amount.toFixed(2)} TKT`,
      type: 'referral_bonus',
      amount: record.amount,
    });
    queueTelegramNotification(
      recipient,
      `L${record.level} referral bonus: ${source.telegramUsername ? '@' + source.telegramUsername : source.userId} won a match. You received +${record.amount.toFixed(2)} TKT.`,
      { dedupeKey: `${record.id}:notice` },
    );
  }
  record.status = 'credited';
  record.creditedAt = Date.now();
  referralPayouts.set(record.id, record);
  schedulePersist({ referralPayoutId: record.id });
}

function applyReferralMatchBonus(user: UserState, payoutAmount: number, matchId: string) {
  if (payoutAmount <= 0) {
    return {
      inviterBonus: 0,
      netPayout: payoutAmount,
    };
  }

  let totalBonus = 0;
  const createRecord = (level: ReferralPayoutLevel, recipient: UserState, rateBps: number) => {
    const id = `referral-payout:${matchId}:l${level}:${recipient.userId}`;
    const amount = round2(payoutAmount * rateBps / 10_000);
    const existing = referralPayouts.get(id);
    const record: ReferralPayoutRecord = existing || {
      id,
      matchId,
      level,
      sourceUserId: user.userId,
      recipientUserId: recipient.userId,
      grossPayout: payoutAmount,
      rateBps,
      amount,
      status: 'pending',
      createdAt: Date.now(),
      creditedAt: null,
    };
    if (!existing) {
      referralPayouts.set(id, record);
      schedulePersist({ referralPayoutId: id });
    }
    return record;
  };

  if (user.referredByUserId) {
    const inviterL1 = users.get(user.referredByUserId);
    if (inviterL1 && inviterL1.userId !== user.userId) {
      const l1 = createRecord(1, inviterL1, 200); // 2.00% Level 1
      if (l1.amount > 0) {
        totalBonus += l1.amount;
        creditReferralPayout(l1, inviterL1, user);
      }

      if (inviterL1.referredByUserId) {
        const inviterL2 = users.get(inviterL1.referredByUserId);
        if (inviterL2 && inviterL2.userId !== user.userId && inviterL2.userId !== inviterL1.userId) {
          const l2 = createRecord(2, inviterL2, 100); // 1.00% Level 2
          if (l2.amount > 0) {
            totalBonus += l2.amount;
            creditReferralPayout(l2, inviterL2, user);
          }
        }
      }
    }
  }

  const netPayout = round2(Math.max(0, payoutAmount - totalBonus));
  return {
    inviterBonus: round2(totalBonus),
    netPayout,
  };
}

type LedgerEntryInput = Omit<TicketLedgerEntry, 'id' | 'createdAt' | 'userId'> & Partial<Pick<TicketLedgerEntry, 'id' | 'createdAt'>>;

function createLedgerEntry(user: UserState, entry: LedgerEntryInput) {
  if (entry.id) {
    const existing = user.transactions.find((candidate) => candidate.id === entry.id);
    if (existing) return existing;
  }
  const ledgerEntry: TicketLedgerEntry = {
    id: entry.id || `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: entry.createdAt || Date.now(),
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

function createWithdrawalOperatorToken(action: 'complete' | 'reject', requestId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  withdrawalOperatorTokens.set(crypto.createHash('sha256').update(token).digest('hex'), {
    action,
    requestId,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
  return token;
}

const withdrawalOperatorTokens = new Map<string, { action: 'complete' | 'reject'; requestId: string; expiresAt: number }>();
function verifyWithdrawalOperatorToken(action: 'complete' | 'reject', requestId: string, token: unknown) {
  if (typeof token !== 'string' || !token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = withdrawalOperatorTokens.get(tokenHash);
  return !!record && record.action === action && record.requestId === requestId && record.expiresAt > Date.now();
}

function consumeWithdrawalOperatorToken(action: 'complete' | 'reject', requestId: string, token: unknown) {
  if (!verifyWithdrawalOperatorToken(action, requestId, token) || typeof token !== 'string') return false;
  withdrawalOperatorTokens.delete(crypto.createHash('sha256').update(token).digest('hex'));
  return true;
}

function buildWithdrawalOperatorActionUrl(action: 'complete' | 'reject', requestId: string) {
  const token = createWithdrawalOperatorToken(action, requestId);
  return `${BACKEND_PUBLIC_URL}/api/admin/withdrawals/${encodeURIComponent(requestId)}/${action}?token=${encodeURIComponent(token)}`;
}

type WithdrawalReviewUser = Pick<UserState,
  'userId'
  | 'telegramUsername'
  | 'telegramFirstName'
  | 'telegramLastName'
  | 'walletAddress'
  | 'heldTickets'
  | 'availableTickets'
>;

function formatUserForOperator(user: WithdrawalReviewUser) {
  const telegramName = user.telegramUsername ? `@${user.telegramUsername}` : 'no username';
  const fullName = [user.telegramFirstName, user.telegramLastName].filter(Boolean).join(' ') || 'no name';
  return `${telegramName} / ${fullName} / ${user.userId}`;
}

function getWithdrawalReviewFlags(user: WithdrawalReviewUser, request: WithdrawalRequest, pendingRequests: WithdrawalRequest[]) {
  const flags: string[] = [];
  const activeMatchId = activeMatchByUser.get(user.userId);
  const queued = matchmakingQueue.some((player) => player.userId === user.userId);
  const waitingPrivateRoom = Array.from(privateRooms.values()).find((room) => (
    room.status !== 'started' && room.players.some((player) => player.userId === user.userId)
  ));

  if (pendingRequests.length > 0) {
    flags.push(`Duplicate pending requests before this one: ${pendingRequests.length}`);
  }
  if (request.walletAddress !== user.walletAddress) {
    flags.push('Requested wallet differs from saved profile wallet');
  }
  if (user.heldTickets > 0) {
    flags.push(`User has ${user.heldTickets.toFixed(2)} held TKT`);
  }
  if (activeMatchId) {
    flags.push(`User is in active match ${activeMatchId}`);
  }
  if (queued) {
    flags.push('User is in public matchmaking queue');
  }
  if (waitingPrivateRoom) {
    flags.push(`User is in waiting private room ${waitingPrivateRoom.roomCode}`);
  }
  if (request.ticketAmount > 0 && request.ticketAmount > user.availableTickets + request.ticketAmount) {
    flags.push('Requested amount is larger than pre-request available balance');
  }

  return flags.length ? flags : ['No blocking signals detected by server checks'];
}

function notifyWithdrawalOperator(user: WithdrawalReviewUser, request: WithdrawalRequest) {
  const operatorChatId = resolveWithdrawalOperatorChatId();
  if (!operatorChatId || !Number.isFinite(operatorChatId)) {
    console.warn(`Withdrawal ${request.id} created, but WITHDRAWAL_OPERATOR_CHAT_ID is not configured.`);
    return;
  }

  const flags = (request.reviewFlags || []).filter((flag) => flag !== 'No blocking signals detected by server checks');
  const completeUrl = buildWithdrawalOperatorActionUrl('complete', request.id);
  const rejectUrl = buildWithdrawalOperatorActionUrl('reject', request.id);
  const shortAddress = (address: string) => address.length > 18
    ? `${address.slice(0, 8)}…${address.slice(-6)}`
    : address;
  const username = user.telegramUsername ? `@${user.telegramUsername.replace(/^@/, '')}` : user.userId;
  const message = [
    `💸 Withdrawal: ${request.ticketAmount.toFixed(2)} TKT → ${request.tonAmount.toFixed(2)} TON`,
    `User: ${username}`,
    `To: ${shortAddress(request.walletAddress)}`,
    `From: ${shortAddress(WITHDRAWAL_SENDER_WALLET)}`,
    `Ref: ${request.payoutComment || request.id}`,
    ...flags.map((flag) => `⚠️ ${flag}`),
  ].join('\n');

  queueTelegramMessage(`withdrawal:${request.id}`, operatorChatId, message, {
    inline_keyboard: [
      [
        {
          text: `Pay ${request.tonAmount.toFixed(2)} TON`,
          url: request.operatorTransferLink,
        },
      ],
      [
        {
          text: 'Check payment',
          url: completeUrl,
        },
        {
          text: 'Refund',
          url: rejectUrl,
        },
      ],
    ],
  }, { dedupeKey: `withdrawal:${request.id}:notice` });
  flushTelegramNotifications().catch((error) => {
    console.error('Withdrawal operator notification flush failed', error);
  });
}

function resolveWithdrawalOperatorChatId() {
  const normalizedUsername = WITHDRAWAL_OPERATOR_USERNAME.replace(/^@/, '').trim().toLowerCase();
  const operator = Array.from(users.values()).find((entry) => (
    entry.telegramUsername?.replace(/^@/, '').trim().toLowerCase() === normalizedUsername
    && !!entry.telegramChatId
  ));
  return operator?.telegramChatId || WITHDRAWAL_OPERATOR_CHAT_ID;
}

function recoverPendingWithdrawalNotifications() {
  const operatorChatId = resolveWithdrawalOperatorChatId();
  for (const request of withdrawalRequests.values()) {
    if (request.status !== 'pending') continue;
    const notificationKey = `withdrawal:${request.id}`;
    const hasCurrentDelivery = telegramNotifications.some((item) => (
      item.userId === notificationKey
      && item.telegramChatId === operatorChatId
      && (item.status === 'sent' || item.status === 'pending' || item.status === 'sending' || item.status === 'unknown' || item.status === 'failed')
    ));
    if (!hasCurrentDelivery) {
      const user = getUser(request.userId, request.walletAddress);
      notifyWithdrawalOperator(user, request);
    }
  }
}

function getWithdrawalNotificationStatus(requestId: string): 'queued' | 'sent' | 'failed' | 'missing' {
  const items = telegramNotifications.filter((item) => item.userId === `withdrawal:${requestId}`);
  if (items.some((item) => item.status === 'sent')) return 'sent';
  if (items.some((item) => item.status === 'pending' || item.status === 'sending' || item.status === 'unknown' || item.status === 'failed')) return 'queued';
  return 'missing';
}

const ticketingService = createTicketingService({
  claimDepositPayment,
  createLedgerEntry,
  depositIntents,
  getWithdrawalReviewFlags,
  getWithdrawalNotificationStatus,
  getUser,
  notifyWithdrawalRequest: notifyWithdrawalOperator,
  requireAdmin,
  round2,
  schedulePersist,
  withdrawalRequests,
}, {
  backgroundRecheckIntervalMs: 60_000,
  depositIntentTtlMs: 15 * 60 * 1000,
  enableChainVerification: ENABLE_CHAIN_VERIFICATION,
  marketingWallet: MARKETING_WALLET,
  minWithdrawTickets: MIN_WITHDRAW_TICKETS,
  ticketPriceTon: TICKET_PRICE_TON,
  tonApiBaseUrl: TON_API_BASE_URL,
  tonApiKey: TON_API_KEY,
  tonVerificationMode: TON_VERIFICATION_MODE,
  withdrawalSenderWallet: WITHDRAWAL_SENDER_WALLET,
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
    const j = crypto.randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isValidServerMove(card: ServerCard, activeColor: CardColor, activeValue: CardValue) {
  return card.color === 'wild' || card.color === activeColor || card.value === activeValue;
}

function createServerLog(message: string, type: 'info' | 'play' | 'draw' | 'action' | 'win' | 'bet' | 'fold' | 'deal' = 'info') {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    message,
    type,
  };
}

function isPlayerActive(p: ServerGamePlayer) {
  return p.isAi || p.isConnected !== false;
}

function getNextActivePlayerIndex(players: ServerGamePlayer[], currentIndex: number, direction: number, steps = 1): number {
  const numPlayers = players.length;
  if (numPlayers === 0) return 0;

  const hasActive = players.some(isPlayerActive);
  let curr = currentIndex;

  for (let s = 0; s < steps; s++) {
    let loopGuard = 0;
    do {
      curr = (curr + direction + numPlayers) % numPlayers;
      loopGuard++;
    } while (hasActive && !isPlayerActive(players[curr]) && loopGuard < numPlayers);
  }
  return curr;
}

function advanceServerTurn(state: ServerGameState, skipCount = 1): ServerGameState {
  const nextIndex = getNextActivePlayerIndex(state.players, state.currentPlayerIndex, state.direction, skipCount);
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
  const serverPlayers: ServerGamePlayer[] = players.map((player) => {
    const isBot = Boolean(player.isAi || player.userId.startsWith('bot_'));
    return {
      userId: player.userId,
      username: player.username,
      avatarId: player.avatarId,
      hand: [],
      isAi: isBot,
      isConnected: isBot,
      hasConnected: isBot,
      lastSeenAt: isBot ? Date.now() : null,
      disconnectedAt: null,
      unoDeclared: false,
      emotion: 'happy',
    };
  });

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

  const initialCurrentPlayerIndex = getNextActivePlayerIndex(serverPlayers, 0, 1, 0);

  return {
    deck,
    discardPile: [startingCard],
    players: serverPlayers,
    currentPlayerIndex: initialCurrentPlayerIndex,
    direction: 1,
    activeColor: startingCard.color,
    activeValue: startingCard.value,
    phase: 'playing',
    winnerUserId: null,
    logs: [createServerLog('Match started. Stake table is live.', 'info')],
    consecutiveDraws: 0,
  };
}

function generateServerBlackjackShoe(numDecks = 4): ServerBlackjackCard[] {
  const suits: Array<'spades' | 'hearts' | 'diamonds' | 'clubs'> = ['spades', 'hearts', 'diamonds', 'clubs'];
  const shoe: ServerBlackjackCard[] = [];
  let counter = 0;
  for (let d = 0; d < numDecks; d++) {
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        let value = rank;
        if (rank > 10 && rank < 14) value = 10;
        if (rank === 14) value = 11;
        shoe.push({
          id: `bj_${suit}_${rank}_${d}_${counter++}_${Math.random().toString(36).slice(2, 6)}`,
          suit,
          rank,
          value,
        });
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function evaluateServerBlackjackHand(cards: ServerBlackjackCard[]): {
  score: number;
  isSoft: boolean;
  isBusted: boolean;
  hasBlackjack: boolean;
} {
  let score = 0;
  let aces = 0;

  for (const card of cards) {
    score += card.value;
    if (card.rank === 14) {
      aces += 1;
    }
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  const isSoft = aces > 0 && score <= 21;
  const isBusted = score > 21;
  const hasBlackjack = cards.length === 2 && score === 21;

  return {
    score,
    isSoft,
    isBusted,
    hasBlackjack,
  };
}

function createInitialBlackjackMatchState(players: QueuePlayer[], stake: number): ServerBlackjackGameState {
  const shoe = generateServerBlackjackShoe(4);
  const initialBet = 10;

  const serverPlayers: ServerBlackjackPlayer[] = players.map((p) => {
    const isBot = Boolean(p.isAi || p.userId.startsWith('bot_') || p.userId.startsWith('waiting_for_player_'));
    const c1 = shoe.pop()!;
    const c2 = shoe.pop()!;
    const evalResult = evaluateServerBlackjackHand([c1, c2]);
    return {
      userId: p.userId,
      username: p.username,
      avatarId: p.avatarId,
      isAi: isBot,
      isConnected: !isBot,
      hasConnected: !isBot,
      lastSeenAt: !isBot ? Date.now() : null,
      disconnectedAt: null,
      cards: [c1, c2],
      bet: initialBet,
      chips: 100 - initialBet,
      score: evalResult.score,
      isSoft: evalResult.isSoft,
      isBusted: false,
      hasBlackjack: evalResult.hasBlackjack,
      status: evalResult.hasBlackjack ? ('blackjack' as const) : ('playing' as const),
      wins: 0,
      eliminated: false,
    };
  });

  const d1 = shoe.pop()!;
  const d2 = shoe.pop()!;
  const dEval = evaluateServerBlackjackHand([d1, d2]);
  const dealer: ServerBlackjackPlayer = {
    userId: 'dealer',
    username: 'Dealer (House)',
    avatarId: 'bear',
    isAi: true,
    isConnected: true,
    hasConnected: true,
    cards: [d1, d2],
    bet: 0,
    chips: 9999,
    score: dEval.score,
    isSoft: dEval.isSoft,
    isBusted: false,
    hasBlackjack: dEval.hasBlackjack,
    status: 'playing',
    wins: 0,
  };

  const totalPot = initialBet * serverPlayers.length;

  let initialPlayerIdx = 0;
  while (initialPlayerIdx < serverPlayers.length && serverPlayers[initialPlayerIdx].status !== 'playing') {
    initialPlayerIdx++;
  }

  const initialStage = initialPlayerIdx < serverPlayers.length ? 'player_turn' : 'dealer_turn';

  return {
    shoe,
    dealer,
    players: serverPlayers,
    currentPlayerIndex: initialPlayerIdx < serverPlayers.length ? initialPlayerIdx : 0,
    stage: initialStage,
    pot: totalPot,
    stake,
    currentHand: 1,
    maxHands: 5,
    targetWins: 2,
    winnerUserId: null,
    matchChampionUserId: null,
    logs: [createServerLog(`🃏 Hand 1/5 dealt for ${serverPlayers.length} players with 100 chips bankroll!`, 'info')],
    turnStartedAt: Date.now(),
    turnTimeoutSec: 15,
  };
}

function advanceBlackjackTurn(match: ActiveMatch) {
  const bj = match.blackjackGameState;
  if (!bj) return;

  let nextIdx = bj.currentPlayerIndex + 1;
  while (nextIdx < bj.players.length && (bj.players[nextIdx].status !== 'playing' || bj.players[nextIdx].eliminated)) {
    nextIdx++;
  }

  if (nextIdx < bj.players.length) {
    bj.currentPlayerIndex = nextIdx;
    bj.stage = 'player_turn';
    bj.turnStartedAt = Date.now();
  } else {
    // All players finished their turn -> Dealer turn!
    startServerDealerTurn(match);
  }
}

function startServerDealerTurn(match: ActiveMatch) {
  const bj = match.blackjackGameState;
  if (!bj) return;

  bj.stage = 'dealer_turn';
  bj.turnStartedAt = Date.now();
  const dEval = evaluateServerBlackjackHand(bj.dealer.cards);
  bj.dealer.score = dEval.score;
  bj.dealer.isSoft = dEval.isSoft;
  bj.dealer.isBusted = dEval.isBusted;
  bj.dealer.status = dEval.isBusted ? 'busted' : 'playing';

  schedulePersist({ matchId: match.matchId });
  broadcastMatch(match.matchId);

  // Step 1: Wait 1200ms after flipping the hole card before drawing additional cards
  setTimeout(() => {
    stepServerDealerDraw(match);
  }, 1200);
}

function stepServerDealerDraw(match: ActiveMatch) {
  const bj = match.blackjackGameState;
  if (!bj || bj.stage !== 'dealer_turn') return;

  const activePlayers = bj.players.filter((p) => !p.eliminated);
  const anyStandingPlayer = activePlayers.some((p) => !p.isBusted);
  let dEval = evaluateServerBlackjackHand(bj.dealer.cards);

  if (anyStandingPlayer && dEval.score < 17 && bj.shoe.length > 0) {
    const card = bj.shoe.pop()!;
    bj.dealer.cards.push(card);
    dEval = evaluateServerBlackjackHand(bj.dealer.cards);
    bj.dealer.score = dEval.score;
    bj.dealer.isSoft = dEval.isSoft;
    bj.dealer.isBusted = dEval.isBusted;
    bj.dealer.status = dEval.isBusted ? 'busted' : 'playing';

    bj.logs = [createServerLog(`🃏 Dealer draws a card (Score: ${dEval.score})`, 'draw'), ...bj.logs].slice(0, 50);
    schedulePersist({ matchId: match.matchId });
    broadcastMatch(match.matchId);

    // Schedule next draw after 1100ms
    setTimeout(() => {
      stepServerDealerDraw(match);
    }, 1100);
  } else {
    // Dealer finished drawing -> finalize round settlement!
    finalizeServerDealerSequence(match);
  }
}

function finalizeServerDealerSequence(match: ActiveMatch) {
  const bj = match.blackjackGameState;
  if (!bj) return;

  const activePlayers = bj.players.filter((p) => !p.eliminated);
  const dEval = evaluateServerBlackjackHand(bj.dealer.cards);
  bj.dealer.score = dEval.score;
  bj.dealer.isSoft = dEval.isSoft;
  bj.dealer.isBusted = dEval.isBusted;
  bj.dealer.status = dEval.isBusted ? 'busted' : 'stood';

  // Evaluate payouts & chips
  const roundWinners: ServerBlackjackPlayer[] = [];
  activePlayers.forEach((p) => {
    let wonRound = false;
    let profit = 0;
    if (p.isBusted) {
      wonRound = false;
      profit = -p.bet;
    } else if (dEval.isBusted) {
      wonRound = true;
      profit = p.hasBlackjack ? Math.round(p.bet * 1.5) : p.bet;
      p.chips += (p.bet + profit);
    } else if (p.hasBlackjack && !dEval.hasBlackjack) {
      wonRound = true;
      profit = Math.round(p.bet * 1.5);
      p.chips += (p.bet + profit);
    } else if (p.score > dEval.score) {
      wonRound = true;
      profit = p.bet;
      p.chips += (p.bet + profit);
    } else if (p.score === dEval.score) {
      // Tie (push) - bet returned
      wonRound = false;
      profit = 0;
      p.chips += p.bet;
    } else {
      wonRound = false;
      profit = -p.bet;
    }

    p.lastProfit = profit;
    if (wonRound) {
      p.wins += 1;
      roundWinners.push(p);
    }

    // Check elimination
    if (p.chips <= 0) {
      p.chips = 0;
      p.eliminated = true;
      bj.logs = [createServerLog(`💀 ${p.username} ran out of chips and is eliminated!`, 'action'), ...bj.logs].slice(0, 50);
    }
  });

  // Check if match ended (Hand 5 finished OR <= 1 survivor)
  const remainingPlayers = bj.players.filter((p) => !p.eliminated && p.chips > 0);
  const isMatchOver = remainingPlayers.length <= 1 || bj.currentHand >= bj.maxHands;

  if (isMatchOver) {
    // Find Champion by highest chip count
    const sorted = [...bj.players].sort((a, b) => (b.chips - a.chips) || (b.wins - a.wins));
    const champion = sorted[0] || bj.players[0];

    const winningDesc = `🏆 ${champion.username.toUpperCase()} WINS THE MATCH WITH ${champion.chips} CHIPS!`;
    bj.stage = 'match_ended';
    bj.winnerUserId = champion.userId;
    bj.matchChampionUserId = champion.userId;
    bj.roundWinnerUserId = champion.userId;
    bj.roundWinnerName = champion.username;
    bj.winningHandDesc = winningDesc;
    bj.logs = [createServerLog(winningDesc, 'win'), ...bj.logs].slice(0, 50);
    settleBlackjackMatch(match);
  } else {
    let handSummary = '';
    if (roundWinners.length > 0) {
      const names = roundWinners.map((w) => w.username).join(', ');
      handSummary = `⭐ ${names} won Hand ${bj.currentHand}! Dealer: ${dEval.isBusted ? 'BUST (' + dEval.score + ')' : dEval.score}. Hand ${bj.currentHand + 1}/${bj.maxHands} in 6s...`;
      bj.roundWinnerUserId = roundWinners[0].userId;
      bj.roundWinnerName = names;
    } else if (dEval.isBusted) {
      handSummary = `Dealer busted (${dEval.score})! Hand ${bj.currentHand + 1}/${bj.maxHands} in 6s...`;
    } else {
      handSummary = `Dealer won Hand ${bj.currentHand} (${dEval.score}). Hand ${bj.currentHand + 1}/${bj.maxHands} in 6s...`;
    }

    bj.stage = 'round_ended';
    bj.winningHandDesc = handSummary;
    bj.nextRoundStartsAt = Date.now() + 6000;
    bj.logs = [createServerLog(handSummary, 'info'), ...bj.logs].slice(0, 50);
  }

  schedulePersist({ matchId: match.matchId });
  broadcastMatch(match.matchId);
}

function startNextBlackjackRound(match: ActiveMatch) {
  const bj = match.blackjackGameState;
  if (!bj || bj.stage === 'match_ended') return;

  bj.currentHand += 1;

  if (bj.shoe.length < (bj.players.length + 1) * 5) {
    bj.shoe = generateServerBlackjackShoe(4);
  }

  const standardBet = 10;
  let totalPot = 0;

  bj.players.forEach((p) => {
    if (p.eliminated || p.chips <= 0) {
      p.eliminated = true;
      p.chips = 0;
      p.bet = 0;
      p.cards = [];
      p.score = 0;
      p.status = 'stood';
      return;
    }

    const betAmount = Math.min(standardBet, p.chips);
    p.chips -= betAmount;
    p.bet = betAmount;
    totalPot += betAmount;

    const c1 = bj.shoe.pop()!;
    const c2 = bj.shoe.pop()!;
    const pEval = evaluateServerBlackjackHand([c1, c2]);
    p.cards = [c1, c2];
    p.score = pEval.score;
    p.isSoft = pEval.isSoft;
    p.isBusted = false;
    p.hasBlackjack = pEval.hasBlackjack;
    p.status = pEval.hasBlackjack ? 'blackjack' : 'playing';
  });

  bj.pot = totalPot;

  const d1 = bj.shoe.pop()!;
  const d2 = bj.shoe.pop()!;
  const dEval = evaluateServerBlackjackHand([d1, d2]);
  bj.dealer.cards = [d1, d2];
  bj.dealer.score = dEval.score;
  bj.dealer.isSoft = dEval.isSoft;
  bj.dealer.isBusted = false;
  bj.dealer.hasBlackjack = dEval.hasBlackjack;
  bj.dealer.status = 'playing';

  let nextIdx = 0;
  while (nextIdx < bj.players.length && (bj.players[nextIdx].status !== 'playing' || bj.players[nextIdx].eliminated)) {
    nextIdx++;
  }

  bj.currentPlayerIndex = nextIdx < bj.players.length ? nextIdx : 0;
  bj.stage = nextIdx < bj.players.length ? 'player_turn' : 'dealer_turn';
  bj.nextRoundStartsAt = null;
  bj.roundWinnerUserId = null;
  bj.roundWinnerName = null;
  bj.turnStartedAt = Date.now();
  bj.logs = [createServerLog(`🃏 Hand ${bj.currentHand}/${bj.maxHands} dealt!`, 'info'), ...bj.logs].slice(0, 50);

  if (bj.stage === 'dealer_turn') {
    startServerDealerTurn(match);
  }
}

function applyBlackjackAction(match: ActiveMatch, userId: string, action: string, amount?: number) {
  if (!match.playStartedAt) {
    throw new Error('Waiting for all players to connect.');
  }
  const bj = match.blackjackGameState;
  if (!bj) {
    throw new Error('Blackjack game state not found.');
  }

  if (action === 'blackjack_place_bet' || action === 'place_bet' || action === 'bet') {
    const requestedBet = typeof amount === 'number' && Number.isFinite(amount)
      ? Math.max(5, Math.min(100, Math.floor(amount)))
      : 10;
    const p = bj.players.find((pl) => isSameUser(pl.userId, userId));
    if (p && !p.eliminated) {
      const oldBet = p.bet;
      const effectiveBet = Math.min(requestedBet, p.chips + oldBet);
      p.chips = (p.chips + oldBet) - effectiveBet;
      p.bet = effectiveBet;
      bj.pot = bj.players.reduce((sum, pl) => sum + pl.bet, 0);
      bj.logs = [createServerLog(`${p.username} set bet to ${p.bet} chips!`, 'action'), ...bj.logs].slice(0, 50);
      schedulePersist({ matchId: match.matchId });
      return;
    }
  }

  if (action === 'blackjack_next_hand' || action === 'next_hand') {
    if (bj.stage === 'round_ended') {
      startNextBlackjackRound(match);
      schedulePersist({ matchId: match.matchId });
      return;
    }
    throw new Error('Round is not ended yet.');
  }

  if (bj.stage !== 'player_turn') {
    throw new Error('Not player turn stage.');
  }

  const currentPlayer = bj.players[bj.currentPlayerIndex];
  if (!currentPlayer || !isSameUser(currentPlayer.userId, userId)) {
    throw new Error('It is not your turn.');
  }

  if (action === 'blackjack_hit' || action === 'hit') {
    if (bj.shoe.length === 0) {
      bj.shoe = generateServerBlackjackShoe(4);
    }
    const card = bj.shoe.pop()!;
    currentPlayer.cards.push(card);
    const pEval = evaluateServerBlackjackHand(currentPlayer.cards);
    currentPlayer.score = pEval.score;
    currentPlayer.isSoft = pEval.isSoft;
    currentPlayer.isBusted = pEval.isBusted;

    bj.logs = [createServerLog(`${currentPlayer.username} hit and drew a card (score: ${pEval.score})`, 'draw'), ...bj.logs].slice(0, 50);

    if (pEval.isBusted) {
      currentPlayer.status = 'busted';
      bj.logs = [createServerLog(`💥 ${currentPlayer.username} busted with ${pEval.score}!`, 'action'), ...bj.logs].slice(0, 50);
      advanceBlackjackTurn(match);
    } else if (pEval.score === 21) {
      currentPlayer.status = 'stood';
      advanceBlackjackTurn(match);
    } else {
      bj.turnStartedAt = Date.now();
    }
  } else if (action === 'blackjack_stand' || action === 'stand') {
    currentPlayer.status = 'stood';
    bj.logs = [createServerLog(`${currentPlayer.username} stood at score ${currentPlayer.score}`, 'play'), ...bj.logs].slice(0, 50);
    advanceBlackjackTurn(match);
  } else if (action === 'blackjack_double' || action === 'double') {
    if (currentPlayer.cards.length !== 2) {
      throw new Error('Double down is only allowed on the first 2 cards.');
    }
    const additionalBet = Math.min(currentPlayer.bet, currentPlayer.chips);
    currentPlayer.chips -= additionalBet;
    currentPlayer.bet += additionalBet;
    if (bj.shoe.length === 0) {
      bj.shoe = generateServerBlackjackShoe(4);
    }
    const card = bj.shoe.pop()!;
    currentPlayer.cards.push(card);
    const pEval = evaluateServerBlackjackHand(currentPlayer.cards);
    currentPlayer.score = pEval.score;
    currentPlayer.isSoft = pEval.isSoft;
    currentPlayer.isBusted = pEval.isBusted;
    currentPlayer.status = pEval.isBusted ? 'busted' : 'stood';

    bj.logs = [createServerLog(`${currentPlayer.username} doubled down to ${currentPlayer.bet} chips! (score: ${pEval.score})`, 'action'), ...bj.logs].slice(0, 50);
    advanceBlackjackTurn(match);
  } else {
    throw new Error(`Unsupported blackjack action: ${action}`);
  }

  schedulePersist({ matchId: match.matchId });
}

function settleBlackjackMatch(activeMatch: ActiveMatch) {
  if (activeMatch.settled) return;

  const bj = activeMatch.blackjackGameState;
  if (!bj) return;

  const champion = bj.players.find((p) => p.userId === bj.winnerUserId) || bj.players[0];
  const grossPot = activeMatch.stake * activeMatch.players.length;
  const seasonFund = round2(grossPot * 0.02);
  const burnFund = round2(grossPot * 0.02);
  const netPrizePool = round2(grossPot - seasonFund - burnFund);

  bj.winningPayout = netPrizePool;

  bj.players.forEach((player) => {
    if (player.userId.startsWith('bot_') || player.userId.startsWith('waiting_for_player_')) return;
    const user = getUser(player.userId);
    const isWinner = player.userId === champion?.userId;
    const grossPayout = isWinner ? netPrizePool : 0;
    const referralSettlement = activeMatch.mode === 'pvp' && grossPayout > 0
      ? applyReferralMatchBonus(user, grossPayout, activeMatch.matchId)
      : { inviterBonus: 0, netPayout: grossPayout };

    const matchPayoutLedgerId = `match-payout:${activeMatch.matchId}:${user.userId}`;
    const payoutAlreadyCredited = user.transactions.some((entry) => entry.id === matchPayoutLedgerId);

    if (!payoutAlreadyCredited) {
      user.heldTickets = round2(Math.max(0, user.heldTickets - activeMatch.stake));
      if (referralSettlement.netPayout > 0) {
        user.availableTickets = round2(user.availableTickets + referralSettlement.netPayout);
        createLedgerEntry(user, {
          id: matchPayoutLedgerId,
          event: `${activeMatch.mode === 'pvp' ? 'PVP Blackjack' : 'Private Blackjack'} Payout`,
          value: `+${referralSettlement.netPayout.toFixed(2)} TKT`,
          type: 'match_payout',
          amount: referralSettlement.netPayout,
        });
      }

      if (activeMatch.mode === 'pvp') {
        updateQuestProgress(user.userId, 'play_online', 1);
      } else {
        updateQuestProgress(user.userId, 'play_private', 1);
      }
      if (isWinner) {
        updateQuestProgress(user.userId, 'win_any', 1);
      }
    }
    maybeActivateReferral(user, activeMatch.matchId);
    claimCompletedQuests(user);
    schedulePersist({ userId: user.userId });
  });

  // Evaluate tournament match progression if part of an active tournament
  if (currentTournament && currentTournament.status === 'in_progress') {
    const tMatch = currentTournament.matches.find((m) => m.matchId === activeMatch.matchId);
    if (tMatch) {
      const winnerId = champion?.userId || bj.players[0]?.userId || null;
      tMatch.status = 'completed';
      tMatch.winnerId = winnerId;
      evaluateTournamentProgression();
    }
  }

  activeMatch.settled = true;
  activeMatch.players.forEach((player) => {
    activeMatchByUser.delete(player.userId);
  });

  activeMatch.payoutResult = {
    grossPot,
    seasonFund,
    burnFund,
    netPrizePool,
    winnerUserId: champion?.userId,
  };

  schedulePersist({ matchId: activeMatch.matchId });
  flushTelegramNotifications().catch(() => undefined);

  // Clean up private room if any
  const associatedRoom = Array.from(privateRooms.values()).find((r) => r.matchId === activeMatch.matchId);
  if (associatedRoom) {
    const roomCode = associatedRoom.roomCode;
    const subscribers = privateRoomSubscribers.get(roomCode);
    subscribers?.forEach((response) => {
      sendSse(response, 'private-room-completed', {
        roomCode,
        reason: 'The blackjack match has concluded.',
      });
      response.end();
    });
    privateRoomSubscribers.delete(roomCode);
    privateRooms.delete(roomCode);
    schedulePersist({ deleteRoomCode: roomCode });
  }

  scheduleMatchCleanup(activeMatch.matchId);
}

const POKER_RANK_NAMES: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

const POKER_SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

function generateServerPokerDeck(): ServerPokerCard[] {
  const suits: Array<'spades' | 'hearts' | 'diamonds' | 'clubs'> = ['spades', 'hearts', 'diamonds', 'clubs'];
  const deck: ServerPokerCard[] = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({
        id: `pk_${suit}_${rank}_${Math.random().toString(36).slice(2, 6)}`,
        suit,
        rank,
      });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function get5CardCombinations<T>(array: T[], k = 5): T[][] {
  if (k === 0) return [[]];
  if (array.length === 0) return [];
  const head = array[0];
  const tail = array.slice(1);
  const withHead = get5CardCombinations(tail, k - 1).map((comb) => [head, ...comb]);
  const withoutHead = get5CardCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

function evaluateServerPoker5CardHand(cards: ServerPokerCard[]): {
  rankType: string;
  score: number;
  description: string;
  bestFive: ServerPokerCard[];
} {
  if (cards.length !== 5) {
    throw new Error('evaluateServerPoker5CardHand requires exactly 5 cards');
  }

  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  let isStraight = false;
  let straightHighRank = 0;
  const ranks = sorted.map((c) => c.rank);

  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true;
    straightHighRank = ranks[0];
  } else if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true;
    straightHighRank = 5; // A-2-3-4-5 wheel straight
  }

  const rankCounts: Record<number, number> = {};
  for (const c of sorted) {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  }

  const countEntries = Object.entries(rankCounts)
    .map(([rankStr, count]) => ({ rank: Number(rankStr), count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.rank - a.rank;
    });

  if (isFlush && isStraight) {
    if (straightHighRank === 14) {
      return {
        rankType: 'royal_flush',
        score: 900_000_000,
        description: `Royal Flush of ${POKER_SUIT_SYMBOLS[sorted[0].suit]}`,
        bestFive: sorted,
      };
    }
    return {
      rankType: 'straight_flush',
      score: 800_000_000 + straightHighRank,
      description: `Straight Flush, ${POKER_RANK_NAMES[straightHighRank]}-High`,
      bestFive: sorted,
    };
  }

  if (countEntries[0].count === 4) {
    const quadRank = countEntries[0].rank;
    const kicker = countEntries[1].rank;
    const score = 700_000_000 + quadRank * 15 + kicker;
    return {
      rankType: 'four_of_a_kind',
      score,
      description: `Four of a Kind, ${POKER_RANK_NAMES[quadRank]}s`,
      bestFive: sorted,
    };
  }

  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    const tripRank = countEntries[0].rank;
    const pairRank = countEntries[1].rank;
    const score = 600_000_000 + tripRank * 15 + pairRank;
    return {
      rankType: 'full_house',
      score,
      description: `Full House, ${POKER_RANK_NAMES[tripRank]}s full of ${POKER_RANK_NAMES[pairRank]}s`,
      bestFive: sorted,
    };
  }

  if (isFlush) {
    let score = 500_000_000;
    for (let i = 0; i < 5; i++) {
      score += sorted[i].rank * Math.pow(15, 4 - i);
    }
    return {
      rankType: 'flush',
      score,
      description: `Flush, ${POKER_RANK_NAMES[sorted[0].rank]}-High`,
      bestFive: sorted,
    };
  }

  if (isStraight) {
    return {
      rankType: 'straight',
      score: 400_000_000 + straightHighRank,
      description: `Straight, ${POKER_RANK_NAMES[straightHighRank]}-High`,
      bestFive: sorted,
    };
  }

  if (countEntries[0].count === 3) {
    const tripRank = countEntries[0].rank;
    const k1 = countEntries[1].rank;
    const k2 = countEntries[2].rank;
    const score = 300_000_000 + tripRank * 225 + k1 * 15 + k2;
    return {
      rankType: 'three_of_a_kind',
      score,
      description: `Three of a Kind, ${POKER_RANK_NAMES[tripRank]}s`,
      bestFive: sorted,
    };
  }

  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const p1 = countEntries[0].rank;
    const p2 = countEntries[1].rank;
    const k = countEntries[2].rank;
    const score = 200_000_000 + p1 * 225 + p2 * 15 + k;
    return {
      rankType: 'two_pair',
      score,
      description: `Two Pair, ${POKER_RANK_NAMES[p1]}s and ${POKER_RANK_NAMES[p2]}s`,
      bestFive: sorted,
    };
  }

  if (countEntries[0].count === 2) {
    const p = countEntries[0].rank;
    const k1 = countEntries[1].rank;
    const k2 = countEntries[2].rank;
    const k3 = countEntries[3].rank;
    const score = 100_000_000 + p * 3375 + k1 * 225 + k2 * 15 + k3;
    return {
      rankType: 'one_pair',
      score,
      description: `Pair of ${POKER_RANK_NAMES[p]}s`,
      bestFive: sorted,
    };
  }

  let score = 0;
  for (let i = 0; i < 5; i++) {
    score += sorted[i].rank * Math.pow(15, 4 - i);
  }
  return {
    rankType: 'high_card',
    score,
    description: `High Card, ${POKER_RANK_NAMES[sorted[0].rank]}`,
    bestFive: sorted,
  };
}

function evaluateServerPoker7CardHand(cards: ServerPokerCard[]): {
  rankType: string;
  score: number;
  description: string;
  bestFive: ServerPokerCard[];
} {
  if (cards.length < 5) {
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    return {
      rankType: 'high_card',
      score: sorted[0]?.rank || 0,
      description: sorted[0] ? `High Card ${POKER_RANK_NAMES[sorted[0].rank]}` : 'High Card',
      bestFive: sorted,
    };
  }

  const combinations = get5CardCombinations(cards, 5);
  let bestHand: { rankType: string; score: number; description: string; bestFive: ServerPokerCard[] } | null = null;

  for (const comb of combinations) {
    const evaluated = evaluateServerPoker5CardHand(comb);
    if (!bestHand || evaluated.score > bestHand.score) {
      bestHand = evaluated;
    }
  }

  return bestHand!;
}

function createInitialPokerMatchState(players: QueuePlayer[], stake: number): ServerPokerGameState {
  const deck = generateServerPokerDeck();
  const STARTING_CHIPS = 100;
  const SMALL_BLIND = 1;
  const BIG_BLIND = 2;

  const serverPlayers: ServerPokerPlayer[] = players.map((p) => {
    const isAi = p.isAi || p.userId.startsWith('bot_') || p.userId.startsWith('waiting_for_player_');
    const c1 = deck.pop()!;
    const c2 = deck.pop()!;
    return {
      userId: p.userId,
      username: p.username,
      avatarId: p.avatarId,
      isAi,
      isConnected: true,
      hasConnected: !isAi && !p.userId.startsWith('waiting_for_player_'),
      lastSeenAt: Date.now(),
      disconnectedAt: null,
      chips: STARTING_CHIPS,
      currentBet: 0,
      totalMatchInvested: 0,
      holeCards: [c1, c2],
      folded: false,
      isAllIn: false,
      hasActedThisStage: false,
      eliminated: false,
    };
  });

  const dealerIdx = 0;
  const sbIdx = serverPlayers.length > 2 ? 1 : 0;
  const bbIdx = serverPlayers.length > 2 ? 2 : 1;
  const firstTurnIdx = serverPlayers.length > 2 ? (bbIdx + 1) % serverPlayers.length : 0;

  serverPlayers[sbIdx].chips -= SMALL_BLIND;
  serverPlayers[sbIdx].currentBet = SMALL_BLIND;
  serverPlayers[sbIdx].totalMatchInvested = SMALL_BLIND;
  serverPlayers[sbIdx].lastAction = `SB (${SMALL_BLIND})`;

  serverPlayers[bbIdx].chips -= BIG_BLIND;
  serverPlayers[bbIdx].currentBet = BIG_BLIND;
  serverPlayers[bbIdx].totalMatchInvested = BIG_BLIND;
  serverPlayers[bbIdx].lastAction = `BB (${BIG_BLIND})`;

  const pot = SMALL_BLIND + BIG_BLIND;

  return {
    deck,
    stage: 'preflop',
    pot,
    currentBet: BIG_BLIND,
    minRaise: BIG_BLIND * 2,
    communityCards: [],
    players: serverPlayers,
    dealerIndex: dealerIdx,
    smallBlindIndex: sbIdx,
    bigBlindIndex: bbIdx,
    currentPlayerIndex: firstTurnIdx,
    smallBlindAmount: SMALL_BLIND,
    bigBlindAmount: BIG_BLIND,
    winnerUserIds: [],
    winningCardIds: [],
    matchChampionUserId: null,
    nextRoundStartsAt: null,
    logs: [createServerLog(`Texas Hold'em match started. Blinds ${SMALL_BLIND}/${BIG_BLIND}`, 'info')],
    turnStartedAt: Date.now(),
    turnTimeoutSec: 15,
  };
}

function checkPokerMatchChampion(match: ActiveMatch) {
  const pk = match.pokerGameState;
  if (!pk) return;

  pk.players.forEach((p) => {
    if (p.chips <= 0) {
      p.eliminated = true;
    }
  });

  const survivors = pk.players.filter((p) => !p.eliminated && p.chips > 0);
  if (survivors.length <= 1) {
    const champion = survivors[0] || pk.players[0];
    pk.stage = 'match_ended';
    pk.matchChampionUserId = champion.userId;
    pk.winnerUserIds = [champion.userId];
    pk.winningHandDesc = `🏆 ${champion.username.toUpperCase()} WINS THE POKER MATCH!`;
    pk.logs = [createServerLog(pk.winningHandDesc, 'win'), ...pk.logs].slice(0, 50);
    settlePokerMatch(match);
  } else {
    pk.nextRoundStartsAt = Date.now() + 5000;
  }
}

function advancePokerStage(match: ActiveMatch) {
  const pk = match.pokerGameState;
  if (!pk || pk.stage === 'ended' || pk.stage === 'match_ended') return;

  const active = pk.players.filter((p) => !p.folded && !p.eliminated);
  if (active.length <= 1) {
    advancePokerTurn(match);
    return;
  }

  // Reset stage bets for next stage
  pk.players.forEach((p) => {
    p.currentBet = 0;
    p.hasActedThisStage = false;
    if (!p.folded && !p.isAllIn && !p.eliminated) {
      p.lastAction = undefined;
    }
  });
  pk.currentBet = 0;
  pk.minRaise = pk.bigBlindAmount;

  if (pk.stage === 'preflop') {
    pk.stage = 'flop';
    pk.communityCards = [pk.deck.pop()!, pk.deck.pop()!, pk.deck.pop()!];
    pk.logs = [createServerLog(`Flop dealt: ${pk.communityCards.map(c => c.rank + c.suit[0]).join(' ')}`, 'deal'), ...pk.logs].slice(0, 50);
  } else if (pk.stage === 'flop') {
    pk.stage = 'turn';
    const c = pk.deck.pop()!;
    pk.communityCards.push(c);
    pk.logs = [createServerLog(`Turn card dealt: ${c.rank + c.suit[0]}`, 'deal'), ...pk.logs].slice(0, 50);
  } else if (pk.stage === 'turn') {
    pk.stage = 'river';
    const c = pk.deck.pop()!;
    pk.communityCards.push(c);
    pk.logs = [createServerLog(`River card dealt: ${c.rank + c.suit[0]}`, 'deal'), ...pk.logs].slice(0, 50);
  } else if (pk.stage === 'river') {
    pk.stage = 'showdown';
  }

  const nonAllIn = active.filter((p) => !p.isAllIn);
  if (nonAllIn.length <= 1 && pk.stage !== 'showdown') {
    while (pk.communityCards.length < 5) {
      pk.communityCards.push(pk.deck.pop()!);
    }
    pk.stage = 'showdown';
  }

  if (pk.stage === 'showdown') {
    let bestScore = -1;
    let winners: ServerPokerPlayer[] = [];
    let bestDesc = '';
    let winningBestFive: ServerPokerCard[] = [];

    active.forEach((p) => {
      const evalRes = evaluateServerPoker7CardHand([...p.holeCards, ...pk.communityCards]);
      p.handScore = evalRes.score;
      p.handDesc = evalRes.description;
      if (evalRes.score > bestScore) {
        bestScore = evalRes.score;
        winners = [p];
        bestDesc = evalRes.description;
        winningBestFive = evalRes.bestFive;
      } else if (evalRes.score === bestScore) {
        winners.push(p);
      }
    });

    const splitPot = Math.floor(pk.pot / winners.length);
    winners.forEach((w) => {
      w.chips += splitPot;
    });

    pk.winnerUserIds = winners.map((w) => w.userId);
    pk.winningCardIds = winningBestFive.map((c) => c.id);
    const winNames = winners.map((w) => w.username).join(' & ');
    pk.winningHandDesc = `${winNames} won with ${bestDesc}! (${splitPot} chips each)`;
    pk.logs = [createServerLog(pk.winningHandDesc, 'win'), ...pk.logs].slice(0, 50);
    pk.stage = 'ended';

    checkPokerMatchChampion(match);
    return;
  }

  let nextIdx = (pk.dealerIndex + 1) % pk.players.length;
  let count = 0;
  while ((pk.players[nextIdx].folded || pk.players[nextIdx].isAllIn || pk.players[nextIdx].eliminated) && count < pk.players.length) {
    nextIdx = (nextIdx + 1) % pk.players.length;
    count++;
  }
  if (count >= pk.players.length) {
    advancePokerStage(match);
  } else {
    pk.currentPlayerIndex = nextIdx;
    pk.turnStartedAt = Date.now();
  }
}

function advancePokerTurn(match: ActiveMatch) {
  const pk = match.pokerGameState;
  if (!pk || pk.stage === 'ended' || pk.stage === 'match_ended') return;

  const active = pk.players.filter((p) => !p.folded && !p.eliminated);
  if (active.length <= 1) {
    const winner = active[0] || pk.players[0];
    winner.chips += pk.pot;
    pk.winnerUserIds = [winner.userId];
    pk.winningCardIds = winner.holeCards.map((c) => c.id);
    pk.winningHandDesc = `All opponents folded. ${winner.username} wins pot of ${pk.pot} chips!`;
    pk.logs = [createServerLog(pk.winningHandDesc, 'win'), ...pk.logs].slice(0, 50);
    pk.stage = 'ended';

    checkPokerMatchChampion(match);
    return;
  }

  const nonAllIn = active.filter((p) => !p.isAllIn);
  const allActedAndMatched = active.every(
    (p) => p.isAllIn || (p.hasActedThisStage && p.currentBet === pk.currentBet)
  );

  if (nonAllIn.length === 0 || allActedAndMatched || (nonAllIn.length === 1 && nonAllIn[0].hasActedThisStage && nonAllIn[0].currentBet >= pk.currentBet)) {
    advancePokerStage(match);
  } else {
    let nextIdx = (pk.currentPlayerIndex + 1) % pk.players.length;
    let count = 0;
    while ((pk.players[nextIdx].folded || pk.players[nextIdx].isAllIn || pk.players[nextIdx].eliminated) && count < pk.players.length) {
      nextIdx = (nextIdx + 1) % pk.players.length;
      count++;
    }
    if (count >= pk.players.length) {
      advancePokerStage(match);
    } else {
      pk.currentPlayerIndex = nextIdx;
      pk.turnStartedAt = Date.now();
    }
  }
}

function startNextPokerRound(match: ActiveMatch) {
  const pk = match.pokerGameState;
  if (!pk || pk.stage === 'match_ended') return;

  pk.players.forEach((p) => {
    if (p.chips <= 0) p.eliminated = true;
  });

  const survivors = pk.players.filter((p) => !p.eliminated && p.chips > 0);
  if (survivors.length <= 1) {
    checkPokerMatchChampion(match);
    return;
  }

  const deck = generateServerPokerDeck();
  pk.deck = deck;

  let nextDealerIdx = (pk.dealerIndex + 1) % pk.players.length;
  while (pk.players[nextDealerIdx].eliminated || pk.players[nextDealerIdx].chips <= 0) {
    nextDealerIdx = (nextDealerIdx + 1) % pk.players.length;
  }
  pk.dealerIndex = nextDealerIdx;

  let sbIdx = survivors.length > 2 ? (nextDealerIdx + 1) % pk.players.length : nextDealerIdx;
  while (pk.players[sbIdx].eliminated || pk.players[sbIdx].chips <= 0) {
    sbIdx = (sbIdx + 1) % pk.players.length;
  }
  pk.smallBlindIndex = sbIdx;

  let bbIdx = (sbIdx + 1) % pk.players.length;
  while (pk.players[bbIdx].eliminated || pk.players[bbIdx].chips <= 0) {
    bbIdx = (bbIdx + 1) % pk.players.length;
  }
  pk.bigBlindIndex = bbIdx;

  let firstTurnIdx = survivors.length > 2 ? (bbIdx + 1) % pk.players.length : sbIdx;
  while (pk.players[firstTurnIdx].eliminated || pk.players[firstTurnIdx].chips <= 0) {
    firstTurnIdx = (firstTurnIdx + 1) % pk.players.length;
  }
  pk.currentPlayerIndex = firstTurnIdx;

  pk.players.forEach((p) => {
    p.currentBet = 0;
    p.totalMatchInvested = 0;
    p.folded = p.eliminated || p.chips <= 0;
    p.isAllIn = false;
    p.hasActedThisStage = false;
    p.lastAction = undefined;
    p.holeCards = p.folded ? [] : [deck.pop()!, deck.pop()!];
  });

  const sbPost = Math.min(pk.players[sbIdx].chips, pk.smallBlindAmount);
  pk.players[sbIdx].chips -= sbPost;
  pk.players[sbIdx].currentBet = sbPost;
  pk.players[sbIdx].totalMatchInvested = sbPost;
  pk.players[sbIdx].lastAction = `SB (${sbPost})`;
  if (pk.players[sbIdx].chips === 0) pk.players[sbIdx].isAllIn = true;

  const bbPost = Math.min(pk.players[bbIdx].chips, pk.bigBlindAmount);
  pk.players[bbIdx].chips -= bbPost;
  pk.players[bbIdx].currentBet = bbPost;
  pk.players[bbIdx].totalMatchInvested = bbPost;
  pk.players[bbIdx].lastAction = `BB (${bbPost})`;
  if (pk.players[bbIdx].chips === 0) pk.players[bbIdx].isAllIn = true;

  pk.pot = sbPost + bbPost;
  pk.currentBet = Math.max(sbPost, bbPost);
  pk.minRaise = pk.currentBet * 2;
  pk.communityCards = [];
  pk.winnerUserIds = [];
  pk.winningCardIds = [];
  pk.winningHandDesc = undefined;
  pk.nextRoundStartsAt = null;
  pk.stage = 'preflop';
  pk.turnStartedAt = Date.now();
  pk.logs = [createServerLog(`Next hand started. Blinds ${pk.smallBlindAmount}/${pk.bigBlindAmount}`, 'info'), ...pk.logs].slice(0, 50);
}

function applyPokerAction(match: ActiveMatch, userId: string, rawAction: string, betAmount?: number) {
  const pk = match.pokerGameState;
  if (!pk) throw new Error('Poker game state not found.');

  const action = rawAction.replace(/^poker_/, '');
  if (action === 'next_hand' || action === 'poker_next_hand') {
    if (pk.stage === 'ended') {
      startNextPokerRound(match);
      return;
    }
  }

  if (pk.stage === 'ended' || pk.stage === 'match_ended') {
    throw new Error('Hand is already ended.');
  }

  const currPlayer = pk.players[pk.currentPlayerIndex];
  if (!currPlayer || !isSameUser(currPlayer.userId, userId)) {
    throw new Error('Not your turn.');
  }

  const needed = pk.currentBet - currPlayer.currentBet;

  if (action === 'fold') {
    currPlayer.folded = true;
    currPlayer.hasActedThisStage = true;
    currPlayer.lastAction = 'FOLD';
    pk.logs = [createServerLog(`${currPlayer.username} folded`, 'fold'), ...pk.logs].slice(0, 50);
    advancePokerTurn(match);
  } else if (action === 'check') {
    if (needed > 0) {
      throw new Error(`Cannot check; ${needed} chips needed to call.`);
    }
    currPlayer.hasActedThisStage = true;
    currPlayer.lastAction = 'CHECK';
    pk.logs = [createServerLog(`${currPlayer.username} checked`, 'bet'), ...pk.logs].slice(0, 50);
    advancePokerTurn(match);
  } else if (action === 'call') {
    if (needed <= 0) {
      currPlayer.hasActedThisStage = true;
      currPlayer.lastAction = 'CHECK';
      pk.logs = [createServerLog(`${currPlayer.username} checked`, 'bet'), ...pk.logs].slice(0, 50);
      advancePokerTurn(match);
      return;
    }
    const callAmount = Math.min(currPlayer.chips, needed);
    currPlayer.chips -= callAmount;
    currPlayer.currentBet += callAmount;
    currPlayer.totalMatchInvested += callAmount;
    if (currPlayer.chips === 0) {
      currPlayer.isAllIn = true;
      currPlayer.lastAction = 'ALL-IN';
    } else {
      currPlayer.lastAction = `CALL ${callAmount}`;
    }
    currPlayer.hasActedThisStage = true;
    pk.pot += callAmount;
    pk.logs = [createServerLog(`${currPlayer.username} ${currPlayer.lastAction}`, 'bet'), ...pk.logs].slice(0, 50);
    advancePokerTurn(match);
  } else if (action === 'raise') {
    const targetTotalBet = Number(betAmount);
    if (!Number.isFinite(targetTotalBet) || targetTotalBet <= pk.currentBet) {
      throw new Error(`Raise amount must exceed current bet (${pk.currentBet}).`);
    }
    const additionalNeeded = targetTotalBet - currPlayer.currentBet;
    const actualBet = Math.min(currPlayer.chips, additionalNeeded);
    const newCurrentBet = currPlayer.currentBet + actualBet;

    currPlayer.chips -= actualBet;
    currPlayer.currentBet = newCurrentBet;
    currPlayer.totalMatchInvested += actualBet;
    if (currPlayer.chips === 0) {
      currPlayer.isAllIn = true;
      currPlayer.lastAction = 'ALL-IN';
    } else {
      currPlayer.lastAction = `RAISE ${newCurrentBet}`;
    }
    currPlayer.hasActedThisStage = true;
    pk.pot += actualBet;
    pk.currentBet = newCurrentBet;
    pk.minRaise = newCurrentBet + pk.bigBlindAmount;

    pk.players.forEach((p, idx) => {
      if (idx !== pk.currentPlayerIndex && !p.folded && !p.isAllIn && !p.eliminated) {
        p.hasActedThisStage = false;
      }
    });

    pk.logs = [createServerLog(`${currPlayer.username} ${currPlayer.lastAction}`, 'bet'), ...pk.logs].slice(0, 50);
    advancePokerTurn(match);
  } else if (action === 'all_in') {
    const allInAmount = currPlayer.chips;
    const newCurrentBet = currPlayer.currentBet + allInAmount;
    currPlayer.chips = 0;
    currPlayer.currentBet = newCurrentBet;
    currPlayer.totalMatchInvested += allInAmount;
    currPlayer.isAllIn = true;
    currPlayer.hasActedThisStage = true;
    currPlayer.lastAction = 'ALL-IN';
    pk.pot += allInAmount;

    if (newCurrentBet > pk.currentBet) {
      pk.currentBet = newCurrentBet;
      pk.minRaise = newCurrentBet + pk.bigBlindAmount;
      pk.players.forEach((p, idx) => {
        if (idx !== pk.currentPlayerIndex && !p.folded && !p.isAllIn && !p.eliminated) {
          p.hasActedThisStage = false;
        }
      });
    }

    pk.logs = [createServerLog(`${currPlayer.username} went ALL-IN (${allInAmount})`, 'bet'), ...pk.logs].slice(0, 50);
    advancePokerTurn(match);
  } else {
    throw new Error(`Unsupported poker action: ${action}`);
  }
}

function settlePokerMatch(activeMatch: ActiveMatch) {
  if (activeMatch.settled) return;

  const pk = activeMatch.pokerGameState;
  if (!pk) return;

  const champion = pk.players.find((p) => p.userId === pk.matchChampionUserId) || pk.players[0];
  const grossPot = activeMatch.stake * activeMatch.players.length;
  const seasonFund = round2(grossPot * 0.02);
  const burnFund = round2(grossPot * 0.02);
  const netPrizePool = round2(grossPot - seasonFund - burnFund);

  pk.winningPayout = netPrizePool;

  pk.players.forEach((player) => {
    if (player.userId.startsWith('bot_') || player.userId.startsWith('waiting_for_player_')) return;
    const user = getUser(player.userId);
    const isWinner = player.userId === champion?.userId;
    const grossPayout = isWinner ? netPrizePool : 0;
    const referralSettlement = activeMatch.mode === 'pvp' && grossPayout > 0
      ? applyReferralMatchBonus(user, grossPayout, activeMatch.matchId)
      : { inviterBonus: 0, netPayout: grossPayout };

    const matchPayoutLedgerId = `match-payout:${activeMatch.matchId}:${user.userId}`;
    const payoutAlreadyCredited = user.transactions.some((entry) => entry.id === matchPayoutLedgerId);

    if (!payoutAlreadyCredited) {
      user.heldTickets = round2(Math.max(0, user.heldTickets - activeMatch.stake));
      if (referralSettlement.netPayout > 0) {
        user.availableTickets = round2(user.availableTickets + referralSettlement.netPayout);
        createLedgerEntry(user, {
          id: matchPayoutLedgerId,
          event: `${activeMatch.mode === 'pvp' ? 'PVP Poker' : 'Private Poker'} Payout`,
          value: `+${referralSettlement.netPayout.toFixed(2)} TKT`,
          type: 'match_payout',
          amount: referralSettlement.netPayout,
        });
      }

      if (activeMatch.mode === 'pvp') {
        updateQuestProgress(user.userId, 'play_online', 1);
      } else {
        updateQuestProgress(user.userId, 'play_private', 1);
      }
      if (isWinner) {
        updateQuestProgress(user.userId, 'win_any', 1);
      }
    }
    maybeActivateReferral(user, activeMatch.matchId);
    claimCompletedQuests(user);
    schedulePersist({ userId: user.userId });
  });

  // Evaluate tournament match progression if part of an active tournament
  if (currentTournament && currentTournament.status === 'in_progress') {
    const tMatch = currentTournament.matches.find((m) => m.matchId === activeMatch.matchId);
    if (tMatch) {
      const winnerId = champion?.userId || pk.players[0]?.userId || null;
      tMatch.status = 'completed';
      tMatch.winnerId = winnerId;
      evaluateTournamentProgression();
    }
  }

  activeMatch.settled = true;
  activeMatch.players.forEach((player) => {
    activeMatchByUser.delete(player.userId);
  });

  activeMatch.payoutResult = {
    grossPot,
    seasonFund,
    burnFund,
    netPrizePool,
    winnerUserId: champion?.userId,
  };

  schedulePersist({ matchId: activeMatch.matchId });
  flushTelegramNotifications().catch(() => undefined);

  const associatedRoom = Array.from(privateRooms.values()).find((r) => r.matchId === activeMatch.matchId);
  if (associatedRoom) {
    const roomCode = associatedRoom.roomCode;
    const subscribers = privateRoomSubscribers.get(roomCode);
    subscribers?.forEach((response) => {
      sendSse(response, 'private-room-completed', {
        roomCode,
        reason: 'The poker match has concluded.',
      });
      response.end();
    });
    privateRoomSubscribers.delete(roomCode);
    privateRooms.delete(roomCode);
    schedulePersist({ deleteRoomCode: roomCode });
  }

  scheduleMatchCleanup(activeMatch.matchId);
}

function buildPokerPerspectiveState(match: ActiveMatch, userId: string) {
  const pk = match.pokerGameState;
  if (!pk) return null;

  const userIndex = pk.players.findIndex((p) => isSameUser(p.userId, userId));
  const isSpectator = userIndex === -1;
  const isShowdownOrEnded = pk.stage === 'showdown' || pk.stage === 'ended' || pk.stage === 'match_ended';

  const mappedPlayers = pk.players.map((p, idx) => {
    const isMe = !isSpectator && isSameUser(p.userId, userId);
    const localId = isMe ? 'player' : `opponent_${idx}`;
    const holeCards = isMe || isShowdownOrEnded
      ? p.holeCards
      : p.holeCards.map((c, cIdx) => ({
          id: `hidden_card_${idx}_${cIdx}`,
          suit: 'spades' as const,
          rank: 0,
          hidden: true,
        }));

    return {
      id: localId,
      userId: p.userId,
      name: p.username,
      avatar: p.avatarId,
      chips: p.chips,
      currentBet: p.currentBet,
      totalMatchInvested: p.totalMatchInvested,
      holeCards,
      folded: p.folded,
      isAllIn: p.isAllIn,
      isAi: p.isAi,
      lastAction: p.lastAction,
      hasActedThisStage: p.hasActedThisStage,
      eliminated: p.eliminated,
      isConnected: p.isConnected !== false,
      disconnectedAt: p.disconnectedAt || null,
    };
  });

  const winnerIds = pk.winnerUserIds.map((wId) => {
    const pIdx = pk.players.findIndex((p) => isSameUser(p.userId, wId));
    return !isSpectator && isSameUser(wId, userId) ? 'player' : `opponent_${pIdx}`;
  });

  const champion = pk.players.find((p) => p.userId === pk.matchChampionUserId);
  const turnTimeLeft = Math.max(0, Math.ceil((15_000 - (Date.now() - (pk.turnStartedAt || Date.now()))) / 1000));

  const pokerGameState = {
    stage: pk.stage,
    pot: pk.pot,
    currentBet: pk.currentBet,
    minRaise: pk.minRaise,
    communityCards: pk.communityCards,
    players: mappedPlayers,
    dealerIndex: pk.dealerIndex,
    smallBlindIndex: pk.smallBlindIndex,
    bigBlindIndex: pk.bigBlindIndex,
    currentPlayerIndex: pk.currentPlayerIndex,
    smallBlindAmount: pk.smallBlindAmount,
    bigBlindAmount: pk.bigBlindAmount,
    winnerIds,
    winningCardIds: pk.winningCardIds,
    winningHandDesc: pk.winningHandDesc,
    isMatchOver: pk.stage === 'match_ended',
    matchWinnerName: champion?.username,
    winningPayout: pk.winningPayout,
    logs: pk.logs.slice(0, 20),
    turnTimeLeft,
    turnStartedAt: pk.turnStartedAt,
    stake: match.stake,
    mode: match.mode,
    matchId: match.matchId,
    roomCode: (match as any).roomCode,
    nextRoundStartsAt: pk.nextRoundStartsAt || null,
    waitingForPlayers: !match.playStartedAt,
    connectionDeadlineAt: match.connectionDeadlineAt || null,
  };

  return {
    matchId: match.matchId,
    mode: match.mode,
    stake: match.stake,
    gameType: 'poker',
    isSpectator,
    pokerGameState,
    gameState: pokerGameState as any,
  };
}

function buildBlackjackPerspectiveState(match: ActiveMatch, userId: string) {
  const bj = match.blackjackGameState;
  if (!bj) return null;

  const userIndex = bj.players.findIndex((p) => isSameUser(p.userId, userId));
  const isSpectator = userIndex === -1;

  // Mask dealer hole card during player turns
  const isPlayerTurnStage = bj.stage === 'player_turn';
  const dealerCards = bj.dealer.cards.map((card, idx) => {
    if (idx === 1 && isPlayerTurnStage) {
      return {
        id: 'dealer_hole_card',
        suit: 'spades' as const,
        rank: 0,
        value: 0,
        hidden: true,
      };
    }
    return card;
  });

  const visibleDealerScore = isPlayerTurnStage ? (bj.dealer.cards[0]?.value || 0) : bj.dealer.score;

  const mappedDealer = {
    id: 'dealer',
    name: 'Dealer (House)',
    avatar: bj.dealer.avatarId,
    chips: bj.dealer.chips,
    bet: bj.dealer.bet,
    cards: dealerCards,
    score: visibleDealerScore,
    isSoft: isPlayerTurnStage ? false : bj.dealer.isSoft,
    isBusted: isPlayerTurnStage ? false : bj.dealer.isBusted,
    hasBlackjack: isPlayerTurnStage ? false : bj.dealer.hasBlackjack,
    status: isPlayerTurnStage ? ('playing' as const) : bj.dealer.status,
    wins: bj.dealer.wins,
  };

  const mappedPlayers = bj.players.map((p, idx) => {
    const isMe = !isSpectator && isSameUser(p.userId, userId);
    const localId = isMe ? 'player' : `opponent_${idx}`;
    return {
      id: localId,
      userId: p.userId,
      name: p.username,
      avatar: p.avatarId,
      chips: p.chips,
      bet: p.bet,
      cards: p.cards,
      score: p.score,
      isSoft: p.isSoft,
      isBusted: p.isBusted,
      hasBlackjack: p.hasBlackjack,
      status: p.status,
      wins: p.wins,
      isAi: p.isAi,
      isConnected: p.isConnected !== false,
      disconnectedAt: p.disconnectedAt || null,
    };
  });

  const champion = bj.players.find((p) => p.wins >= bj.targetWins);
  const mappedChampion = champion ? {
    id: !isSpectator && champion.userId === userId ? 'player' : 'opponent',
    name: champion.username,
    avatar: champion.avatarId,
    chips: champion.chips,
    bet: champion.bet,
    cards: champion.cards,
    score: champion.score,
    isSoft: champion.isSoft,
    isBusted: champion.isBusted,
    hasBlackjack: champion.hasBlackjack,
    status: champion.status,
    wins: champion.wins,
    isAi: champion.isAi,
  } : null;

  const turnTimeLeft = Math.max(0, Math.ceil((15_000 - (Date.now() - (bj.turnStartedAt || Date.now()))) / 1000));

  const blackjackGameState = {
    stage: bj.stage,
    pot: bj.pot,
    stake: match.stake,
    mode: match.mode,
    currentPlayerIndex: bj.currentPlayerIndex,
    players: mappedPlayers,
    dealer: mappedDealer,
    targetWins: bj.targetWins,
    winner: champion ? champion.username : bj.winnerUserId ? 'Winner' : null,
    matchChampion: mappedChampion,
    roundWinnerUserId: bj.roundWinnerUserId || null,
    roundWinnerName: bj.roundWinnerName || null,
    nextRoundStartsAt: bj.nextRoundStartsAt || null,
    winningHandDesc: bj.winningHandDesc,
    winningPayout: bj.winningPayout,
    logs: bj.logs.slice(0, 20),
    turnTimeLeft,
    turnStartedAt: bj.turnStartedAt,
    matchId: match.matchId,
    roomCode: (match as any).roomCode,
    waitingForPlayers: !match.playStartedAt,
    connectionDeadlineAt: match.connectionDeadlineAt || null,
  };

  return {
    matchId: match.matchId,
    mode: match.mode,
    stake: match.stake,
    gameType: 'blackjack',
    isSpectator,
    blackjackGameState,
    gameState: blackjackGameState as any,
  };
}

function isSameUser(id1?: string | null, id2?: string | null): boolean {
  if (!id1 || !id2) return false;
  if (id1 === id2) return true;
  const normalize = (id: string) => id.replace(/^tg[:_]/, '').trim();
  return normalize(id1) === normalize(id2);
}

function buildPerspectiveState(match: ActiveMatch, userId: string) {
  if (match.gameType === 'poker' || match.pokerGameState) {
    return buildPokerPerspectiveState(match, userId);
  }
  if (match.gameType === 'blackjack' || match.blackjackGameState) {
    return buildBlackjackPerspectiveState(match, userId);
  }

  const userIndex = match.gameState.players.findIndex((player) => isSameUser(player.userId, userId));
  const isSpectator = userIndex === -1;
  const perspectiveIndex = isSpectator ? 0 : userIndex;

  const rotatedPlayers = match.gameState.players.map((_, offset) => {
    const originalIndex = (perspectiveIndex + offset) % match.gameState.players.length;
    const sourcePlayer = match.gameState.players[originalIndex];
    const localId = offset === 0 && !isSpectator ? 'player' : (`ai${offset}` as 'ai1' | 'ai2' | 'ai3');
    const revealFullHand = match.gameState.phase === 'game_over';
    const visibleHand = (offset === 0 && !isSpectator) || revealFullHand ? sourcePlayer.hand : [];

    return {
      id: localId,
      userId: sourcePlayer.userId,
      name: sourcePlayer.username,
      avatar: sourcePlayer.avatarId,
      hand: visibleHand,
      handCount: sourcePlayer.hand.length,
      isAi: sourcePlayer.isAi,
      unoDeclared: sourcePlayer.unoDeclared,
      emotion: sourcePlayer.emotion,
      isConnected: sourcePlayer.isConnected !== false,
      disconnectedAt: sourcePlayer.disconnectedAt || null,
    };
  });

  const currentPlayerIndex = ((match.gameState.currentPlayerIndex - perspectiveIndex) % match.gameState.players.length + match.gameState.players.length) % match.gameState.players.length;
  const winnerIndex = match.gameState.winnerUserId
    ? match.gameState.players.findIndex((player) => player.userId === match.gameState.winnerUserId)
    : -1;
  const localWinnerId = winnerIndex === -1
    ? null
    : (!isSpectator && winnerIndex === perspectiveIndex ? 'player' : (`ai${((winnerIndex - perspectiveIndex + match.gameState.players.length) % match.gameState.players.length)}` as 'ai1' | 'ai2' | 'ai3'));

  const rawPlayerWins = (match.gameState as any).playerWins || {};
  const mappedPlayerWins: Record<string, number> = {};
  match.gameState.players.forEach((sourcePlayer, originalIndex) => {
    const wins = rawPlayerWins[sourcePlayer.userId] || rawPlayerWins[sourcePlayer.username] || 0;
    const localId = !isSpectator && originalIndex === perspectiveIndex
      ? 'player'
      : (`ai${((originalIndex - perspectiveIndex + match.gameState.players.length) % match.gameState.players.length)}` as 'ai1' | 'ai2' | 'ai3');
    mappedPlayerWins[sourcePlayer.userId] = wins;
    mappedPlayerWins[sourcePlayer.username] = wins;
    mappedPlayerWins[localId] = wins;
  });

  return {
    matchId: match.matchId,
    mode: match.mode,
    stake: match.stake,
    isSpectator,
    gameState: {
      deck: [],
      deckCount: match.gameState.deck.length,
      discardPile: match.gameState.discardPile.slice(-1),
      discardCount: match.gameState.discardPile.length,
      players: rotatedPlayers,
      currentPlayerIndex,
      direction: match.gameState.direction,
      activeColor: match.gameState.activeColor,
      activeValue: match.gameState.activeValue,
      phase: match.gameState.phase,
      winnerId: localWinnerId,
      logs: match.gameState.logs ? match.gameState.logs.slice(0, 15) : [],
      turnStartedAt: match.gameState.turnStartedAt,
      turnTimeoutSec: match.turnTimeoutSec || 10,
      dealerId: 'ai1',
      consecutiveDraws: match.gameState.consecutiveDraws,
      accusablePlayers: [],
      waitingForPlayers: !match.playStartedAt,
      connectionDeadlineAt: match.connectionDeadlineAt || null,
      playerWins: mappedPlayerWins,
      winsRequired: (match.gameState as any).winsRequired || (currentTournament?.winsRequired || 1),
    },
  };
}

function applyPlayAction(match: ActiveMatch, userId: string, cardId: string, chosenColor?: CardColor) {
  if (!match.playStartedAt) {
    throw new Error('Waiting for all players to connect.');
  }
  const state = match.gameState;
  if (state.phase !== 'playing') {
    throw new Error('Match is already finished.');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || !isSameUser(currentPlayer.userId, userId)) {
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
    const activeCount = state.players.filter(isPlayerActive).length;
    if (activeCount === 2) {
      skipCount = 2;
    }
  } else if (card.value === 'skip') {
    skipCount = 2;
  } else if (card.value === 'draw2' || card.value === 'wild_draw4') {
    const drawCount = card.value === 'draw2' ? 2 : 4;
    nextState = ensureServerDeck(nextState, drawCount);

    const victimIndex = getNextActivePlayerIndex(state.players, state.currentPlayerIndex, nextState.direction, 1);
    const victim = nextState.players[victimIndex];
    const drawnCards = nextState.deck.splice(Math.max(nextState.deck.length - drawCount, 0), drawCount);
    victim.hand = [...victim.hand, ...drawnCards];
    victim.emotion = 'worried';

    const nextAfterVictimIndex = getNextActivePlayerIndex(nextState.players, victimIndex, nextState.direction, 1);
    nextState.currentPlayerIndex = nextAfterVictimIndex;
    nextState.consecutiveDraws = 0;

    const colorLabel = card.color === 'wild' ? `wild -> ${finalColor}` : `${card.color} ${card.value}`;
    nextState.logs = [
      createServerLog(`${currentPlayer.username} played ${colorLabel} (+${drawCount} cards to ${victim.username})`, 'action'),
      ...nextState.logs,
    ].slice(0, 50);

    match.gameState = nextState;
    match.gameState.turnStartedAt = Date.now();
    schedulePersist({ matchId: match.matchId });
    return;
  }

  const colorLabel = card.color === 'wild' ? `wild -> ${finalColor}` : `${card.color} ${card.value}`;
  nextState.logs = [createServerLog(`${currentPlayer.username} played ${colorLabel}`, card.color === 'wild' || card.value === 'skip' || card.value === 'reverse' ? 'action' : 'play'), ...nextState.logs].slice(0, 50);
  match.gameState = advanceServerTurn(nextState, skipCount);
  match.gameState.turnStartedAt = Date.now();
  schedulePersist({ matchId: match.matchId });
}

function applyDrawAction(match: ActiveMatch, userId: string) {
  if (!match.playStartedAt) {
    throw new Error('Waiting for all players to connect.');
  }
  const state = match.gameState;
  if (state.phase !== 'playing') {
    throw new Error('Match is already finished.');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || !isSameUser(currentPlayer.userId, userId)) {
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
  if (!match.playStartedAt) {
    throw new Error('Waiting for all players to connect.');
  }
  const state = match.gameState;
  if (state.phase !== 'playing') {
    throw new Error('Match is already finished.');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || !isSameUser(currentPlayer.userId, userId)) {
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

function activateMatch(matchId: string, mode: MatchMode, players: QueuePlayer[], stake: number, gameType: 'uno' | 'poker' | 'blackjack' = 'uno') {
  const createdAt = Date.now();
  const waitsForPrivatePlayers = mode === 'private'
    && players.some((player) => player.userId.startsWith('waiting_for_player_'));
  const waitsForPlayers = mode === 'pvp' || waitsForPrivatePlayers;
  const activeMatch: ActiveMatch = {
    matchId,
    mode,
    gameType,
    stake,
    players,
    createdAt,
    connectionDeadlineAt: mode === 'pvp' ? createdAt + 35_000 : (waitsForPrivatePlayers ? createdAt + 60_000 : undefined),
    playStartedAt: waitsForPlayers ? null : createdAt,
    costsCommitted: players.every((player) => player.costsCommitted !== false),
    settled: false,
    gameState: createInitialMatchState(players),
    blackjackGameState: gameType === 'blackjack' ? createInitialBlackjackMatchState(players, stake) : undefined,
    pokerGameState: gameType === 'poker' ? createInitialPokerMatchState(players, stake) : undefined,
  };
  activeMatch.gameState.turnStartedAt = waitsForPlayers ? undefined : createdAt;
  if (activeMatch.blackjackGameState) {
    activeMatch.blackjackGameState.turnStartedAt = waitsForPlayers ? undefined : createdAt;
  }
  if (activeMatch.pokerGameState) {
    activeMatch.pokerGameState.turnStartedAt = waitsForPlayers ? undefined : createdAt;
  }
  activeMatches.set(matchId, activeMatch);
  players.forEach((queuedPlayer) => {
    if (queuedPlayer.userId.startsWith('waiting_for_player_')) return;
    const user = getUser(queuedPlayer.userId);
    user.matchmakingFailureAt = null;
    activeMatchByUser.set(queuedPlayer.userId, matchId);
    if (user.userId) activeMatchByUser.set(user.userId, matchId);
    if (user.telegramId) {
      activeMatchByUser.set(`tg_${user.telegramId}`, matchId);
      activeMatchByUser.set(`tg:${user.telegramId}`, matchId);
      activeMatchByUser.set(String(user.telegramId), matchId);
    }
    markMatchPlayerConnected(activeMatch, queuedPlayer.userId);
    schedulePersist({ userId: queuedPlayer.userId });
  });
  if (mode === 'pvp') {
    maybeStartPublicMatch(activeMatch);
  }
  schedulePersist({ matchId });
  broadcastMatch(matchId);
  return activeMatch;
}

function ensureMatchLifecycle(match: ActiveMatch) {
  // Matches persisted before the connection lobby was introduced already had
  // their costs committed and gameplay running. Never charge them again.
  if (match.mode === 'pvp' && match.connectionDeadlineAt === undefined) {
    match.connectionDeadlineAt = match.createdAt;
    match.playStartedAt = match.playStartedAt || match.createdAt;
    match.costsCommitted = true;
  }
}

function commitPublicMatchCosts(match: ActiveMatch) {
  if (match.costsCommitted) return true;
  const energyCost = match.stake === 0 ? PUBLIC_FREE_MATCH_ENERGY_COST : PUBLIC_STAKE_MATCH_ENERGY_COST;
  const entries = match.players
    .filter((player) => player.costsCommitted !== true && !player.isAi && !player.userId.startsWith('bot_'))
    .map((player) => ({ player, user: getUser(player.userId) }));

  for (const { user, player } of entries) {
    recalculateEnergy(user);
    const needTicketHold = match.stake > 0 && player.costsCommitted !== 'held';
    if (match.stake > 0 && (needTicketHold && user.availableTickets < match.stake)) {
      return false;
    }
  }

  for (const { player, user } of entries) {
    if (user.energy >= energyCost) {
      spendEnergy(user, energyCost, match.stake === 0 ? 'Free Public Match Energy' : 'Online Match Energy');
    } else {
      user.energy = 0;
      user.energyUpdatedAt = Date.now();
    }
    updateQuestProgress(user.userId, 'spend_energy', energyCost);
    if (match.stake > 0) {
      if (player.costsCommitted !== 'held') {
        user.availableTickets = round2(user.availableTickets - match.stake);
        user.heldTickets = round2(user.heldTickets + match.stake);
      }
      createLedgerEntry(user, {
        event: 'PVP Match Hold',
        value: `-${match.stake.toFixed(2)} TKT`,
        type: 'stake_hold',
        amount: -match.stake,
      });
    }
    player.joinedAt = match.createdAt;
    player.costsCommitted = true;
    schedulePersist({ userId: user.userId });
  }
  match.costsCommitted = true;
  return true;
}

function cancelUnstartedPublicMatch(match: ActiveMatch, reason = 'Not all players connected in time. Match cancelled.') {
  broadcastMatchCancelled(match.matchId, reason);
  match.players.forEach((player) => {
    activeMatchByUser.delete(player.userId);
    if (!player.isAi && !player.userId.startsWith('bot_')) {
      const user = users.get(player.userId);
      if (user) {
        if (player.stake > 0 && (player.costsCommitted === 'held' || player.costsCommitted === true)) {
          user.heldTickets = round2(Math.max(0, user.heldTickets - player.stake));
          user.availableTickets = round2(user.availableTickets + player.stake);
          createLedgerEntry(user, {
            id: `match-cancel-refund:${match.matchId}:${user.userId}`,
            event: 'Cancelled Match Refund',
            value: `+${player.stake.toFixed(2)} TKT`,
            type: 'stake_release',
            amount: player.stake,
          });
        }
        const energyCost = match.stake === 0 ? PUBLIC_FREE_MATCH_ENERGY_COST : PUBLIC_STAKE_MATCH_ENERGY_COST;
        if (player.costsCommitted === true && energyCost > 0) {
          rewardEnergy(user, energyCost, 'Cancelled Match Energy Refund', `match-cancel-energy-refund:${match.matchId}:${user.userId}`);
        }
        user.matchmakingFailureAt = Date.now();
        user.matchmakingFailureReason = 'timeout';
        schedulePersist({ userId: user.userId });
      }
    }
  });
  activeMatches.delete(match.matchId);
  schedulePersist({ deleteMatchId: match.matchId });
}

function maybeStartPublicMatch(match: ActiveMatch, now = Date.now()) {
  ensureMatchLifecycle(match);
  if (match.mode !== 'pvp' || match.playStartedAt) return true;
  const isTournament = match.matchId.startsWith('tourn-');
  const timeoutMs = 60_000;
  const deadlineReached = now >= (match.connectionDeadlineAt || match.createdAt + timeoutMs);
  
  const connectedPlayers = match.gameState.players.filter((player) => player.hasConnected || player.isAi);
  const allConnected = connectedPlayers.length === match.gameState.players.length && connectedPlayers.length >= MIN_MATCH_PLAYERS;

  // Start immediately when MIN_MATCH_PLAYERS humans have connected or all players are connected
  const connectedHumanCount = match.gameState.players.filter((p) => p.hasConnected && !p.isAi).length;
  const enoughHumansConnected = connectedHumanCount >= MIN_MATCH_PLAYERS && !isTournament;

  // If not all matched players are connected and deadline not reached yet, continue waiting in lobby
  // unless we have enough humans connected for a fast start
  if (!allConnected && !deadlineReached && !enoughHumansConnected) return false;
  
  if (deadlineReached && !allConnected) {
    if (isTournament) {
      match.gameState.players.forEach((player) => {
        if (!player.hasConnected) {
          player.isAi = false;
          player.isConnected = false;
          player.disconnectedAt = now;
        }
      });
      match.playStartedAt = now;
      match.gameState.turnStartedAt = now;
      if (match.blackjackGameState) {
        match.blackjackGameState.turnStartedAt = now;
      }
      if (match.pokerGameState) {
        match.pokerGameState.turnStartedAt = now;
      }
      match.gameState.logs = [
        createServerLog('🎮 Tournament match started. Non-connected players are in shadow mode (skipping turns until reconnected).', 'info'),
        ...match.gameState.logs,
      ].slice(0, 50);
      schedulePersist({ matchId: match.matchId });
      broadcastMatch(match.matchId);
      return true;
    }

    const connectedCount = match.gameState.players.filter((p) => p.hasConnected && !p.isAi).length;
    if (match.stake === 0 && connectedCount > 0) {
      match.gameState.players.forEach((player) => {
        if (!player.hasConnected && !player.isAi) {
          activeMatchByUser.delete(player.userId);
          player.isAi = true;
          player.isConnected = true;
          player.hasConnected = true;
          player.username = `Bot ${player.username}`;
          const qP = match.players.find((qp) => qp.userId === player.userId);
          if (qP) {
            qP.isAi = true;
          }
        }
      });
      if (match.blackjackGameState) {
        match.blackjackGameState.players.forEach((p) => {
          if (!p.hasConnected && !p.isAi) {
            p.isAi = true;
            p.isConnected = true;
            p.hasConnected = true;
            p.username = `Bot ${p.username}`;
          }
        });
      }
      if (match.pokerGameState) {
        match.pokerGameState.players.forEach((p) => {
          if (!p.hasConnected && !p.isAi) {
            p.isAi = true;
            p.isConnected = true;
            p.hasConnected = true;
            p.username = `Bot ${p.username}`;
          }
        });
      }
      match.gameState.logs = [
        createServerLog('🔌 Absent player replaced by AI bot. Free match starting.', 'info'),
        ...match.gameState.logs,
      ].slice(0, 50);
    } else {
      cancelUnstartedPublicMatch(match, 'Not all players connected in time. Match cancelled.');
      return false;
    }
  }

  if (!commitPublicMatchCosts(match)) {
    cancelUnstartedPublicMatch(match, 'Match costs could not be committed. Match cancelled.');
    return false;
  }
  match.playStartedAt = now;
  match.gameState.turnStartedAt = now;
  if (match.blackjackGameState) {
    match.blackjackGameState.turnStartedAt = now;
  }
  if (match.pokerGameState) {
    match.pokerGameState.turnStartedAt = now;
  }
  match.gameState.logs = [createServerLog('All available players are ready. Match started.', 'info'), ...match.gameState.logs].slice(0, 50);
  schedulePersist({ matchId: match.matchId });
  broadcastMatch(match.matchId);
  return true;
}

function markMatchPlayerConnected(match: ActiveMatch, userId: string) {
  ensureMatchLifecycle(match);
  if (match.pokerGameState) {
    const pkPlayer = match.pokerGameState.players.find((entry) => isSameUser(entry.userId, userId));
    if (pkPlayer) {
      pkPlayer.isAi = false;
      pkPlayer.isConnected = true;
      pkPlayer.hasConnected = true;
      pkPlayer.lastSeenAt = Date.now();
      pkPlayer.disconnectedAt = null;
    }
  }
  if (match.blackjackGameState) {
    const bjPlayer = match.blackjackGameState.players.find((entry) => isSameUser(entry.userId, userId));
    if (bjPlayer) {
      bjPlayer.isAi = false;
      bjPlayer.isConnected = true;
      bjPlayer.hasConnected = true;
      bjPlayer.lastSeenAt = Date.now();
      bjPlayer.disconnectedAt = null;
    }
  }
  const qPlayer = match.players.find((entry) => isSameUser(entry.userId, userId));
  if (qPlayer) {
    qPlayer.isAi = false;
  }
  const player = match.gameState.players.find((entry) => isSameUser(entry.userId, userId));
  if (player) {
    const wasAi = player.isAi;
    player.isAi = false;
    player.isConnected = true;
    player.hasConnected = true;
    player.lastSeenAt = Date.now();
    player.disconnectedAt = null;
    if (wasAi) {
      match.gameState.logs = [createServerLog(`🔌 ${player.username} reconnected and took back control.`, 'info'), ...match.gameState.logs].slice(0, 50);
    }
  }
  activeMatchByUser.set(userId, match.matchId);
  schedulePersist({ matchId: match.matchId });
  const started = maybeStartPublicMatch(match);
  if (!started) {
    broadcastMatch(match.matchId);
  }
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
  if (netPrizePool <= 0) {
    return Object.fromEntries(Array.from({ length: playerCount }, (_, index) => [index + 1, 0]));
  }
  const shares = playerCount <= 2
    ? [1.00, 0.00]
    : playerCount === 3
      ? [0.70, 0.30, 0.00]
      : [0.70, 0.30, 0.00, 0.00];
  const payouts = shares.map((share, index) => index === 0
    ? 0
    : Math.floor((netPrizePool * share + Number.EPSILON) * 100) / 100);
  payouts[0] = round2(netPrizePool - payouts.slice(1).reduce((sum, payout) => sum + payout, 0));
  return Object.fromEntries(payouts.map((payout, index) => [index + 1, payout]));
}

function tryActivateQueuedMatch(userId: string): MatchmakingStatusPayload | null {
  let activeMatchId = activeMatchByUser.get(userId);
  if (!activeMatchId) {
    for (const [uid, mId] of activeMatchByUser.entries()) {
      if (isSameUser(uid, userId)) {
        activeMatchId = mId;
        break;
      }
    }
  }
  if (activeMatchId) {
    const activeMatch = activeMatches.get(activeMatchId);
    const isGameOver = activeMatch && (
      activeMatch.settled ||
      (activeMatch.gameType === 'poker' ? activeMatch.pokerGameState?.stage === 'match_ended' :
       activeMatch.gameType === 'blackjack' ? activeMatch.blackjackGameState?.stage === 'match_ended' :
       activeMatch.gameState.phase === 'game_over')
    );
    const isPlayerActive = activeMatch && activeMatch.players.some((p) => isSameUser(p.userId, userId) && !p.isAi && !p.userId.startsWith('waiting_for_player_'));
    const isStaleMatch = activeMatch && (Date.now() - (activeMatch.playStartedAt || activeMatch.createdAt || 0) > 10 * 60 * 1000);

    if (activeMatch && !isGameOver && !isStaleMatch && isPlayerActive) {
      markMatchPlayerConnected(activeMatch, userId);
      const perspective = buildPerspectiveState(activeMatch, userId);
      return {
        status: 'ready',
        matchId: activeMatch.matchId,
        players: activeMatch.players,
        stake: activeMatch.stake,
        mode: activeMatch.mode,
        gameType: activeMatch.gameType || 'uno',
        gameState: (perspective as any)?.gameState,
        blackjackGameState: (perspective as any)?.blackjackGameState,
        pokerGameState: (perspective as any)?.pokerGameState,
      };
    } else {
      activeMatchByUser.delete(userId);
      for (const uid of Array.from(activeMatchByUser.keys())) {
        if (isSameUser(uid, userId)) activeMatchByUser.delete(uid);
      }
    }
  }

  const player = matchmakingQueue.find((entry) => isSameUser(entry.userId, userId));
  if (!player) {
    const user = users.get(userId) || (Array.from(users.entries()).find(([uId]) => isSameUser(uId, userId))?.[1]);
    if (user?.matchmakingFailureReason === 'timeout' && user.matchmakingFailureAt) {
      return {
        status: 'expired',
        message: 'Previous matchmaking attempt expired. No tickets or energy were charged. You can join again.',
        failedAt: user.matchmakingFailureAt,
      };
    }
    return { status: 'idle' };
  }

  const playerGameType = player.gameType || 'uno';
  const similarPlayers = matchmakingQueue.filter(
    (entry) => (entry.gameType || 'uno') === playerGameType && entry.stake === player.stake && entry.mode === player.mode
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
    stake: player.stake,
    mode: player.mode,
    gameType: playerGameType,
  };
}

const BOT_NAMES = ['Anya', 'Max', 'Leo', 'Elena', 'Oscar', 'Maya', 'Viktor', 'Chloe'];
const BOT_AVATARS = ['rabbit', 'koala', 'fox', 'bear', 'cat', 'panda', 'tiger', 'racoon'];

function createBotQueuePlayer(stake: number, mode: MatchMode, index = 0): QueuePlayer {
  const botId = `bot_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
  const nameIndex = Math.floor(Math.random() * BOT_NAMES.length);
  return {
    userId: botId,
    username: `Bot ${BOT_NAMES[nameIndex]}`,
    avatarId: BOT_AVATARS[nameIndex % BOT_AVATARS.length],
    stake,
    mode,
    joinedAt: Date.now(),
    costsCommitted: true,
    isAi: true,
  };
}

function expireTimedOutMatchmakingPlayers(now = Date.now()) {
  const groupSizes = new Map<string, number>();
  matchmakingQueue.forEach((player) => {
    const key = `${player.gameType || 'uno'}_${player.mode}_${player.stake}`;
    groupSizes.set(key, (groupSizes.get(key) || 0) + 1);
  });
  const expired = matchmakingQueue.filter((player) => {
    const key = `${player.gameType || 'uno'}_${player.mode}_${player.stake}`;
    return now - player.joinedAt >= MATCHMAKING_TIMEOUT_MS
      && (groupSizes.get(key) || 0) < MIN_MATCH_PLAYERS;
  });
  if (expired.length === 0) return;

  const expiredUserIds = new Set(expired.map((player) => player.userId));
  matchmakingQueue = matchmakingQueue.filter((player) => !expiredUserIds.has(player.userId));
  expired.forEach((player) => {
    if (!player.isAi && !player.userId.startsWith('bot_')) {
      const user = getUser(player.userId);
      if (player.stake > 0 && player.costsCommitted === 'held') {
        user.heldTickets = round2(Math.max(0, user.heldTickets - player.stake));
        user.availableTickets = round2(user.availableTickets + player.stake);
      }
      user.matchmakingFailureAt = now;
      user.matchmakingFailureReason = 'timeout';
      schedulePersist({ userId: player.userId });
    }
  });
  schedulePersist();
  expired.forEach((player) => broadcastQueue(player.userId));
}

function runMatchmakingTick() {
  expireTimedOutMatchmakingPlayers();
  if (matchmakingQueue.length === 0) return;

  const groups = new Map<string, QueuePlayer[]>();
  for (const player of matchmakingQueue) {
    const key = `${player.gameType || 'uno'}_${player.mode}_${player.stake}`;
    const list = groups.get(key) || [];
    list.push(player);
    groups.set(key, list);
  }

  for (const [key, players] of groups.entries()) {
    players.sort((a, b) => a.joinedAt - b.joinedAt);

    let i = 0;
    while (i < players.length) {
      const remaining = players.length - i;
      if (remaining >= MIN_MATCH_PLAYERS) {
        const groupSlice = players.slice(i, i + MAX_MATCH_PLAYERS);
        const oldestPlayer = groupSlice[0];

        const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const mode = oldestPlayer.mode;
        const stake = oldestPlayer.stake;
        const gameType = oldestPlayer.gameType || 'uno';

        activateMatch(matchId, mode, groupSlice, stake, gameType);

        matchmakingQueue = matchmakingQueue.filter(q => !groupSlice.some(p => isSameUser(p.userId, q.userId)));

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
        const waitingPlayer = players[i];
        if (waitingPlayer && waitingPlayer.stake === 0 && Date.now() - waitingPlayer.joinedAt >= 65_000) {
          const gameType = waitingPlayer.gameType || 'uno';
          const botCount = gameType === 'blackjack' ? 2 : 1;
          const bots: QueuePlayer[] = [];
          for (let b = 0; b < botCount; b++) {
            const bot = createBotQueuePlayer(0, waitingPlayer.mode, b + 1);
            bot.gameType = gameType;
            bots.push(bot);
          }
          const groupSlice = [waitingPlayer, ...bots];
          const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          activateMatch(matchId, waitingPlayer.mode, groupSlice, 0, gameType);
          matchmakingQueue = matchmakingQueue.filter(p => p.userId !== waitingPlayer.userId);
          schedulePersist();
          const timer = matchmakerCleanupTimers.get(waitingPlayer.userId);
          if (timer) {
            clearTimeout(timer);
            matchmakerCleanupTimers.delete(waitingPlayer.userId);
          }
          broadcastQueue(waitingPlayer.userId);
        }
        break;
      }
    }
  }
}

function sendSse(response: Response, event: string, payload: unknown, dedupe = true) {
  if (response.writableEnded || response.destroyed) return false;
  const serializedPayload = JSON.stringify(payload);
  const eventPayloads = lastSsePayloadByResponse.get(response) || new Map<string, string>();
  if (dedupe && eventPayloads.get(event) === serializedPayload) {
    realtimeTraffic.framesDeduplicated += 1;
    return false;
  }
  eventPayloads.set(event, serializedPayload);
  lastSsePayloadByResponse.set(response, eventPayloads);
  response.write(`event: ${event}\n`);
  response.write(`data: ${serializedPayload}\n\n`);
  (response as any).flush?.();
  realtimeTraffic.framesSent += 1;
  realtimeTraffic.payloadBytesSent += Buffer.byteLength(serializedPayload);
  if (event === 'heartbeat') realtimeTraffic.heartbeatsSent += 1;
  return true;
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

function normalizePrivateRoomCode(raw: string | undefined): string {
  if (!raw) return '';
  let code = String(raw).trim().toUpperCase();
  if (code.startsWith('ROOM_')) code = code.slice(5);
  if (code.startsWith('POKER_')) code = code.slice(6);
  if (code.startsWith('BLACKJACK_')) code = code.slice(10);
  if (code.startsWith('UNO_')) code = code.slice(4);
  return code;
}

function buildPrivateRoomPayload(room: PrivateRoom) {
  return {
    roomCode: room.roomCode,
    telegramLink: buildTelegramMiniAppLink(room.gameType ? `room_${room.gameType}_${room.roomCode}` : `room_${room.roomCode}`),
    stake: room.stake,
    targetPlayers: room.targetPlayers,
    status: room.status,
    playersCount: room.players.length,
    minPlayers: MIN_MATCH_PLAYERS,
    maxPlayers: MAX_MATCH_PLAYERS,
    players: room.players,
    matchId: room.matchId || null,
    gameType: room.gameType || 'uno',
    hostUserId: room.hostUserId,
  };
}

function broadcastPrivateRoom(roomCode: string) {
  const room = privateRooms.get(roomCode);
  const subscribers = privateRoomSubscribers.get(roomCode);
  if (!room || !subscribers) return;
  const payload = buildPrivateRoomPayload(room);
  subscribers.forEach((response) => sendSse(response, 'private-room', payload));
}

function broadcastMatchCancelled(matchId: string, reason: string) {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers) return;
  subscribers.forEach((response) => {
    sendSse(response, 'match-cancelled', { matchId, reason });
    response.end();
  });
  matchSubscribers.delete(matchId);
}

function privateRoomHasOpenSeats(room: PrivateRoom) {
  const match = room.matchId ? activeMatches.get(room.matchId) : null;
  return room.players.length < room.targetPlayers
    || Boolean(match?.players.some((player) => player.userId.startsWith('waiting_for_player_')));
}

function refundPrivateRoomReservation(player: QueuePlayer, roomCode: string, reason: string) {
  if (!player.costsCommitted) return;
  const user = getUser(player.userId);
  if (player.stake > 0) {
    user.heldTickets = round2(Math.max(0, user.heldTickets - player.stake));
    user.availableTickets = round2(user.availableTickets + player.stake);
    createLedgerEntry(user, {
      id: `private-room-refund:${roomCode}:${player.userId}`,
      event: reason,
      value: `+${player.stake.toFixed(2)} TKT`,
      type: 'stake_release',
      amount: player.stake,
    });
    rewardEnergy(
      user,
      1,
      'Private Room Energy Refund',
      `private-room-energy-refund:${roomCode}:${player.userId}`,
    );
  }
  player.costsCommitted = false;
  schedulePersist({ userId: player.userId });
}

function commitPrivateRoomCosts(room: PrivateRoom, players: QueuePlayer[]) {
  const entries = players
    .filter((player) => player.costsCommitted !== true)
    .map((player) => ({ player, user: getUser(player.userId) }));
  for (const { user } of entries) {
    recalculateEnergy(user);
    if (room.stake > 0 && (user.availableTickets < room.stake || user.energy < 1)) {
      return false;
    }
  }
  for (const { player, user } of entries) {
    if (room.stake > 0) {
      spendEnergy(user, 1, 'Private Room Energy');
      updateQuestProgress(user.userId, 'spend_energy', 1);
      user.availableTickets = round2(user.availableTickets - room.stake);
      user.heldTickets = round2(user.heldTickets + room.stake);
      createLedgerEntry(user, {
        event: 'Private Room Hold',
        value: `-${room.stake.toFixed(2)} TKT`,
        type: 'stake_hold',
        amount: -room.stake,
      });
    }
    player.costsCommitted = true;
    schedulePersist({ userId: user.userId });
  }
  return true;
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
  for (const [subUserId, subscribers] of queueSubscribers.entries()) {
    if (isSameUser(subUserId, userId)) {
      const payload = buildQueuePayload(subUserId);
      const isReady = (payload as any)?.status === 'ready';
      subscribers.forEach((response) => sendSse(response, 'queue-status', payload, !isReady));
    }
  }
}

function buildOperationalHealthStatus() {
  return {
    status: 'healthy',
    time: new Date().toISOString(),
    service: 'redoapp-backend',
    privateRoomsVersion: 'json-create-free-room-v5',
    cache: {
      provider: redisCacheEnabled ? 'upstash-redis' : 'disabled',
      referralTtlSec: redisCacheEnabled ? REFERRAL_CACHE_TTL_SEC : null,
      hits: redisCacheHits,
      misses: redisCacheMisses,
      failures: redisCacheFailures,
    },
    referralReset: {
      migrationId: REFERRAL_RESET_MIGRATION_ID,
      status: referralResetStatus,
      affectedUsers: referralResetAffectedUsers,
    },
    referralPayoutAudit: {
      total: referralPayouts.size,
      pending: Array.from(referralPayouts.values()).filter((payout) => payout.status === 'pending').length,
    },
    realtimeTraffic: {
      ...realtimeTraffic,
      queueSubscribers: Array.from(queueSubscribers.values()).reduce((total, entries) => total + entries.size, 0),
      privateRoomSubscribers: Array.from(privateRoomSubscribers.values()).reduce((total, entries) => total + entries.size, 0),
      matchSubscribers: Array.from(matchSubscribers.values()).reduce((total, entries) => total + entries.size, 0),
    },
  };
}

// Render only needs a successful response here. Keep the public check free of
// operational counters and payout state, which belong behind administrator auth.
app.get('/api/health', (req, res) => {
  const health = buildOperationalHealthStatus();
  res.json({ status: health.status, time: health.time, service: health.service });
});

app.get('/api/admin/health', requireAdmin, (req, res) => {
  res.json(buildOperationalHealthStatus());
});

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value);
  // Spreadsheet applications treat a leading formula marker as executable.
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvTimestamp(value: number | null) {
  return value ? new Date(value).toISOString() : '';
}

app.get('/api/admin/referrals/payouts.csv', requireAdmin, (req, res) => {
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  const status = req.query.status === 'pending' || req.query.status === 'credited' ? req.query.status : null;
  const payouts = Array.from(referralPayouts.values())
    .filter((payout) => (!Number.isFinite(from) || payout.createdAt >= from) && (!Number.isFinite(to) || payout.createdAt <= to))
    .filter((payout) => !status || payout.status === status)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const header = [
    'payout_id', 'status', 'match_id', 'level', 'source_user_id', 'source_username',
    'recipient_user_id', 'recipient_username', 'gross_payout_tkt', 'rate_percent',
    'amount_tkt', 'created_at_utc', 'credited_at_utc',
  ];
  const rows = payouts.map((payout) => {
    const source = users.get(payout.sourceUserId);
    const recipient = users.get(payout.recipientUserId);
    return [
      payout.id,
      payout.status,
      payout.matchId,
      payout.level,
      payout.sourceUserId,
      source?.telegramUsername ? `@${source.telegramUsername}` : '',
      payout.recipientUserId,
      recipient?.telegramUsername ? `@${recipient.telegramUsername}` : '',
      payout.grossPayout.toFixed(2),
      (payout.rateBps / 100).toFixed(2),
      payout.amount.toFixed(2),
      csvTimestamp(payout.createdAt),
      csvTimestamp(payout.creditedAt),
    ].map(csvCell).join(',');
  });

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="referral-payouts-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(`\uFEFF${header.map(csvCell).join(',')}\n${rows.join('\n')}\n`);
});

app.post('/api/users/sync', async (req, res) => {
  const { walletAddress, telegramInitData, startParam } = req.body as { userId?: string; walletAddress?: string; telegramInitData?: string; startParam?: string };
  const resolved = resolveCanonicalUserId(req.body, req);
  if (!resolved.userId) {
    return res.status(400).json({ error: 'Missing userId.' });
  }
  const canIssueSessionToken = !!resolved.auth || resolved.isSessionFallback || resolved.userId.startsWith('guest:') || resolved.userId.startsWith('guest_') || Boolean(resolved.userId);
  const user = getUser(resolved.userId, walletAddress);
  if (resolved.auth) {
    applyTelegramAuth(user, resolved.auth);
  }
  // In production the referral parameter is part of Telegram's signed
  // initData. Do not let a client replace it with an arbitrary inviter code.
  const trustedStartParam = resolved.auth?.start_param || startParam || undefined;
  assignReferralIfNeeded(user, trustedStartParam);
  try {
    // The referral edge must be durable before the Mini App treats the sync
    // as successful; otherwise a Render restart can lose a just-opened link.
    await persistStateNow();
  } catch {
    return res.status(503).json({ error: 'Account data is temporarily unavailable. Please retry.' });
  }
  return res.json({
    telegramInitDataValid: !!resolved.auth,
    sessionToken: canIssueSessionToken ? createSessionToken(user.userId) : null,
    ...buildBootstrapProfileResponse(user),
  });
});

function buildDailyCheckinResponse(user: UserState, checkin: DailyCheckinRecord, replayed: boolean) {
  return {
    success: true,
    replayed,
    ...checkin,
    xp: user.xp,
    energy: getEnergyState(user),
    claimedQuestIds: user.completedQuestIds,
    lastDailyXpAt: checkin.claimedAt,
  };
}

function sendDailyCheckinSuccess(req: Request, res: Response, payload: Record<string, unknown>) {
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  if (input?.responseMode === 'script') {
    const callback = typeof input.callback === 'string' ? input.callback : '';
    if (!/^__redoappDaily_[A-Za-z0-9_]+$/.test(callback)) {
      return res.status(400).json({ error: 'Invalid daily check-in callback.' });
    }
    const serializedPayload = JSON.stringify(payload).replace(/</g, '\\u003c');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.type('application/javascript').send(
      `window[${JSON.stringify(callback)}](${serializedPayload});`
    );
  }
  if (input?.responseMode === 'iframe') {
    const parentOrigin = typeof input.parentOrigin === 'string' && /^https?:\/\/[^/]+$/i.test(input.parentOrigin)
      ? input.parentOrigin
      : '';
    if (!parentOrigin) return res.status(400).json({ error: 'Invalid bridge origin.' });
    const message = JSON.stringify({
      source: 'redoapp-daily-checkin-bridge',
      requestId: String(input.bridgeRequestId || ''),
      payload,
    }).replace(/</g, '\\u003c');
    // Helmet's default X-Frame-Options blocks this intentionally embedded
    // bridge on the separate frontend origin unless it is removed here.
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'");
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><script>parent.postMessage(${message}, ${JSON.stringify(parentOrigin)})</script>`);
  }
  return res.json(payload);
}

function handleDailyCheckin(req: AuthenticatedRequest, res: Response) {
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  const walletAddress = typeof input.walletAddress === 'string' ? input.walletAddress : undefined;
  const user = getUser(getAuthenticatedUserId(req), walletAddress);
  const now = Date.now();
  const requestedClaimId = typeof input.claimId === 'string'
    ? input.claimId.trim().slice(0, 120)
    : '';

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
    const savedCheckin = user.lastDailyCheckin;
    if (savedCheckin && getStartOfUtcDay(savedCheckin.claimedAt) === today) {
      return sendDailyCheckinSuccess(req, res, buildDailyCheckinResponse(user, savedCheckin, true));
    }
    return sendDailyCheckinSuccess(req, res, {
      success: false,
      alreadyClaimed: true,
      xpAwarded: 0,
      xp: user.xp,
      streak: user.dailyStreak || 0,
      lastDailyXpAt: user.lastDailyXpAt,
      rewardTickets: 0,
      rewardEnergy: 0,
      energy: getEnergyState(user),
    });
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

  const checkin: DailyCheckinRecord = {
    claimId: requestedClaimId || `daily-checkin-${user.userId}-${today}`,
    claimedAt: now,
    streak,
    xpAwarded: reward.xp,
    rewardTickets: reward.tickets,
    rewardEnergy: reward.energy,
  };
  user.lastDailyCheckin = checkin;
  schedulePersist({ userId: user.userId });

  return sendDailyCheckinSuccess(req, res, {
    ...buildDailyCheckinResponse(user, checkin, false),
    claimedQuestIds,
  });
}

app.post('/api/xp/daily-checkin', requireAuth, handleDailyCheckin);
// Telegram mobile WebViews occasionally leave the JSON POST pending after the
// server has committed the reward. This idempotent no-preflight route returns
// the same daily record through postMessage instead of requiring a reload.
app.get('/api/xp/daily-checkin-beacon', requireAuth, handleDailyCheckin);

app.get('/api/xp/daily-checkin-status', requireAuth, (req: AuthenticatedRequest, res) => {
  const input = req.query as Record<string, unknown>;
  const walletAddress = typeof input.walletAddress === 'string' ? input.walletAddress : undefined;
  const user = getUser(getAuthenticatedUserId(req), walletAddress);
  const today = getStartOfUtcDay(Date.now());
  const savedCheckin = user.lastDailyCheckin;

  if (savedCheckin && getStartOfUtcDay(savedCheckin.claimedAt) === today) {
    return sendDailyCheckinSuccess(req, res, buildDailyCheckinResponse(user, savedCheckin, true));
  }

  const alreadyClaimed = Boolean(user.lastDailyXpAt && getStartOfUtcDay(user.lastDailyXpAt) === today);
  return sendDailyCheckinSuccess(req, res, {
    success: false,
    alreadyClaimed,
    xpAwarded: 0,
    xp: user.xp,
    streak: user.dailyStreak || 0,
    rewardTickets: 0,
    rewardEnergy: 0,
    energy: getEnergyState(user),
    lastDailyXpAt: user.lastDailyXpAt,
  });
});

app.get('/api/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = getUser(getAuthenticatedUserId(req));
  return res.json(buildProfileResponse(user));
});

app.get('/api/referrals', requireAuth, async (req: AuthenticatedRequest, res) => {
  const inviterUserId = getAuthenticatedUserId(req);
  const { limit, cursor } = parseReferralPagination(req.query.limit, req.query.cursor);
  const version = await getReferralCacheVersion(inviterUserId);
  const cursorPart = cursor ? `${cursor.assignedAt}:${cursor.userId}` : 'first';
  const cacheKey = `${REDIS_CACHE_NAMESPACE}:referrals:page:${cacheKeyPart(inviterUserId)}:${version}:${limit}:${cacheKeyPart(cursorPart)}`;
  res.setHeader('Cache-Control', 'private, no-store');
  const cached = await getCachedJson<ReturnType<typeof listReferralInvites>>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }
  const page = listReferralInvites(inviterUserId, req.query.limit, req.query.cursor);
  if (isRedisCacheAvailable()) {
    void setCachedJson(cacheKey, page, REFERRAL_CACHE_TTL_SEC);
    res.setHeader('X-Cache', 'MISS');
  } else {
    res.setHeader('X-Cache', 'BYPASS');
  }
  return res.json(page);
});

function buildLootboxClaimResponse(user: UserState, claim: LootboxClaimRecord, replayed: boolean) {
  return {
    success: true,
    replayed,
    ...claim,
    availableTickets: user.availableTickets,
    xp: user.xp,
    energy: getEnergyState(user),
    lootboxClaimedAt: claim.claimedAt,
    lootboxAvailable: false,
  };
}

app.post('/api/quests/claim-lootbox', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = getUser(getAuthenticatedUserId(req));
  const now = Date.now();
  const todayStart = getStartOfUtcDay(now);
  const requestedClaimId = typeof req.body?.claimId === 'string'
    ? req.body.claimId.trim().slice(0, 120)
    : '';

  if (user.lootboxClaimedAt && getStartOfUtcDay(user.lootboxClaimedAt) === todayStart) {
    const savedClaim = user.lastLootboxClaim;
    if (savedClaim && getStartOfUtcDay(savedClaim.claimedAt) === todayStart) {
      // A Telegram WebView can lose the response after the server has already
      // committed the reward. Replaying the stored result makes retries safe
      // and prevents both a false error and a second credit.
      return res.json(buildLootboxClaimResponse(user, savedClaim, true));
    }
    // Compatibility for rewards claimed before idempotent records existed.
    // We cannot reconstruct the old random roll, but the current balance is
    // authoritative and a retry must never issue another reward.
    return res.json({
      success: true,
      replayed: true,
      alreadyClaimed: true,
      claimId: requestedClaimId || `legacy-${user.userId}-${todayStart}`,
      claimedAt: user.lootboxClaimedAt,
      rewardType: 'xp',
      rewardTickets: 0,
      rewardEnergy: 0,
      rewardXp: 0,
      message: "Today's chest was already collected. Your balance is up to date.",
      availableTickets: user.availableTickets,
      xp: user.xp,
      energy: getEnergyState(user),
      lootboxClaimedAt: user.lootboxClaimedAt,
      lootboxAvailable: false,
    });
  }

  const dailyQuestCompletion = getDailyQuestCompletion(user.userId, now);
  if (!dailyQuestCompletion.allCompleted) {
    return res.status(400).json({
      error: `Complete all daily quests before opening the chest. Currently completed: ${dailyQuestCompletion.completed}/${dailyQuestCompletion.total}.`,
    });
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

  const claim: LootboxClaimRecord = {
    claimId: requestedClaimId || `lootbox-${user.userId}-${todayStart}`,
    claimedAt: now,
    rewardType,
    rewardTickets: 0,
    rewardEnergy: rewardEnergyAmount,
    rewardXp: rewardXpAmount,
    message,
  };
  user.lootboxClaimedAt = now;
  user.lastLootboxClaim = claim;
  schedulePersist({ userId: user.userId });

  return res.json(buildLootboxClaimResponse(user, claim, false));
});

// TOURNAMENT ENDPOINTS & AUTOMATION
function sendTelegramMessageSafely(chatId: number, text: string, buttonUrl?: string, buttonText?: string) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (buttonUrl) {
    // Telegram Bot API requires `url` (not `web_app`) for t.me deep links.
    body.reply_markup = {
      inline_keyboard: [[{ text: buttonText || '🎮 JOIN MATCH TABLE NOW', url: buttonUrl }]],
    };
  }
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Telegram Bot Error] chatId=${chatId}: HTTP ${res.status} - ${errText}`);
      } else {
        console.log(`[Telegram Bot Success] Message sent to chatId=${chatId}`);
      }
    })
    .catch((err) => {
      console.error(`[Telegram Bot Transport Error] chatId=${chatId}:`, err);
    });
}

function resolveTelegramChatId(pid: string): number | undefined {
  const u = users.get(pid);
  const pObj = currentTournament?.participants.find((p) => p.userId === pid);
  if (pObj?.chatId) return pObj.chatId;
  if (u?.telegramChatId) return u.telegramChatId;
  if (u?.telegramId) return u.telegramId;
  if (pid.startsWith('tg:')) {
    const parsed = Number(pid.replace('tg:', ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function completeTournament(winnerId: string | null) {
  if (!currentTournament) return;

  currentTournament.status = 'finished';
  currentTournament.finishedAt = Date.now();

  if (winnerId) {
    const u = users.get(winnerId);
    const pObj = currentTournament.participants.find((p) => p.userId === winnerId);
    currentTournament.winnerUserId = winnerId;
    const rawUsername = u?.telegramUsername || pObj?.username || winnerId.replace(/^tg:/, '');
    currentTournament.winnerName = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
    currentTournament.winnerAvatar = pObj?.avatarId || 'rabbit';

    const winnerChatId = resolveTelegramChatId(winnerId);
    if (winnerChatId) {
      sendTelegramMessageSafely(
        winnerChatId,
        `🏆 <b>CONGRATULATIONS CHAMPION!</b>\nYou won <b>${currentTournament.title}</b>!\nYour Award is ready!`,
        currentTournament.nftLink,
        '🎁 View Prize ➔'
      );
    }
  } else {
    currentTournament.winnerName = 'REDO Champion';
    currentTournament.winnerAvatar = 'rabbit';
  }

  // Push to past tournaments history list
  pastTournaments.unshift({ ...currentTournament });
  if (pastTournaments.length > 20) {
    pastTournaments.pop();
  }

  schedulePersist();
}

function evaluateTournamentProgression() {
  if (!currentTournament || currentTournament.status !== 'in_progress') return;

  const currentRoundMatches = currentTournament.matches.filter((m) => m.round === currentTournament!.currentRound);
  if (currentRoundMatches.length === 0) return;

  const allCurrentRoundCompleted = currentRoundMatches.every((m) => m.status === 'completed' && m.winnerId);
  if (!allCurrentRoundCompleted) return;

  const currentRoundWinners = currentRoundMatches.map((m) => m.winnerId!).filter(Boolean);
  if (currentRoundWinners.length <= 1) {
    completeTournament(currentRoundWinners[0] || null);
    schedulePersist();
    return;
  }

  const nextRoundNumber = currentTournament.currentRound + 1;
  currentTournament.currentRound = nextRoundNumber;

  const nextTables = distributePlayersIntoTables(currentRoundWinners);
  const isFinalRound = nextTables.length === 1 && currentRoundWinners.length <= 4;
  const waitingTimerEndAt = Date.now() + 90000; // 90 seconds wait timer

  nextTables.forEach((tablePlayers, idx) => {
    const matchId = isFinalRound
      ? `tourn-${currentTournament!.id}-r${nextRoundNumber}-final`
      : `tourn-${currentTournament!.id}-r${nextRoundNumber}-m${idx + 1}`;

    const newMatch: TournamentMatch = {
      matchId,
      round: nextRoundNumber,
      tableIndex: idx + 1,
      playerIds: tablePlayers,
      winnerId: null,
      status: 'in_progress',
      waitingTimerEndAt,
    };
    currentTournament!.matches.push(newMatch);

    const queuePlayers: QueuePlayer[] = tablePlayers.map((pid) => {
      const u = users.get(pid);
      const pObj = currentTournament!.participants.find((p) => p.userId === pid);
      return {
        userId: pid,
        username: u?.telegramUsername || pObj?.username || pid.replace(/^tg:/, ''),
        avatarId: pObj?.avatarId || 'rabbit',
        stake: 0,
        mode: 'pvp',
        joinedAt: Date.now(),
      };
    });

    const gameType = currentTournament!.gameType || 'uno';
    const matchState = createInitialMatchState(queuePlayers);

    const activeMatch: ActiveMatch = {
      matchId,
      mode: 'pvp',
      gameType,
      stake: 0,
      players: queuePlayers,
      createdAt: Date.now(),
      settled: false,
      turnTimeoutSec: 10,
      connectionDeadlineAt: Date.now() + 30_000,
      playStartedAt: Date.now(),
      costsCommitted: true,
      gameState: matchState,
      blackjackGameState: gameType === 'blackjack' ? createInitialBlackjackMatchState(queuePlayers, 0) : undefined,
      pokerGameState: gameType === 'poker' ? createInitialPokerMatchState(queuePlayers, 0) : undefined,
    };

    if (activeMatch.blackjackGameState) activeMatch.blackjackGameState.turnStartedAt = Date.now();
    if (activeMatch.pokerGameState) activeMatch.pokerGameState.turnStartedAt = Date.now();

    activeMatches.set(matchId, activeMatch);

    tablePlayers.forEach((pid) => {
      activeMatchByUser.set(pid, matchId);
      const targetChatId = resolveTelegramChatId(pid);
      if (targetChatId) {
        const gameLabel = gameType === 'poker' ? 'Poker' : gameType === 'blackjack' ? 'Blackjack' : 'UNO';
        const tableUrl = buildTelegramMiniAppLink(`tournament_table_${matchId}`);
        const text = isFinalRound
          ? `🏆 <b>FINAL ROUND STARTED!</b>\nCongratulations! You reached the ${gameLabel.toUpperCase()} TOURNAMENT FINAL! Tap below to join your table now.`
          : `🏆 <b>SEMI-FINAL ROUND ${nextRoundNumber} STARTED!</b>\nCongratulations! You advanced to Round ${nextRoundNumber} in ${gameLabel} Tournament! Tap below to join your table now.`;
        sendTelegramMessageSafely(targetChatId, text, tableUrl, '🎮 Enter Table ➔');
      }
    });
  });

  schedulePersist();
}

function processTournamentTick() {
  if (!currentTournament) return;
  const now = Date.now();

  // 1. Auto Start when timer reaches 0
  if (currentTournament.status === 'upcoming' && now >= currentTournament.startAt) {
    if (currentTournament.participants.length < 2) {
      currentTournament.status = 'finished';
      currentTournament.description = 'Tournament ended (insufficient participants).';
      schedulePersist();
      return;
    }

    currentTournament.status = 'in_progress';
    currentTournament.currentRound = 1;

    const gameType = currentTournament.gameType || 'uno';

    // Distribute participants into dynamic tables (2, 3, 4 players)
    const playerIds = currentTournament.participants.map((p) => p.userId);
    const tables = distributePlayersIntoTables(playerIds);

    currentTournament.matches = tables.map((tablePlayers, idx) => {
      const matchId = `tourn-${currentTournament!.id}-r1-m${idx + 1}`;
      
      const queuePlayers: QueuePlayer[] = tablePlayers.map((pid) => {
        const u = users.get(pid);
        const pObj = currentTournament!.participants.find((p) => p.userId === pid);
        return {
          userId: pid,
          username: u?.telegramUsername || pObj?.username || pid,
          avatarId: pObj?.avatarId || 'rabbit',
          stake: 0,
          mode: 'pvp',
          joinedAt: Date.now(),
        };
      });

      const matchState = createInitialMatchState(queuePlayers);

      const activeMatch: ActiveMatch = {
        matchId,
        mode: 'pvp',
        gameType,
        stake: 0,
        players: queuePlayers,
        createdAt: Date.now(),
        settled: false,
        turnTimeoutSec: 10, // 10s TURN TIMER FOR TOURNAMENTS
        connectionDeadlineAt: Date.now() + 30_000,
        playStartedAt: Date.now(),
        costsCommitted: true,
        gameState: matchState,
        blackjackGameState: gameType === 'blackjack' ? createInitialBlackjackMatchState(queuePlayers, 0) : undefined,
        pokerGameState: gameType === 'poker' ? createInitialPokerMatchState(queuePlayers, 0) : undefined,
      };

      if (activeMatch.blackjackGameState) activeMatch.blackjackGameState.turnStartedAt = Date.now();
      if (activeMatch.pokerGameState) activeMatch.pokerGameState.turnStartedAt = Date.now();

      activeMatches.set(matchId, activeMatch);

      tablePlayers.forEach((pid) => {
        activeMatchByUser.set(pid, matchId);
        const targetChatId = resolveTelegramChatId(pid);
        if (targetChatId) {
          const gameLabel = gameType === 'poker' ? 'Poker Tournament' : gameType === 'blackjack' ? 'Blackjack Tournament' : 'Tournament';
          const tableUrl = buildTelegramMiniAppLink(`tournament_table_${matchId}`);
          sendTelegramMessageSafely(
            targetChatId,
            `🏆 <b>${gameLabel} Started!</b>\nYour table is ready! Tap below to enter match. Timer per turn: 10 seconds.`,
            tableUrl,
            '🎮 Enter Table ➔'
          );
        }
      });

      return {
        matchId,
        round: 1,
        tableIndex: idx + 1,
        playerIds: tablePlayers,
        winnerId: null,
        status: 'in_progress' as const,
      };
    });

    schedulePersist();
  }
}


setInterval(processTournamentTick, 5000);

// Bug #1 fix: continuously tick matchmaking so players pair even if one joined
// after the other's join-triggered tick already ran.
setInterval(() => {
  if (matchmakingQueue.length > 0) {
    runMatchmakingTick();
  }
}, 2000);

function buildTournamentLeaderboard() {
  const winCounts = new Map<string, { userId: string; username: string; avatarId: string; winsCount: number; lastWinAt: number }>();

  const allFinished = [...pastTournaments];
  if (currentTournament && currentTournament.status === 'finished') {
    allFinished.push(currentTournament);
  }

  allFinished.forEach((t) => {
    if (t.winnerUserId) {
      const existing = winCounts.get(t.winnerUserId);
      const rawUsername = (t.winnerName || t.winnerUserId.replace(/^tg:/, '')).replace(/^@/, '');
      const avatarId = t.winnerAvatar || 'rabbit';
      const winTime = t.finishedAt || t.startAt || Date.now();

      if (existing) {
        existing.winsCount += 1;
        if (winTime > existing.lastWinAt) existing.lastWinAt = winTime;
      } else {
        winCounts.set(t.winnerUserId, {
          userId: t.winnerUserId,
          username: rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`,
          avatarId,
          winsCount: 1,
          lastWinAt: winTime,
        });
      }
    }
  });

  return Array.from(winCounts.values()).sort((a, b) => b.winsCount - a.winsCount || b.lastWinAt - a.lastWinAt);
}

app.get('/api/tournaments/current', (req, res) => {
  let authUserId: string | null = null;
  try {
    const telegramInitData = extractTelegramInitData(req);
    const auth = verifyTelegramInitData(telegramInitData);
    if (auth) authUserId = `tg:${auth.id}`;
    else {
      const session = verifySessionToken(extractSessionToken(req));
      if (session) authUserId = session.userId;
    }
  } catch {
    // Ignore
  }

  const leaderboard = buildTournamentLeaderboard();

  if (!currentTournament) {
    return res.json({ tournament: null, history: pastTournaments, leaderboard });
  }

  const isRegistered = authUserId
    ? currentTournament.participants.some((p) => p.userId === authUserId)
    : false;

  return res.json({
    tournament: {
      ...currentTournament,
      isRegistered,
    },
    history: pastTournaments,
    leaderboard,
  });
});

app.post('/api/tournaments/register', requireAuth, rateLimitMiddleware(10, 60000, 'user'), (req, res) => {
  const userId = (req as AuthenticatedRequest).authUserId!;
  const user = users.get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (!currentTournament) {
    return res.status(400).json({ error: 'No active tournament.' });
  }

  if (currentTournament.status !== 'upcoming') {
    return res.status(400).json({ error: 'Tournament registration is closed.' });
  }

  const existingIdx = currentTournament.participants.findIndex((p) => p.userId === userId);
  if (existingIdx >= 0) {
    // Unregister and refund tickets if ticket-based entry
    if (currentTournament.entryTicketCost > 0) {
      user.availableTickets = round2(user.availableTickets + currentTournament.entryTicketCost);
      createLedgerEntry(user, {
        id: `tx-tourn-refund-${Date.now()}`,
        event: 'Tournament Fee Refund',
        value: `+${currentTournament.entryTicketCost.toFixed(2)} TKT`,
        amount: currentTournament.entryTicketCost,
        type: 'stake_release',
      });
    }
    currentTournament.participants.splice(existingIdx, 1);
    schedulePersist({ userId });
    return res.json({ success: true, registered: false, tournament: { ...currentTournament, isRegistered: false }, availableTickets: user.availableTickets });
  }

  if (currentTournament.participants.length >= currentTournament.maxPlayers) {
    return res.status(400).json({ error: 'Tournament is full.' });
  }

  if (currentTournament.entryTicketCost > 0) {
    if (user.availableTickets < currentTournament.entryTicketCost) {
      return res.status(400).json({ error: `Insufficient tickets. Entry requires ${currentTournament.entryTicketCost} TKT.` });
    }
    user.availableTickets = round2(user.availableTickets - currentTournament.entryTicketCost);
    createLedgerEntry(user, {
      id: `tx-tourn-fee-${Date.now()}`,
      event: 'Tournament Entry Fee',
      value: `-${currentTournament.entryTicketCost.toFixed(2)} TKT`,
      amount: -currentTournament.entryTicketCost,
      type: 'stake_hold',
    });
  }


  currentTournament.participants.push({
    userId,
    username: user.telegramUsername || user.telegramFirstName || userId,
    avatarId: 'rabbit',
    registeredAt: Date.now(),
    chatId: user.telegramChatId,
  });

  schedulePersist({ userId });
  return res.json({ success: true, registered: true, tournament: { ...currentTournament, isRegistered: true }, availableTickets: user.availableTickets });
});

app.post('/api/admin/tournaments/create', requireAuth, rateLimitMiddleware(5, 60000, 'user'), (req, res) => {
  const userId = (req as AuthenticatedRequest).authUserId!;
  const user = users.get(userId);
  const username = (user?.telegramUsername || '').replace(/^@/, '').toLowerCase();
  const isAdmin = (ADMIN_API_KEY && req.headers['x-admin-key'] === ADMIN_API_KEY) ||
    userId === `tg:${WITHDRAWAL_OPERATOR_CHAT_ID}` ||
    username === 'allin_gram';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const { title, description, gameType, nftLink, nftImage, startInMinutes, rules, maxPlayers, entryTicketCost, winsRequired } = req.body || {};

  const normalizedGameType: 'uno' | 'poker' | 'blackjack' =
    gameType === 'poker' || gameType === 'blackjack' ? gameType : 'uno';
  const minutes = Number(startInMinutes) || 60;
  const ticketCost = Math.max(0, Number(entryTicketCost) || 0);
  const targetWins = Number(winsRequired) === 2 ? 2 : 1;

  const defaultTitle = normalizedGameType === 'poker'
    ? 'TEXAS HOLD\'EM POKER CHAMPIONSHIP'
    : normalizedGameType === 'blackjack'
    ? 'BLACKJACK GRAND PRIX'
    : 'REDO CARTOON CHAMPIONSHIP';

  const defaultRules = normalizedGameType === 'poker'
    ? '10s turn timer. Texas Hold\'em tables. Last player standing advances.'
    : normalizedGameType === 'blackjack'
    ? '10s turn timer. Blackjack tables. Highest score/chips advances.'
    : '10s turn timer. Single elimination tables.';

  // Preserve registered participants if updating an upcoming tournament
  const existingParticipants = (currentTournament && currentTournament.status === 'upcoming')
    ? currentTournament.participants
    : [];

  const existingMatches = (currentTournament && currentTournament.status === 'upcoming')
    ? currentTournament.matches
    : [];

  const tournamentId = (currentTournament && currentTournament.status === 'upcoming')
    ? currentTournament.id
    : `tourn-${Date.now()}`;

  currentTournament = {
    id: tournamentId,
    title: title || defaultTitle,
    gameType: normalizedGameType,
    description: description || `Official REDO ${normalizedGameType.toUpperCase()} card tournament!`,
    nftLink: nftLink || 'https://getgems.io',
    nftImage: nftImage || '/ayanami-plush.png',
    startAt: Date.now() + minutes * 60 * 1000,
    status: 'upcoming',
    rules: rules || defaultRules,
    maxPlayers: Number(maxPlayers) || 32,
    entryTicketCost: ticketCost,
    winsRequired: targetWins,
    participants: existingParticipants,
    matches: existingMatches,
    currentRound: 1,
    winnerUserId: currentTournament?.winnerUserId || null,
    winnerName: currentTournament?.winnerName || null,
    winnerAvatar: currentTournament?.winnerAvatar || null,
    finishedAt: currentTournament?.finishedAt || null,
    createdAt: currentTournament?.createdAt || Date.now(),
  };

  schedulePersist();
  return res.json({ success: true, tournament: currentTournament });
});

app.post('/api/admin/tournaments/notify', requireAuth, rateLimitMiddleware(3, 60000, 'user'), async (req, res) => {
  const userId = (req as AuthenticatedRequest).authUserId!;
  const user = users.get(userId);
  const username = (user?.telegramUsername || '').replace(/^@/, '').toLowerCase();
  const isAdmin = (ADMIN_API_KEY && req.headers['x-admin-key'] === ADMIN_API_KEY) ||
    userId === `tg:${WITHDRAWAL_OPERATOR_CHAT_ID}` ||
    username === 'allin_gram';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  if (!currentTournament) {
    return res.status(400).json({ error: 'No active or upcoming tournament to notify about.' });
  }

  const tourn = currentTournament;
  const statusLabel = tourn.status === 'upcoming'
    ? `${Math.max(1, Math.round((tourn.startAt - Date.now()) / 60000))} min`
    : tourn.status === 'in_progress'
    ? 'LIVE NOW'
    : 'Completed';

  const gameBadge = tourn.gameType === 'poker'
    ? '♠️ POKER'
    : tourn.gameType === 'blackjack'
    ? '🃏 BLACKJACK'
    : '🎮 UNO';

  const text = [
    `🏆 <b>REDOapp ${gameBadge} TOURNAMENT</b>`,
    ``,
    `📌 <b>${tourn.title}</b>`,
    `🎲 <b>Game:</b> ${gameBadge}`,
    `💰 <b>Entry Fee:</b> ${tourn.entryTicketCost > 0 ? `${tourn.entryTicketCost} TKT` : 'FREE ENTRY'}`,
    `🎁 <b>Prize:</b> ${tourn.nftLink}`,
    `⏳ <b>Starts in:</b> ${statusLabel}`,
    ``,
    `Open REDO app to join! 🎮`,
  ].join('\n');

  let notifiedCount = 0;
  const eligibleUsers = Array.from(users.values()).filter((u) => u.telegramChatId);

  const tournamentsUrl = buildTelegramMiniAppLink('tournaments');

  for (const u of eligibleUsers) {
    if (u.telegramChatId) {
      sendTelegramMessageSafely(
        u.telegramChatId,
        text,
        tournamentsUrl,
        '🏆 Tournaments ➔'
      );
      notifiedCount++;
    }
  }

  return res.json({
    success: true,
    notifiedCount,
    totalUsers: eligibleUsers.length,
    message: `Tournament announcement sent to ${notifiedCount} Telegram user(s).`,
  });
});

app.post('/api/admin/tournaments/simulate', requireAuth, rateLimitMiddleware(5, 60000, 'user'), async (req, res) => {
  const userId = (req as AuthenticatedRequest).authUserId!;
  const user = users.get(userId);
  const username = (user?.telegramUsername || '').replace(/^@/, '').toLowerCase();
  const isAdmin = (ADMIN_API_KEY && req.headers['x-admin-key'] === ADMIN_API_KEY) ||
    userId === `tg:${WITHDRAWAL_OPERATOR_CHAT_ID}` ||
    username === 'allin_gram';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const { title, description, gameType, nftLink, nftImage, startInMinutes, rules, maxPlayers, entryTicketCost, winsRequired, playerCount } = req.body || {};

  const simGameType: 'uno' | 'poker' | 'blackjack' =
    gameType === 'poker' || gameType === 'blackjack'
      ? gameType
      : (currentTournament?.gameType || 'uno');

  const defaultSimTitle = simGameType === 'poker'
    ? `REDO POKER CHAMPIONSHIP (${Number(playerCount) || Number(maxPlayers) || 16} PLAYERS)`
    : simGameType === 'blackjack'
    ? `REDO BLACKJACK GRAND PRIX (${Number(playerCount) || Number(maxPlayers) || 16} PLAYERS)`
    : `REDO CHAMPIONSHIP (${Number(playerCount) || Number(maxPlayers) || 16} PLAYERS)`;

  const totalSimPlayers = Math.max(4, Math.min(64, Number(playerCount) || Number(maxPlayers) || 16));
  const simWinsRequired = Number(winsRequired) === 2 ? 2 : (currentTournament?.winsRequired || 1);
  const simTitle = title || currentTournament?.title || defaultSimTitle;
  const simNftLink = nftLink || currentTournament?.nftLink || 'https://getgems.io';
  const simNftImage = nftImage || currentTournament?.nftImage || '/ayanami-plush.png';
  const simDescription = description || currentTournament?.description || `Official REDO ${simGameType.toUpperCase()} tournament!`;
  const simMinutes = Number(startInMinutes) || 60;
  const simTicketCost = entryTicketCost !== undefined ? Math.max(0, Number(entryTicketCost) || 0) : (currentTournament?.entryTicketCost || 0);
  const simRules = rules || currentTournament?.rules || (simWinsRequired === 2 ? 'First to 2 Wins (Best of 3)' : '10s turn timer. Single elimination tables.');

  const avatars = ['rabbit', 'fox', 'cat', 'bear', 'koala', 'panda', 'tiger', 'penguin'];
  const botNames = ['cyber_fox', 'lunar_cat', 'astro_bear', 'pixel_king', 'unomaster', 'card_shark', 'hyper_koala', 'turbo_rabbit', 'shadow_ninja', 'blaze_lion', 'storm_hawk', 'cosmic_wolf', 'alpha_bot', 'apex_predator', 'mystic_owl', 'vortex_panther', 'phantom_viper', 'neon_dragon', 'quantum_lynx', 'starlight_deer', 'thunder_puma', 'glitch_raccoon', 'solar_falcon', 'zen_shiba', 'frost_polar', 'sky_eagle', 'fire_phoenix', 'iron_rhino', 'swift_cheetah', 'golden_swan', 'silent_lynx'];

  const simParticipants: TournamentParticipant[] = [
    {
      userId: userId,
      username: user?.telegramUsername ? `@${user.telegramUsername.replace(/^@/, '')}` : (user?.telegramFirstName || userId.replace(/^tg:/, '')),
      avatarId: 'rabbit',
      registeredAt: Date.now(),
      chatId: user?.telegramChatId,
    },
  ];

  for (let i = 1; i < totalSimPlayers; i++) {
    const name = botNames[(i - 1) % botNames.length];
    const avatar = avatars[(i - 1) % avatars.length];
    simParticipants.push({
      userId: `sim-user-${i}`,
      username: `@${name}_${i}`,
      avatarId: avatar,
      registeredAt: Date.now() + i,
    });
  }

  // 1. Create simulated tournament
  const tournamentId = `tourn-sim-${Date.now()}`;
  currentTournament = {
    id: tournamentId,
    title: simTitle,
    gameType: simGameType,
    description: simDescription,
    nftLink: simNftLink,
    nftImage: simNftImage,
    startAt: Date.now() + 2000,
    status: 'upcoming',
    rules: simRules,
    maxPlayers: totalSimPlayers,
    entryTicketCost: simTicketCost,
    winsRequired: simWinsRequired,
    participants: simParticipants,
    matches: [],
    currentRound: 1,
    winnerUserId: null,
    winnerName: null,
    winnerAvatar: null,
    finishedAt: null,
    createdAt: Date.now(),
  };

  const adminChatId = resolveTelegramChatId(userId);
  if (adminChatId) {
    const gameBadge = simGameType === 'poker' ? '♠️ POKER' : simGameType === 'blackjack' ? '🃏 BLACKJACK' : '🎮 UNO';
    const simNoticeText = [
      `🏆 <b>REDOapp ${gameBadge} TOURNAMENT SIMULATION</b>`,
      ``,
      `📌 <b>${simTitle}</b>`,
      `🎲 <b>Game:</b> ${gameBadge}`,
      `👥 <b>Participants:</b> ${totalSimPlayers} players`,
      `💰 <b>Entry Fee:</b> ${simTicketCost > 0 ? `${simTicketCost} TKT` : 'FREE ENTRY'}`,
      `🎁 <b>Prize:</b> ${simNftLink}`,
      `⏳ <b>Starts in:</b> ${simMinutes} min (Simulation)`,
      ``,
      `Open REDO app to join! 🎮`,
    ].join('\n');

    const tournamentsUrl = buildTelegramMiniAppLink('tournaments');
    sendTelegramMessageSafely(
      adminChatId,
      simNoticeText,
      tournamentsUrl,
      '🏆 Tournaments ➔'
    );
  }

  // 2. Start Round 1
  currentTournament.status = 'in_progress';
  currentTournament.currentRound = 1;
  const playerIds = currentTournament.participants.map((p) => p.userId);
  const tables = distributePlayersIntoTables(playerIds);

  currentTournament.matches = tables.map((tablePlayers, idx) => {
    const matchId = `tourn-${tournamentId}-r1-m${idx + 1}`;
    
    tablePlayers.forEach((pid) => {
      activeMatchByUser.set(pid, matchId);
      const targetChatId = resolveTelegramChatId(pid);
      if (targetChatId) {
        const tableUrl = buildTelegramMiniAppLink(`tournament_table_${matchId}`);
        sendTelegramMessageSafely(
          targetChatId,
          `🏆 <b>Tournament Started!</b>\nYour table is ready! Tap below to enter match.`,
          tableUrl
        );
      }
    });

    return {
      matchId,
      round: 1,
      tableIndex: idx + 1,
      playerIds: tablePlayers,
      winnerId: null,
      status: 'in_progress' as const,
    };
  });

  // 3. Loop through rounds and simulate table wins until tournament is finished
  let safetyLoopCounter = 0;
  while (currentTournament && currentTournament.status === 'in_progress' && safetyLoopCounter < 10) {
    safetyLoopCounter++;
    const activeRound = currentTournament.currentRound;
    const roundMatches = currentTournament.matches.filter((m) => m.round === activeRound && m.status !== 'completed');

    if (roundMatches.length === 0) break;

    // Simulate completion for all matches in the current round
    roundMatches.forEach((match) => {
      const adminInTable = match.playerIds.find((pid) => pid === userId);
      const winnerId = adminInTable || match.playerIds[0];
      match.status = 'completed';
      match.winnerId = winnerId;
      match.playerWins = { [winnerId]: simWinsRequired };
    });

    // Advance to next round or finish tournament
    evaluateTournamentProgression();
  }

  if (currentTournament) {
    currentTournament.participants.forEach((p) => {
      activeMatchByUser.delete(p.userId);
    });
  }

  schedulePersist();
  return res.json({
    success: true,
    tournament: currentTournament ? { ...currentTournament, isRegistered: true } : null,
    history: pastTournaments,
  });
});


app.use('/api/tickets', requireAuth, rateLimitMiddleware(30, 60000, 'user'));

ticketingService.registerRoutes(app);

app.get('/api/admin/withdrawals/:requestId/complete', async (req, res) => {
  const requestId = String(req.params.requestId || '');
  if (!verifyWithdrawalOperatorToken('complete', requestId, req.query.token)) {
    return res.status(403).send('Invalid or expired withdrawal operator link.');
  }
  // The link is only a short-lived confirmation page; the state change requires POST.
  return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Verify withdrawal</title><form method="post" action="/api/admin/withdrawals/${encodeURIComponent(requestId)}/complete"><input type="hidden" name="token" value="${String(req.query.token).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><button type="submit">Verify TON payment on blockchain</button></form>`);

  const request = withdrawalRequests.get(requestId);
  if (!request) {
    return res.status(404).send('Withdrawal request not found.');
  }
  if (request.status === 'completed') {
    return res.send(`Withdrawal ${request.id} is already completed.`);
  }
  if (request.status === 'rejected') {
    return res.status(400).send(`Withdrawal ${request.id} was already rejected.`);
  }

  request.status = 'completed';
  request.completedAt = Date.now();
  const txHash = typeof req.query.txHash === 'string' ? String(req.query.txHash) : '';
  request.completedTxHash = txHash.trim()
    ? txHash.trim()
    : null;
  schedulePersist({ withdrawalId: request.id, userId: request.userId });

  const user = getUser(request.userId, request.walletAddress);
  createLedgerEntry(user, {
    event: 'Withdrawal Completed',
    value: `${request.ticketAmount.toFixed(2)} TKT`,
    type: 'withdraw_completed',
    amount: request.ticketAmount,
  });
  await persistStateNow();

  return res.send(`Withdrawal ${request.id} marked completed. Sent ${request.tonAmount.toFixed(2)} TON to ${request.walletAddress}.`);
});

app.get('/api/admin/withdrawals/:requestId/reject', async (req, res) => {
  const requestId = String(req.params.requestId || '');
  if (!verifyWithdrawalOperatorToken('reject', requestId, req.query.token)) {
    return res.status(403).send('Invalid or expired withdrawal operator link.');
  }
  // The link is only a short-lived confirmation page; the state change requires POST.
  return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Reject withdrawal</title><form method="post" action="/api/admin/withdrawals/${encodeURIComponent(requestId)}/reject"><input type="hidden" name="token" value="${String(req.query.token).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><button type="submit">Reject withdrawal and refund tickets</button></form>`);

  const request = withdrawalRequests.get(requestId);
  if (!request) {
    return res.status(404).send('Withdrawal request not found.');
  }
  if (request.status === 'completed') {
    return res.status(400).send(`Withdrawal ${request.id} is already completed and cannot be rejected.`);
  }
  if (request.status === 'rejected') {
    return res.send(`Withdrawal ${request.id} is already rejected.`);
  }

  request.status = 'rejected';
  const user = getUser(request.userId, request.walletAddress);
  user.availableTickets = round2(user.availableTickets + request.ticketAmount);
  schedulePersist({ withdrawalId: request.id, userId: request.userId });
  createLedgerEntry(user, {
    event: 'Withdrawal Rejected',
    value: `+${request.ticketAmount.toFixed(2)} TKT`,
    type: 'withdraw_rejected',
    amount: request.ticketAmount,
  });
  await persistStateNow();

  return res.send(`Withdrawal ${request.id} rejected and ${request.ticketAmount.toFixed(2)} TKT refunded.`);
});

app.post('/api/admin/withdrawals/:requestId/complete', async (req, res) => {
  const requestId = String(req.params.requestId || '');
  if (!verifyWithdrawalOperatorToken('complete', requestId, req.body?.token)) return res.status(403).send('Invalid or expired withdrawal operator link.');
  const request = withdrawalRequests.get(requestId);
  if (!request) return res.status(404).send('Withdrawal request not found.');
  if (request.status === 'rejected') return res.status(400).send('Withdrawal was cancelled or expired. Do not send it.');
  if (request.status === 'completed') return res.send(`Withdrawal ${request.id} is already verified on-chain.`);
  await ticketingService.recheckPendingWithdrawals(0);
  const verifiedRequest = withdrawalRequests.get(requestId);
  if (verifiedRequest?.status !== 'completed') {
    return res.status(409).send('The matching TON transaction is not indexed yet. Wait a few seconds and retry verification.');
  }
  consumeWithdrawalOperatorToken('complete', requestId, req.body?.token);
  await persistStateNow();
  return res.send(`Withdrawal ${request.id} verified on-chain and marked completed.`);
});

app.post('/api/admin/withdrawals/:requestId/reject', async (req, res) => {
  const requestId = String(req.params.requestId || '');
  if (!consumeWithdrawalOperatorToken('reject', requestId, req.body?.token)) return res.status(403).send('Invalid or expired withdrawal operator link.');
  const request = withdrawalRequests.get(requestId);
  if (!request || request.status !== 'pending') return res.status(400).send('Withdrawal cannot be rejected.');
  request.status = 'rejected';
  const user = getUser(request.userId, request.walletAddress);
  user.availableTickets = round2(user.availableTickets + request.ticketAmount);
  schedulePersist({ withdrawalId: request.id, userId: request.userId });
  createLedgerEntry(user, { event: 'Withdrawal Rejected', value: `+${request.ticketAmount.toFixed(2)} TKT`, type: 'withdraw_rejected', amount: request.ticketAmount });
  await persistStateNow();
  return res.send(`Withdrawal ${request.id} rejected and refunded.`);
});

app.get('/api/admin/users/lookup', requireAuth, rateLimitMiddleware(20, 60000, 'user'), (req: AuthenticatedRequest, res) => {
  const requesterId = getAuthenticatedUserId(req);
  const requesterUser = users.get(requesterId);
  const username = (requesterUser?.telegramUsername || '').replace(/^@/, '').toLowerCase();
  const isAdmin = (ADMIN_API_KEY && req.headers['x-admin-key'] === ADMIN_API_KEY) ||
    (ADMIN_API_KEY && req.headers['x-admin-api-key'] === ADMIN_API_KEY) ||
    requesterId === `tg:${WITHDRAWAL_OPERATOR_CHAT_ID}` ||
    username === 'allin_gram';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const user = findUserByUsernameOrId(query);
  if (!user) {
    return res.status(404).json({ error: `User '${query}' not found.` });
  }

  const userDeposits = Array.from(depositIntents.values()).filter((d) => d.userId === user.userId);
  const userWithdrawals = Array.from(withdrawalRequests.values()).filter((w) => w.userId === user.userId);

  return res.json({
    userId: user.userId,
    telegramUsername: user.telegramUsername || null,
    walletAddress: user.walletAddress || null,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    xp: user.xp,
    energy: getEnergyState(user),
    transactions: user.transactions,
    deposits: userDeposits,
    withdrawals: userWithdrawals,
  });
});

app.post('/api/admin/users/adjust-balance', requireAuth, rateLimitMiddleware(10, 60000, 'user'), async (req: AuthenticatedRequest, res) => {
  const requesterId = getAuthenticatedUserId(req);
  const requesterUser = users.get(requesterId);
  const username = (requesterUser?.telegramUsername || '').replace(/^@/, '').toLowerCase();
  const isAdmin = (ADMIN_API_KEY && req.headers['x-admin-key'] === ADMIN_API_KEY) ||
    (ADMIN_API_KEY && req.headers['x-admin-api-key'] === ADMIN_API_KEY) ||
    requesterId === `tg:${WITHDRAWAL_OPERATOR_CHAT_ID}` ||
    username === 'allin_gram';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const { targetUserId, username: targetUsername, amount, mode, reason } = req.body || {};
  let user: UserState | undefined;
  if (targetUsername) {
    user = findUserByUsernameOrId(targetUsername);
  } else if (targetUserId) {
    user = findUserByUsernameOrId(targetUserId) || getUser(String(targetUserId).trim());
  } else {
    user = requesterUser;
  }

  const delta = Number(amount);
  if (!user || !Number.isFinite(delta)) {
    return res.status(400).json({ error: 'Adjustment requires a valid target user and numeric amount.' });
  }

  if (mode === 'set') {
    user.availableTickets = round2(Math.max(0, delta));
  } else {
    user.availableTickets = round2(Math.max(0, user.availableTickets + delta));
  }

  createLedgerEntry(user, {
    event: reason ? `Admin Adjustment: ${reason}` : 'Admin Ticket Adjustment',
    value: `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} TKT`,
    type: delta >= 0 ? 'reward' : 'fund_burn',
    amount: delta,
  });

  schedulePersist({ userId: user.userId });
  await persistStateNow();

  return res.json({
    success: true,
    userId: user.userId,
    telegramUsername: user.telegramUsername || null,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
  });
});

app.post('/api/admin/referrals/reconcile', requireAuth, rateLimitMiddleware(5, 60000, 'user'), async (req: AuthenticatedRequest, res) => {
  const requesterId = getAuthenticatedUserId(req);
  const requesterUser = users.get(requesterId);
  const username = (requesterUser?.telegramUsername || '').replace(/^@/, '').toLowerCase();
  const isAdmin = (ADMIN_API_KEY && req.headers['x-admin-key'] === ADMIN_API_KEY) ||
    (ADMIN_API_KEY && req.headers['x-admin-api-key'] === ADMIN_API_KEY) ||
    requesterId === `tg:${WITHDRAWAL_OPERATOR_CHAT_ID}` ||
    username === 'allin_gram';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const count = reconcileReferralStatuses();
  await persistStateNow();
  return res.json({ success: true, reconciledCount: count });
});

app.post('/api/admin/users/restore-balances', requireAuth, rateLimitMiddleware(5, 60000, 'user'), async (req: AuthenticatedRequest, res) => {
  const requesterId = getAuthenticatedUserId(req);
  const requesterUser = users.get(requesterId);
  const username = (requesterUser?.telegramUsername || '').replace(/^@/, '').toLowerCase();
  const isAdmin = (ADMIN_API_KEY && req.headers['x-admin-key'] === ADMIN_API_KEY) ||
    (ADMIN_API_KEY && req.headers['x-admin-api-key'] === ADMIN_API_KEY) ||
    requesterId === `tg:${WITHDRAWAL_OPERATOR_CHAT_ID}` ||
    username === 'allin_gram';

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  let restoredUsers = 0;
  users.forEach((user) => {
    if (reconcileStuckUserBalances(user)) {
      schedulePersist({ userId: user.userId });
      restoredUsers++;
    }
  });

  await persistStateNow();

  return res.json({
    success: true,
    totalUsers: users.size,
    restoredUsers,
    message: `Audited and restored balances for ${restoredUsers} user(s) out of ${users.size} total.`,
  });
});


function sendMatchmakerJoinSuccess(req: Request, res: Response, payload: Record<string, unknown>) {
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  if (input?.responseMode === 'iframe') {
    const parentOrigin = typeof input.parentOrigin === 'string' && /^https?:\/\/[^/]+$/i.test(input.parentOrigin)
      ? input.parentOrigin
      : '';
    if (!parentOrigin) return res.status(400).json({ error: 'Invalid bridge origin.' });
    const message = JSON.stringify({
      source: 'redoapp-matchmaker-bridge',
      requestId: String(input.bridgeRequestId || ''),
      payload,
    }).replace(/</g, '\\u003c');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'");
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><script>parent.postMessage(${message}, ${JSON.stringify(parentOrigin)})</script>`);
  }
  return res.json(payload);
}

function sendMatchmakerStatusSuccess(req: Request, res: Response, payload: object) {
  const input = req.query as Record<string, unknown>;
  // Status is user-specific and changes from searching to ready without the
  // URL changing. Prevent Render's static rewrite/CDN and embedded WebViews
  // from reusing an earlier queue response.
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (input.responseMode === 'script') {
    const callback = typeof input.callback === 'string' ? input.callback : '';
    if (!/^__redoappQueue_[A-Za-z0-9_]+$/.test(callback)) {
      return res.status(400).json({ error: 'Invalid matchmaking callback.' });
    }
    const serializedPayload = JSON.stringify(payload).replace(/</g, '\\u003c');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.type('application/javascript').send(
      `window[${JSON.stringify(callback)}](${serializedPayload});`
    );
  }
  if (input.responseMode === 'iframe') {
    const parentOrigin = typeof input.parentOrigin === 'string' && /^https?:\/\/[^/]+$/i.test(input.parentOrigin)
      ? input.parentOrigin
      : '';
    if (!parentOrigin) return res.status(400).json({ error: 'Invalid bridge origin.' });
    const message = JSON.stringify({
      source: 'redoapp-matchmaker-status-bridge',
      requestId: String(input.bridgeRequestId || ''),
      payload,
    }).replace(/</g, '\\u003c');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'");
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><script>parent.postMessage(${message}, ${JSON.stringify(parentOrigin)})</script>`);
  }
  return res.json(payload);
}

function sendMatchmakerWatchPage(req: Request, res: Response) {
  const input = req.query as Record<string, unknown>;
  const parentOrigin = typeof input.parentOrigin === 'string' && /^https?:\/\/[^/]+$/i.test(input.parentOrigin)
    ? input.parentOrigin
    : '';
  const bridgeRequestId = typeof input.bridgeRequestId === 'string' && /^queue-watch-[A-Za-z0-9_-]+$/.test(input.bridgeRequestId)
    ? input.bridgeRequestId
    : '';
  if (!parentOrigin || !bridgeRequestId) {
    return res.status(400).json({ error: 'Invalid matchmaking watch bridge.' });
  }

  const serializedParentOrigin = JSON.stringify(parentOrigin);
  const serializedRequestId = JSON.stringify(bridgeRequestId).replace(/</g, '\\u003c');
  res.removeHeader('X-Frame-Options');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors *; base-uri 'none'"
  );
  return res.type('html').send(`<!doctype html>
<meta charset="utf-8">
<script>
(() => {
  const parentOrigin = ${serializedParentOrigin};
  const requestId = ${serializedRequestId};
  const auth = new URLSearchParams(location.search);
  auth.delete('parentOrigin');
  auth.delete('bridgeRequestId');
  const query = auth.toString();
  const post = (payload) => parent.postMessage({
    source: 'redoapp-matchmaker-watch-bridge',
    requestId,
    payload
  }, parentOrigin);
  let pollInFlight = false;
  let lastStreamMessageAt = 0;
  const poll = async () => {
    if (pollInFlight || (lastStreamMessageAt && Date.now() - lastStreamMessageAt < 3000)) return;
    pollInFlight = true;
    try {
      const response = await fetch('/api/matchmaker/status?' + query, {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (response.ok) post(await response.json());
    } catch {}
    finally { pollInFlight = false; }
  };
  try {
    const stream = new EventSource('/api/matchmaker/stream?' + query);
    stream.addEventListener('queue-status', (event) => {
      lastStreamMessageAt = Date.now();
      try { post(JSON.parse(event.data)); } catch {}
    });
    stream.onerror = () => {
      lastStreamMessageAt = 0;
      poll();
    };
  } catch {}
  poll();
  setInterval(poll, 1500);
})();
</script>`);
}

function handleMatchmakerJoin(req: AuthenticatedRequest, res: Response) {
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  const { username, avatarId, stake, mode, walletAddress, gameType: rawGameType } = input as {
    username: string;
    avatarId: string;
    stake: number;
    mode: MatchMode;
    walletAddress?: string;
    gameType?: 'uno' | 'poker' | 'blackjack';
  };
  const gameType: 'uno' | 'poker' | 'blackjack' = rawGameType || 'uno';
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
  recalculateEnergy(user);
  // Remove a previous timed-out queue before considering this new request.
  // This keeps stale persisted entries from being revived by a late player.
  expireTimedOutMatchmakingPlayers();
  const forceFresh = Boolean(input.forceFresh);
  const activeMatchId = activeMatchByUser.get(userId);
  const existingActiveMatch = activeMatchId ? activeMatches.get(activeMatchId) : null;
  const isGameOver = !existingActiveMatch || existingActiveMatch.settled || (
    existingActiveMatch.gameType === 'poker' ? existingActiveMatch.pokerGameState?.stage === 'match_ended' :
    existingActiveMatch.gameType === 'blackjack' ? existingActiveMatch.blackjackGameState?.stage === 'match_ended' :
    existingActiveMatch.gameState.phase === 'game_over'
  );
  const isDifferentGame = existingActiveMatch && (existingActiveMatch.gameType || 'uno') !== gameType;
  const isStaleMatch = existingActiveMatch && (Date.now() - (existingActiveMatch.playStartedAt || existingActiveMatch.createdAt || Date.now()) > 600_000);
  // Bug #6 fix: 90s instead of 30s — Render cold starts + Telegram WebView
  // reconnects can take up to 40s; 30s was too aggressive and caused players
  // who briefly lost connection to lose their match slot.
  const isUnstartedAbandoned = existingActiveMatch && !existingActiveMatch.playStartedAt && (Date.now() - existingActiveMatch.createdAt > 90_000);

  if (existingActiveMatch && !isGameOver && !isStaleMatch && !isDifferentGame && !isUnstartedAbandoned && !forceFresh) {
    markMatchPlayerConnected(existingActiveMatch, userId);
    return sendMatchmakerJoinSuccess(req, res, {
      success: true,
      availableTickets: user.availableTickets,
      heldTickets: user.heldTickets,
      energy: getEnergyState(user),
      matchmaker: tryActivateQueuedMatch(userId),
      replayed: true,
    });
  } else if (activeMatchId && (isGameOver || isStaleMatch || isDifferentGame || isUnstartedAbandoned || forceFresh)) {
    activeMatchByUser.delete(userId);
  }
  const existingQueuedPlayer = matchmakingQueue.find((player) => isSameUser(player.userId, userId));
  if (!forceFresh && existingQueuedPlayer && existingQueuedPlayer.stake === stakeAmount && existingQueuedPlayer.mode === mode && (existingQueuedPlayer.gameType || 'uno') === gameType) {
    return sendMatchmakerJoinSuccess(req, res, {
      success: true,
      availableTickets: user.availableTickets,
      heldTickets: user.heldTickets,
      energy: getEnergyState(user),
      matchmaker: tryActivateQueuedMatch(userId),
      replayed: true,
    });
  }
  if (stakeAmount > 0 && user.availableTickets < stakeAmount) {
    return res.status(400).json({
      error: 'Insufficient available tickets for stake.',
      availableTickets: user.availableTickets,
      heldTickets: user.heldTickets,
      energy: getEnergyState(user),
    });
  }
  if (user.energy < energyCost) {
    return res.status(400).json({
      error: `Not enough energy. Free match requires ${energyCost} energy.`,
      availableTickets: user.availableTickets,
      heldTickets: user.heldTickets,
      energy: getEnergyState(user),
    });
  }

  const activeTimer = matchmakerCleanupTimers.get(userId);
  if (activeTimer) {
    clearTimeout(activeTimer);
    matchmakerCleanupTimers.delete(userId);
  }

  const oldQueuedPlayer = matchmakingQueue.find(p => isSameUser(p.userId, userId));
  if (oldQueuedPlayer && oldQueuedPlayer.stake > 0 && oldQueuedPlayer.costsCommitted === 'held') {
    user.heldTickets = round2(Math.max(0, user.heldTickets - oldQueuedPlayer.stake));
    user.availableTickets = round2(user.availableTickets + oldQueuedPlayer.stake);
  }

  matchmakingQueue = matchmakingQueue.filter(p => !isSameUser(p.userId, userId));
  user.matchmakingFailureAt = null;
  user.matchmakingFailureReason = null;

  // Dynamic table fill: If a public match is already active/waiting with open seats (< MAX players)
  // Bug #5 fix: only join truly unstarted matches (playStartedAt === null) to avoid
  // mid-game intrusions. The old condition also admitted already-started bot matches
  // within 20s which caused state corruption. Now we accept any unstarted pvp match
  // that still has open player slots.
  const openActiveMatch = Array.from(activeMatches.values()).find(
    (m) => m.mode === 'pvp' &&
      (m.gameType || 'uno') === gameType &&
      m.stake === stakeAmount &&
      !m.settled &&
      !m.playStartedAt &&
      m.players.length < MAX_MATCH_PLAYERS &&
      !m.players.some((p) => isSameUser(p.userId, userId))
  );

  if (openActiveMatch) {
    if (stakeAmount > 0) {
      user.availableTickets = round2(user.availableTickets - stakeAmount);
      user.heldTickets = round2(user.heldTickets + stakeAmount);
    }
    if (user.energy >= energyCost) {
      spendEnergy(user, energyCost, stakeAmount === 0 ? 'Free Public Match Energy' : 'Online Match Energy');
    }

    const newPlayer: QueuePlayer = {
      userId,
      username,
      avatarId,
      stake: stakeAmount,
      mode,
      gameType,
      joinedAt: Date.now(),
      costsCommitted: true,
    };

    openActiveMatch.players.push(newPlayer);
    activeMatchByUser.set(userId, openActiveMatch.matchId);

    const state = ensureServerDeck(openActiveMatch.gameState, 7);
    const startingHand = state.deck.splice(0, 7);
    openActiveMatch.gameState = state;
    openActiveMatch.gameState.players.push({
      userId,
      username,
      avatarId,
      hand: startingHand,
      isAi: false,
      isConnected: true,
      hasConnected: true,
      lastSeenAt: Date.now(),
      disconnectedAt: null,
      unoDeclared: false,
      emotion: 'happy',
    });

    if (openActiveMatch.pokerGameState) {
      if (openActiveMatch.pokerGameState.deck.length < 5) {
        openActiveMatch.pokerGameState.deck = generateServerPokerDeck();
      }
      const c1 = openActiveMatch.pokerGameState.deck.pop()!;
      const c2 = openActiveMatch.pokerGameState.deck.pop()!;
      const STARTING_CHIPS = 100;
      openActiveMatch.pokerGameState.players.push({
        userId,
        username,
        avatarId,
        isAi: false,
        isConnected: true,
        hasConnected: true,
        lastSeenAt: Date.now(),
        disconnectedAt: null,
        chips: STARTING_CHIPS,
        currentBet: 0,
        totalMatchInvested: 0,
        holeCards: [c1, c2],
        folded: false,
        isAllIn: false,
        hasActedThisStage: false,
        eliminated: false,
      });
      openActiveMatch.pokerGameState.logs = [
        createServerLog(`👋 ${username} joined the Poker table! (${openActiveMatch.players.length}/4)`, 'info'),
        ...openActiveMatch.pokerGameState.logs,
      ].slice(0, 50);
    }

    if (openActiveMatch.blackjackGameState) {
      if (openActiveMatch.blackjackGameState.shoe.length < 5) {
        openActiveMatch.blackjackGameState.shoe = generateServerBlackjackShoe(4);
      }
      const c1 = openActiveMatch.blackjackGameState.shoe.pop()!;
      const c2 = openActiveMatch.blackjackGameState.shoe.pop()!;
      const pEval = evaluateServerBlackjackHand([c1, c2]);
      const initialBet = 10;
      openActiveMatch.blackjackGameState.players.push({
        userId,
        username,
        avatarId,
        isAi: false,
        isConnected: true,
        hasConnected: true,
        lastSeenAt: Date.now(),
        disconnectedAt: null,
        cards: [c1, c2],
        bet: initialBet,
        chips: 100 - initialBet,
        score: pEval.score,
        isSoft: pEval.isSoft,
        isBusted: false,
        hasBlackjack: pEval.hasBlackjack,
        status: pEval.hasBlackjack ? 'blackjack' : 'playing',
        wins: 0,
        eliminated: false,
      });
      openActiveMatch.blackjackGameState.pot = initialBet * openActiveMatch.blackjackGameState.players.length;
      openActiveMatch.blackjackGameState.logs = [
        createServerLog(`👋 ${username} joined the Blackjack table! (${openActiveMatch.players.length}/4)`, 'info'),
        ...openActiveMatch.blackjackGameState.logs,
      ].slice(0, 50);
    }

    openActiveMatch.gameState.logs = [
      createServerLog(`👋 ${username} joined the public table! (${openActiveMatch.players.length}/4)`, 'info'),
      ...openActiveMatch.gameState.logs,
    ].slice(0, 50);

    schedulePersist({ userId });
    schedulePersist({ matchId: openActiveMatch.matchId });
    broadcastMatch(openActiveMatch.matchId);

    if (openActiveMatch.players.length >= 4) {
      maybeStartPublicMatch(openActiveMatch);
    }

    return sendMatchmakerJoinSuccess(req, res, {
      success: true,
      availableTickets: user.availableTickets,
      heldTickets: user.heldTickets,
      energy: getEnergyState(user),
      matchmaker: tryActivateQueuedMatch(userId),
    });
  }

  if (stakeAmount > 0) {
    user.availableTickets = round2(user.availableTickets - stakeAmount);
    user.heldTickets = round2(user.heldTickets + stakeAmount);
  }

  matchmakingQueue.push({
    userId,
    username,
    avatarId,
    stake: stakeAmount,
    mode,
    gameType,
    joinedAt: Date.now(),
    costsCommitted: stakeAmount > 0 ? 'held' : false,
  });

  runMatchmakingTick();

  matchmakingQueue
    .filter(p => p.stake === stakeAmount && p.mode === mode && (p.gameType || 'uno') === gameType)
    .forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
  schedulePersist({ userId });

  const queueStatus = tryActivateQueuedMatch(userId);

  return sendMatchmakerJoinSuccess(req, res, {
    success: true,
    queueLength: matchmakingQueue.filter(p => p.stake === stakeAmount && p.mode === mode && (p.gameType || 'uno') === gameType).length,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
    matchmaker: queueStatus,
  });
}

app.post('/api/matchmaker/join', requireAuth, rateLimitMiddleware(60, 60000, 'user'), handleMatchmakerJoin);
// Telegram WebViews can leave a cross-origin JSON POST pending indefinitely.
// This idempotent iframe route avoids the preflight and reports the canonical
// queue state to the parent window, just like private-room creation does.
app.get('/api/matchmaker/join-beacon', requireAuth, rateLimitMiddleware(60, 60000, 'user'), handleMatchmakerJoin);

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
    let hasActiveSubs = false;
    for (const [subUid, subs] of queueSubscribers.entries()) {
      if (isSameUser(subUid, userId) && subs.size > 0) {
        hasActiveSubs = true;
        break;
      }
    }
    if (!hasActiveSubs) {
      if (!matchmakerCleanupTimers.has(userId)) {
        const timer = setTimeout(() => {
          matchmakerCleanupTimers.delete(userId);
          let stillNoSubs = true;
          for (const [subUid, subs] of queueSubscribers.entries()) {
            if (isSameUser(subUid, userId) && subs.size > 0) {
              stillNoSubs = false;
              break;
            }
          }
          const player = matchmakingQueue.find(p => isSameUser(p.userId, userId));
          if (stillNoSubs && player) {
            if (player.stake > 0 && player.costsCommitted === 'held') {
              const u = users.get(userId) || (Array.from(users.entries()).find(([uId]) => isSameUser(uId, userId))?.[1]);
              if (u) {
                u.heldTickets = round2(Math.max(0, u.heldTickets - player.stake));
                u.availableTickets = round2(u.availableTickets + player.stake);
              }
            }
            matchmakingQueue = matchmakingQueue.filter(p => !isSameUser(p.userId, userId));
            schedulePersist();
            matchmakingQueue
              .filter(p => p.stake === player.stake && p.mode === player.mode)
              .forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
          }
        }, 60000); // survive Telegram WebView reloads and slow backend wake-ups
        matchmakerCleanupTimers.set(userId, timer);
      }
    }
  });
});

function handleMatchmakerStatus(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req);
  expireTimedOutMatchmakingPlayers();

  const activeTimer = matchmakerCleanupTimers.get(userId);
  if (activeTimer) {
    clearTimeout(activeTimer);
    matchmakerCleanupTimers.delete(userId);
  }

  const payload = tryActivateQueuedMatch(userId) || { status: 'idle' };
  return sendMatchmakerStatusSuccess(req, res, payload);
}

app.get('/api/matchmaker/status', requireAuth, handleMatchmakerStatus);
// Same queue truth as /status, but delivered without a credentialed CORS
// preflight so a Telegram WebView cannot miss the ready transition.
app.get('/api/matchmaker/status-beacon', requireAuth, handleMatchmakerStatus);

// A finite server-side wait is the most reliable ready signal for Telegram
// iOS/iMe WebViews. Unlike SSE through a Static Site rewrite, this request
// completes normally as soon as the authoritative matchId exists, so neither
// CDN streaming behaviour nor throttled client polling can hide the table.
app.get('/api/matchmaker/wait-beacon', requireAuth, rateLimitMiddleware(120, 60_000, 'user'), (req: AuthenticatedRequest, res) => {
  const userId = getAuthenticatedUserId(req);
  const requestedWaitMs = Number(req.query.waitMs);
  const waitMs = Number.isFinite(requestedWaitMs)
    ? Math.max(1_000, Math.min(65_000, requestedWaitMs))
    : 60_000;
  const startedAt = Date.now();
  let settled = false;
  let observedQueue = false;
  let interval: NodeJS.Timeout | null = null;
  let timeout: NodeJS.Timeout | null = null;

  const cleanup = () => {
    if (interval) clearInterval(interval);
    if (timeout) clearTimeout(timeout);
    interval = null;
    timeout = null;
  };
  const finish = (payload: MatchmakingStatusPayload) => {
    if (settled || res.writableEnded) return;
    settled = true;
    cleanup();
    sendMatchmakerStatusSuccess(req, res, payload);
  };
  const check = () => {
    if (settled || res.writableEnded) return;
    expireTimedOutMatchmakingPlayers();
    const status = tryActivateQueuedMatch(userId) || { status: 'idle' as const };
    if (status.status === 'searching') observedQueue = true;
    if (
      status.status === 'ready'
      || status.status === 'expired'
      || (status.status === 'idle' && observedQueue)
      || Date.now() - startedAt >= waitMs
    ) {
      finish(status);
    }
  };

  const activeTimer = matchmakerCleanupTimers.get(userId);
  if (activeTimer) {
    clearTimeout(activeTimer);
    matchmakerCleanupTimers.delete(userId);
  }

  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.on('close', cleanup);
  interval = setInterval(check, 1_000);
  timeout = setTimeout(check, waitMs);
  check();
});
// Keep the queue observer on the backend origin. Some iOS Telegram-compatible
// WebViews suspend cross-origin EventSource/fetch while the wallet or another
// embedded page is active, but continue running a rendered iframe.
app.get('/api/matchmaker/watch', requireAuth, sendMatchmakerWatchPage);

function sendPrivateRoomCreateSuccess(req: Request, res: Response, payload: Record<string, unknown>) {
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  if (input?.responseMode === 'iframe') {
    const parentOrigin = typeof input.parentOrigin === 'string' && /^https?:\/\/[^/]+$/i.test(input.parentOrigin)
      ? input.parentOrigin
      : '';
    if (!parentOrigin) return res.status(400).json({ error: 'Invalid bridge origin.' });
    const message = JSON.stringify({
      source: 'redoapp-room-bridge',
      requestId: String(input.bridgeRequestId || ''),
      payload,
    }).replace(/</g, '\\u003c');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'");
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><script>parent.postMessage(${message}, ${JSON.stringify(parentOrigin)})</script>`);
  }
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="transparent"/></svg>');
  }
  return res.json(payload);
}

function handlePrivateRoomCreate(req: AuthenticatedRequest, res: Response) {
  const input = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
  const { username, avatarId, stake, targetPlayers, walletAddress, createRequestId, requestedRoomCode, gameType: rawGameType } = input as {
    username: string;
    avatarId: string;
    stake: number;
    targetPlayers?: number;
    walletAddress?: string;
    createRequestId?: string;
    requestedRoomCode?: string;
    gameType?: 'uno' | 'poker' | 'blackjack';
  };
  const gameType: 'uno' | 'poker' | 'blackjack' = rawGameType || 'uno';
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
  const targetPlayersCount = Number(targetPlayers || 2);
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
    gameType,
    joinedAt: Date.now(),
    costsCommitted: false,
  };
  const existingWaitingRoom = Array.from(privateRooms.values()).find((room) =>
    room.hostUserId === userId && room.status === 'waiting'
  );
  if (existingWaitingRoom) {
    const oldCode = existingWaitingRoom.roomCode;
    const oldMatchId = existingWaitingRoom.matchId;
    privateRooms.delete(oldCode);
    if (oldMatchId) {
      activeMatches.delete(oldMatchId);
      activeMatchByUser.delete(userId);
    }
    schedulePersist({ deleteRoomCode: oldCode, deleteMatchId: oldMatchId || undefined });
  }
  if (normalizedRequestId) {
    const existingRoom = Array.from(privateRooms.values()).find((room) =>
      room.hostUserId === userId && room.createRequestId === normalizedRequestId);
    if (existingRoom && existingRoom.gameType === gameType) {
      const existingUser = getUser(userId, walletAddress);
      return sendPrivateRoomCreateSuccess(req, res, {
        success: true,
        roomCode: existingRoom.roomCode,
        telegramLink: buildTelegramMiniAppLink(`room_${existingRoom.roomCode}`),
        stake: existingRoom.stake,
        targetPlayers: existingRoom.targetPlayers,
        gameType: existingRoom.gameType || gameType,
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
  recalculateEnergy(user);
  if (stakeAmount > 0 && user.energy < 1) {
    return res.status(400).json({ error: 'Not enough energy.' });
  }

  let roomCode = normalizedRequestedCode;
  if (!roomCode || privateRooms.has(roomCode)) {
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
      gameType,
      joinedAt: Date.now(),
      costsCommitted: false,
    });
  }

  activateMatch(matchId, 'private', matchPlayers, stakeAmount, gameType);

  privateRooms.set(roomCode, {
    roomCode,
    createRequestId: normalizedRequestId || undefined,
    stake: stakeAmount,
    targetPlayers: targetPlayersCount,
    hostUserId: userId,
    gameType,
    players: [hostPlayer],
    createdAt: Date.now(),
    status: 'waiting',
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
    gameType,
    status: 'waiting',
    matchId,
    playersCount: 1,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
}

function startPrivateRoomMatchHelper(room: PrivateRoom, match: ActiveMatch) {
  const startedAt = Date.now();
  room.status = 'started';
  match.costsCommitted = true;
  match.playStartedAt = startedAt;
  match.players = [...room.players];

  if (match.gameType === 'poker' || match.pokerGameState) {
    match.pokerGameState = createInitialPokerMatchState(match.players, match.stake);
    match.pokerGameState.turnStartedAt = startedAt;
  } else if (match.gameType === 'blackjack' || match.blackjackGameState) {
    match.blackjackGameState = createInitialBlackjackMatchState(match.players, match.stake);
    match.blackjackGameState.turnStartedAt = startedAt;
  } else {
    match.gameState = createInitialMatchState(match.players);
    match.gameState.turnStartedAt = startedAt;
  }

  match.players.forEach((p) => {
    activeMatchByUser.set(p.userId, match.matchId);
  });
}

app.post('/api/private-rooms/create', optionalAuth, rateLimitMiddleware(10, 60000, 'user'), handlePrivateRoomCreate);
app.get('/api/private-rooms/create-beacon', optionalAuth, rateLimitMiddleware(10, 60000, 'user'), handlePrivateRoomCreate);

const joinFailuresMap = new Map<string, { count: number; lockedUntil: number }>();

app.post('/api/private-rooms/join', optionalAuth, rateLimitMiddleware(10, 60000, 'user'), (req: AuthenticatedRequest, res) => {
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

  const lockoutKey = userId ? `user:${userId}` : (req.authUserId ? `user:${req.authUserId}` : `ip:${req.ip || 'global'}`);
  const failure = joinFailuresMap.get(lockoutKey);
  if (failure && Date.now() < failure.lockedUntil) {
    return res.status(403).json({ error: 'Too many failed attempts. Try again later.' });
  }

  const normalizedCode = normalizePrivateRoomCode(roomCode) || String(roomCode || '').toUpperCase();
  const room = privateRooms.get(normalizedCode) || privateRooms.get(String(roomCode).toUpperCase());
  if (!room) {
    const cur = failure && Date.now() > failure.lockedUntil ? { count: 0, lockedUntil: 0 } : (failure || { count: 0, lockedUntil: 0 });
    cur.count++;
    if (cur.count >= 5) {
      cur.lockedUntil = Date.now() + 10000; // 10 seconds lockout
    }
    joinFailuresMap.set(lockoutKey, cur);
    return res.status(404).json({ error: 'Private room not found.' });
  }

  joinFailuresMap.delete(lockoutKey);
  const match = room.matchId ? activeMatches.get(room.matchId) : null;

  if (room.players.some((player) => isSameUser(player.userId, userId)) || (match && match.players.some((player) => isSameUser(player.userId, userId)))) {
    const user = getUser(userId, walletAddress);
    activeMatchByUser.set(userId, match ? match.matchId : (room.matchId || ''));
    if (match) {
      markMatchPlayerConnected(match, userId);
      broadcastMatch(match.matchId);
    }
    broadcastPrivateRoom(room.roomCode);
    return res.json({
      success: true,
      roomCode: room.roomCode,
      telegramLink: buildTelegramMiniAppLink(room.gameType ? `room_${room.gameType}_${room.roomCode}` : `room_${room.roomCode}`),
      targetPlayers: room.targetPlayers,
      playersCount: room.players.length,
      gameType: room.gameType || 'uno',
      status: room.status,
      matchId: room.matchId || null,
      players: room.players,
      hostUserId: room.hostUserId,
      availableTickets: user.availableTickets,
      heldTickets: user.heldTickets,
      energy: getEnergyState(user),
    });
  }

  const hasPlaceholders = !!match && match.players.some(p => p.userId.startsWith('waiting_for_player_'));

  if (room.status === 'started' && !hasPlaceholders) {
    return res.status(400).json({ error: 'Private room has already started.' });
  }
  if (room.players.length >= room.targetPlayers) {
    return res.status(400).json({ error: 'Private room is already full.' });
  }

  const user = getUser(userId, walletAddress);
  if (user.availableTickets < room.stake) {
    return res.status(400).json({ error: 'Insufficient available tickets for this private room.' });
  }
  recalculateEnergy(user);
  if (room.stake > 0 && user.energy < 1) {
    return res.status(400).json({ error: 'Not enough energy.' });
  }

  const newPlayer: QueuePlayer = {
    userId,
    username,
    avatarId,
    stake: room.stake,
    mode: 'private',
    gameType: room.gameType || 'uno',
    joinedAt: Date.now(),
    costsCommitted: false,
  };

  const completesRoom = room.players.length + 1 >= room.targetPlayers;
  if (match?.costsCommitted) {
    room.players.forEach((player) => {
      if (player.costsCommitted === undefined) player.costsCommitted = true;
    });
  }
  if (completesRoom && !commitPrivateRoomCosts(room, [...room.players, newPlayer])) {
    return res.status(409).json({ error: 'A player no longer has enough tickets or energy to start this room.' });
  }

  room.players.push(newPlayer);

  if (match) {
    // Replace the first placeholder in match.players
    const placeholderIdx = match.players.findIndex(p => p.userId.startsWith('waiting_for_player_'));
    if (placeholderIdx !== -1) {
      const placeholderUserId = match.players[placeholderIdx].userId;
      match.players[placeholderIdx] = newPlayer;
      
      const gsPlayerIdx = match.gameState.players.findIndex(p => p.userId === placeholderUserId);
      if (gsPlayerIdx !== -1) {
        match.gameState.players[gsPlayerIdx].userId = userId;
        match.gameState.players[gsPlayerIdx].username = username;
        match.gameState.players[gsPlayerIdx].avatarId = avatarId;
      }

      if (match.blackjackGameState) {
        const bjPlayerIdx = match.blackjackGameState.players.findIndex(p => p.userId === placeholderUserId);
        if (bjPlayerIdx !== -1) {
          match.blackjackGameState.players[bjPlayerIdx].userId = userId;
          match.blackjackGameState.players[bjPlayerIdx].username = username;
          match.blackjackGameState.players[bjPlayerIdx].avatarId = avatarId;
          match.blackjackGameState.players[bjPlayerIdx].isAi = false;
          match.blackjackGameState.players[bjPlayerIdx].isConnected = true;
          match.blackjackGameState.players[bjPlayerIdx].hasConnected = true;
        }
      }

      if (match.pokerGameState) {
        const pkPlayerIdx = match.pokerGameState.players.findIndex(p => p.userId === placeholderUserId);
        if (pkPlayerIdx !== -1) {
          match.pokerGameState.players[pkPlayerIdx].userId = userId;
          match.pokerGameState.players[pkPlayerIdx].username = username;
          match.pokerGameState.players[pkPlayerIdx].avatarId = avatarId;
          match.pokerGameState.players[pkPlayerIdx].isAi = false;
          match.pokerGameState.players[pkPlayerIdx].isConnected = true;
          match.pokerGameState.players[pkPlayerIdx].hasConnected = true;
        }
      }

      activeMatchByUser.set(userId, match.matchId);

      const anyLeft = match.players.some(p => p.userId.startsWith('waiting_for_player_'));
      if ((!anyLeft || room.players.length >= room.targetPlayers) && room.status !== 'started') {
        startPrivateRoomMatchHelper(room, match);
      }
    } else if (room.players.length >= room.targetPlayers && room.status !== 'started') {
      startPrivateRoomMatchHelper(room, match);
    }
  }

  if (room.status === 'started') {
    commitPrivateRoomCosts(room, [newPlayer]);
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
    telegramLink: buildTelegramMiniAppLink(room.gameType ? `room_${room.gameType}_${room.roomCode}` : `room_${room.roomCode}`),
    targetPlayers: room.targetPlayers,
    playersCount: room.players.length,
    gameType: room.gameType || 'uno',
    status: room.status,
    matchId: room.matchId || null,
    players: room.players,
    hostUserId: room.hostUserId,
    availableTickets: user.availableTickets,
    heldTickets: user.heldTickets,
    energy: getEnergyState(user),
  });
});

app.post('/api/private-rooms/start', optionalAuth, rateLimitMiddleware(10, 60000, 'user'), (req: AuthenticatedRequest, res) => {
  const { roomCode } = req.body as { roomCode: string; userId?: string };
  const userId = getPrivateRoomUserId(req, req.body as Record<string, unknown>);
  if (!userId) {
    return res.status(400).json({ error: 'Missing private room user id.' });
  }

  const normalizedCode = normalizePrivateRoomCode(roomCode) || String(roomCode || '').toUpperCase();
  const room = privateRooms.get(normalizedCode) || privateRooms.get(String(roomCode || '').toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Private room not found.' });
  }

  if (!isSameUser(room.hostUserId, userId)) {
    return res.status(403).json({ error: 'Only the room creator can start the match.' });
  }

  if (room.players.length < 2) {
    return res.status(400).json({ error: 'At least 2 players are required to start.' });
  }

  const match = room.matchId ? activeMatches.get(room.matchId) : null;
  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  if (!commitPrivateRoomCosts(room, room.players)) {
    return res.status(409).json({ error: 'A player no longer has enough tickets or energy to start this room.' });
  }

  startPrivateRoomMatchHelper(room, match);

  privateRooms.set(room.roomCode, room);
  schedulePersist({ roomCode: room.roomCode, matchId: room.matchId || undefined });
  broadcastMatch(match.matchId);
  broadcastPrivateRoom(room.roomCode);

  return res.json({
    success: true,
    roomCode: room.roomCode,
    status: 'started',
    matchId: room.matchId,
    playersCount: room.players.length,
    gameType: room.gameType || 'uno',
  });
});

app.post('/api/matches/leave-unstarted', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = getAuthenticatedUserId(req);
  const requestedMatchId = typeof req.body?.matchId === 'string' ? req.body.matchId : '';
  const requestedRoomCode = typeof req.body?.roomCode === 'string'
    ? normalizePrivateRoomCode(req.body.roomCode)
    : '';
  const mappedMatchId = activeMatchByUser.get(userId) || '';
  const matchId = requestedMatchId || mappedMatchId;
  const match = matchId ? activeMatches.get(matchId) : null;
  const room = requestedRoomCode
    ? (privateRooms.get(requestedRoomCode) || privateRooms.get(String(req.body.roomCode).toUpperCase()))
    : Array.from(privateRooms.values()).find((candidate) => candidate.matchId === matchId);

  if (!match && !room) {
    activeMatchByUser.delete(userId);
    return res.json({ success: true, alreadyLeft: true });
  }

  if (room) {
    const roomMatch = room.matchId ? activeMatches.get(room.matchId) : match;
    if (!privateRoomHasOpenSeats(room)) {
      return res.status(409).json({ error: 'The private match has already started and cannot be cancelled.' });
    }
    const leavingPlayer = room.players.find((player) => player.userId === userId);
    if (!leavingPlayer) {
      activeMatchByUser.delete(userId);
      return res.json({ success: true, alreadyLeft: true });
    }
    if (roomMatch?.costsCommitted) {
      room.players.forEach((player) => {
        if (player.costsCommitted === undefined) player.costsCommitted = true;
      });
    }

    if (room.hostUserId === userId) {
      room.players.forEach((player) => {
        refundPrivateRoomReservation(player, room.roomCode, 'Private Room Cancel Refund');
        if (activeMatchByUser.get(player.userId) === room.matchId) {
          activeMatchByUser.delete(player.userId);
        }
      });
      const subscribers = privateRoomSubscribers.get(room.roomCode);
      subscribers?.forEach((response) => {
        sendSse(response, 'private-room-cancelled', {
          roomCode: room.roomCode,
          reason: 'The host cancelled the room.',
        });
        response.end();
      });
      privateRoomSubscribers.delete(room.roomCode);
      if (room.matchId) {
        broadcastMatchCancelled(room.matchId, 'The host cancelled the room.');
        activeMatches.delete(room.matchId);
      }
      privateRooms.delete(room.roomCode);
      schedulePersist({
        deleteRoomCode: room.roomCode,
        deleteMatchId: room.matchId,
      });
      await persistStateNow();
      return res.json({ success: true, cancelled: true });
    }

    refundPrivateRoomReservation(leavingPlayer, room.roomCode, 'Private Room Leave Refund');
    room.players = room.players.filter((player) => player.userId !== userId);
    activeMatchByUser.delete(userId);
    if (roomMatch) {
      const playerIndex = roomMatch.players.findIndex((player) => player.userId === userId);
      if (playerIndex >= 0) {
        const placeholderUserId = `waiting_for_player_${playerIndex}_${Date.now()}`;
        roomMatch.players[playerIndex] = {
          userId: placeholderUserId,
          username: 'Waiting...',
          avatarId: 'koala',
          stake: room.stake,
          mode: 'private',
          joinedAt: Date.now(),
          costsCommitted: false,
        };
        const statePlayer = roomMatch.gameState.players.find((player) => player.userId === userId);
        if (statePlayer) {
          statePlayer.userId = placeholderUserId;
          statePlayer.username = 'Waiting...';
          statePlayer.avatarId = 'koala';
        }
        roomMatch.playStartedAt = null;
        roomMatch.gameState.turnStartedAt = undefined;
        roomMatch.costsCommitted = false;
        room.status = 'waiting';
      }
    }
    schedulePersist({ roomCode: room.roomCode, matchId: room.matchId });
    broadcastPrivateRoom(room.roomCode);
    if (room.matchId) broadcastMatch(room.matchId);
    await persistStateNow();
    return res.json({ success: true, left: true });
  }

  if (match) {
    if (!match.players.some((player) => player.userId === userId)) {
      activeMatchByUser.delete(userId);
      return res.json({ success: true, alreadyLeft: true });
    }
    ensureMatchLifecycle(match);
    if (!match.playStartedAt) {
      if (match.matchId.startsWith('tourn-')) {
        activeMatchByUser.delete(userId);
        const pInState = match.gameState.players.find((p) => p.userId === userId);
        if (pInState) {
          pInState.isAi = true;
          pInState.isConnected = false;
          pInState.disconnectedAt = Date.now();
          match.gameState.logs = [
            createServerLog(`🔌 ${pInState.username} left the tournament table (AI bot replacing).`, 'info'),
            ...match.gameState.logs,
          ].slice(0, 50);
        }
        schedulePersist({ matchId: match.matchId });
        broadcastMatch(match.matchId);
        await persistStateNow();
        return res.json({ success: true, left: true, convertedToBot: true });
      }

      match.players.forEach((player) => activeMatchByUser.delete(player.userId));
      broadcastMatchCancelled(match.matchId, 'A player left before the match started.');
      activeMatches.delete(match.matchId);
      schedulePersist({ deleteMatchId: match.matchId });
      await persistStateNow();
      return res.json({ success: true, cancelled: true });
    }

    activeMatchByUser.delete(userId);
    const pInState = match.gameState.players.find((p) => p.userId === userId);
    if (pInState) {
      pInState.isAi = true;
      pInState.isConnected = false;
      pInState.disconnectedAt = Date.now();
      match.gameState.logs = [
        createServerLog(`🔌 ${pInState.username} left the match.`, 'info'),
        ...match.gameState.logs,
      ].slice(0, 50);
    }
    const pInBj = match.blackjackGameState?.players.find((p) => p.userId === userId);
    if (pInBj) {
      pInBj.isAi = true;
      pInBj.isConnected = false;
      pInBj.disconnectedAt = Date.now();
      match.blackjackGameState!.logs = [
        createServerLog(`🔌 ${pInBj.username} left the table.`, 'info'),
        ...match.blackjackGameState!.logs,
      ].slice(0, 50);
    }
    const pInPoker = match.pokerGameState?.players.find((p) => p.userId === userId);
    if (pInPoker) {
      pInPoker.isAi = true;
      pInPoker.isConnected = false;
      pInPoker.disconnectedAt = Date.now();
    }

    const remainingHumans = match.players.filter(
      (p) => !p.isAi && !p.userId.startsWith('bot_') && p.userId !== userId
    );

    // If no humans remain or if it is a 2-player PVP match where one player leaves early
    const isTwoPlayerPvp = match.mode === 'pvp' && !match.matchId.startsWith('tourn-');
    if (remainingHumans.length === 0 || (isTwoPlayerPvp && (Date.now() - match.createdAt < 60_000))) {
      cancelUnstartedPublicMatch(match, 'Opponent left the match. Match cancelled.');
      await persistStateNow();
      return res.json({ success: true, cancelled: true });
    }

    const allBjBots = match.blackjackGameState ? match.blackjackGameState.players.every((p) => p.isAi) : false;
    const allUnoBots = match.gameState.players.every((p) => p.isAi);
    const allPokerBots = match.pokerGameState ? match.pokerGameState.players.every((p) => p.isAi) : false;
    if (allUnoBots || allBjBots || allPokerBots) {
      match.gameState.phase = 'game_over';
      if (match.blackjackGameState) match.blackjackGameState.stage = 'match_ended';
      if (match.pokerGameState) match.pokerGameState.stage = 'match_ended';
      match.players.forEach((p) => activeMatchByUser.delete(p.userId));
      if (match.blackjackGameState) {
        settleBlackjackMatch(match);
      } else if (match.pokerGameState) {
        settlePokerMatch(match);
      } else {
        settleMatchHelper(match);
      }
    } else {
      schedulePersist({ matchId: match.matchId });
      broadcastMatch(match.matchId);
    }
    await persistStateNow();
    return res.json({ success: true, left: true, convertedToBot: true });
  }

  activeMatchByUser.delete(userId);
  return res.json({ success: true, alreadyLeft: true });
});

app.get('/api/private-rooms/status/:roomCode', optionalAuth, (req, res) => {
  const normalizedCode = normalizePrivateRoomCode(req.params.roomCode) || String(req.params.roomCode || '').toUpperCase();
  const room = privateRooms.get(normalizedCode) || privateRooms.get(String(req.params.roomCode || '').toUpperCase());
  if (!room) {
    return res.status(200).json({ status: 'completed', message: 'Private room has concluded.' });
  }
  if (room.matchId) {
    const match = activeMatches.get(room.matchId);
    if (match && (match.settled || match.gameState?.phase === 'game_over' || match.pokerGameState?.stage === 'match_ended' || match.blackjackGameState?.stage === 'match_ended')) {
      return res.status(200).json({ status: 'completed', roomCode: room.roomCode, message: 'Private room has finished.' });
    }
  }

  return res.json({
    roomCode: room.roomCode,
    telegramLink: buildTelegramMiniAppLink(room.gameType ? `room_${room.gameType}_${room.roomCode}` : `room_${room.roomCode}`),
    stake: room.stake,
    targetPlayers: room.targetPlayers,
    status: room.status,
    playersCount: room.players.length,
    minPlayers: MIN_MATCH_PLAYERS,
    maxPlayers: MAX_MATCH_PLAYERS,
    players: room.players,
    matchId: room.matchId || null,
    gameType: room.gameType || 'uno',
    hostUserId: room.hostUserId,
  });
});

app.get('/api/private-rooms/stream/:roomCode', optionalAuth, (req, res) => {
  const roomCode = normalizePrivateRoomCode(req.params.roomCode) || String(req.params.roomCode || '').toUpperCase();
  const room = privateRooms.get(roomCode) || privateRooms.get(String(req.params.roomCode || '').toUpperCase());
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
                  const matchToCancel = roomToDisband.matchId
                    ? activeMatches.get(roomToDisband.matchId)
                    : null;
                  if (matchToCancel?.costsCommitted) {
                    roomToDisband.players.forEach((player) => {
                      if (player.costsCommitted === undefined) player.costsCommitted = true;
                    });
                  }
                  roomToDisband.players.forEach(p => {
                    refundPrivateRoomReservation(p, roomCode, 'Private Room Host Leave Release');
                    if (activeMatchByUser.get(p.userId) === roomToDisband.matchId) {
                      activeMatchByUser.delete(p.userId);
                    }
                  });
                  if (roomToDisband.matchId) {
                    broadcastMatchCancelled(roomToDisband.matchId, 'The waiting room expired.');
                    activeMatches.delete(roomToDisband.matchId);
                  }
                  privateRooms.delete(roomCode);
                  privateRoomCleanupTimers.delete(roomCode);
                  schedulePersist({
                    deleteRoomCode: roomCode,
                    deleteMatchId: roomToDisband.matchId,
                  });
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
                    const matchToUpdate = roomToUpdate.matchId
                      ? activeMatches.get(roomToUpdate.matchId)
                      : null;
                    if (matchToUpdate?.costsCommitted && playerToBoot.costsCommitted === undefined) {
                      playerToBoot.costsCommitted = true;
                    }
                    roomToUpdate.players = roomToUpdate.players.filter(p => p.userId !== userId);
                    refundPrivateRoomReservation(playerToBoot, roomCode, 'Private Room Leave Release');
                    activeMatchByUser.delete(userId);
                    if (matchToUpdate) {
                      const playerIndex = matchToUpdate.players.findIndex((player) => player.userId === userId);
                      if (playerIndex >= 0) {
                        const placeholderUserId = `waiting_for_player_${playerIndex}_${Date.now()}`;
                        matchToUpdate.players[playerIndex] = {
                          userId: placeholderUserId,
                          username: 'Waiting...',
                          avatarId: 'koala',
                          stake: roomToUpdate.stake,
                          mode: 'private',
                          joinedAt: Date.now(),
                          costsCommitted: false,
                        };
                        const statePlayer = matchToUpdate.gameState.players.find((player) => player.userId === userId);
                        if (statePlayer) {
                          statePlayer.userId = placeholderUserId;
                          statePlayer.username = 'Waiting...';
                          statePlayer.avatarId = 'koala';
                        }
                        matchToUpdate.playStartedAt = null;
                        matchToUpdate.gameState.turnStartedAt = undefined;
                        matchToUpdate.costsCommitted = false;
                        roomToUpdate.status = 'waiting';
                      }
                    }
                    schedulePersist({ roomCode, matchId: roomToUpdate.matchId });
                    broadcastPrivateRoom(roomCode);
                    if (roomToUpdate.matchId) broadcastMatch(roomToUpdate.matchId);
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

function sendMatchStateSuccess(req: Request, res: Response, payload: Record<string, unknown>) {
  const input = req.query as Record<string, unknown>;
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (input.responseMode === 'iframe') {
    const parentOrigin = typeof input.parentOrigin === 'string' && /^https?:\/\/[^/]+$/i.test(input.parentOrigin)
      ? input.parentOrigin
      : '';
    if (!parentOrigin) return res.status(400).json({ error: 'Invalid bridge origin.' });
    const message = JSON.stringify({
      source: 'redoapp-match-state-bridge',
      requestId: String(input.bridgeRequestId || ''),
      payload,
    }).replace(/</g, '\\u003c');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'");
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><script>parent.postMessage(${message}, ${JSON.stringify(parentOrigin)})</script>`);
  }
  return res.json(payload);
}

function findSettledTournamentMatch(matchId: string): TournamentMatch | null {
  if (currentTournament?.matches) {
    const m = currentTournament.matches.find((item) => item.matchId === matchId);
    if (m) return m;
  }
  for (const past of pastTournaments) {
    if (past.matches) {
      const m = past.matches.find((item) => item.matchId === matchId);
      if (m) return m;
    }
  }
  return null;
}

function handleMatchState(req: AuthenticatedRequest, res: Response) {
  const { matchId } = req.params;
  const userId = getAuthenticatedUserId(req);
  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    const settledMatch = findSettledTournamentMatch(matchId);
    if (settledMatch) {
      return res.json({
        settled: true,
        status: 'finished',
        winnerUserId: settledMatch.winnerId,
        matchId: settledMatch.matchId,
        message: 'This tournament match has ended.',
      });
    }
    return res.status(404).json({ error: 'Match not found.' });
  }
  const isUserInMatch = activeMatch.players.some((p) => p.userId === userId) || activeMatch.gameState.players.some((p) => p.userId === userId) || Boolean(activeMatch.pokerGameState?.players.some((p) => p.userId === userId)) || Boolean(activeMatch.blackjackGameState?.players.some((p) => p.userId === userId));
  if (isUserInMatch) {
    markMatchPlayerConnected(activeMatch, userId);
  }
  const state = buildPerspectiveState(activeMatch, userId);
  if (!state) {
    return res.status(403).json({ error: 'User is not part of this match.' });
  }
  return sendMatchStateSuccess(req, res, state);
}

app.get('/api/matches/state/:matchId', requireAuth, handleMatchState);
// A no-preflight state read for Telegram WebViews. It both returns the
// player's perspective and records the connection heartbeat.
app.get('/api/matches/state-beacon/:matchId', requireAuth, handleMatchState);
// Same finite state response under the matchmaker rewrite. This lets the
// mobile client render the first table frame without a second cross-origin
// iframe after matchmaking has completed.
app.get('/api/matchmaker/match-state/:matchId', requireAuth, handleMatchState);

app.get('/api/matches/stream/:matchId', requireAuth, (req: AuthenticatedRequest, res) => {
  const { matchId } = req.params;
  const userId = getAuthenticatedUserId(req);
  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    const settledMatch = findSettledTournamentMatch(matchId);
    if (settledMatch) {
      return res.json({
        settled: true,
        status: 'finished',
        winnerUserId: settledMatch.winnerId,
        matchId: settledMatch.matchId,
        message: 'This tournament match has ended.',
      });
    }
    return res.status(404).json({ error: 'Match not found.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.locals.userId = userId;

  subscribeToChannel(matchSubscribers, matchId, res);

  const isUserInMatch = activeMatch.players.some((p) => isSameUser(p.userId, userId))
    || activeMatch.gameState.players.some((p) => isSameUser(p.userId, userId))
    || Boolean(activeMatch.pokerGameState?.players.some((p) => isSameUser(p.userId, userId)))
    || Boolean(activeMatch.blackjackGameState?.players.some((p) => isSameUser(p.userId, userId)));
  if (isUserInMatch) {
    markMatchPlayerConnected(activeMatch, userId);
  }

  const state = buildPerspectiveState(activeMatch, userId);
  if (!state) {
    return res.status(403).json({ error: 'User is not part of this match.' });
  }

  sendSse(res, 'match-state', state);

  res.on('close', () => {
    const subscribers = matchSubscribers.get(matchId);
    const isStillConnected = !!subscribers && Array.from(subscribers).some(
      (sub) => isSameUser(sub.locals.userId, userId) && sub !== res
    );

    if (!isStillConnected) {
      const match = activeMatches.get(matchId);
      if (match) {
        const player = match.gameState.players.find(p => isSameUser(p.userId, userId));
        const hasFreshHeartbeat = !!player?.lastSeenAt && Date.now() - player.lastSeenAt < 10_000;
        if (player && player.isConnected !== false && !hasFreshHeartbeat) {
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
  const { matchId, action, cardId, chosenColor, amount } = req.body as {
    matchId: string;
    action: string;
    cardId?: string;
    chosenColor?: CardColor;
    amount?: number;
  };
  const userId = getAuthenticatedUserId(req);

  const activeMatch = activeMatches.get(matchId);
  if (!activeMatch) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  try {
    if (activeMatch.gameType === 'poker' || activeMatch.pokerGameState || action.startsWith('poker_') || action === 'fold' || action === 'check' || action === 'call' || action === 'raise' || action === 'all_in') {
      applyPokerAction(activeMatch, userId, action, amount);
    } else if (activeMatch.gameType === 'blackjack' || activeMatch.blackjackGameState || action.startsWith('blackjack_') || action === 'hit' || action === 'stand' || action === 'double' || action === 'next_hand' || action === 'place_bet' || action === 'bet') {
      applyBlackjackAction(activeMatch, userId, action, amount);
    } else if (action === 'play') {
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
    const status = error instanceof Error && error.message.startsWith('Supabase ') ? 503 : 400;
    return res.status(status).json({
      error: error instanceof Error ? error.message : 'Match action failed.',
    });
  }
});

app.post('/api/matchmaker/leave', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = getAuthenticatedUserId(req);
  const user = getUser(userId);
  user.matchmakingFailureAt = null;
  user.matchmakingFailureReason = null;
  const player = matchmakingQueue.find(p => p.userId === userId);
  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
  if (player) {
    if (player.stake > 0 && player.costsCommitted === 'held') {
      user.heldTickets = round2(Math.max(0, user.heldTickets - player.stake));
      user.availableTickets = round2(user.availableTickets + player.stake);
    }
    matchmakingQueue
      .filter(p => p.stake === player.stake && p.mode === player.mode)
      .forEach((queuedPlayer) => broadcastQueue(queuedPlayer.userId));
  }
  schedulePersist({ userId });
  broadcastQueue(userId);
  res.json({ success: true, availableTickets: user.availableTickets, heldTickets: user.heldTickets });
});

function scheduleMatchCleanup(matchId: string) {
  setTimeout(() => {
    const match = activeMatches.get(matchId);
    if (match && !match.settled) {
      if (match.gameState.phase === 'game_over') {
        settleMatchHelper(match);
      } else if (match.stake > 0) {
        match.players.forEach((p) => {
          const user = getUser(p.userId);
          user.heldTickets = round2(Math.max(0, user.heldTickets - match.stake));
          user.availableTickets = round2(user.availableTickets + match.stake);
          createLedgerEntry(user, {
            id: `match-refund:${matchId}:${user.userId}`,
            event: 'Unsettled Match Refund',
            value: `+${match.stake.toFixed(2)} TKT`,
            type: 'stake_release',
            amount: match.stake,
          });
          schedulePersist({ userId: user.userId });
        });
      }
    }
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

  // Evaluate tournament match round progression before final settlement
  if (currentTournament && currentTournament.status === 'in_progress') {
    const tMatch = currentTournament.matches.find((m) => m.matchId === activeMatch.matchId);
    if (tMatch) {
      const winsRequired = currentTournament.winsRequired || 1;
      const winnerId = activeMatch.gameState.winnerUserId || placements[0]?.userId || null;
      if (winnerId) {
        tMatch.playerWins = tMatch.playerWins || {};
        tMatch.playerWins[winnerId] = (tMatch.playerWins[winnerId] || 0) + 1;

        if (winsRequired > 1 && tMatch.playerWins[winnerId] < winsRequired) {
          // Target wins not reached yet! Show 5-second round_over leaderboard to all players on table first
          const prevPlayersMap = new Map(activeMatch.gameState.players.map((p) => [p.userId, p]));
          const winnerPlayer = prevPlayersMap.get(winnerId);
          const winnerName = winnerPlayer?.username || winnerId;

          // Set temporary round_over phase for 5 seconds
          activeMatch.gameState.phase = 'round_over';
          (activeMatch.gameState as any).roundWinnerUserId = winnerId;
          (activeMatch.gameState as any).roundWinnerName = winnerName;
          (activeMatch.gameState as any).roundEndTimestamp = Date.now();
          (activeMatch.gameState as any).nextRoundStartsAt = Date.now() + 5000;
          (activeMatch.gameState as any).playerWins = tMatch.playerWins;
          (activeMatch.gameState as any).winsRequired = winsRequired;

          schedulePersist({ matchId: activeMatch.matchId });
          broadcastMatch(activeMatch.matchId);

          // Delay 5 seconds before dealing the next hand
          setTimeout(() => {
            if (!activeMatch || activeMatch.settled) return;
            const newGameState = createInitialMatchState(activeMatch.players);

            // Preserve player connection and AI state from previous round
            newGameState.players.forEach((p) => {
              const prev = prevPlayersMap.get(p.userId);
              if (prev) {
                p.isAi = prev.isAi;
                p.isConnected = prev.isConnected;
                p.hasConnected = prev.hasConnected;
                p.lastSeenAt = prev.lastSeenAt;
                p.disconnectedAt = prev.disconnectedAt;
              }
            });

            (newGameState as any).playerWins = tMatch.playerWins;
            (newGameState as any).winsRequired = winsRequired;
            newGameState.turnStartedAt = Date.now();
            newGameState.logs = [
              createServerLog(`🏆 ${winnerName} won this hand! Round score: ${tMatch.playerWins[winnerId]}/${winsRequired} wins. Next hand starting!`, 'win'),
              ...newGameState.logs,
            ].slice(0, 50);

            activeMatch.gameState = newGameState;
            activeMatch.settled = false;
            activeMatch.playStartedAt = activeMatch.playStartedAt || Date.now();

            activeMatch.players.forEach((player) => {
              activeMatchByUser.set(player.userId, activeMatch.matchId);
            });

            schedulePersist({ matchId: activeMatch.matchId });
            broadcastMatch(activeMatch.matchId);
          }, 5000);

          return;
        }
      }

      tMatch.status = 'completed';
      tMatch.winnerId = winnerId;
      evaluateTournamentProgression();
    }
  }

  // Final match settlement
  const grossPot = activeMatch.stake * activeMatch.players.length;
  const seasonFund = round2(grossPot * 0.02);
  const burnFund = round2(grossPot * 0.02);
  const netPrizePool = round2(grossPot - seasonFund - burnFund);
  const payoutByRank = buildPayoutByRank(activeMatch.players.length, netPrizePool);

  placements.forEach(({ userId, rank }) => {
    if (userId.startsWith('bot_')) return;
    const user = getUser(userId);
    const grossPayout = payoutByRank[rank] || 0;
    const referralSettlement = activeMatch.mode === 'pvp' && grossPayout > 0
      ? applyReferralMatchBonus(user, grossPayout, activeMatch.matchId)
      : { inviterBonus: 0, netPayout: grossPayout };
    const matchPayoutLedgerId = `match-payout:${activeMatch.matchId}:${user.userId}`;
    const payoutAlreadyCredited = user.transactions.some((entry) => entry.id === matchPayoutLedgerId);

    if (!payoutAlreadyCredited) {
      user.heldTickets = round2(Math.max(0, user.heldTickets - activeMatch.stake));
      if (referralSettlement.netPayout > 0) {
        user.availableTickets = round2(user.availableTickets + referralSettlement.netPayout);
        createLedgerEntry(user, {
          id: matchPayoutLedgerId,
          event: `${activeMatch.mode === 'pvp' ? 'PVP Match' : 'Private Match'} Payout`,
          value: `+${referralSettlement.netPayout.toFixed(2)} TKT`,
          type: 'match_payout',
          amount: referralSettlement.netPayout,
        });
      }
      if (activeMatch.mode === 'pvp') {
        updateQuestProgress(user.userId, 'play_online', 1);
      } else {
        updateQuestProgress(user.userId, 'play_private', 1);
      }
      if (rank === 1) {
        updateQuestProgress(user.userId, 'win_any', 1);
      }
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

  // Clean up and complete any associated private room
  const associatedRoom = Array.from(privateRooms.values()).find((r) => r.matchId === activeMatch.matchId);
  if (associatedRoom) {
    const roomCode = associatedRoom.roomCode;
    const subscribers = privateRoomSubscribers.get(roomCode);
    subscribers?.forEach((response) => {
      sendSse(response, 'private-room-completed', {
        roomCode,
        reason: 'The match has concluded.',
      });
      response.end();
    });
    privateRoomSubscribers.delete(roomCode);
    privateRooms.delete(roomCode);
    schedulePersist({ deleteRoomCode: roomCode });
  }

  scheduleMatchCleanup(activeMatch.matchId);
}

app.post('/api/matches/settle', requireAuth, async (req: AuthenticatedRequest, res) => {
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
  try {
    // Payouts and both L1/L2 referral bonuses share this commit boundary.
    await persistStateNow();
  } catch {
    return res.status(503).json({ error: 'Settlement is waiting for durable storage. Retry safely.' });
  }

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
  recoverPendingWithdrawalNotifications();
  flushTelegramNotifications().catch((error) => {
    console.error('Telegram notification worker failed', error);
  });
}, 15000);

setInterval(() => {
  runMatchmakingTick();
}, 1000);

// Keep long-lived streams healthy with a tiny event instead of forcing clients
// to download complete queue, room or match snapshots when nothing changed.
setInterval(() => {
  const responses = new Set<Response>();
  [queueSubscribers, privateRoomSubscribers, matchSubscribers].forEach((store) => {
    store.forEach((subscribers) => subscribers.forEach((response) => responses.add(response)));
  });
  responses.forEach((response) => {
    sendSse(response, 'heartbeat', { t: Date.now() }, false);
  });
}, 15_000);

setInterval(() => {
  const now = Date.now();
  for (const [matchId, match] of activeMatches.entries()) {
    if (match.settled) {
      match.players.forEach((p) => activeMatchByUser.delete(p.userId));
      continue;
    }

    if (match.gameType === 'poker' && match.pokerGameState) {
      const pk = match.pokerGameState;
      if (pk.stage === 'match_ended') {
        match.players.forEach((p) => activeMatchByUser.delete(p.userId));
        settlePokerMatch(match);
        continue;
      }
      if (match.mode === 'pvp' && !match.playStartedAt) {
        maybeStartPublicMatch(match, now);
        continue;
      }
      if (!match.playStartedAt) {
        continue;
      }

      // Check auto-next-hand for ended stage
      if (pk.stage === 'ended') {
        if (pk.nextRoundStartsAt && now >= pk.nextRoundStartsAt) {
          startNextPokerRound(match);
          broadcastMatch(matchId);
          schedulePersist({ matchId });
        }
        continue;
      }

      // Turn timeout for active player
      if (pk.stage === 'preflop' || pk.stage === 'flop' || pk.stage === 'turn' || pk.stage === 'river') {
        const currPlayer = pk.players[pk.currentPlayerIndex];
        if (currPlayer && !currPlayer.folded && !currPlayer.isAllIn && !currPlayer.eliminated) {
          if (!pk.turnStartedAt) {
            pk.turnStartedAt = now;
          }
          const elapsedSec = Math.floor((now - pk.turnStartedAt) / 1000);
          const isBot = Boolean(currPlayer.isAi || currPlayer.userId.startsWith('bot_') || currPlayer.isConnected === false);
          const limit = isBot ? 1 : 15;
          if (elapsedSec >= limit) {
            const needed = pk.currentBet - currPlayer.currentBet;
            if (needed <= 0) {
              applyPokerAction(match, currPlayer.userId, 'check');
            } else if (isBot && currPlayer.chips >= needed && Math.random() > 0.5) {
              applyPokerAction(match, currPlayer.userId, 'call');
            } else {
              applyPokerAction(match, currPlayer.userId, 'fold');
            }
            broadcastMatch(matchId);
            schedulePersist({ matchId });
          }
        }
      }
      // Check if all human players abandoned the poker table
      const hasActivePokerHumans = pk.players.some((p) => !p.isAi && !p.userId.startsWith('bot_') && p.isConnected !== false);
      const pokerAgeMs = now - match.createdAt;
      if (!hasActivePokerHumans && pokerAgeMs > 30_000) {
        pk.stage = 'match_ended';
        match.players.forEach((p) => activeMatchByUser.delete(p.userId));
        settlePokerMatch(match);
        continue;
      }
      continue;
    }

    if (match.gameType === 'blackjack' && match.blackjackGameState) {
      const bj = match.blackjackGameState;
      if (bj.stage === 'match_ended') {
        match.players.forEach((p) => activeMatchByUser.delete(p.userId));
        settleBlackjackMatch(match);
        continue;
      }
      if (match.mode === 'pvp' && !match.playStartedAt) {
        maybeStartPublicMatch(match, now);
        continue;
      }
      if (!match.playStartedAt) {
        continue;
      }

      // Check auto-next-hand for round_ended
      if (bj.stage === 'round_ended') {
        if (bj.nextRoundStartsAt && now >= bj.nextRoundStartsAt) {
          startNextBlackjackRound(match);
          broadcastMatch(matchId);
          schedulePersist({ matchId });
        }
        continue;
      }

      // Turn timeout for active player
      if (bj.stage === 'player_turn') {
        const currPlayer = bj.players[bj.currentPlayerIndex];
        if (currPlayer) {
          if (!bj.turnStartedAt) {
            bj.turnStartedAt = now;
          }
          const elapsedSec = Math.floor((now - bj.turnStartedAt) / 1000);
          const isBot = Boolean(currPlayer.isAi || currPlayer.userId.startsWith('bot_'));
          const limit = isBot ? 1 : 15;
          if (elapsedSec >= limit) {
            if (currPlayer.score < 12) {
              applyBlackjackAction(match, currPlayer.userId, 'hit');
            } else {
              applyBlackjackAction(match, currPlayer.userId, 'stand');
            }
            broadcastMatch(matchId);
            schedulePersist({ matchId });
          }
        }
      }

      // Check if all human players abandoned the blackjack table
      const hasActiveBjHumans = bj.players.some((p) => !p.isAi && !p.userId.startsWith('bot_') && p.isConnected !== false);
      const bjAgeMs = now - match.createdAt;
      if (!hasActiveBjHumans && bjAgeMs > 30_000) {
        bj.stage = 'match_ended';
        match.players.forEach((p) => activeMatchByUser.delete(p.userId));
        settleBlackjackMatch(match);
        continue;
      }
      continue;
    }

    if (match.gameState.phase === 'game_over') {
      match.players.forEach((p) => activeMatchByUser.delete(p.userId));
      settleMatchHelper(match);
      continue;
    }

    if (match.gameState.phase !== 'playing') {
      match.players.forEach((p) => activeMatchByUser.delete(p.userId));
      continue;
    }

    const matchAgeMs = now - match.createdAt;
    const allBotsOrOffline = match.gameState.players.every((p) => p.isAi || p.isConnected === false);
    if ((matchAgeMs > 30_000 && allBotsOrOffline) || matchAgeMs > 10 * 60 * 1000) {
      match.gameState.phase = 'game_over';
      match.players.forEach((p) => activeMatchByUser.delete(p.userId));
      settleMatchHelper(match);
      continue;
    }

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

    ensureMatchLifecycle(match);

    // Evaluate connection status
    state.players.forEach((player) => {
      const subscribers = matchSubscribers.get(matchId);
      const hasSseConnection = !!subscribers && Array.from(subscribers).some(
        (res) => res.locals.userId === player.userId
      );
      const hasFreshHeartbeat = !!player.lastSeenAt && now - player.lastSeenAt < 10_000;
      const isConnected = hasSseConnection || hasFreshHeartbeat;

      if (isConnected) {
        if (player.isConnected === false) {
          player.isConnected = true;
          player.hasConnected = true;
          player.disconnectedAt = null;
          state.logs = [createServerLog(`🔌 ${player.username} reconnected.`, 'info'), ...state.logs].slice(0, 50);
          broadcastMatch(matchId);
        }
      } else {
        if (!player.isAi) {
          if (player.isConnected !== false) {
            player.isConnected = false;
            player.disconnectedAt = now;
            state.logs = [createServerLog(`🔌 ${player.username} disconnected.`, 'info'), ...state.logs].slice(0, 50);
            broadcastMatch(matchId);
          } else if (!player.disconnectedAt) {
            player.disconnectedAt = now;
          }
        }
      }
    });

    if (match.mode === 'pvp' && !match.playStartedAt) {
      maybeStartPublicMatch(match, now);
      continue;
    }

    // Ensure current turn points to an active player if possible
    let currentPlayerIndex = state.currentPlayerIndex;
    let currentPlayer = state.players[currentPlayerIndex];
    if (currentPlayer && !isPlayerActive(currentPlayer) && state.players.some(isPlayerActive)) {
      const activeIndex = getNextActivePlayerIndex(state.players, currentPlayerIndex, state.direction, 0);
      if (activeIndex !== currentPlayerIndex) {
        state.currentPlayerIndex = activeIndex;
        currentPlayerIndex = activeIndex;
        currentPlayer = state.players[activeIndex];
        state.turnStartedAt = now;
        broadcastMatch(matchId);
        schedulePersist({ matchId });
      }
    }

    if (!currentPlayer) continue;

    if (!state.turnStartedAt) {
      state.turnStartedAt = now;
    }

    const elapsedSec = Math.floor((now - state.turnStartedAt) / 1000);
    const isBotPlayer = Boolean(currentPlayer.isAi || currentPlayer.userId.startsWith('bot_'));
    const turnLimit = isBotPlayer ? 1 : (match.turnTimeoutSec || 10);

    if (currentPlayer.isConnected !== false) {
      if (elapsedSec >= turnLimit) {
        if (!isBotPlayer) {
          state.logs = [createServerLog(`⏰ ${currentPlayer.username}'s turn timed out. Auto-playing.`, 'info'), ...state.logs].slice(0, 50);
        }
        runServerAiTurn(match, currentPlayerIndex);
        broadcastMatch(matchId);
        schedulePersist({ matchId });
      }
    } else {
      // Offline / AFK player: skip turn immediately without waiting!
      state.logs = [createServerLog(`🔌 ${currentPlayer.username} is offline (skipping turn).`, 'info'), ...state.logs].slice(0, 50);
      match.gameState = advanceServerTurn(match.gameState);
      match.gameState.turnStartedAt = now;
      broadcastMatch(matchId);
      schedulePersist({ matchId });
    }
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

setInterval(() => {
  try {
    let totalUserTickets = 0;
    for (const user of users.values()) {
      totalUserTickets += user.availableTickets + user.heldTickets;
    }
    console.log(`[Audit] Total circulating tickets across all users: ${totalUserTickets.toFixed(2)} TKT`);
  } catch (err) {
    console.error('[Audit] Failed to execute double-entry bookkeeping validation:', err);
  }
}, 3600000); // 1 hour

function assertProductionBootstrapConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [
    ['TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN],
    ['APP_SESSION_SECRET', APP_SESSION_SECRET],
    ['ADMIN_API_KEY', ADMIN_API_KEY],
    ['TON_API_KEY', TON_API_KEY],
  ]
    .filter(([, value]) => !value || value === 'local-dev-session-secret')
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing or insecure production configuration: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  assertProductionBootstrapConfiguration();
  // Render's local filesystem is ephemeral. Starting production without the
  // managed Supabase store would make referral links, balances and payouts
  // disappear on a cold restart, so fail fast instead of accepting money.
  if (process.env.NODE_ENV === 'production' && !supabaseAdmin) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production.');
  }
  await loadPersistedState();
  await applyOneTimeReferralReset();
  await applyOneTimeBalanceRepair();
  ticketingService.reconcilePendingWithdrawals();
  try {
    await ticketingService.recheckPendingWithdrawals();
  } catch (error) {
    console.error('Initial pending withdrawal chain recheck failed', error);
  }
  recoverPendingWithdrawalNotifications();
  flushTelegramNotifications().catch((error) => {
    console.error('Initial withdrawal notification flush failed', error);
  });
  ticketingService.startBackgroundDepositRecheck();
  ticketingService.recheckPendingDeposits().catch((error) => {
    console.error('Initial pending deposit recheck failed', error);
  });
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Redoapp backend running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Backend bootstrap failed', error);
  process.exit(1);
});
