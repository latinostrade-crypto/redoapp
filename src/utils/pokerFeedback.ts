import { sound, type PokerSoundId } from './sound';

export type PokerFeedbackEvent = PokerSoundId;

type TelegramHaptics = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

function haptics(): TelegramHaptics | undefined {
  if (!getPokerHapticsEnabled()) return undefined;
  const webApp = (window as typeof window & {
    Telegram?: { WebApp?: { version?: string; HapticFeedback?: TelegramHaptics } };
  }).Telegram?.WebApp;
  const version = Number.parseFloat(webApp?.version || '0');
  if (!webApp?.HapticFeedback || !Number.isFinite(version) || version < 6.1) return undefined;
  return webApp.HapticFeedback;
}

const POKER_HAPTICS_KEY = 'redoapp:poker-haptics';

export function getPokerHapticsEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(POKER_HAPTICS_KEY) !== 'off';
}

export function setPokerHapticsEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') window.localStorage.setItem(POKER_HAPTICS_KEY, enabled ? 'on' : 'off');
}

/** Single mapping for poker sound IDs and optional Telegram haptics. It never
 * autoplays audio: the existing synthesizer still unlocks only after a user
 * interaction, and Telegram decides whether haptics are supported. */
export function playPokerFeedback(event: PokerFeedbackEvent) {
  const telegramHaptics = haptics();
  sound.playPokerCue(event);

  switch (event) {
    case 'ui_click':
      telegramHaptics?.selectionChanged?.();
      break;
    case 'ui_cancel':
    case 'fold':
    case 'scene_transition':
      telegramHaptics?.impactOccurred?.('light');
      break;
    case 'ui_confirm':
    case 'bet_move':
    case 'pot_receive':
    case 'player_join':
      telegramHaptics?.impactOccurred?.('light');
      break;
    case 'card_deal':
    case 'card_flip':
      break;
    case 'player_turn':
      telegramHaptics?.impactOccurred?.('light');
      break;
    case 'timer_warning':
      telegramHaptics?.notificationOccurred?.('warning');
      break;
    case 'player_disconnect':
    case 'player_eliminated':
      telegramHaptics?.notificationOccurred?.('error');
      break;
    case 'all_in':
    case 'showdown':
    case 'game_start':
      telegramHaptics?.impactOccurred?.('medium');
      break;
    case 'winner':
      telegramHaptics?.notificationOccurred?.('success');
      break;
    case 'game_over':
      telegramHaptics?.impactOccurred?.('medium');
      break;
  }
}
