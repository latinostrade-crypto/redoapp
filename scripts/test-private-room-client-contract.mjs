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

console.log('Private room client contract checks passed.');
