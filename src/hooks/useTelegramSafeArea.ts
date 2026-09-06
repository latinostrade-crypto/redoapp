import { useEffect, useState } from 'react';

type Insets = { top: number; right: number; bottom: number; left: number };

const EMPTY_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

type TelegramViewport = {
  contentSafeAreaInset?: Partial<Insets>;
  safeAreaInset?: Partial<Insets>;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
};

function readInsets(): Insets {
  if (typeof window === 'undefined') return EMPTY_INSETS;
  const webApp = (window as typeof window & { Telegram?: { WebApp?: TelegramViewport } }).Telegram?.WebApp;
  const content = webApp?.contentSafeAreaInset;
  const safe = webApp?.safeAreaInset;
  return {
    top: Math.max(0, Number(content?.top ?? safe?.top ?? 0)),
    right: Math.max(0, Number(content?.right ?? safe?.right ?? 0)),
    bottom: Math.max(0, Number(content?.bottom ?? safe?.bottom ?? 0)),
    left: Math.max(0, Number(content?.left ?? safe?.left ?? 0)),
  };
}

export function useTelegramSafeArea() {
  const [insets, setInsets] = useState<Insets>(readInsets);

  useEffect(() => {
    const webApp = (window as typeof window & { Telegram?: { WebApp?: TelegramViewport } }).Telegram?.WebApp;
    const update = () => setInsets(readInsets());
    update();
    webApp?.onEvent?.('safeAreaChanged', update);
    webApp?.onEvent?.('contentSafeAreaChanged', update);
    return () => {
      webApp?.offEvent?.('safeAreaChanged', update);
      webApp?.offEvent?.('contentSafeAreaChanged', update);
    };
  }, []);

  return insets;
}
