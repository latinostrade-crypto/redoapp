import { useEffect, useRef } from 'react';

type Pixel = { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string };

export function TapPixelDust() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let pixels: Pixel[] = [];
    let frame = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      pixels = pixels.filter((pixel) => pixel.life > 0);
      for (const pixel of pixels) {
        pixel.x += pixel.vx;
        pixel.y += pixel.vy;
        pixel.vx *= .91;
        pixel.vy = pixel.vy * .91 + .018;
        pixel.life -= .055;
        ctx.globalAlpha = Math.max(0, pixel.life) * .58;
        ctx.fillStyle = pixel.color;
        ctx.fillRect(Math.round(pixel.x), Math.round(pixel.y), pixel.size, pixel.size);
      }
      ctx.globalAlpha = 1;
      frame = pixels.length ? requestAnimationFrame(draw) : 0;
    };
    const scatter = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const palette = ['#ff5a50', '#ba2d2d', '#f2c35b', '#77828a'];
      for (let index = 0; index < 9; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = .35 + Math.random() * 1.25;
        pixels.push({
          x: event.clientX + (Math.random() - .5) * 8,
          y: event.clientY + (Math.random() - .5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - .25,
          life: .75 + Math.random() * .25,
          size: Math.random() > .7 ? 3 : 2,
          color: palette[Math.floor(Math.random() * palette.length)],
        });
      }
      if (!frame) frame = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointerdown', scatter, { passive: true });
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', scatter);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="rp-tap-pixel-dust" aria-hidden="true" />;
}
