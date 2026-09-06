/** One short-lived canvas, real raster tiles, no particle DOM or React frame updates. */
let cancelCurrent: (() => void) | undefined;
const heroSelector = '.rp-main-banner > img';
const gameSelector = '.rp-menu-poker__banner img';

export function transitionMenuBanner(fromGame: boolean, toGame: boolean, change: () => void) {
  cancelCurrent?.();
  const source = document.querySelector<HTMLImageElement>(fromGame ? gameSelector : heroSelector);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!source?.complete || !source.naturalWidth || reduced || document.hidden || !fromGame && !toGame) {
    change(); return;
  }
  const startRect = source.getBoundingClientRect();
  // Off-screen transitions must not pull the user away from their scroll position.
  if (startRect.bottom <= 0 || startRect.top >= innerHeight) { change(); return; }
  const originalSrc = source.currentSrc;
  // Freeze the outgoing pixels: React may reuse the same <img> with a new src.
  const sourceRaster = document.createElement('canvas');
  sourceRaster.width = Math.min(560, source.naturalWidth);
  sourceRaster.height = Math.round(sourceRaster.width * source.naturalHeight / source.naturalWidth);
  const rasterContext = sourceRaster.getContext('2d');
  if (!rasterContext) { change(); return; }
  rasterContext.imageSmoothingEnabled = false;
  rasterContext.drawImage(source, 0, 0, sourceRaster.width, sourceRaster.height);
  const savedSourceOpacity = source.style.opacity;
  const root = document.querySelector('.rp-main-menu');
  if (!root) { change(); return; }
  let frame = 0, canvas: HTMLCanvasElement | undefined, target: HTMLImageElement | undefined;
  let observer: MutationObserver | undefined, finished = false, targetOpacity = '';
  let loaded: (() => void) | undefined;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame); clearTimeout(timeout); observer?.disconnect(); canvas?.remove();
    if (loaded) root.removeEventListener('load', loaded, true);
    source.style.opacity = savedSourceOpacity;
    if (target) target.style.opacity = targetOpacity;
    window.removeEventListener('resize', finish); window.removeEventListener('scroll', finish, true);
    document.removeEventListener('visibilitychange', finish);
    if (cancelCurrent === finish) cancelCurrent = undefined;
  };
  const timeout = window.setTimeout(finish, 1800);
  cancelCurrent = finish;
  window.addEventListener('resize', finish, {once: true});
  window.addEventListener('scroll', finish, {once: true, capture: true, passive: true});
  document.addEventListener('visibilitychange', finish, {once: true});

  const attempt = () => {
    if (finished || canvas) return;
    const candidate = document.querySelector<HTMLImageElement>(toGame ? gameSelector : heroSelector);
    if (!candidate || fromGame === toGame && candidate.currentSrc === originalSrc || !candidate.complete || !candidate.naturalWidth) return;
    const endRect = candidate.getBoundingClientRect();
    if (!endRect.width) return; // The outgoing tab may still be in its exit phase.
    if (endRect.bottom <= 0 || endRect.top >= innerHeight) { finish(); return; }
    target = candidate; targetOpacity = target.style.opacity;
    observer?.disconnect();
    canvas = document.createElement('canvas');
    canvas.className = 'rp-banner-particles'; canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '100', imageRendering: 'pixelated'});
    // Do not multiply by devicePixelRatio: a high-density phone must not cost 9x more.
    const scale = Math.min(1, 720 / innerWidth, 900 / innerHeight);
    canvas.width = Math.ceil(innerWidth * scale); canvas.height = Math.ceil(innerHeight * scale);
    const ctx = canvas.getContext('2d', {alpha: true});
    if (!ctx) { finish(); return; }
    ctx.scale(scale, scale); ctx.imageSmoothingEnabled = false;
    document.body.append(canvas);
    source.style.opacity = '0'; target.style.opacity = '0';
    const constrained = navigator.hardwareConcurrency <= 4 || ((navigator as Navigator & {deviceMemory?: number}).deviceMemory ?? 8) <= 4;
    const columns = constrained ? 20 : 28, rows = constrained ? 8 : 10;
    const duration = constrained ? 480 : 620;
    const started = performance.now(); let previous = started, slowFrames = 0;
    const draw = (now: number) => {
      if (finished) return;
      if (now - previous > 50) slowFrames++; previous = now;
      const t = Math.min(1, (now - started) / duration);
      if (t >= 1 || slowFrames >= 3) { finish(); return; }
      const ease = t * t * (3 - 2 * t), spread = Math.sin(t * Math.PI);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        const n = x + y * columns;
        const dx = ((n * 37 % 67) - 33) * spread;
        const dy = ((n * 19 % 43) - 21) * spread;
        const px = startRect.left + x * startRect.width / columns;
        const py = startRect.top + y * startRect.height / rows;
        const tx = endRect.left + x * endRect.width / columns;
        const ty = endRect.top + y * endRect.height / rows;
        const width = (startRect.width * (1 - ease) + endRect.width * ease) / columns;
        const height = (startRect.height * (1 - ease) + endRect.height * ease) / rows;
        const outgoing = t < .48 + (n % 7) * .015;
        const image = outgoing ? sourceRaster : candidate;
        const imageWidth = outgoing ? sourceRaster.width : candidate.naturalWidth;
        const imageHeight = outgoing ? sourceRaster.height : candidate.naturalHeight;
        const shrink = 1 - .58 * spread;
        ctx.drawImage(image, x * imageWidth / columns, y * imageHeight / rows,
          imageWidth / columns, imageHeight / rows,
          Math.round(px + (tx - px) * ease + dx), Math.round(py + (ty - py) * ease + dy),
          Math.ceil(width * shrink), Math.ceil(height * shrink));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  };
  observer = new MutationObserver(attempt);
  observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class']});
  // Image decode can finish after the React commit; do not hide either image while waiting.
  loaded = () => attempt();
  root.addEventListener('load', loaded, true);
  try { change(); } catch (error) { finish(); throw error; }
}

export function cancelMenuBannerTransition() { cancelCurrent?.(); }
