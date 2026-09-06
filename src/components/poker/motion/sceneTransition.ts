/** Survives the table unmount so both sides of the navigation are covered. */
let transitionActive = false;
export function transitionResistanceScene(changeScene: () => void, reduced = false) {
  if (transitionActive) return;
  if (reduced || document.hidden) { changeScene(); return; }
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '2147483646', pointerEvents: 'none', imageRendering: 'pixelated' });
  canvas.width = Math.ceil(innerWidth / 8); canvas.height = Math.ceil(innerHeight / 8);
  const ctx = canvas.getContext('2d');
  if (!ctx) { changeScene(); return; }
  transitionActive = true;
  document.body.append(canvas);
  let changed = false, frame = 0;
  const started = performance.now();
  const finish = () => { cancelAnimationFrame(frame); canvas.remove(); transitionActive = false; if (!changed) { changed = true; changeScene(); } };
  const fallback = window.setTimeout(finish, 1400);
  const draw = (now: number) => {
    const elapsed = now - started;
    const coverage = elapsed < 360 ? Math.min(1, elapsed / 300) : Math.max(0, 1 - (elapsed - 420) / 340);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#020303';
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const rank = ((x * 17 + y * 31 + (x >> 2) * (y >> 2) * 7) % 101) / 100;
      if (rank <= Math.floor(coverage * 12) / 12) ctx.fillRect(x, y, 1, 1);
    }
    if (elapsed >= 340 && !changed) { changed = true; changeScene(); }
    if (elapsed >= 780) { clearTimeout(fallback); finish(); } else frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
}
