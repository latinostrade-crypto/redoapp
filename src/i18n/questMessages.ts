import type { GameMessageKey } from './LanguageProvider';

// Match stable server IDs, never player-created text or arbitrary titles.
export const questMessageKeys: Record<string, readonly [GameMessageKey, GameMessageKey]> = {
  daily_online_1: ['questUnoTitle', 'questUnoDescription'],
  daily_free_poker_1: ['questPokerTitle', 'questPokerDescription'],
  daily_free_blackjack_1: ['questBlackjackTitle', 'questBlackjackDescription'],
  daily_checkin_1: ['questCheckinTitle', 'questCheckinDescription'],
  daily_spend_energy_3: ['questEnergyTitle', 'questEnergyDescription'],
  daily_win_1: ['questWinTitle', 'questWinDescription'],
  daily_online_bonus_1: ['questEncoreTitle', 'questEncoreDescription'],
  weekly_invite_1: ['questReferralTitle', 'questReferralDescription'],
};
