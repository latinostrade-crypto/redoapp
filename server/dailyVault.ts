export type DailyVaultReward =
  | { type: 'tickets'; tickets: number; energy: 0; label: string }
  | { type: 'bracelet'; tickets: 0; energy: 0; label: string }
  | { type: 'energy'; tickets: 0; energy: 5 | 2; label: string };

/**
 * Server-owned Daily Vault odds. `random` is injectable so the exact payout
 * boundaries can be tested without sampling a probabilistic distribution.
 */
export function rollDailyVaultReward(random = Math.random()): DailyVaultReward {
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new Error('Daily Vault random value must be within [0, 1).');
  }
  if (random < 0.001) return { type: 'tickets', tickets: 0.5, energy: 0, label: 'Rare TKT' };
  if (random < 0.006) return { type: 'bracelet', tickets: 0, energy: 0, label: 'Tournament Bracelet' };
  if (random < 0.306) return { type: 'energy', tickets: 0, energy: 5, label: 'Energy Boost' };
  return { type: 'energy', tickets: 0, energy: 2, label: 'Energy Refill' };
}
