import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PokerSoundId, PokerSoundSource } from '../src/utils/sound';

const store = new Map<string, string>();
const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) };
let tones = 0, stops = 0, nativeVibrations = 0, browserVibrations = 0;
const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
class AudioMock {
  currentTime = 0;
  state = 'running';
  destination = {};
  createOscillator() { return { frequency: parameter, connect() {}, start() { tones++; }, stop() { stops++; } }; }
  createGain() { return { gain: parameter, connect() {} }; }
}
const webApp = { version: '9.0', HapticFeedback: { impactOccurred() { nativeVibrations++; }, notificationOccurred() { nativeVibrations++; }, selectionChanged() { nativeVibrations++; } } };
Object.assign(globalThis, {
  localStorage: storage,
  window: { localStorage: storage, AudioContext: AudioMock, setTimeout: () => 1, clearTimeout() {}, Telegram: { WebApp: webApp } },
  document: { hidden: false, addEventListener: (type: string, callback: () => void) => { if (type === 'pointerdown') callback(); } },
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { vibrate() { browserVibrations++; return true; } } });
const { sound } = await import('../src/utils/sound');
const { playPokerFeedback, setPokerHapticsEnabled } = await import('../src/utils/pokerFeedback');
const events: Record<PokerSoundId, true> = {
  ui_click: true, ui_confirm: true, ui_cancel: true, card_deal: true, card_flip: true,
  player_turn: true, timer_warning: true, bet_move: true, pot_receive: true, fold: true,
  all_in: true, player_join: true, player_disconnect: true, player_eliminated: true,
  showdown: true, game_start: true, winner: true, game_over: true, scene_transition: true,
};
const sources: PokerSoundSource[] = ['self', 'opponent', 'system', 'ui'];
const everyEvent = () => {
  for (const event of Object.keys(events) as PokerSoundId[]) for (const source of sources) playPokerFeedback(event, source);
};
sound.setPokerAudioMode('self');
everyEvent();
assert.equal(tones, 2, 'ME plays only the two-note alert for the local turn');
assert.equal(nativeVibrations, 0, 'ME does not send table-event vibrations');
tones = 0;
for (const event of Object.keys(events) as PokerSoundId[]) for (const source of sources) sound.playPokerCue(event, source);
assert.equal(tones, 2, 'Direct synthesizer calls obey the same ME filter');

sound.setPokerAudioMode('muted');
tones = 0;
setPokerHapticsEnabled(false);
everyEvent();
assert.equal(tones, 0, 'OFF never synthesizes audio');
assert.equal(nativeVibrations, 1, 'OFF alerts only on the local turn, even if decorative haptics were disabled');
assert.equal(browserVibrations, 0, 'Native and browser vibration must not double fire');
webApp.version = '6.0';
playPokerFeedback('player_turn', 'self');
assert.equal(browserVibrations, 1, 'Unsupported Telegram clients fall back to browser vibration');
webApp.version = '9.0';
webApp.HapticFeedback.impactOccurred = () => { throw new Error('unavailable'); };
assert.doesNotThrow(() => playPokerFeedback('player_turn', 'self'));
assert.equal(browserVibrations, 2, 'Native failure falls back without interrupting the turn');

sound.setPokerAudioMode('all');
tones = 0;
sound.playPokerCue('all_in', 'opponent');
assert.equal(tones, 3, 'ALL retains opponent cues');
const beforeSwitch = stops;
sound.setPokerAudioMode('self');
assert.ok(stops > beforeSwitch, 'Changing mode stops previously scheduled poker voices');
sound.setMute(true);
tones = 0;
sound.playPokerCue('player_turn', 'self');
assert.equal(tones, 0, 'Global mute still wins');

for (const file of ['src/hooks/usePokerGame.ts', 'src/components/PokerGame.tsx']) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), /sound\.play(?:Pop|Shuffle|Victory|Defeat|Error|Warning)\(/, `${file} must not bypass poker audio mode`);
}
console.log('PASS poker audio: ME turn only, OFF vibration only, native/fallback, ALL, mute and pending voice cancellation');
