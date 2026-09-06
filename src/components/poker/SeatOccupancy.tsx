import { useLanguage } from '../../i18n/LanguageProvider';
import React from 'react';
export function SeatOccupancy({ count, capacity }: { count: number; capacity: number }) {
  const { tr } = useLanguage();
  return <span className="rp-occupancy" aria-label={tr('seatCount', { count, capacity })}>
    <span aria-hidden="true">{Array.from({ length: capacity }, (_, i) => <i key={`${i}-${i < count}`} className={i < count ? 'rp-occupancy--filled' : ''} />)}</span>
    <strong>{count}/{capacity}{' '}{tr("playersSentence")}</strong>
  </span>;
}
