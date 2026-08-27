import assert from 'node:assert/strict';
import { rollDailyVaultReward } from '../server/dailyVault.ts';

assert.deepEqual(rollDailyVaultReward(0), { type: 'tickets', tickets: 0.5, energy: 0, label: 'Rare TKT' });
assert.equal(rollDailyVaultReward(0.000999).type, 'tickets');
assert.deepEqual(rollDailyVaultReward(0.001), { type: 'bracelet', tickets: 0, energy: 0, label: 'Tournament Bracelet' });
assert.equal(rollDailyVaultReward(0.005999).type, 'bracelet');
assert.deepEqual(rollDailyVaultReward(0.006), { type: 'energy', tickets: 0, energy: 5, label: 'Energy Boost' });
assert.deepEqual(rollDailyVaultReward(0.305999), { type: 'energy', tickets: 0, energy: 5, label: 'Energy Boost' });
assert.deepEqual(rollDailyVaultReward(0.306), { type: 'energy', tickets: 0, energy: 2, label: 'Energy Refill' });
assert.throws(() => rollDailyVaultReward(1));
assert.throws(() => rollDailyVaultReward(-0.01));

console.log('Daily Vault odds checks passed.');
