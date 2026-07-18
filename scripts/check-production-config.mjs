const required = [
  'TELEGRAM_BOT_TOKEN',
  'APP_SESSION_SECRET',
  'ADMIN_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TON_API_KEY',
  'MARKETING_WALLET',
  'WITHDRAWAL_SENDER_WALLET',
  'BACKEND_PUBLIC_URL',
];

const errors = [];
const value = (key) => String(process.env[key] || '').trim();
const isPlaceholder = (item) => !item || /^(change-me|your-|mock-|example|local-dev-session-secret)$/i.test(item);

for (const key of required) {
  if (isPlaceholder(value(key))) errors.push(`${key} must be set to a production value.`);
}

if (value('NODE_ENV') !== 'production') errors.push('NODE_ENV must be production.');
if (value('APP_SESSION_SECRET').length < 32) errors.push('APP_SESSION_SECRET must be at least 32 characters.');
if (value('ADMIN_API_KEY').length < 24) errors.push('ADMIN_API_KEY must be at least 24 characters.');
if (value('ENABLE_CHAIN_VERIFICATION').toLowerCase() !== 'true') errors.push('ENABLE_CHAIN_VERIFICATION must be true.');
if (value('TON_VERIFICATION_MODE').toLowerCase() !== 'tonapi') errors.push('TON_VERIFICATION_MODE must be tonapi.');

const initDataAge = Number(value('TELEGRAM_INITDATA_MAX_AGE_SEC'));
if (!Number.isInteger(initDataAge) || initDataAge < 60 || initDataAge > 900) {
  errors.push('TELEGRAM_INITDATA_MAX_AGE_SEC must be an integer from 60 to 900.');
}

for (const key of ['SUPABASE_URL', 'BACKEND_PUBLIC_URL']) {
  const current = value(key);
  try {
    if (new URL(current).protocol !== 'https:') errors.push(`${key} must use HTTPS.`);
  } catch {
    errors.push(`${key} must be a valid HTTPS URL.`);
  }
}

if (errors.length > 0) {
  console.error('Production configuration check failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Production configuration check passed.');
