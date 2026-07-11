import type { Express, NextFunction, Request, Response } from 'express';
import { Cell, beginCell, loadMessage } from '@ton/core';

export type LedgerType =
  | 'wallet'
  | 'reward'
  | 'purchase'
  | 'stake_hold'
  | 'stake_release'
  | 'match_payout'
  | 'referral_bonus'
  | 'fund_season'
  | 'fund_burn'
  | 'withdraw_pending'
  | 'withdraw_rejected'
  | 'withdraw_completed';

export interface TicketLedgerEntry {
  id: string;
  userId: string;
  event: string;
  value: string;
  type: LedgerType;
  amount: number;
  createdAt: number;
}

export interface DepositIntent {
  id: string;
  userId: string;
  walletAddress: string;
  ticketAmount: number;
  tonAmount: number;
  status: 'pending' | 'confirmed';
  createdAt: number;
  normalizedMessageHash?: string;
  txHash?: string;
  signedBoc?: string;
  lastVerificationError?: string | null;
  lastVerificationAt?: number | null;
  confirmationAttempts?: number;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  walletAddress: string;
  ticketAmount: number;
  tonAmount: number;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: number;
  completedAt?: number;
  completedTxHash?: string | null;
  operatorTransferLink?: string;
  reviewFlags?: string[];
}

interface UserStateLike {
  userId: string;
  telegramId?: number;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  walletAddress?: string;
  availableTickets: number;
  heldTickets: number;
  transactions: TicketLedgerEntry[];
}

interface TonVerificationResult {
  ok: boolean;
  provider: string;
  reason?: string;
  normalizedMessageHash?: string;
  txHash?: string;
}

interface TicketingDeps {
  createLedgerEntry: (user: UserStateLike, entry: Omit<TicketLedgerEntry, 'id' | 'createdAt' | 'userId'>) => TicketLedgerEntry;
  depositIntents: Map<string, DepositIntent>;
  getUser: (userId: string, walletAddress?: string) => UserStateLike;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
  round2: (value: number) => number;
  schedulePersist: (opts?: {
    userId?: string;
    matchId?: string;
    roomCode?: string;
    depositId?: string;
    withdrawalId?: string;
    deleteMatchId?: string;
    deleteRoomCode?: string;
  }) => void;
  getWithdrawalReviewFlags?: (user: UserStateLike, request: WithdrawalRequest, pendingRequests: WithdrawalRequest[]) => string[];
  notifyWithdrawalRequest?: (user: UserStateLike, request: WithdrawalRequest) => void;
  withdrawalRequests: Map<string, WithdrawalRequest>;
}

interface TicketingConfig {
  backgroundRecheckIntervalMs: number;
  depositIntentTtlMs: number;
  enableChainVerification: boolean;
  marketingWallet: string;
  minWithdrawTickets: number;
  ticketPriceTon: number;
  tonApiBaseUrl: string;
  tonApiKey: string;
  tonVerificationMode: string;
}

export interface PendingDepositView {
  id: string;
  ticketAmount: number;
  tonAmount: number;
  status: 'pending' | 'confirmed';
  createdAt: number;
  txHash?: string | null;
  normalizedMessageHash?: string | null;
  lastVerificationError?: string | null;
  lastVerificationAt?: number | null;
  confirmationAttempts: number;
  expiresAt: number;
  canRetry: boolean;
}

function toNano(value: number) {
  return BigInt(Math.round(value * 1_000_000_000));
}

function extractAddress(candidate: unknown): string | null {
  if (!candidate) return null;
  if (typeof candidate === 'string') return candidate;
  if (typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>;
    if (typeof record.address === 'string') return record.address;
    if (typeof record.raw === 'string') return record.raw;
  }
  return null;
}

function extractNanoAmount(candidate: unknown): bigint | null {
  if (candidate == null) return null;
  if (typeof candidate === 'string' && /^\d+$/.test(candidate)) return BigInt(candidate);
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return BigInt(Math.trunc(candidate));
  if (typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>;
    if (typeof record.coins === 'string' && /^\d+$/.test(record.coins)) return BigInt(record.coins);
  }
  return null;
}

function getNormalizedExternalMessageHash(signedBoc: string) {
  const normalizedBoc = String(signedBoc || '').trim();
  if (!normalizedBoc) return null;

  try {
    const root = Cell.fromBase64(normalizedBoc);
    const message = loadMessage(root.beginParse());
    if (message.info.type !== 'external-in') {
      return null;
    }

    const normalized = beginCell()
      .storeUint(2, 2)
      .storeUint(0, 2)
      .storeAddress(message.info.dest)
      .storeUint(0, 4)
      .storeBit(false)
      .storeBit(true)
      .storeRef(message.body)
      .endCell();

    return normalized.hash().toString('hex');
  } catch {
    return null;
  }
}

function normalizeWalletAddress(value: string) {
  return String(value || '').trim();
}

function buildTonkeeperTransferLink(walletAddress: string, tonAmount: number, comment: string) {
  const nanoAmount = Math.round(tonAmount * 1_000_000_000);
  const params = new URLSearchParams({
    amount: String(nanoAmount),
    text: comment,
  });
  return `https://app.tonkeeper.com/transfer/${encodeURIComponent(walletAddress)}?${params.toString()}`;
}

function transactionMatchesIntent(transaction: Record<string, unknown>, intent: DepositIntent, config: TicketingConfig) {
  const outMessages = Array.isArray(transaction.out_msgs) ? transaction.out_msgs : [];
  const expectedNano = toNano(intent.tonAmount);

  return outMessages.some((message) => {
    const record = (message || {}) as Record<string, unknown>;
    const destination = extractAddress(record.destination) || extractAddress(record.dest);
    const value = extractNanoAmount(record.value);
    return destination === config.marketingWallet && value === expectedNano;
  });
}

async function pollTonApiTransactionByMessageHash(messageHash: string, intent: DepositIntent, config: TicketingConfig) {
  const requestUrl = `${config.tonApiBaseUrl.replace(/\/$/, '')}/blockchain/messages/${messageHash}/transaction`;
  const headers: Record<string, string> = config.tonApiKey
    ? { Authorization: `Bearer ${config.tonApiKey}` }
    : {};
  const delaysMs = [1000, 2000, 4000, 8000, 12000];

  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    let response = await fetch(requestUrl, { headers });

    // TonAPI allows limited unauthenticated REST access. A stale/revoked key
    // must not make every already-broadcast payment impossible to verify.
    if (response.status === 401 && config.tonApiKey) {
      console.warn('TonAPI rejected TON_API_KEY; retrying deposit verification without it.');
      response = await fetch(requestUrl, { headers: { Accept: 'application/json' } });
    }

    if (response.ok) {
      const payload = await response.json() as Record<string, unknown>;
      if (!transactionMatchesIntent(payload, intent, config)) {
        throw new Error('TON transaction does not match the expected wallet or ticket amount.');
      }
      return payload as { hash: string };
    }

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after') || '0');
      await new Promise((resolve) => setTimeout(resolve, Math.max(delaysMs[attempt], retryAfterSeconds * 1000, 1100)));
      continue;
    }

    if (response.status !== 404) {
      throw new Error(`TonAPI returned HTTP ${response.status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
  }

  throw new Error('Transaction was not found in TON within the verification window.');
}

async function verifyTonDeposit(intent: DepositIntent, signedBoc: string, config: TicketingConfig): Promise<TonVerificationResult> {
  // Never credit a deposit from client-supplied data alone: it must be checked on-chain.
  if (!config.enableChainVerification || config.tonVerificationMode === 'manual') {
    return {
      ok: false,
      provider: config.tonVerificationMode,
      reason: 'On-chain deposit verification is required.',
    };
  }
  const normalizedMessageHash = getNormalizedExternalMessageHash(signedBoc);
  if (!normalizedMessageHash) {
    return {
      ok: false,
      provider: config.tonVerificationMode,
      reason: 'Missing or invalid signedBoc.',
    };
  }

  try {
    const transaction = await pollTonApiTransactionByMessageHash(normalizedMessageHash, intent, config);
    return {
      ok: true,
      provider: config.tonVerificationMode,
      normalizedMessageHash,
      txHash: transaction.hash,
    };
  } catch (error) {
    return {
      ok: false,
      provider: config.tonVerificationMode,
      reason: error instanceof Error ? error.message : 'Unknown verification failure.',
    };
  }
}

export function createTicketingService(deps: TicketingDeps, config: TicketingConfig) {
  let backgroundTimer: NodeJS.Timeout | null = null;
  const getRequestUserId = (req: Request) => (req as Request & { authUserId?: string }).authUserId;

  function isIntentExpired(intent: DepositIntent) {
    return Date.now() - intent.createdAt > config.depositIntentTtlMs;
  }

  function hasDuplicateMessageHash(intent: DepositIntent, normalizedMessageHash?: string) {
    if (!normalizedMessageHash) return false;
    return Array.from(deps.depositIntents.values()).some((entry) => (
      entry.id !== intent.id
      && entry.normalizedMessageHash
      && entry.normalizedMessageHash === normalizedMessageHash
    ));
  }

  function finalizeConfirmedIntent(intent: DepositIntent, verification: TonVerificationResult | null) {
    if (intent.status === 'confirmed') {
      return deps.getUser(intent.userId, intent.walletAddress);
    }

    intent.status = 'confirmed';
    intent.normalizedMessageHash = verification?.normalizedMessageHash || intent.normalizedMessageHash;
    intent.txHash = verification?.txHash || intent.txHash;
    intent.lastVerificationError = null;
    intent.lastVerificationAt = Date.now();
    deps.schedulePersist({ depositId: intent.id, userId: intent.userId });

    const user = deps.getUser(intent.userId, intent.walletAddress);
    user.availableTickets = deps.round2(user.availableTickets + intent.ticketAmount);
    deps.createLedgerEntry(user, {
      event: 'Deposit Confirmed',
      value: `+${intent.ticketAmount.toFixed(2)} TKT`,
      type: 'purchase',
      amount: intent.ticketAmount,
    });
    return user;
  }

  async function attemptDepositConfirmation(intent: DepositIntent, signedBoc: string) {
    intent.signedBoc = signedBoc;
    intent.confirmationAttempts = (intent.confirmationAttempts || 0) + 1;
    intent.lastVerificationAt = Date.now();
    deps.schedulePersist({ depositId: intent.id });

    const verification = await verifyTonDeposit(intent, signedBoc, config);
    if (!verification.ok) {
      intent.lastVerificationError = verification.reason || 'Transaction verification failed.';
      deps.schedulePersist({ depositId: intent.id });
      return {
        ok: false as const,
        verification,
      };
    }

    if (hasDuplicateMessageHash(intent, verification.normalizedMessageHash)) {
      intent.lastVerificationError = 'This blockchain payment was already used for another deposit.';
      deps.schedulePersist({ depositId: intent.id });
      return {
        ok: false as const,
        verification: {
          ok: false,
          provider: verification.provider,
          reason: intent.lastVerificationError,
        },
      };
    }

    const user = finalizeConfirmedIntent(intent, verification);
    return {
      ok: true as const,
      verification,
      user,
    };
  }

  function buildPendingDepositView(intent: DepositIntent): PendingDepositView {
    const expiresAt = intent.createdAt + config.depositIntentTtlMs;
    return {
      id: intent.id,
      ticketAmount: intent.ticketAmount,
      tonAmount: intent.tonAmount,
      status: intent.status,
      createdAt: intent.createdAt,
      txHash: intent.txHash || null,
      normalizedMessageHash: intent.normalizedMessageHash || null,
      lastVerificationError: intent.lastVerificationError || null,
      lastVerificationAt: intent.lastVerificationAt || null,
      confirmationAttempts: intent.confirmationAttempts || 0,
      expiresAt,
      canRetry: intent.status === 'pending' && !!intent.signedBoc && Date.now() < expiresAt,
    };
  }

  async function recheckPendingDeposits() {
    const now = Date.now();
    const pending = Array.from(deps.depositIntents.values()).filter((intent) => (
      intent.status === 'pending'
      && !!intent.signedBoc
      && !isIntentExpired(intent)
      // TonAPI may need time to index a broadcast transaction. Retrying every
      // 15 seconds multiplied provider calls and caused avoidable 429s.
      && (!intent.lastVerificationAt || now - intent.lastVerificationAt >= 60_000)
    ));

    for (const intent of pending) {
      try {
        await attemptDepositConfirmation(intent, intent.signedBoc!);
      } catch (error) {
        intent.lastVerificationError = error instanceof Error ? error.message : 'Background verification failed.';
        intent.lastVerificationAt = Date.now();
        deps.schedulePersist({ depositId: intent.id });
      }
    }
  }

  function startBackgroundDepositRecheck() {
    if (backgroundTimer) return;
    backgroundTimer = setInterval(() => {
      recheckPendingDeposits().catch((error) => {
        console.error('Pending deposit background recheck failed', error);
      });
    }, config.backgroundRecheckIntervalMs);
  }

  function registerRoutes(app: Express) {
    app.get(['/api/tickets/balance', '/api/tickets/balance/:userId'], (req: Request, res: Response) => {
      const userId = req.params.userId || getRequestUserId(req);
      if (!userId) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      if (req.params.userId && getRequestUserId(req) !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      const user = deps.getUser(userId);
      return res.json({
        availableTickets: user.availableTickets,
        heldTickets: user.heldTickets,
        totalTickets: deps.round2(user.availableTickets + user.heldTickets),
      });
    });

    app.get(['/api/tickets/ledger', '/api/tickets/ledger/:userId'], (req: Request, res: Response) => {
      const userId = req.params.userId || getRequestUserId(req);
      if (!userId) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      if (req.params.userId && getRequestUserId(req) !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      const user = deps.getUser(userId);
      return res.json({ transactions: user.transactions });
    });

    app.get(['/api/tickets/pending', '/api/tickets/pending/:userId'], (req: Request, res: Response) => {
      const userId = req.params.userId || getRequestUserId(req);
      if (!userId) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      if (req.params.userId && getRequestUserId(req) !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      const pending = Array.from(deps.depositIntents.values())
        .filter((intent) => intent.userId === userId && intent.status === 'pending')
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(buildPendingDepositView);
      return res.json({ deposits: pending });
    });

    app.post('/api/tickets/deposit-intent', (req: Request, res: Response) => {
      const { walletAddress, ticketAmount } = req.body;
      const userId = getRequestUserId(req);
      const amount = Number(ticketAmount);
      if (!userId || !walletAddress || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Deposit requires userId, walletAddress and a positive ticket amount.' });
      }
      deps.getUser(userId, walletAddress);
      const roundedTicketAmount = deps.round2(amount);
      const reusableIntent = Array.from(deps.depositIntents.values()).find((entry) => (
        entry.userId === userId
        && entry.walletAddress === walletAddress
        && entry.ticketAmount === roundedTicketAmount
        && entry.status === 'pending'
        && !entry.signedBoc
        && !isIntentExpired(entry)
      ));
      if (reusableIntent) {
        return res.json({
          intentId: reusableIntent.id,
          marketingWallet: config.marketingWallet,
          ticketAmount: reusableIntent.ticketAmount,
          tonAmount: reusableIntent.tonAmount,
          status: reusableIntent.status,
          reused: true,
        });
      }
      const intent: DepositIntent = {
        id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        walletAddress,
        ticketAmount: roundedTicketAmount,
        tonAmount: deps.round2(amount * config.ticketPriceTon),
        status: 'pending',
        createdAt: Date.now(),
        lastVerificationError: null,
        lastVerificationAt: null,
        confirmationAttempts: 0,
      };
      deps.depositIntents.set(intent.id, intent);
      deps.schedulePersist({ depositId: intent.id, userId: intent.userId });
      return res.json({
        intentId: intent.id,
        marketingWallet: config.marketingWallet,
        ticketAmount: intent.ticketAmount,
        tonAmount: intent.tonAmount,
        status: intent.status,
      });
    });

    app.post('/api/tickets/deposit-confirm', async (req: Request, res: Response) => {
      const { intentId, signedBoc } = req.body;
      const intent = deps.depositIntents.get(intentId);
      if (!intent) {
        return res.status(404).json({ error: 'Deposit intent not found.' });
      }
      if (intent.userId !== getRequestUserId(req)) {
        return res.status(403).json({ error: 'This deposit intent belongs to another account.' });
      }
      if (isIntentExpired(intent)) {
        return res.status(400).json({ error: 'Deposit intent expired. Please start a new purchase.' });
      }
      if (config.enableChainVerification && !signedBoc && !intent.signedBoc) {
        return res.status(400).json({ error: 'signedBoc is required when chain verification is enabled.' });
      }
      if (intent.status === 'confirmed') {
        const user = deps.getUser(intent.userId, intent.walletAddress);
        return res.json({
          success: true,
          availableTickets: user.availableTickets,
          status: intent.status,
          txHash: intent.txHash || null,
          normalizedMessageHash: intent.normalizedMessageHash || null,
        });
      }

      const confirmation = await attemptDepositConfirmation(intent, signedBoc || intent.signedBoc || '');
      if (!confirmation.ok) {
        return res.status(400).json({
          error: confirmation.verification.reason || 'Transaction verification failed.',
          verificationProvider: confirmation.verification.provider,
          pendingDeposit: buildPendingDepositView(intent),
        });
      }

      return res.json({
        success: true,
        txHash: confirmation.verification.txHash || null,
        normalizedMessageHash: confirmation.verification.normalizedMessageHash || null,
        status: intent.status,
        availableTickets: confirmation.user.availableTickets,
      });
    });

    app.post('/api/tickets/withdraw-request', (req: Request, res: Response) => {
      const { walletAddress, ticketAmount } = req.body;
      const userId = getRequestUserId(req);
      if (!userId || !walletAddress || !ticketAmount) {
        return res.status(400).json({ error: 'Withdrawal requires userId, walletAddress and ticketAmount.' });
      }
      const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
      if (!normalizedWalletAddress) {
        return res.status(400).json({ error: 'Withdrawal wallet address is required.' });
      }
      const amount = Number(ticketAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Withdrawal amount must be greater than 0.' });
      }
      if (amount < config.minWithdrawTickets) {
        return res.status(400).json({ error: `Minimum withdrawal is ${config.minWithdrawTickets} tickets.` });
      }
      const user = deps.getUser(userId);
      if (user.walletAddress && user.walletAddress !== normalizedWalletAddress) {
        return res.status(400).json({ error: 'Withdrawal wallet does not match the connected account on this profile.' });
      }
      if (!user.walletAddress) {
        user.walletAddress = normalizedWalletAddress;
      }
      if (user.availableTickets < amount) {
        return res.status(400).json({ error: 'Insufficient available tickets.' });
      }
      const pendingRequests = Array.from(deps.withdrawalRequests.values()).filter((request) => (
        request.userId === userId && request.status === 'pending'
      ));
      if (pendingRequests.length > 0) {
        return res.status(400).json({ error: 'You already have a pending withdrawal request.' });
      }
      const tonAmount = deps.round2(amount * config.ticketPriceTon);
      user.availableTickets = deps.round2(user.availableTickets - amount);
      const request: WithdrawalRequest = {
        id: `wd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        walletAddress: normalizedWalletAddress,
        ticketAmount: amount,
        tonAmount,
        status: 'pending',
        createdAt: Date.now(),
      };
      request.operatorTransferLink = buildTonkeeperTransferLink(
        request.walletAddress,
        request.tonAmount,
        `Redoapp withdrawal ${request.id}`
      );
      request.reviewFlags = deps.getWithdrawalReviewFlags?.(user, request, pendingRequests) || [];
      deps.withdrawalRequests.set(request.id, request);
      deps.schedulePersist({ withdrawalId: request.id, userId: user.userId });
      deps.createLedgerEntry(user, {
        event: 'Withdrawal Requested',
        value: `-${amount.toFixed(2)} TKT`,
        type: 'withdraw_pending',
        amount: -amount,
      });
      deps.notifyWithdrawalRequest?.(user, request);
      return res.json({
        success: true,
        requestId: request.id,
        status: request.status,
        tonAmount: request.tonAmount,
      });
    });

    app.post('/api/tickets/withdraw-complete', deps.requireAdmin, (req: Request, res: Response) => {
      const { requestId, txHash } = req.body;
      const request = deps.withdrawalRequests.get(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Withdrawal request not found.' });
      }
      if (request.status === 'completed') {
        return res.json({ success: true, status: request.status });
      }
      if (request.status === 'rejected') {
        return res.status(400).json({ error: 'Withdrawal request was already rejected.' });
      }
      request.status = 'completed';
      request.completedAt = Date.now();
      request.completedTxHash = typeof txHash === 'string' && txHash.trim() ? txHash.trim() : null;
      deps.schedulePersist({ withdrawalId: request.id, userId: request.userId });
      const user = deps.getUser(request.userId, request.walletAddress);
      deps.createLedgerEntry(user, {
        event: 'Withdrawal Completed',
        value: `${request.ticketAmount.toFixed(2)} TKT`,
        type: 'withdraw_completed',
        amount: request.ticketAmount,
      });
      return res.json({ success: true, status: request.status });
    });
  }

  return {
    registerRoutes,
    startBackgroundDepositRecheck,
    recheckPendingDeposits,
  };
}
