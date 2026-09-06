import { useEffect } from 'react';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import { wakeBackend } from './utils/api';

const manifestUrl = window.location.origin + '/tonconnect-manifest.json';
const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'redo_appbot';
const telegramAppShortName = import.meta.env.VITE_TELEGRAM_APP_SHORT_NAME || 'app';
const telegramReturnUrl =
  `https://t.me/${telegramBotUsername}/${telegramAppShortName}` as `${string}://${string}`;

let gameBootstrapped = false;

export default function GameSurface() {
  useEffect(() => {
    if (gameBootstrapped) return;
    gameBootstrapped = true;
    wakeBackend();
  }, []);

  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      actionsConfiguration={{
        returnStrategy: 'back',
        twaReturnUrl: telegramReturnUrl,
      }}
    >
      <App />
    </TonConnectUIProvider>
  );
}
