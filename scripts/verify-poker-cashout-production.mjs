import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const dbMode = process.env.CASINO_TABLES_DB_MODE === 'true';

if (!url.startsWith('https://') || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this production preflight.');
  process.exit(1);
}
if (!dbMode) {
  console.error('CASINO_TABLES_DB_MODE must be true: poker cash-out/referral writes must use the atomic database RPC.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: catalog, error: catalogError } = await supabase
  .from('casino_table_catalog')
  .select('id,game_type,mode,min_buy_in,max_buy_in')
  .eq('game_type', 'poker')
  .eq('mode', 'public')
  .limit(1);
if (catalogError || !catalog?.length) {
  console.error(`Public poker table catalogue is unavailable: ${catalogError?.message || 'no public poker table found'}`);
  process.exit(1);
}

// A guaranteed-missing table is a non-mutating schema probe. The v2 function
// accepts p_referral_payouts, acquires no live seat and raises this exact
// controlled error. Old four-argument functions instead fail RPC resolution.
const { error: contractError } = await supabase.rpc('casino_leave_table_seat', {
  p_table_id: '__casino_contract_probe__',
  p_user_id: '__casino_contract_probe__',
  p_cash_out: 0,
  p_idempotency_key: 'casino-contract-probe-v2',
  p_referral_payouts: [],
});
if (!contractError || !/Table not found/i.test(contractError.message || '')) {
  console.error(`Cash-out/referral RPC v2 is not ready: ${contractError?.message || 'unexpected probe response'}`);
  process.exit(1);
}

const { error: ledgerError } = await supabase
  .from('casino_chip_ledger')
  .select('event,idempotency_key')
  .limit(1);
if (ledgerError) {
  console.error(`Casino chip ledger is unavailable: ${ledgerError.message}`);
  process.exit(1);
}

console.log('Production poker cash-out/referral preflight passed.');
console.log(`Verified table: ${catalog[0].id}; atomic casino_leave_table_seat v2 accepts referral payouts.`);
