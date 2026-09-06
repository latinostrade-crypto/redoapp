// Manual pre-deploy backup. Never invoked by the app or Render build.
// Requires portable PostgreSQL 17 tools and SUPABASE_DB_PASSWORD in ignored .env.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

const run = promisify(execFile);
const project = 'rxhnhgtwfwisrnkhtzko';
const password = dotenv.parse(fs.readFileSync('.env')).SUPABASE_DB_PASSWORD;
if (!password) throw new Error('Set SUPABASE_DB_PASSWORD in the ignored .env file; never pass it on the command line.');
const bin = path.resolve('output/tools/postgres17/pgsql/bin');
// Download from this project's Database Settings > SSL configuration.
const ca = path.resolve('output/tools/supabase-ca.crt');
for (const file of ['pg_dump.exe', 'pg_dumpall.exe', 'pg_restore.exe', 'psql.exe']) {
  if (!fs.existsSync(path.join(bin, file))) throw new Error(`Missing PostgreSQL tool: ${file}`);
}
if (!fs.existsSync(ca)) throw new Error('Missing trusted TLS CA bundle.');
const directory = path.resolve('output/backups', `supabase-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  PGHOST: 'aws-1-ap-south-1.pooler.supabase.com', PGPORT: '5432',
  PGDATABASE: 'postgres', PGUSER: `postgres.${project}`, PGPASSWORD: password,
  PGSSLMODE: 'verify-full', PGSSLROOTCERT: ca, PGCONNECT_TIMEOUT: '15',
  PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000',
  PGAPPNAME: 'redoapp-predeploy-backup',
};
async function pg(tool, args) {
  try {
    return await run(path.join(bin, `${tool}.exe`), args, { env, windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    // Do not print the Error object: subprocess metadata may contain credentials.
    const detail = String(error.stderr || error.message || 'failed').split(password).join('[redacted]');
    throw new Error(`${tool}: ${detail.slice(0, 2000)}`);
  }
}

try {
  const version = (await pg('psql', ['--no-password', '-XAt', '-c', 'show server_version'])).stdout.trim();
  console.log(`Read-only TLS connection verified: project ${project}, PostgreSQL ${version}.`);
  await pg('pg_dumpall', ['--no-password', '--roles-only', '--no-role-passwords', '--file', path.join(directory, 'roles.sql')]);
  const partial = path.join(directory, 'database.partial');
  await pg('pg_dump', ['--no-password', '--format=custom', '--lock-wait-timeout=10000', '--file', partial]);
  const listing = (await pg('pg_restore', ['--list', partial])).stdout;
  const required = ['app_state', 'casino_table_catalog', 'casino_table_runtime', 'casino_table_seats', 'casino_chip_ledger', 'ticket_accounts', 'ticket_transactions', 'ticket_ledger_entries', 'ticket_reconciliation_cases'];
  for (const table of required) {
    if (!listing.includes(`TABLE DATA public ${table} `)) throw new Error(`Backup lacks required table data: ${table}`);
  }
  // Decode the entire archive, not just its catalog; no SQL is executed.
  await pg('pg_restore', ['--file', path.join(directory, 'database-decoded.sql'), partial]);
  fs.renameSync(partial, path.join(directory, 'database.dump'));
  fs.writeFileSync(path.join(directory, 'archive-list.txt'), listing);
  const files = ['roles.sql', 'database.dump', 'database-decoded.sql', 'archive-list.txt'].map(file => {
    const bytes = fs.readFileSync(path.join(directory, file));
    return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  });
  const report = { project, createdAt: new Date().toISOString(), serverVersion: version, tls: 'verify-full', sourceReadOnly: true, requiredTablesVerified: required, archiveFullyDecoded: true, restoreRehearsed: false, files, scope: 'Logical PostgreSQL database and password-free roles. Does not include Storage object bytes or platform secrets/configuration.' };
  fs.writeFileSync(path.join(directory, 'backup-manifest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ directory, requiredTables: required.length, archiveFullyDecoded: true, files }, null, 2));
} catch (error) {
  console.error(String(error.message).split(password).join('[redacted]'));
  console.error('Backup incomplete; do not deploy using this directory as a verified backup.');
  process.exitCode = 1;
}
