import { useLayoutEffect, useRef, useState } from 'react';
import type { BoardDelivery } from './motion/presentation';
import './plush-cards.css';

export const PLUSH_CAST = ['beast', 'frog', 'girl', 'dog-v2', 'durov'] as const;

/** Permanent actor; only the local board clock starts its short pose sequence. */
export function PlushCard({ slot, visible, delivery, reduced }: {
  slot: number; visible: boolean; delivery?: BoardDelivery; reduced: boolean;
}) {
  const scene = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const active = Boolean(delivery && !reduced);
  useLayoutEffect(() => {
    if (!scene.current || !delivery || !active) return;
    scene.current.parentElement!.style.setProperty('--crew-elapsed', `${-Math.max(0, performance.now() - delivery.start)}ms`);
  }, [delivery?.start, active]);
  const sprite = slot === 1 ? 'pepe-heart-poses' : `${PLUSH_CAST[slot]}-poses`;
  return <span ref={scene} aria-hidden="true" className={`rp-plush-scene${visible ? ' rp-plush-scene--revealed' : ''}${active ? ' rp-plush-scene--delivery' : ''}${slot === 1 ? ' rp-plush-scene--pepe' : ''}`}>
    {!ready && <img src={`/poker-plush/${PLUSH_CAST[slot]}.webp`} width={80} height={104} alt="" className="rp-plush-fallback" />}
    <span className="rp-plush-pose" style={{ visibility: ready ? 'visible' : 'hidden' }}>
      <img src={`/poker-plush/${sprite}.webp`} width={240} height={104} alt="" draggable={false}
        onLoad={() => setReady(true)} onError={() => setReady(false)} className="rp-plush-sprites" />
    </span>
  </span>;
}
