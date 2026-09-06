import React, { useEffect, useRef } from 'react';
import lottie, { AnimationItem } from 'lottie-web';

interface LottieStickerProps {
  path: string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
}

export const LottieSticker: React.FC<LottieStickerProps> = ({
  path,
  className = 'w-10 h-10',
  loop = true,
  autoplay = true,
  speed = 1,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current || !path) return;

    animRef.current?.destroy();
    
    try {
      const anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop,
        autoplay,
        path,
      });

      anim.setSpeed(speed);
      animRef.current = anim;
      let visible = true;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      const syncPlayback = () => {
        if (reduced.matches) { anim.goToAndStop(Math.floor(anim.totalFrames * .3), true); return; }
        if (autoplay && visible && !document.hidden) anim.play(); else anim.pause();
      };
      const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        syncPlayback();
      });
      observer?.observe(containerRef.current);
      document.addEventListener('visibilitychange', syncPlayback);
      reduced.addEventListener('change', syncPlayback);
      anim.addEventListener('DOMLoaded', syncPlayback);
      syncPlayback();
      return () => {
        observer?.disconnect();
        document.removeEventListener('visibilitychange', syncPlayback);
        reduced.removeEventListener('change', syncPlayback);
        anim.destroy();
        if (animRef.current === anim) animRef.current = null;
      };
    } catch (err) {
      console.error('Failed to load lottie sticker:', path, err);
    }

    return () => {
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [path, loop, autoplay, speed]);

  return (
    <div
      ref={containerRef}
      className={`inline-block pointer-events-none select-none ${className}`}
      style={{ overflow: 'hidden' }}
    />
  );
};
