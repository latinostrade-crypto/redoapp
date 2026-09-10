import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url.startsWith('https://') || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the chip preflight.');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const checks = await Promise.all([
  supabase.from('chip_accounts').select('id').limit(1),
  supabase.from('chip_transactions').select('id').limit(1),
  supabase.from('chip_ledger_entries').select('id').limit(1),
  supabase.from('wallet_deposit_claims').select('intent_id').limit(1),
  supabase.from('chip_profile_reconciliation').select('user_id').limit(25),
  supabase.from('chip_transaction_reconciliation').select('transaction_id').limit(25),
]);
const errors = checks.map(result => result.error).filter(Boolean);
if (errors.length) {
  console.error(`Unified chip schema is unavailable: ${errors.map(error => error.message).join('; ')}`);
  process.exit(1);
}
const profileDrift = checks[4].data?.length || 0;
const transactionDrift = checks[5].data?.length || 0;
if (profileDrift || transactionDrift) {
  console.error(`Unified chip reconciliation failed: profiles=${profileDrift}, transactions=${transactionDrift}.`);
  process.exit(1);
}
console.log('Unified chip production preflight passed: schema present and reconciliation clean.');
