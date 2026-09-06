import { i18n } from './instance';
import { gameMessages } from './gameMessages';

for (const [index, language] of ['en', 'ru'].entries()) {
  i18n.addResourceBundle(language, 'game', Object.fromEntries(
    Object.entries(gameMessages).map(([key, values]) => [key, values[index]]),
  ));
  // Exact app-owned messages in legacy/server responses. Never replace substrings
  // in player names, wallet addresses or other interpolated external data.
  i18n.addResourceBundle(language, 'server', Object.fromEntries(
    Object.values(gameMessages).filter(values => !values[0].includes('{{'))
      .map(values => [values[0], values[index]]),
  ));
}
