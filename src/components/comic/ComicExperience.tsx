import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { comicScenes, TELEGRAM_APP_URL } from '../../data/comicScenes';
import { ComicScene } from './ComicScene';
import { ReducedMotionExperience } from './ReducedMotionExperience';
import { StoryProgress } from './StoryProgress';
import './comic.css';

gsap.registerPlugin(ScrollTrigger);

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

export default function ComicExperience() {
  const storyRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const [activeChapter, setActiveChapter] = useState(1);
  const reducedMotion = usePrefersReducedMotion();

  const handleChapterChange = useCallback((chapter: number) => {
    setActiveChapter((current) => (current === chapter ? current : chapter));
  }, []);

  useLayoutEffect(() => {
    if (reducedMotion || !storyRef.current || !progressRef.current) return;

    const progressElement = progressRef.current;
    progressElement.style.setProperty('--story-progress', '0');

    const trigger = ScrollTrigger.create({
      id: 'comic-story-progress',
      trigger: storyRef.current,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        progressElement.style.setProperty('--story-progress', String(self.progress));
      },
    });

    return () => trigger.kill();
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    let cancelled = false;
    const firstImage = storyRef.current?.querySelector<HTMLImageElement>(
      '.comic-scene:first-of-type [data-scene-image] img',
    );
    const fontReady = document.fonts?.ready ?? Promise.resolve();
    const imageReady =
      firstImage && typeof firstImage.decode === 'function'
        ? firstImage.decode().catch(() => undefined)
        : Promise.resolve();

    Promise.all([fontReady, imageReady]).then(() => {
      if (cancelled) return;
      window.requestAnimationFrame(() => ScrollTrigger.refresh());
    });

    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  return (
    <div className="comic-experience" ref={storyRef}>
      <a className="comic-skip-link" href="#story-finale">
        Skip to final call to action
      </a>

      <header className="comic-topbar">
        <a href="#before-the-first-move" className="comic-topbar__brand" aria-label="Redoapp story start">
          <img src="/text(logo).jpg" alt="Redoapp" width={938} height={201} />
          <span>INTERACTIVE STORY</span>
        </a>
        <nav aria-label="Story actions">
          <a
            className="comic-topbar__telegram"
            href={TELEGRAM_APP_URL}
            target="_blank"
            rel="noreferrer"
          >
            TELEGRAM
          </a>
          <a
            className="comic-topbar__play"
            href={TELEGRAM_APP_URL}
            target="_blank"
            rel="noreferrer"
          >
            SKIP TO GAME <span aria-hidden="true">→</span>
          </a>
        </nav>
      </header>

      {!reducedMotion && (
        <StoryProgress
          currentChapter={activeChapter}
          totalChapters={comicScenes.length}
          progressRef={progressRef}
        />
      )}

      {reducedMotion ? (
        <ReducedMotionExperience scenes={comicScenes} />
      ) : (
        <main id="story-start">
          <h1 className="sr-only">Redoapp — an interactive card-game story</h1>
          {comicScenes.map((scene, sceneIndex) => (
            <div
              id={scene.finale ? 'story-finale' : undefined}
              key={scene.id}
              className="comic-scene-shell"
            >
              <ComicScene
                scene={scene}
                sceneIndex={sceneIndex}
                onChapterChange={handleChapterChange}
              />
            </div>
          ))}
        </main>
      )}

      <footer className="comic-footer">
        <span>REDOAPP © 2026</span>
        <a href="https://redoapp.onrender.com" target="_blank" rel="noreferrer">
          WEB APP
        </a>
        <a href={TELEGRAM_APP_URL} target="_blank" rel="noreferrer">
          TELEGRAM MINI APP
        </a>
      </footer>
    </div>
  );
}
