import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Isolated LAN testing: never load production database/bot/payment credentials
// from .env, and never open an existing production-like runtime-state file.
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, NODE_ENV: 'development', PORT: '10000',
  RUNTIME_STATE_DIR: path.join(root, 'output', 'lan-dev'),
  BACKEND_PUBLIC_URL: 'http://127.0.0.1:10000',
  APP_SESSION_SECRET: randomBytes(32).toString('hex'), CASINO_TABLES_DB_MODE: 'false',
  ENABLE_CHAIN_VERIFICATION: 'false', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
  TELEGRAM_BOT_TOKEN: '', TON_API_KEY: '', ADMIN_API_KEY: '',
  UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
};
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
child.on('exit', code => process.exit(code || 0));
