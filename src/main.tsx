import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import RootApp from './RootApp';
import './index.css';

const telegramWebApp = (window as any).Telegram?.WebApp;

// Tell Telegram that the shell is ready. Game-only work starts in GameSurface.
telegramWebApp?.ready();
telegramWebApp?.expand();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
