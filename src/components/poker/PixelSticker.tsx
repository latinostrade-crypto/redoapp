import React, { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';

/** Existing authored stickers, sampled at 12fps on a small nearest-neighbour canvas. */
export function PixelSticker({ path, label, animate = false, reduced = false }: { path: string; label: string; animate?: boolean; reduced?: boolean }) {
  const source = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    setFailed(false);
    if (!source.current || !target.current) return;
    const context = target.current.getContext('2d');
    if (!context) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const animation = lottie.loadAnimation({ container: source.current, renderer: 'canvas', autoplay: false, loop: false, path, rendererSettings: { dpr: 1, clearCanvas: true } });
    animation.setSubframe(false);
    const render = (frame: number) => {
      animation.goToAndStop(frame, true);
      const canvas = source.current?.querySelector('canvas');
      if (!canvas) return;
      context.clearRect(0, 0, 32, 32); context.imageSmoothingEnabled = false;
      context.drawImage(canvas, 0, 0, 32, 32);
    };
    animation.addEventListener('DOMLoaded', () => {
      let frame = Math.floor(animation.totalFrames * .3);
      render(frame);
      setReady(true);
      if (!animate || reduced) return;
      let ticks = 0;
      timer = setInterval(() => {
        frame = (frame + Math.max(1, Math.round(animation.frameRate / 12))) % Math.max(1, animation.totalFrames);
        render(frame);
        if (++ticks >= 24) clearInterval(timer);
      }, 1000 / 12);
    });
    animation.addEventListener('data_failed', () => setFailed(true));
    return () => { clearInterval(timer); animation.destroy(); };
  }, [path, animate, reduced]);
  return <span className="rp-sticker" role="img" aria-label={label}>
    <span ref={source} className="rp-sticker-source" aria-hidden="true" />
    {(!ready || failed) && <span className="rp-sticker-fallback">{label}</span>}
    <canvas ref={target} width={32} height={32} aria-hidden="true" style={{ visibility: ready && !failed ? 'visible' : 'hidden' }} />
  </span>;
}
