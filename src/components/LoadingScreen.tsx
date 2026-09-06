import { useLanguage } from '../i18n/LanguageProvider';
import { useState } from 'react';

export function LoadingScreen() {
  const { tr } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div role="status" aria-label={tr("loadingGame")} className="fixed inset-0 bg-[#0c0f12] z-[9999] w-screen h-screen overflow-hidden">
      {imageFailed ? (
        <div className="w-full h-full flex items-center justify-center font-mono text-[11px] text-[#ffcc00]">{tr("loadingUpper")}</div>
      ) : (
        <img
          src="/loading-screener.webp"
          alt={tr("loading")}
          onError={() => setImageFailed(true)}
          className="w-full h-full object-cover select-none pointer-events-none"
        />
      )}
    </div>
  );
}
