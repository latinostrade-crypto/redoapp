import React, { useLayoutEffect, useRef, useState } from 'react';
import type { BoardDelivery } from './motion/presentation';
import './plush-cards.css';

export const PLUSH_CAST = ['beast', 'frog', 'girl', 'dog-v2', 'durov'] as const;

/** Decorative delivery only. The presentation model owns reveal deadlines. */
export function PlushCard({ slot, visible, delivery, reduced }: {
  slot: number; visible: boolean; delivery?: BoardDelivery; reduced: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = Boolean(delivery && !reduced && loaded && !failed);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !delivery || !active) return;
    const target = el.parentElement!.getBoundingClientRect();
    const deck = el.closest('.rp-community-board')?.querySelector('.rp-plush-deck')?.getBoundingClientRect();
    if (!deck) return;
    el.style.setProperty('--plush-from-x', `${Math.round(deck.left + deck.width / 2 - target.left - target.width / 2)}px`);
    el.style.setProperty('--plush-from-y', `${Math.round(deck.top + deck.height / 2 - target.top - target.height / 2)}px`);
    el.style.setProperty('--plush-elapsed', `${-Math.max(0, performance.now() - delivery.start)}ms`);
  }, [delivery?.start, active]);
  useLayoutEffect(() => {
    const canvas = dustRef.current;
    const actor = ref.current?.querySelector<HTMLImageElement>('.rp-plush-actor');
    if (!active || !delivery || !canvas || !actor) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
    const scale = Math.min((width - 32) / 80, (height - 32) / 104);
    const left = (width - 80 * scale) / 2, top = (height - 104 * scale) / 2;
    let frame = 0;
    const draw = () => {
      const elapsed = performance.now() - delivery.start;
      ctx.clearRect(0, 0, width, height);
      if (document.hidden || elapsed >= 745) return;
      if (elapsed >= 445.5) {
        const progress = Math.min(1, (elapsed - 445.5) / 300);
        // Real sprite pixels, deterministic block erosion; one small canvas, no particle DOM.
        for (let y = 0; y < 104; y += 4) for (let x = 0; x < 80; x += 4) {
          const seed = ((x * 73 + y * 151 + x * y * 7) % 997) / 997;
          if (progress > .15 + seed * .85) continue;
          const drift = Math.floor(progress * (3 + seed * 9));
          ctx.globalAlpha = 1 - progress * .65;
          ctx.drawImage(actor, x, y, 4, 4,
            Math.round(left + x * scale + (x < 40 ? -drift : drift)),
            Math.round(top + y * scale - drift), Math.ceil(4 * scale), Math.ceil(4 * scale));
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, width, height); };
  }, [delivery?.start, active]);
  if (visible && !active) return null;
  return <span ref={ref} aria-hidden="true" className={`rp-plush-scene${active ? ' rp-plush-scene--delivery' : ''}`}>
    {!visible && !loaded && <img src="/cards/poker-back-redo.png" className="rp-community-card-back" alt="" />}
    {!failed && <img src={`/poker-plush/${PLUSH_CAST[slot]}.webp`} width={80} height={104} alt="" draggable={false}
      onLoad={() => setLoaded(true)} onError={() => { setFailed(true); setLoaded(false); }}
      className="rp-plush-actor" style={{ visibility: loaded ? 'visible' : 'hidden' }} />}
    {active && <img src="/cards/poker-back-redo.png" width={40} height={56} alt="" className="rp-plush-parcel" />}
    {active && <canvas ref={dustRef} className="rp-plush-dust" aria-hidden="true" />}
  </span>;
}
