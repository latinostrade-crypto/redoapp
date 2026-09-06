import React, { lazy, Suspense, useEffect, useState, Component, ErrorInfo, ReactNode } from 'react';
import './root.css';
import { cleanErrorMessage } from './utils/api';
import { CommonText, LanguageProvider, useLanguage } from './i18n/LanguageProvider';

if (typeof window !== 'undefined') {
  const originalAlert = window.alert;
  window.alert = (message: any) => {
    originalAlert(cleanErrorMessage(message));
  };
}

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  interval = 1000
): React.LazyExoticComponent<T> {
  return lazy(
    () =>
      new Promise<{ default: T }>((resolve, reject) => {
        const attempt = (remaining: number) => {
          factory()
            .then(resolve)
            .catch((error) => {
              if (remaining <= 1) {
                const hasReloaded = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('redoapp_chunk_reloaded');
                if (!hasReloaded && typeof window !== 'undefined') {
                  sessionStorage.setItem('redoapp_chunk_reloaded', '1');
                  window.location.reload();
                  return;
                }
                reject(error);
                return;
              }
              setTimeout(() => attempt(remaining - 1), interval);
            });
        };
        attempt(retries);
      })
  );
}

const ComicExperience = lazyWithRetry(() => import('./components/comic/ComicExperience'));
const GameSurface = lazyWithRetry(() => import('./GameSurface'));

type AppSurface = 'story' | 'game';

function getSurfaceFromEnvironment(): AppSurface {
  const params = new URLSearchParams(window.location.search);
  if (params.get('story') === '1') return 'story';
  if (params.get('play') === '1') return 'game';
  if (params.get('room')) return 'game';

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  let startParam = (
    params.get('tgWebAppStartParam') ||
    params.get('startapp') ||
    params.get('startApp') ||
    hashParams.get('tgWebAppStartParam') ||
    hashParams.get('startapp') ||
    hashParams.get('startApp') ||
    params.get('room') ||
    hashParams.get('room') ||
    (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param ||
    ''
  );

  if (!startParam && (params.get('tgWebAppData') || hashParams.get('tgWebAppData'))) {
    try {
      const dataStr = params.get('tgWebAppData') || hashParams.get('tgWebAppData') || '';
      const innerParams = new URLSearchParams(dataStr);
      startParam = innerParams.get('start_param') || innerParams.get('tgWebAppStartParam') || innerParams.get('startapp') || '';
    } catch {}
  }

  if (startParam?.startsWith('room_') || startParam?.startsWith('ref_') || params.get('room') || hashParams.get('room')) {
    return 'game';
  }

  const telegram = (window as any).Telegram?.WebApp;
  const isTelegramLaunch = Boolean(
    telegram?.initData ||
      telegram?.initDataUnsafe?.user ||
      telegram?.initDataUnsafe?.start_param ||
      startParam
  );
  if (isTelegramLaunch) return 'game';

  return 'story';
}

function GameLoadingText() {
  const { t } = useLanguage();
  return <>{t('DEALING THE TABLE…')}</>;
}

function SurfaceLoader({ surface }: { surface: AppSurface }) {
  return (
    <div className="surface-loader" role="status" aria-live="polite">
      <img src="/text(logo).jpg" alt="Redoapp" width={938} height={201} />
      <span>{surface === 'story' ? 'ASSEMBLING THE STORY…' : <GameLoadingText />}</span>
      <i aria-hidden="true" />
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  localized?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootApp ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('redoapp_active_match');
      } catch {}
      window.location.reload();
    }
  };

  render(): ReactNode {
    if ((this as any).state?.hasError) {
      return (
        <div className="surface-loader flex flex-col items-center justify-center p-6 text-center bg-[#0c0f12] text-white">
          <img src="/text(logo).jpg" alt="Redoapp" width={938} height={201} className="max-w-[200px] mb-4" />
          <h2 className="text-base font-black text-[#ff3366] uppercase mb-2">{((this as any).props as ErrorBoundaryProps).localized ? <CommonText text="Connection Issue" /> : "Connection Issue"}</h2>
          <p className="text-xs text-slate-400 max-w-xs mb-4">
            {((this as any).props as ErrorBoundaryProps).localized ? <CommonText text="Could not load the game resources. Please tap below to reload." /> : "Could not load the game resources. Please tap below to reload."}
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 bg-[#00ff66] text-black font-black text-xs uppercase rounded shadow-[2px_2px_0_#000] active:translate-y-0.5"
          >
            {((this as any).props as ErrorBoundaryProps).localized ? <CommonText text="RELOAD APP" /> : "RELOAD APP"}
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default function RootApp() {
  const [surface, setSurface] = useState<AppSurface>(getSurfaceFromEnvironment);

  useEffect(() => {
    const handleHistoryChange = () => setSurface(getSurfaceFromEnvironment());
    window.addEventListener('popstate', handleHistoryChange);
    return () => window.removeEventListener('popstate', handleHistoryChange);
  }, []);

  if (surface === 'story') {
    return <RootErrorBoundary><Suspense fallback={<SurfaceLoader surface="story" />}><ComicExperience /></Suspense></RootErrorBoundary>;
  }

  return (
    <LanguageProvider>
      <RootErrorBoundary localized>
        <Suspense fallback={<SurfaceLoader surface="game" />}><GameSurface /></Suspense>
      </RootErrorBoundary>
    </LanguageProvider>
  );
}
