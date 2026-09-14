import { useLayoutEffect, useRef, useState } from 'react';
import type { BoardDelivery } from './motion/presentation';
import './pepe-card.css';

/** Uses the existing board clock: heart release → pixel burst / pull → reveal at 900ms. */
export function PepeHeart({ delivery, reduced }: {
  delivery?: BoardDelivery; reduced: boolean;
}) {
  const heart = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [heartReady, setHeartReady] = useState(false);
  const active = Boolean(delivery && !reduced);

  useLayoutEffect(() => {
    const surface = canvas.current;
    const sprite = heart.current;
    if (!surface || !sprite || !active || !heartReady || !delivery) return;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const width = surface.clientWidth, height = surface.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
    const heartWidth = width * .15, heartHeight = heartWidth * 28 / 32;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const time = performance.now() - delivery.start;
      if (document.hidden || time >= 810) return;
      if (time >= 81) {
        const rise = Math.min(1, (time - 81) / 369);
        const x = width / 2 + Math.sin(rise * Math.PI) * 5 - heartWidth / 2;
        const y = height * .88 - rise * height * .64 - heartHeight / 2;
        if (time < 450) ctx.drawImage(sprite, Math.round(x), Math.round(y), heartWidth, heartHeight);
        else {
          const burst = (time - 450) / 360;
          // Sample actual heart pixels into one canvas, never one DOM node per particle.
          for (let py = 0; py < 28; py += 4) for (let px = 0; px < 32; px += 4) {
            const seed = ((px * 73 + py * 151 + px * py * 7) % 997) / 997;
            ctx.globalAlpha = Math.max(0, 1 - burst);
            ctx.drawImage(sprite, px, py, 4, 4,
              Math.round(x + px / 32 * heartWidth + (px - 14) * burst * (1 + seed)),
              Math.round(y + py / 28 * heartHeight - burst * (10 + seed * 22)),
              Math.max(1, Math.round(heartWidth / 8)), Math.max(1, Math.round(heartHeight / 7)));
          }
          ctx.globalAlpha = 1;
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, width, height); };
  }, [active, heartReady, delivery?.start]);

  return <span aria-hidden="true" className="rp-pepe-heart-scene">
    <img ref={heart} src="/poker-plush/pepe-heart.webp" width={32} height={28} alt="" className="rp-pepe-heart-source"
      onLoad={() => setHeartReady(true)} onError={() => setHeartReady(false)} />
    {active && <canvas ref={canvas} className="rp-pepe-heart-flight" />}
  </span>;
}
