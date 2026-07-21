import type { ComicSceneConfig } from '../../types/comic';
import { TELEGRAM_APP_URL } from '../../data/comicScenes';

interface ReducedMotionExperienceProps {
  scenes: ComicSceneConfig[];
}

export function ReducedMotionExperience({ scenes }: ReducedMotionExperienceProps) {
  return (
    <main className="reduced-story" id="story-start">
      <header className="reduced-story__intro">
        <img src="/text(logo).jpg" alt="Redoapp" width={938} height={201} />
        <p>AN INTERACTIVE CARD-GAME STORY</p>
        <h1>Four players. One table. Your move.</h1>
      </header>

      {scenes.map((scene, sceneIndex) => (
        <section
          className="reduced-scene"
          key={scene.id}
          id={scene.id}
          aria-labelledby={`${scene.id}-reduced-title`}
        >
          <header>
            <span>{scene.chapter} / 07</span>
            <p>{scene.eyebrow}</p>
            <h2 id={`${scene.id}-reduced-title`}>{scene.title}</h2>
            <p>{scene.description}</p>
          </header>

          <div className="reduced-scene__images">
            {scene.images.map((image, imageIndex) => {
              const isBanner = image.src.endsWith('/banner.png');
              return (
                <figure key={`${scene.id}-${image.src}`}>
                  <img
                    src={image.src}
                    alt={image.alt}
                    width={isBanner ? 2171 : 768}
                    height={isBanner ? 724 : 1376}
                    loading={sceneIndex === 0 && imageIndex === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                </figure>
              );
            })}
          </div>

          <div className="reduced-scene__dialogue">
            {scene.bubbles.map((bubble) => (
              <blockquote key={bubble.text}>{bubble.text}</blockquote>
            ))}
          </div>

          {scene.facts && (
            <dl className="reduced-scene__facts">
              {scene.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.text}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="reduced-scene__sounds" aria-hidden="true">
            {scene.soundEffects.map((effect) => effect.text).join(' · ')}
          </p>

          {scene.finale && (
            <div className="reduced-story__cta" id="story-finale">
              <a
                className="reduced-story__primary"
                href={TELEGRAM_APP_URL}
                target="_blank"
                rel="noreferrer"
              >
                PLAY REDOAPP →
              </a>
              <a href={TELEGRAM_APP_URL} target="_blank" rel="noreferrer">
                OPEN IN TELEGRAM
              </a>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
