import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../src/components/Web3Dashboard.tsx', import.meta.url), 'utf8');

assert.match(source, /currentTournament\?: TournamentData \| null/, 'active tournament must be persisted');
assert.match(source, /function disqualifyTournamentPlayer/, 'tournaments require a server-owned DQ path');
assert.match(source, /function resolveTournamentForfeits/, 'no-show tables require walkover/void resolution');
assert.match(source, /tournamentAfkExpired/, 'AFK must include a reconnect grace period');
assert.match(source, /activeMatch\.matchId\.startsWith\('tourn-'\).*isTournamentHuman/s, 'UNO settlement must validate human winners');
assert.doesNotMatch(dashboard, /handleAdminSimulateTournament/, 'production admin UI must not expose bot simulation');
console.log('Tournament human-only contract checks passed.');
