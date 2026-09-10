import React from 'react';

export function ChipStackIcon({ className = 'w-3.5 h-3.5', style }: { key?: React.Key; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`rp-chip-logo inline-block shrink-0 ${className}`} aria-hidden="true" style={{ shapeRendering: 'crispEdges', ...style }}>
      {[14, 9, 4].map(y => <g key={y} transform={`translate(0 ${y})`}>
        <path d="M5 0h14v2h4v6h-4v2H5V8H1V2h4Z" fill="#090b0e" />
        <path d="M5 1h14v2h3v4h-3v2H5V7H2V3h3Z" fill="var(--chip-color, #df493f)" />
        <path d="M5 1h14v2h3v2H2V3h3Z" fill="var(--chip-top, #ff7664)" />
        <path d="M5 5h3v3H5zm11 0h3v3h-3zM10 1h4v2h-4Z" fill="#f4ead7" />
        <path d="M8 3h8v2H8Z" fill="#141a20" />
      </g>)}
    </svg>
  );
}
