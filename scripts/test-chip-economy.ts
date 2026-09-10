import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CHIPS_PER_GRAM,
  MAX_CHIP_AMOUNT,
  checkedAddChips,
  chipsToGram,
  parseChips,
  parseGramAsChips,
  sumChips,
} from '../server/chipEconomy';

assert.equal(CHIPS_PER_GRAM, 100);
assert.equal(parseGramAsChips('0.01'), 1);
assert.equal(parseGramAsChips('0.3'), 30);
assert.equal(parseGramAsChips('1.00'), 100);
assert.equal(parseGramAsChips(30), 3000);
assert.equal(parseGramAsChips('0'), null);
assert.equal(parseGramAsChips('0', { allowZero: true }), 0);
assert.equal(parseGramAsChips('1.001'), null);
assert.equal(parseGramAsChips('-1'), null);
assert.equal(parseGramAsChips('Infinity'), null);
assert.equal(parseGramAsChips('100001'), null);

assert.equal(parseChips('30'), 30);
assert.equal(parseChips(30), 30);
assert.equal(parseChips('30.0'), null);
assert.equal(parseChips(Number.MAX_SAFE_INTEGER), null);
assert.equal(chipsToGram(30), 0.3);
assert.equal(checkedAddChips(100, -30), 70);
assert.equal(sumChips([30, 50, 100]), 180);
assert.throws(() => checkedAddChips(10, -11));
assert.throws(() => checkedAddChips(MAX_CHIP_AMOUNT, 1));

const migration = await readFile(new URL('../supabase/20260910_unified_chip_ledger.sql', import.meta.url), 'utf8');
assert.match(migration, /amount bigint not null/, 'chip ledger must store integer amounts');
assert.match(migration, /idempotency_key text not null unique/, 'chip transactions need durable idempotency');
assert.match(migration, /chip transaction must balance to zero/, 'chip postings must be double-entry balanced');
assert.match(migration, /chip_credit_wallet_deposit/, 'wallet claim and credit must share an atomic RPC');
assert.match(migration, /chip_persist_user_snapshot/, 'profile projection and chip ledger must persist atomically');
assert.match(migration, /chip_profile_reconciliation/, 'profile-to-ledger drift must be observable');
assert.match(migration, /payment_message_hash text primary key/, 'one TON payment message must be claimable once');
assert.match(migration, /chip balances may only change through chip_post_transaction/, 'direct balance writes must fail closed');
assert.match(migration, /revoke all on public\.chip_profile_reconciliation from public, anon, authenticated/, 'reconciliation views must not expose balances to clients');
assert.match(migration, /on conflict\(idempotency_key\) do nothing/, 'concurrent replay must converge on one transaction');

console.log('Unified chip economy boundary checks passed.');
