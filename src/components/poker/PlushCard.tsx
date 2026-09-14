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
  return <><span ref={scene} aria-hidden="true" className={`rp-plush-scene${visible ? ' rp-plush-scene--revealed' : ''}${active ? ' rp-plush-scene--delivery' : ''}${slot === 1 ? ' rp-plush-scene--pepe' : ''}`}>
    {!ready && <img src={`/poker-plush/${PLUSH_CAST[slot]}.webp`} width={80} height={104} alt="" className="rp-plush-fallback" />}
    <span className="rp-plush-pose" style={{ visibility: ready ? 'visible' : 'hidden' }}>
      <span className="rp-plush-body"><img src={`/poker-plush/${sprite}.webp`} width={240} height={104} alt="" draggable={false}
        onLoad={() => setReady(true)} onError={() => setReady(false)} className="rp-plush-sprites" />
      </span>
      {active && slot === 1 && <span className="rp-plush-empty-chest">
        <img src={`/poker-plush/${sprite}.webp`} width={240} height={104} alt="" draggable={false} className="rp-plush-chest-sheet" />
      </span>}
    </span>
    {active && ready && <svg className="rp-plush-arms" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? 'translate(100 0) scale(-1 1)' : undefined}>
        <path className="rp-plush-arm rp-plush-arm--outline" d="M 32 65 L 21 72 L 18 73" />
        <path className="rp-plush-arm rp-plush-arm--sleeve" d="M 32 65 L 21 72 L 18 73" />
      </g>)}
    </svg>}
  </span>
    {active && ready && <span className="rp-plush-hands" aria-hidden="true">
      {(['left', 'right'] as const).map(side => <span key={side} className={`rp-plush-grip rp-plush-grip--${side}`}>
        <img src={`/poker-plush/${sprite}.webp`} width={240} height={104} alt="" draggable={false} className="rp-plush-hand-sheet" />
      </span>)}
    </span>}
  </>;
}
