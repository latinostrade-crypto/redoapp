export type PokerReferralLevel = 1 | 2;

export interface PokerCashoutReferralCandidate {
  userId: string;
  level: PokerReferralLevel;
}

export interface PokerCashoutReferralShare extends PokerCashoutReferralCandidate {
  amount: number;
}

/**
 * Referral shares are paid only from a realised poker profit.  This pure
 * calculation is used by the HTTP handler and keeps the rounding/capping
 * rules independently testable from user storage and table state.
 */
export function calculatePokerCashoutReferralShares(
  grossProfit: number,
  candidates: PokerCashoutReferralCandidate[],
): PokerCashoutReferralShare[] {
  const profit = Math.max(0, Math.floor(Number(grossProfit) || 0));
  if (profit === 0) return [];

  const seenUsers = new Set<string>();
  const seenLevels = new Set<PokerReferralLevel>();
  const shares: PokerCashoutReferralShare[] = [];
  for (const candidate of candidates) {
    if (!candidate?.userId || seenUsers.has(candidate.userId) || seenLevels.has(candidate.level)) continue;
    const rateBps = candidate.level === 1 ? 200 : candidate.level === 2 ? 100 : 0;
    if (!rateBps) continue;
    const amount = Math.floor(profit * rateBps / 10_000);
    seenUsers.add(candidate.userId);
    seenLevels.add(candidate.level);
    if (amount > 0) shares.push({ userId: candidate.userId, level: candidate.level, amount });
  }
  return shares;
}
