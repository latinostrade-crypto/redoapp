import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [server, tickets, migration] = await Promise.all([
  readFile(new URL('../server.ts', import.meta.url), 'utf8'),
  readFile(new URL('../server/tickets.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/20260826_ticket_atomic_projection.sql', import.meta.url), 'utf8'),
]);

assert.match(server, /rpc\('ticket_persist_user_snapshot'/, 'user snapshots must use the atomic ticket RPC');
assert.match(server, /ticketStateRevision/, 'user snapshots must carry optimistic-concurrency revisions');
assert.match(server, /parseTicketUnits\(amount\)/, 'casino exchange must accept exact centi-TKT only');
assert.match(server, /Direct balance adjustment is retired/, 'direct admin balance edits must remain disabled');
assert.match(tickets, /\^\\d\+\(\?:\\\.\\d\{1,2\}\)\?\$/, 'deposit and withdrawal values must remain centi-TKT exact');
assert.match(migration, /ticket_persist_user_snapshot/, 'migration must define the atomic projection RPC');
assert.match(migration, /ticket_guard_ledger_immutability/, 'ledger mutation guard must be installed');
assert.match(migration, /ticket_prevent_user_profile_delete/, 'ticket-bearing profiles must be deletion-protected');
assert.match(migration, /ticket_profile_reconciliation/, 'profile-to-ledger reconciliation view must exist');

console.log('Ticket accounting architecture checks passed.');
