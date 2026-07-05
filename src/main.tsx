import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {TonConnectUIProvider} from '@tonconnect/ui-react';
import App from './App.tsx';
import './index.css';
import { wakeBackend } from './utils/api';

const manifestUrl = window.location.origin + '/tonconnect-manifest.json';
const telegramWebApp = (window as any).Telegram?.WebApp;

// Tell Telegram that the first frame is ready and wake the API before React mounts.
telegramWebApp?.ready();
telegramWebApp?.expand();
wakeBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
