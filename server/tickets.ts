import type { Express, NextFunction, Request, Response } from 'express';
import { Address, Cell, beginCell, loadMessage } from '@ton/core';

export type LedgerType =
  | 'wallet'
  | 'reward'
  | 'purchase'
  | 'deposit_reversal'
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
  paymentReference?: string;
  paymentPayload?: string;
  creditReversedAt?: number;
  duplicateOfIntentId?: string;
  paymentMessageHash?: string;
  lastCreditAuditAt?: number;
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
  payoutComment?: string;
  reviewFlags?: string[];
  outboundTxHash?: string | null;
  outboundMessageHash?: string | null;
  lastChainCheckAt?: number | null;
}

function buildWithdrawalPayoutComment(requestId: string) {
  const compactId = requestId.replace(/[^a-zA-Z0-9]/g, '').slice(-12);
  return `WD-${compactId}`;
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
  paymentMessageHash?: string;
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
  claimDepositPayment?: (claimKey: string, intentId: string) => Promise<{ claimed: boolean; ownerIntentId: string }>;
  getWithdrawalNotificationStatus?: (requestId: string) => 'queued' | 'sent' | 'failed' | 'missing';
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
  withdrawalSenderWallet: string;
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

function canonicalTonAddress(value: string | null | undefined) {
  if (!value) return null;
  try {
    return Address.parse(value).toRawString().toLowerCase();
  } catch {
    return String(value).trim().toLowerCase() || null;
  }
}

function tonAddressesEqual(left: string | null | undefined, right: string | null | undefined) {
  const canonicalLeft = canonicalTonAddress(left);
  const canonicalRight = canonicalTonAddress(right);
  return !!canonicalLeft && canonicalLeft === canonicalRight;
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

function buildDepositPaymentPayload(reference: string) {
  return beginCell().storeUint(0, 32).storeStringTail(reference).endCell().toBoc().toString('base64');
}

function extractTextComment(message: Record<string, unknown>) {
  const decoded = message.decoded_body && typeof message.decoded_body === 'object'
    ? message.decoded_body as Record<string, unknown>
    : null;
  const decodedText = decoded && (decoded.text || decoded.comment);
  if (typeof decodedText === 'string') return decodedText;
  const body = typeof message.raw_body === 'string' ? message.raw_body : typeof message.body === 'string' ? message.body : '';
  if (!body) return null;
  try {
    const slice = Cell.fromBase64(body).beginParse();
    if (slice.loadUint(32) !== 0) return null;
    return slice.loadStringTail();
  } catch {
    return null;
  }
}

function messageMatchesPaymentReference(message: Record<string, unknown>, intent: DepositIntent) {
  return !intent.paymentReference || extractTextComment(message) === intent.paymentReference;
}

function transactionSucceeded(transaction: Record<string, unknown>) {
  const compute = transaction.compute_phase && typeof transaction.compute_phase === 'object'
    ? transaction.compute_phase as Record<string, unknown>
    : null;
  const action = transaction.action_phase && typeof transaction.action_phase === 'object'
    ? transaction.action_phase as Record<string, unknown>
    : null;
  return transaction.success !== false
    && transaction.aborted !== true
    && compute?.success !== false
    && action?.success !== false;
}

function findMatchingPaymentMessage(transaction: Record<string, unknown>, intent: DepositIntent, config: TicketingConfig) {
  if (!transactionSucceeded(transaction)) return null;
  const outMessages = Array.isArray(transaction.out_msgs) ? transaction.out_msgs : [];
  const expectedNano = toNano(intent.tonAmount);
  const transactionAccount = extractAddress(transaction.account);
  const senderPaymentMessage = tonAddressesEqual(transactionAccount, intent.walletAddress) && outMessages.find((message) => {
    const record = (message || {}) as Record<string, unknown>;
    const destination = extractAddress(record.destination) || extractAddress(record.dest);
    const value = extractNanoAmount(record.value);
    return tonAddressesEqual(destination, config.marketingWallet)
      && value === expectedNano
      && messageMatchesPaymentReference(record, intent);
  });

  if (senderPaymentMessage) return senderPaymentMessage as Record<string, unknown>;

  // Depending on the indexed message direction, TonAPI may return the
  // recipient transaction instead of the sender-wallet transaction.
  const inMessage = transaction.in_msg && typeof transaction.in_msg === 'object'
    ? transaction.in_msg as Record<string, unknown>
    : null;
  if (!inMessage) return null;
  const source = extractAddress(inMessage.source) || extractAddress(inMessage.src);
  const destination = extractAddress(inMessage.destination) || extractAddress(inMessage.dest);
  const value = extractNanoAmount(inMessage.value);
  return (
    tonAddressesEqual(transactionAccount, config.marketingWallet)
    && tonAddressesEqual(source, intent.walletAddress)
    && tonAddressesEqual(destination, config.marketingWallet)
    && value === expectedNano
    && messageMatchesPaymentReference(inMessage, intent)
  ) ? inMessage : null;
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
      const paymentMessage = findMatchingPaymentMessage(payload, intent, config);
      if (!paymentMessage) {
        throw new Error('TON transaction does not match the expected wallet or ticket amount.');
      }
      if (typeof payload.hash !== 'string' || !payload.hash.trim()) {
        throw new Error('TonAPI returned a transaction without a canonical hash.');
      }
      const paymentMessageHash = typeof paymentMessage.hash === 'string' ? paymentMessage.hash.trim() : '';
      if (!paymentMessageHash) {
        throw new Error('TonAPI returned a payment message without a canonical hash.');
      }
      return { hash: payload.hash, paymentMessageHash } as { hash: string; paymentMessageHash: string };
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
      paymentMessageHash: transaction.paymentMessageHash,
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
  let confirmationClaimQueue: Promise<void> = Promise.resolve();
  let depositReconciliationPromise: Promise<void> | null = null;
  const signedDepositRecoveryTtlMs = 7 * 24 * 60 * 60 * 1000;
  const pendingWithdrawalTtlMs = 24 * 60 * 60 * 1000;
  const getRequestUserId = (req: Request) => (req as Request & { authUserId?: string }).authUserId;

  function isIntentExpired(intent: DepositIntent) {
    return Date.now() - intent.createdAt > config.depositIntentTtlMs;
  }

  function canRecoverSignedIntent(intent: DepositIntent) {
    return !!intent.signedBoc && Date.now() - intent.createdAt <= signedDepositRecoveryTtlMs;
  }

  function expirePendingWithdrawal(request: WithdrawalRequest) {
    if (request.status !== 'pending' || Date.now() - request.createdAt < pendingWithdrawalTtlMs) return false;
    return rejectPendingWithdrawal(request, 'Withdrawal Expired');
  }

  function rejectPendingWithdrawal(request: WithdrawalRequest, event: string) {
    if (request.status !== 'pending') return false;
    const user = deps.getUser(request.userId, request.walletAddress);
    request.status = 'rejected';
    request.completedAt = Date.now();
    user.availableTickets = deps.round2(user.availableTickets + request.ticketAmount);
    deps.createLedgerEntry(user, {
      event,
      value: `+${request.ticketAmount.toFixed(2)} TKT`,
      type: 'withdraw_rejected',
      amount: request.ticketAmount,
    });
    deps.schedulePersist({ withdrawalId: request.id, userId: request.userId });
    return true;
  }

  function reconcilePendingWithdrawals() {
    for (const request of deps.withdrawalRequests.values()) expirePendingWithdrawal(request);
  }

  async function getWithdrawalWalletReadiness(requiredTon = 0) {
    const requestUrl = `${config.tonApiBaseUrl.replace(/\/$/, '')}/blockchain/accounts/${encodeURIComponent(config.withdrawalSenderWallet)}`;
    const headers: Record<string, string> = config.tonApiKey ? { Authorization: `Bearer ${config.tonApiKey}` } : {};
    let response = await fetch(requestUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (response.status === 401 && config.tonApiKey) {
      response = await fetch(requestUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    }
    if (!response.ok) throw new Error(`TonAPI payout wallet check returned HTTP ${response.status}.`);
    const account = await response.json() as { status?: string; balance?: number | string };
    const balanceNano = BigInt(String(account.balance || '0'));
    return {
      active: account.status === 'active',
      status: account.status || 'unknown',
      funded: balanceNano >= toNano(requiredTon) + toNano(0.05),
    };
  }

  function completeWithdrawalFromChain(request: WithdrawalRequest, txHash: string, messageHash: string) {
    if (request.status !== 'pending' && request.status !== 'rejected') return false;
    const messageAlreadyClaimed = Array.from(deps.withdrawalRequests.values()).some((entry) => (
      entry.id !== request.id && entry.outboundMessageHash === messageHash
    ));
    if (messageAlreadyClaimed) return false;
    const wasRefunded = request.status === 'rejected';
    request.status = 'completed';
    request.completedAt = Date.now();
    request.completedTxHash = txHash;
    request.outboundTxHash = txHash;
    request.outboundMessageHash = messageHash;
    const user = deps.getUser(request.userId, request.walletAddress);
    if (wasRefunded) {
      user.availableTickets = deps.round2(user.availableTickets - request.ticketAmount);
    }
    deps.createLedgerEntry(user, {
      event: wasRefunded ? 'Late Withdrawal Settled' : 'Withdrawal Completed',
      value: wasRefunded ? `-${request.ticketAmount.toFixed(2)} TKT` : `${request.ticketAmount.toFixed(2)} TKT`,
      type: 'withdraw_completed',
      amount: wasRefunded ? -request.ticketAmount : request.ticketAmount,
    });
    deps.schedulePersist({ withdrawalId: request.id, userId: request.userId });
    return true;
  }

  function withdrawalMatchesTransaction(transaction: Record<string, unknown>, request: WithdrawalRequest) {
    if (!transactionSucceeded(transaction)) return null;
    const account = extractAddress(transaction.account);
    if (!tonAddressesEqual(account, config.withdrawalSenderWallet)) return null;
    const expectedNano = toNano(request.tonAmount);
    // Requests created before payoutComment was introduced keep their original
    // comment so already-issued operator buttons remain verifiable.
    const expectedComment = request.payoutComment || `Redoapp withdrawal ${request.id}`;
    const outMessages = Array.isArray(transaction.out_msgs) ? transaction.out_msgs : [];
    return outMessages.find((message) => {
      const record = (message || {}) as Record<string, unknown>;
      const destination = extractAddress(record.destination) || extractAddress(record.dest);
      const value = extractNanoAmount(record.value);
      return tonAddressesEqual(destination, request.walletAddress)
        && value === expectedNano
        && extractTextComment(record) === expectedComment;
    }) as Record<string, unknown> | undefined || null;
  }

  async function recheckPendingWithdrawals() {
    reconcilePendingWithdrawals();
    const pending = Array.from(deps.withdrawalRequests.values()).filter((request) => request.status === 'pending');
    const candidates = Array.from(deps.withdrawalRequests.values()).filter((request) => (
      (request.status === 'pending' || request.status === 'rejected') && !request.outboundMessageHash
    ));
    if (!candidates.length) return 0;
    const readiness = await getWithdrawalWalletReadiness();
    if (!readiness.active) {
      pending.forEach((request) => rejectPendingWithdrawal(request, 'Withdrawal Refunded — Payout Wallet Inactive'));
    }
    const requestUrl = `${config.tonApiBaseUrl.replace(/\/$/, '')}/blockchain/accounts/${encodeURIComponent(config.withdrawalSenderWallet)}/transactions?limit=100&sort_order=desc`;
    const headers: Record<string, string> = config.tonApiKey ? { Authorization: `Bearer ${config.tonApiKey}` } : {};
    let response = await fetch(requestUrl, { headers, signal: AbortSignal.timeout(12_000) });
    if (response.status === 401 && config.tonApiKey) {
      response = await fetch(requestUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    }
    if (!response.ok) throw new Error(`TonAPI withdrawal recheck returned HTTP ${response.status}.`);
    const payload = await response.json() as { transactions?: Array<Record<string, unknown>> };
    const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    let completedCount = 0;
    for (const request of candidates) {
      request.lastChainCheckAt = Date.now();
      const transaction = transactions.find((entry) => {
        const timestamp = Number(entry.utime || entry.now || 0) * 1000;
        return (!timestamp || timestamp >= request.createdAt - 60_000) && !!withdrawalMatchesTransaction(entry, request);
      });
      if (!transaction) {
        deps.schedulePersist({ withdrawalId: request.id });
        continue;
      }
      const message = withdrawalMatchesTransaction(transaction, request);
      const txHash = typeof transaction.hash === 'string' ? transaction.hash : '';
      const messageHash = message && typeof message.hash === 'string' ? message.hash : '';
      if (txHash && messageHash && completeWithdrawalFromChain(request, txHash, messageHash)) completedCount += 1;
    }
    return completedCount;
  }

  function hasDuplicateMessageHash(intent: DepositIntent, normalizedMessageHash?: string) {
    if (!normalizedMessageHash) return false;
    return Array.from(deps.depositIntents.values()).some((entry) => (
      entry.id !== intent.id
      && entry.normalizedMessageHash
      && entry.normalizedMessageHash === normalizedMessageHash
    ));
  }

  function findClaimedIntent(intent: DepositIntent, verification: TonVerificationResult) {
    return Array.from(deps.depositIntents.values()).find((entry) => (
      entry.id !== intent.id
      && entry.status === 'confirmed'
      && !entry.creditReversedAt
      && (
        (!!verification.txHash && entry.txHash === verification.txHash)
        || (!!verification.paymentMessageHash && entry.paymentMessageHash === verification.paymentMessageHash)
        || (!!verification.normalizedMessageHash && entry.normalizedMessageHash === verification.normalizedMessageHash)
      )
    ));
  }

  async function withConfirmationClaimLock<T>(task: () => Promise<T>) {
    const previous = confirmationClaimQueue;
    let release = () => {};
    confirmationClaimQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  function reverseDuplicateCredit(intent: DepositIntent, canonicalIntentId: string) {
    if (intent.creditReversedAt) return;
    const user = deps.getUser(intent.userId, intent.walletAddress);
    user.availableTickets = deps.round2(user.availableTickets - intent.ticketAmount);
    intent.creditReversedAt = Date.now();
    intent.duplicateOfIntentId = canonicalIntentId;
    deps.createLedgerEntry(user, {
      event: 'Duplicate Deposit Reversed',
      value: `-${intent.ticketAmount.toFixed(2)} TKT`,
      type: 'deposit_reversal',
      amount: -intent.ticketAmount,
    });
    deps.schedulePersist({ depositId: intent.id, userId: intent.userId });
  }

  async function performDuplicateDepositReconciliation() {
    const unaudited = Array.from(deps.depositIntents.values()).filter((intent) => (
      intent.status === 'confirmed'
      && !intent.creditReversedAt
      && !intent.paymentMessageHash
      && !!intent.signedBoc
    ));
    for (const intent of unaudited) {
      const verification = await verifyTonDeposit(intent, intent.signedBoc!, config);
      intent.lastCreditAuditAt = Date.now();
      if (verification.ok && verification.paymentMessageHash) {
        intent.paymentMessageHash = verification.paymentMessageHash;
        intent.txHash = verification.txHash || intent.txHash;
        intent.normalizedMessageHash = verification.normalizedMessageHash || intent.normalizedMessageHash;
      }
      deps.schedulePersist({ depositId: intent.id });
    }

    const confirmed = Array.from(deps.depositIntents.values())
      .filter((intent) => intent.status === 'confirmed' && !intent.creditReversedAt)
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    const owners = new Map<string, DepositIntent>();
    for (const intent of confirmed) {
      const keys = [intent.paymentMessageHash && `payment-msg:${intent.paymentMessageHash}`, intent.txHash && `tx:${intent.txHash}`, intent.normalizedMessageHash && `msg:${intent.normalizedMessageHash}`]
        .filter(Boolean) as string[];
      const canonical = keys.map((key) => owners.get(key)).find((entry): entry is DepositIntent => !!entry);
      if (canonical) {
        reverseDuplicateCredit(intent, canonical.id);
        continue;
      }
      keys.forEach((key) => owners.set(key, intent));
      const durableClaimKey = intent.paymentMessageHash ? `payment-msg:${intent.paymentMessageHash}` : intent.txHash ? `tx:${intent.txHash}` : '';
      if (durableClaimKey && deps.claimDepositPayment) {
        const claim = await deps.claimDepositPayment(durableClaimKey, intent.id);
        if (!claim.claimed && claim.ownerIntentId !== intent.id) reverseDuplicateCredit(intent, claim.ownerIntentId);
      }
    }

    const intentsByUser = new Map<string, DepositIntent[]>();
    for (const intent of deps.depositIntents.values()) {
      const entries = intentsByUser.get(intent.userId) || [];
      entries.push(intent);
      intentsByUser.set(intent.userId, entries);
    }
    for (const [userId, intents] of intentsByUser) {
      const user = deps.getUser(userId, intents[0]?.walletAddress);
      const expectedDepositCredit = deps.round2(intents
        .filter((intent) => intent.status === 'confirmed' && !intent.creditReversedAt)
        .reduce((sum, intent) => sum + intent.ticketAmount, 0));
      const ledgerDepositCredit = deps.round2(user.transactions
        .filter((entry) => entry.type === 'purchase' || entry.type === 'deposit_reversal')
        .reduce((sum, entry) => sum + entry.amount, 0));
      const excessCredit = deps.round2(ledgerDepositCredit - expectedDepositCredit);
      if (excessCredit > 0) {
        user.availableTickets = deps.round2(user.availableTickets - excessCredit);
        deps.createLedgerEntry(user, {
          event: 'Deposit Ledger Reconciled',
          value: `-${excessCredit.toFixed(2)} TKT`,
          type: 'deposit_reversal',
          amount: -excessCredit,
        });
        deps.schedulePersist({ userId });
      }
    }
  }

  function reconcileDuplicateDepositCredits() {
    if (depositReconciliationPromise) return depositReconciliationPromise;
    depositReconciliationPromise = performDuplicateDepositReconciliation().finally(() => {
      depositReconciliationPromise = null;
    });
    return depositReconciliationPromise;
  }

  function finalizeConfirmedIntent(intent: DepositIntent, verification: TonVerificationResult | null) {
    if (intent.status === 'confirmed') {
      return deps.getUser(intent.userId, intent.walletAddress);
    }

    intent.status = 'confirmed';
    intent.normalizedMessageHash = verification?.normalizedMessageHash || intent.normalizedMessageHash;
    intent.txHash = verification?.txHash || intent.txHash;
    intent.paymentMessageHash = verification?.paymentMessageHash || intent.paymentMessageHash;
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

    return withConfirmationClaimLock(async () => {
      const duplicate = findClaimedIntent(intent, verification);
      if (duplicate || hasDuplicateMessageHash(intent, verification.normalizedMessageHash)) {
        intent.lastVerificationError = 'This blockchain payment was already used for another deposit.';
        deps.schedulePersist({ depositId: intent.id });
        return {
          ok: false as const,
          verification: { ok: false, provider: verification.provider, reason: intent.lastVerificationError },
        };
      }
      if (!verification.txHash || !verification.paymentMessageHash) {
        intent.lastVerificationError = 'Verified TON payment is missing a canonical transaction or message hash.';
        deps.schedulePersist({ depositId: intent.id });
        return {
          ok: false as const,
          verification: { ok: false, provider: verification.provider, reason: intent.lastVerificationError },
        };
      }
      if (deps.claimDepositPayment) {
        const claim = await deps.claimDepositPayment(`payment-msg:${verification.paymentMessageHash}`, intent.id);
        if (!claim.claimed && claim.ownerIntentId !== intent.id) {
          intent.lastVerificationError = 'This on-chain transaction was already credited.';
          deps.schedulePersist({ depositId: intent.id });
          return {
            ok: false as const,
            verification: { ok: false, provider: verification.provider, reason: intent.lastVerificationError },
          };
        }
      }
      const user = finalizeConfirmedIntent(intent, verification);
      return { ok: true as const, verification, user };
    });
  }

  function buildPendingDepositView(intent: DepositIntent): PendingDepositView {
    const expiresAt = intent.createdAt + (intent.signedBoc ? signedDepositRecoveryTtlMs : config.depositIntentTtlMs);
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
      canRetry: intent.status === 'pending' && canRecoverSignedIntent(intent),
    };
  }

  async function recheckPendingDepositsForUser(userId?: string, minimumIntervalMs = 60_000) {
    await reconcileDuplicateDepositCredits();
    const now = Date.now();
    const pending = Array.from(deps.depositIntents.values()).filter((intent) => (
      intent.status === 'pending'
      && !!intent.signedBoc
      && canRecoverSignedIntent(intent)
      && (!userId || intent.userId === userId)
      && (!intent.lastVerificationAt || now - intent.lastVerificationAt >= minimumIntervalMs)
    ));

    let confirmedCount = 0;
    for (const intent of pending) {
      try {
        const result = await attemptDepositConfirmation(intent, intent.signedBoc!);
        if (result.ok) confirmedCount += 1;
      } catch (error) {
        intent.lastVerificationError = error instanceof Error ? error.message : 'Background verification failed.';
        intent.lastVerificationAt = Date.now();
        deps.schedulePersist({ depositId: intent.id });
      }
    }
    return confirmedCount;
  }

  async function recheckPendingDeposits() {
    return recheckPendingDepositsForUser(undefined, 60_000);
  }

  function startBackgroundDepositRecheck() {
    if (backgroundTimer) return;
    backgroundTimer = setInterval(() => {
      recheckPendingDeposits().catch((error) => {
        console.error('Pending deposit background recheck failed', error);
      });
      recheckPendingWithdrawals().catch((error) => {
        console.error('Pending withdrawal background recheck failed', error);
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

    app.post('/api/tickets/recheck', async (req: Request, res: Response) => {
      const userId = getRequestUserId(req);
      if (!userId) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      const confirmedCount = await recheckPendingDepositsForUser(userId, 5_000);
      const user = deps.getUser(userId);
      const deposits = Array.from(deps.depositIntents.values())
        .filter((intent) => intent.userId === userId && intent.status === 'pending')
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(buildPendingDepositView);
      return res.json({
        confirmedCount,
        availableTickets: user.availableTickets,
        heldTickets: user.heldTickets,
        transactions: user.transactions,
        deposits,
      });
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
        if (!reusableIntent.paymentReference) {
          reusableIntent.paymentReference = `redoapp:${reusableIntent.id}`;
          reusableIntent.paymentPayload = buildDepositPaymentPayload(reusableIntent.paymentReference);
          deps.schedulePersist({ depositId: reusableIntent.id });
        }
        return res.json({
          intentId: reusableIntent.id,
          marketingWallet: config.marketingWallet,
          ticketAmount: reusableIntent.ticketAmount,
          tonAmount: reusableIntent.tonAmount,
          status: reusableIntent.status,
          reused: true,
          paymentPayload: reusableIntent.paymentPayload,
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
      intent.paymentReference = `redoapp:${intent.id}`;
      intent.paymentPayload = buildDepositPaymentPayload(intent.paymentReference);
      deps.depositIntents.set(intent.id, intent);
      deps.schedulePersist({ depositId: intent.id, userId: intent.userId });
      return res.json({
        intentId: intent.id,
        marketingWallet: config.marketingWallet,
        ticketAmount: intent.ticketAmount,
        tonAmount: intent.tonAmount,
        status: intent.status,
        paymentPayload: intent.paymentPayload,
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
      if (isIntentExpired(intent) && !signedBoc && !canRecoverSignedIntent(intent)) {
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

    app.post('/api/tickets/withdraw-request', async (req: Request, res: Response) => {
      const { walletAddress, ticketAmount, requestId: clientRequestId } = req.body;
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
      const normalizedRequestId = typeof clientRequestId === 'string' && /^wd-client-[a-zA-Z0-9_-]{8,80}$/.test(clientRequestId)
        ? clientRequestId
        : '';
      if (normalizedRequestId) {
        const existingRequest = deps.withdrawalRequests.get(normalizedRequestId);
        if (existingRequest) {
          if (
            existingRequest.userId !== userId ||
            existingRequest.walletAddress !== normalizedWalletAddress ||
            existingRequest.ticketAmount !== amount
          ) {
            return res.status(409).json({ error: 'Withdrawal request key conflicts with another request.' });
          }
          return res.json({
            success: true,
            requestId: existingRequest.id,
            status: existingRequest.status,
            tonAmount: existingRequest.tonAmount,
            replayed: true,
          });
        }
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
        request.userId === userId && request.status === 'pending' && !expirePendingWithdrawal(request)
      ));
      if (pendingRequests.length > 0) {
        return res.status(400).json({ error: 'You already have a pending withdrawal request.' });
      }
      const tonAmount = deps.round2(amount * config.ticketPriceTon);
      let payoutWallet;
      try {
        payoutWallet = await getWithdrawalWalletReadiness(tonAmount);
      } catch (error) {
        return res.status(503).json({ error: error instanceof Error ? error.message : 'Could not verify payout wallet readiness.' });
      }
      if (!payoutWallet.active) {
        return res.status(503).json({ error: `Withdrawals are temporarily unavailable: payout wallet status is ${payoutWallet.status}. The operator must deploy or replace it.` });
      }
      if (!payoutWallet.funded) {
        return res.status(503).json({ error: 'Withdrawals are temporarily unavailable: payout wallet balance is insufficient for the amount and network fee.' });
      }
      user.availableTickets = deps.round2(user.availableTickets - amount);
      const request: WithdrawalRequest = {
        id: normalizedRequestId || `wd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        walletAddress: normalizedWalletAddress,
        ticketAmount: amount,
        tonAmount,
        status: 'pending',
        createdAt: Date.now(),
      };
      request.payoutComment = buildWithdrawalPayoutComment(request.id);
      request.operatorTransferLink = buildTonkeeperTransferLink(
        request.walletAddress,
        request.tonAmount,
        request.payoutComment
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

    app.get('/api/tickets/withdraw-pending', (req: Request, res: Response) => {
      const userId = getRequestUserId(req);
      if (!userId) return res.status(403).json({ error: 'Forbidden.' });
      const user = deps.getUser(userId);
      const userRequests = Array.from(deps.withdrawalRequests.values()).filter((entry) => entry.userId === userId);
      userRequests.forEach((entry) => expirePendingWithdrawal(entry));
      const request = userRequests
        .sort((left, right) => right.createdAt - left.createdAt)[0];
      return res.json({
        availableTickets: user.availableTickets,
        transactions: user.transactions,
        request: request ? {
          id: request.id,
          ticketAmount: request.ticketAmount,
          tonAmount: request.tonAmount,
          status: request.status,
          createdAt: request.createdAt,
          completedAt: request.completedAt || null,
          outboundTxHash: request.outboundTxHash || request.completedTxHash || null,
          lastChainCheckAt: request.lastChainCheckAt || null,
          notificationStatus: deps.getWithdrawalNotificationStatus?.(request.id) || 'missing',
        } : null,
      });
    });

    app.post('/api/tickets/withdraw-cancel', (req: Request, res: Response) => {
      const userId = getRequestUserId(req);
      const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId : '';
      if (!userId || !requestId) return res.status(400).json({ error: 'Withdrawal cancellation requires requestId.' });
      const request = deps.withdrawalRequests.get(requestId);
      if (!request || request.userId !== userId) return res.status(404).json({ error: 'Withdrawal request not found.' });
      const user = deps.getUser(userId, request.walletAddress);
      if (request.status === 'completed') {
        return res.status(409).json({ error: 'Completed withdrawal cannot be cancelled.' });
      }
      if (request.status === 'rejected') {
        return res.json({ success: true, status: request.status, availableTickets: user.availableTickets, transactions: user.transactions });
      }
      request.status = 'rejected';
      request.completedAt = Date.now();
      user.availableTickets = deps.round2(user.availableTickets + request.ticketAmount);
      deps.createLedgerEntry(user, {
        event: 'Withdrawal Cancelled',
        value: `+${request.ticketAmount.toFixed(2)} TKT`,
        type: 'withdraw_rejected',
        amount: request.ticketAmount,
      });
      deps.schedulePersist({ withdrawalId: request.id, userId });
      return res.json({ success: true, status: request.status, availableTickets: user.availableTickets, transactions: user.transactions });
    });

    app.post('/api/tickets/withdraw-complete', deps.requireAdmin, (req: Request, res: Response) => {
      const { requestId } = req.body;
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
      recheckPendingWithdrawals().then(() => {
        if (request.status !== 'completed') {
          return res.status(409).json({ error: 'Matching on-chain withdrawal payment was not found.' });
        }
        return res.json({ success: true, status: request.status, txHash: request.outboundTxHash || request.completedTxHash || null });
      }).catch((error) => {
        return res.status(502).json({ error: error instanceof Error ? error.message : 'Withdrawal verification failed.' });
      });
    });
  }

  return {
    reconcilePendingWithdrawals,
    recheckPendingWithdrawals,
    registerRoutes,
    startBackgroundDepositRecheck,
    recheckPendingDeposits,
  };
}
