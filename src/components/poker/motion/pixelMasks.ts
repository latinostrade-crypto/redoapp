import type { CSSProperties } from 'react';

// Repeating 4px square cells, shared by all objects. No per-pixel DOM nodes.
function mask(phase: number) {
  let cells = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (((x * 13 + y * 7 + x * y * 3) % 8) < phase) cells += `<rect x="${x * 4}" y="${y * 4}" width="4" height="4" fill="white"/>`;
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${cells}</svg>`)}")`;
}
export const pixelMaskStyle = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`--rp-mask-${i}`, mask(i)])) as CSSProperties;
