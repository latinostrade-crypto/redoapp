import { lazy, Suspense, useEffect, useState } from 'react';
import './root.css';

const ComicExperience = lazy(() => import('./components/comic/ComicExperience'));
const GameSurface = lazy(() => import('./GameSurface'));

type AppSurface = 'story' | 'game';

function getSurfaceFromEnvironment(): AppSurface {
  const params = new URLSearchParams(window.location.search);
  if (params.get('story') === '1') return 'story';
  if (params.get('play') === '1') return 'game';

  const telegram = (window as any).Telegram?.WebApp;
  const isTelegramLaunch = Boolean(
    telegram?.initData ||
      telegram?.initDataUnsafe?.user ||
      telegram?.initDataUnsafe?.start_param,
  );

  return isTelegramLaunch ? 'game' : 'story';
}

function SurfaceLoader({ surface }: { surface: AppSurface }) {
  return (
    <div className="surface-loader" role="status" aria-live="polite">
      <img src="/text(logo).jpg" alt="Redoapp" width={938} height={201} />
      <span>{surface === 'story' ? 'ASSEMBLING THE STORY…' : 'DEALING THE TABLE…'}</span>
      <i aria-hidden="true" />
    </div>
  );
}

export default function RootApp() {
  const [surface, setSurface] = useState<AppSurface>(getSurfaceFromEnvironment);

  useEffect(() => {
    const handleHistoryChange = () => setSurface(getSurfaceFromEnvironment());
    window.addEventListener('popstate', handleHistoryChange);
    return () => window.removeEventListener('popstate', handleHistoryChange);
  }, []);

  return (
    <Suspense fallback={<SurfaceLoader surface={surface} />}>
      {surface === 'story' ? (
        <ComicExperience />
      ) : (
        <GameSurface />
      )}
    </Suspense>
  );
}
