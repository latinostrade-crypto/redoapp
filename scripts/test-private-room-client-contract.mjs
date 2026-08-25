import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'components', 'Web3Dashboard.tsx'), 'utf8');

// A bare React onClick passes MouseEvent as the first function argument. The
// create flow persists its request, so accepting that event would make
// JSON.stringify walk React's circular Fiber tree.
assert.doesNotMatch(source, /onClick=\{createPrivateRoom\}/);
assert.match(source, /onClick=\{\(\) => \{ void createPrivateRoom\(\); \}\}/);
assert.match(source, /const createPrivateRoom = async \(overrideStake\?: unknown, overrideTargetPlayers\?: unknown\)/);
assert.match(source, /typeof overrideStake === 'number'/);
assert.match(source, /PRIVATE_STAKE_OPTIONS\.includes\(overrideStake as PrivateStakeOption\)/);

// A status result may recover only the requester's own already-joined seat.
assert.match(source, /privateRoomHasPlayer\(statusRes, currentUserId\)/);
assert.match(source, /privateRoomHasPlayer\(statusRes, effectiveUserId\)/);
assert.match(source, /A lost join response is recovered through room status\/iframe below\.[\s\S]*retryOnNetworkError: false,[\s\S]*timeoutMs: 12_000/);

// Public queue recovery shares the same WebView connection pool. It must not
// re-run on every render or private-room creation will fail with a network
// error after the browser has exhausted its sockets.
assert.match(source, /const publicQueueRecoveryRef = useRef\(''\)/);
assert.match(source, /if \(publicQueueRecoveryRef\.current === recoveryKey\) return/);
assert.match(source, /window\.setInterval\(requestQueueStatus, 5_000\)/);
assert.match(source, /timeoutMs: 5_000,\s*retryOnNetworkError: false/);

console.log('Private room client contract checks passed.');
