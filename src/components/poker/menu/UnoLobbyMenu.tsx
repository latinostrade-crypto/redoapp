import React from 'react';
import banner from '../../../assets/resistance/uno-network-banner.lossless.webp';

/** Presentation only: queue, invite, stake and room ownership remain in the dashboard. */
export function UnoLobbyMenu({mode, onMode, children}: {mode: string; onMode: (mode: 'public' | 'private' | 'practice') => void; children: React.ReactNode}) {
  return <section className="rp-menu-uno" aria-label="UNO lobby">
    <figure className="rp-menu-poker__banner" data-menu-banner="uno"><img src={banner} width={2172} height={724} alt="REDOapp Resistance UNO. Blue-haired girl, Pepe, badger in a papakha and the REDO mascot, each wearing a dark hood." /></figure>
    <div className="rp-menu-poker__modes"><nav aria-label="UNO mode">
      {(['public','private','practice'] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} onClick={()=>onMode(item)}>{item}</button>)}
    </nav></div>
    <div className="rp-menu-uno__content" key={mode}>{children}</div>
  </section>;
}
