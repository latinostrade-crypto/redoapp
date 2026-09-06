import { useEffect } from 'react';
import { TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import './i18n/registerGame';
import { useLanguage } from './i18n/LanguageProvider';
import App from './App';
import { wakeBackend } from './utils/api';

const manifestUrl = window.location.origin + '/tonconnect-manifest.json';
const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'redo_appbot';
const telegramAppShortName = import.meta.env.VITE_TELEGRAM_APP_SHORT_NAME || 'app';
const telegramReturnUrl =
  `https://t.me/${telegramBotUsername}/${telegramAppShortName}` as `${string}://${string}`;

let gameBootstrapped = false;

function WalletLanguage() {
  const { language } = useLanguage();
  const [, setOptions] = useTonConnectUI();
  useEffect(() => { setOptions({ language }); }, [language, setOptions]);
  return null;
}

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
      <WalletLanguage />
      <App />
    </TonConnectUIProvider>
  );
}
