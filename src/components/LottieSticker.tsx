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
