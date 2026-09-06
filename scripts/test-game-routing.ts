import assert from 'node:assert/strict';
import { buildGameLobbyUrl } from '../src/utils/gameRouting';

assert.equal(
  buildGameLobbyUrl('https://redoapp.org/?play=1'),
  'https://redoapp.org/?play=1',
  'browser game lobby must remain on the game surface',
);
assert.equal(
  buildGameLobbyUrl('https://redoapp.org/?startapp=room_poker_ABCD#tgWebAppData=opaque'),
  'https://redoapp.org/?play=1',
  'consumed room launch data must not replay after returning to lobby',
);
assert.equal(
  buildGameLobbyUrl('http://127.0.0.1:3000/?play=1&reducedMotion=1'),
  'http://127.0.0.1:3000/?play=1&reducedMotion=1',
  'the deterministic accessibility QA flag must survive lobby navigation',
);

console.log('Game lobby routing contract passed.');
