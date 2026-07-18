import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dashboard = readFileSync(path.join(root, 'src/components/Web3Dashboard.tsx'), 'utf8');
const gameHook = readFileSync(path.join(root, 'src/hooks/useUnoGame.ts'), 'utf8');
const server = readFileSync(path.join(root, 'server.ts'), 'utf8');
const tickets = readFileSync(path.join(root, 'server/tickets.ts'), 'utf8');

assert.equal(
  dashboard.includes('watchFrame.src = buildAuthenticatedUrl(`/api/matchmaker/watch'),
  false,
  'Public matchmaking must not create the legacy polling watch iframe.',
);
assert.equal(
  dashboard.includes('Run every transport independently'),
  false,
  'Queue recovery must remain sequential instead of fanning out transports.',
);
assert.match(
  dashboard,
  /getPublicQueueStatusViaSameOrigin\(\)\s*\.catch\(\(\) => apiRequest<PublicQueueStatus>/,
  'Queue recovery must prefer one same-origin request before the direct API fallback.',
);
assert.match(
  dashboard,
  /requestQueueStatus\(\);\s*\}, 12_000\);/,
  'Queue fallback polling must stay at twelve seconds or slower.',
);
assert.match(
  dashboard,
  /Date\.now\(\) - lastRoomEventAt < 20_000/,
  'Private rooms must suppress polling while their SSE stream is healthy.',
);
assert.match(
  gameHook,
  /Date\.now\(\) - remoteMatchStreamLastEventAtRef\.current < 25_000/,
  'Live matches must treat heartbeat-backed SSE as healthy.',
);
assert.match(
  server,
  /sendSse\(response, 'heartbeat', \{ t: Date\.now\(\) \}, false\)/,
  'The backend must keep streams alive with small heartbeat events.',
);
assert.equal(
  /queuedUserIds\.forEach\(\(userId\) => broadcastQueue\(userId\)\)/.test(server),
  false,
  'The backend must not rebroadcast unchanged queue state every second.',
);
assert.match(
  server,
  /backgroundRecheckIntervalMs: 60_000/,
  'Background chain reconciliation must run no more than once per minute.',
);
assert.match(
  tickets,
  /transactions\?limit=20&sort_order=desc/,
  'Withdrawal reconciliation must fetch a bounded recent transaction window.',
);
assert.match(
  server,
  /deck: \[\],\s*deckCount:/,
  'Remote match snapshots must send a deck count instead of every hidden card.',
);
assert.match(
  server,
  /discardPile: match\.gameState\.discardPile\.slice\(-1\)/,
  'Remote match snapshots must send only the visible discard card.',
);

console.log('Traffic budget checks passed.');
