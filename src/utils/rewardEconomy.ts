export const PRIZE_POOL_RATE = 0.96;

export const PAYOUT_SHARES: Record<2 | 3 | 4, readonly number[]> = {
  2: [1.00, 0.00],
  3: [0.70, 0.30, 0.00],
  4: [0.70, 0.30, 0.00, 0.00],
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const floor2 = (value: number) => Math.floor((value + Number.EPSILON) * 100) / 100;

export function calculateTicketPayouts(stake: number, playersCount: 2 | 3 | 4) {
  if (stake <= 0) {
    return {
      netPrizePool: 0,
      payouts: Array(playersCount).fill(0),
    };
  }
  const netPrizePool = round2(stake * playersCount * PRIZE_POOL_RATE);
  const shares = PAYOUT_SHARES[playersCount];
  const payouts = shares.map((share, index) => index === 0 ? 0 : floor2(netPrizePool * share));
  payouts[0] = round2(netPrizePool - payouts.slice(1).reduce((sum, payout) => sum + payout, 0));
  return { netPrizePool, payouts };
}
