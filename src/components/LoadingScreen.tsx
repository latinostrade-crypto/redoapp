import { useState } from 'react';

export function LoadingScreen() {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="fixed inset-0 bg-[#0c0f12] z-[9999] w-screen h-screen overflow-hidden">
      {imageFailed ? (
        <div className="w-full h-full flex items-center justify-center font-mono text-[11px] text-[#ffcc00]">
          LOADING...
        </div>
      ) : (
        <img
          src="/loading-screener.webp"
          alt="Loading..."
          onError={() => setImageFailed(true)}
          className="w-full h-full object-cover select-none pointer-events-none"
        />
      )}
    </div>
  );
}
