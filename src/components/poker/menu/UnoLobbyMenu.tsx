import { useLanguage } from '../../../i18n/LanguageProvider';
import React from 'react';
import banner from '../../../assets/resistance/uno-network-banner.lossless.webp';

/** Presentation only: queue, invite, stake and room ownership remain in the dashboard. */
export function UnoLobbyMenu({mode, onMode, children}: {mode: string; onMode: (mode: 'public' | 'private' | 'practice') => void; children: React.ReactNode}) {
  const { t, tr } = useLanguage();
  return <section className="rp-menu-uno" aria-label={tr('lobbyForGame', { game: 'UNO' })}>
    <figure className="rp-menu-poker__banner" data-menu-banner="uno"><img src={banner} width={2172} height={724} alt={tr('unoBannerAlt')} /></figure>
    <div className="rp-menu-poker__modes"><nav aria-label={tr('modeForGame', { game: 'UNO' })}>
      {(['public','private','practice'] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} onClick={()=>onMode(item)}>{t(item)}</button>)}
    </nav></div>
    <div className="rp-menu-uno__content" key={mode}>{children}</div>
  </section>;
}
