import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {TonConnectUIProvider} from '@tonconnect/ui-react';
import App from './App.tsx';
import './index.css';
import { wakeBackend } from './utils/api';
import { initializeRequiredGameImages } from './utils/cardAssets';

const manifestUrl = window.location.origin + '/tonconnect-manifest.json';
const telegramWebApp = (window as any).Telegram?.WebApp;
const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'redo_appbot';
const telegramAppShortName = import.meta.env.VITE_TELEGRAM_APP_SHORT_NAME || 'app';
const telegramReturnUrl = `https://t.me/${telegramBotUsername}/${telegramAppShortName}` as `${string}://${string}`;

// Tell Telegram that the first frame is ready and wake the API before React mounts.
telegramWebApp?.ready();
telegramWebApp?.expand();
wakeBackend();
initializeRequiredGameImages();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      actionsConfiguration={{
        returnStrategy: 'back',
        twaReturnUrl: telegramReturnUrl,
      }}
    >
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
