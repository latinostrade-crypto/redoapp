import React from 'react';
export function SeatOccupancy({ count, capacity }: { count: number; capacity: number }) {
  return <span className="rp-occupancy" aria-label={`${count} of ${capacity} players`}>
    <span aria-hidden="true">{Array.from({ length: capacity }, (_, i) => <i key={`${i}-${i < count}`} className={i < count ? 'rp-occupancy--filled' : ''} />)}</span>
    <strong>{count}/{capacity} Players</strong>
  </span>;
}
