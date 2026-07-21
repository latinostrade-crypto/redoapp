import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ComicSceneConfig, MotionPreset } from '../../types/comic';
import { TELEGRAM_APP_URL } from '../../data/comicScenes';
import { ParticleDust } from './ParticleDust';
import {
  createParticleDustRenderer,
  type DustTransitionWindow,
} from './dustRenderer';
import { SoundEffect } from './SoundEffect';
import { SpeechBubble } from './SpeechBubble';

gsap.registerPlugin(ScrollTrigger);

interface ComicSceneProps {
  scene: ComicSceneConfig;
  sceneIndex: number;
  onChapterChange: (chapter: number) => void;
}

function getCameraMotion(preset: MotionPreset, isMobile: boolean) {
  const scale = isMobile ? 1.045 : 1.1;

  switch (preset) {
    case 'hallway-split':
      return { scale, xPercent: isMobile ? -1 : -2.5, yPercent: -1.5 };
    case 'center-iris':
      return { scale: isMobile ? 1.04 : 1.115, xPercent: 0, yPercent: -2.5 };
    case 'rivalry':
      return { scale: isMobile ? 1.04 : 1.09, xPercent: isMobile ? 0 : 2, yPercent: -1 };
    case 'impact':
      return { scale: isMobile ? 1.055 : 1.115, xPercent: 0, yPercent: -2 };
    case 'connection':
      return { scale: isMobile ? 1.035 : 1.075, xPercent: -1, yPercent: 1.5 };
    case 'finale':
      return { scale: isMobile ? 1.025 : 1.055, xPercent: 0, yPercent: 0 };
    default:
      return { scale, xPercent: 1.5, yPercent: -1 };
  }
}

export function ComicScene({
  scene,
  sceneIndex,
  onChapterChange,
}: ComicSceneProps) {
  const rootRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const stage = root.querySelector<HTMLElement>('[data-comic-stage]');
    const camera = root.querySelector<HTMLElement>('[data-comic-camera]');
    const backdrop = root.querySelector<HTMLElement>('.comic-backdrop');
    const assemblyLayer = root.querySelector<HTMLElement>('[data-comic-assembly]');
    const frame = root.querySelector<HTMLElement>('[data-comic-frame]');
    const copy = root.querySelector<HTMLElement>('[data-scene-copy]');
    const images = gsap.utils.toArray<HTMLElement>('[data-scene-image]', root);
    const dustCanvas = root.querySelector<HTMLCanvasElement>('[data-dust-canvas]');
    const dustSources = gsap.utils.toArray<HTMLImageElement>('[data-dust-source]', root);
    const dustVisuals = gsap.utils.toArray<HTMLElement>('[data-dust-visual]', root);
    const comicVisuals = dustVisuals
      .filter((element) => element.dataset.dustRole !== 'primary')
      .sort((left, right) => {
        const leftAt = Number.parseFloat(left.dataset.dustRevealAt ?? '0');
        const rightAt = Number.parseFloat(right.dataset.dustRevealAt ?? '0');
        return leftAt - rightAt;
      });
    const flash = root.querySelector<HTMLElement>('[data-impact-flash]');
    const speedLines = gsap.utils.toArray<HTMLElement>('[data-speed-line]', root);
    const cta = root.querySelector<HTMLElement>('[data-comic-cta]');

    if (!stage || !camera || !backdrop || !assemblyLayer || !frame || !copy) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      const buildTimeline = (isMobile: boolean) => {
        gsap.set(images, { clearProps: 'all' });
        gsap.set(images[0], { autoAlpha: 1, scale: 1 });
        gsap.set(images.slice(1), { autoAlpha: 0, scale: 1.018 });
        gsap.set(assemblyLayer, { autoAlpha: 1, scale: 1 });
        const ownsInitialFrame = sceneIndex === 0;
        gsap.set(backdrop, { autoAlpha: ownsInitialFrame ? 1 : 0 });
        gsap.set(frame, { autoAlpha: ownsInitialFrame ? 1 : 0 });
        gsap.set(dustVisuals, { autoAlpha: 0 });
        gsap.set(copy, {
          autoAlpha: ownsInitialFrame ? 1 : 0,
          clipPath: 'inset(0 0% 0 0)',
          x: 0,
        });
        if (speedLines.length > 0) {
          gsap.set(speedLines, { autoAlpha: 0, scaleX: 0, transformOrigin: '50% 50%' });
        }
        if (flash) gsap.set(flash, { autoAlpha: 0 });
        if (cta) {
          gsap.set(cta, {
            autoAlpha: 0,
            clipPath: 'inset(0 0% 0 0)',
            pointerEvents: 'none',
          });
        }

        images.slice(1).forEach((image, index) => {
          gsap.set(image, {
            zIndex: index + 2,
          });
        });

        const dustWindows: DustTransitionWindow[] = [];
        const dustRenderer = dustCanvas
          ? createParticleDustRenderer({
              canvas: dustCanvas,
              images: dustSources,
              visualElements: dustVisuals,
              isMobile,
              seed: (sceneIndex + 1) * 7919,
            })
          : null;
        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            id: `comic-${scene.id}-${isMobile ? 'mobile' : 'desktop'}`,
            trigger: root,
            start: 'top top',
            end: 'bottom top',
            pin: stage,
            pinSpacing: false,
            scrub: isMobile ? 0.62 : 0.9,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onEnter: () => onChapterChange(sceneIndex + 1),
            onEnterBack: () => onChapterChange(sceneIndex + 1),
          },
        });

        timeline.fromTo(
          camera,
          { scale: 1.015, xPercent: 0, yPercent: 0 },
          {
            ...getCameraMotion(scene.motionPreset, isMobile),
            duration: 1,
            ease: 'steps(14)',
          },
          0,
        );

        if (sceneIndex > 0) {
          const entranceDuration = isMobile ? 0.105 : 0.09;
          const domHandoffAt = entranceDuration * 0.78;
          dustWindows.push({
            start: 0,
            duration: entranceDuration,
            outgoing: -1,
            incoming: 0,
            incomingVisualTime: 0,
            incomingVisualKind: 'primary',
            mode: 'gather',
          });
          timeline.set([backdrop, frame, copy], { autoAlpha: 1 }, domHandoffAt);
        }

        const revealCount = Math.max(1, images.length - 1);
        const transitionDuration =
          revealCount === 1 ? 0.26 : revealCount === 2 ? 0.2 : 0.16;
        const transitionStarts =
          revealCount === 1
            ? [0.26]
            : revealCount === 2
              ? [0.18, 0.44]
              : [0.12, 0.31, 0.5];
        let finalImageReadyAt = 0;

        images.slice(1).forEach((image, index) => {
          const at = transitionStarts[index] ?? 0.24;
          const dustDuration = transitionDuration;
          const imageSwapAt = at + dustDuration * 0.76;
          const imageReadyAt = at + dustDuration * 0.78;

          dustWindows.push({
            start: at,
            duration: dustDuration,
            outgoing: index,
            incoming: index + 1,
          });
          timeline.set([backdrop, frame], { autoAlpha: 0 }, at);
          timeline.set(images[index], { autoAlpha: 0, scale: 1 }, imageSwapAt);
          timeline.set(image, { autoAlpha: 1, scale: 1 }, imageSwapAt);
          timeline.set(frame, { autoAlpha: 1 }, imageReadyAt);

          finalImageReadyAt = imageReadyAt;
        });

        const comicRevealStart = Math.max(0.5, finalImageReadyAt + 0.04);
        const comicRevealEnd = scene.finale ? 0.92 : 0.84;
        const comicSpacing =
          (comicRevealEnd - comicRevealStart) / Math.max(1, comicVisuals.length);
        const comicDuration = Math.min(0.055, Math.max(0.026, comicSpacing * 0.72));

        comicVisuals.forEach((element, index) => {
          const at = comicRevealStart + index * comicSpacing;

          if (element.hasAttribute('data-comic-bubble')) {
            timeline.fromTo(
              element,
              {
                autoAlpha: 0,
                scale: 0.62,
                y: isMobile ? 12 : 18,
                rotation: index % 2 === 0 ? -5 : 5,
              },
              {
                autoAlpha: 1,
                scale: 1,
                y: 0,
                rotation: 0,
                duration: comicDuration,
                ease: 'steps(5)',
                immediateRender: false,
              },
              at,
            );
            return;
          }

          if (element.hasAttribute('data-comic-fact')) {
            timeline.fromTo(
              element,
              { autoAlpha: 0, x: isMobile ? -18 : -30 },
              {
                autoAlpha: 1,
                x: 0,
                duration: comicDuration,
                ease: 'steps(6)',
                immediateRender: false,
              },
              at,
            );
            return;
          }

          if (element.hasAttribute('data-comic-sound')) {
            timeline.fromTo(
              element,
              {
                autoAlpha: 0,
                scale: 0.3,
                rotation: index % 2 === 0 ? -14 : 14,
              },
              {
                autoAlpha: 1,
                scale: 1,
                rotation: 0,
                duration: comicDuration,
                ease: 'steps(5)',
                immediateRender: false,
              },
              at,
            );
            return;
          }

          timeline.fromTo(
            element,
            { autoAlpha: 0, y: 16, clipPath: 'inset(0 100% 0 0)' },
            {
              autoAlpha: 1,
              y: 0,
              clipPath: 'inset(0 0% 0 0)',
              duration: comicDuration,
              ease: 'steps(7)',
              immediateRender: false,
            },
            at,
          );
          if (element === cta) {
            timeline.set(cta, { pointerEvents: 'auto' }, at + comicDuration);
          }
        });

        if (scene.impact && flash) {
          timeline
            .to(flash, { autoAlpha: 0.84, duration: 0.018 }, 0.68)
            .to(flash, { autoAlpha: 0, duration: 0.025 }, 0.698)
            .to(
              camera,
              {
                keyframes: {
                  x: isMobile ? [0, -2, 2, 0] : [0, -7, 6, -3, 0],
                  y: isMobile ? [0, 1, -1, 0] : [0, 3, -2, 1, 0],
                  scale: isMobile ? [1.05, 1.065, 1.05] : [1.08, 1.13, 1.08],
                },
                duration: 0.09,
                ease: 'none',
              },
              0.69,
            );

          speedLines.forEach((line, index) => {
            timeline.fromTo(
              line,
              { autoAlpha: 0, scaleX: 0 },
              { autoAlpha: 0.9, scaleX: 1, duration: 0.07, ease: 'steps(5)' },
              0.7 + index * 0.003,
            );
            timeline.to(line, { autoAlpha: 0, duration: 0.06 }, 0.79);
          });
        }

        if (!scene.finale) {
          const exitStart = 0.88;
          const exitDuration = 0.12;
          dustWindows.push({
            start: exitStart,
            duration: exitDuration,
            outgoing: images.length - 1,
            incoming: 0,
            outgoingVisualTime: 1,
            outgoingVisualKind: 'all',
            mode: 'scatter',
          });
          timeline.set(
            [backdrop, frame, ...dustVisuals],
            { autoAlpha: 0 },
            exitStart,
          );
        }

        timeline.eventCallback('onUpdate', () => {
          dustRenderer?.render(timeline.time(), dustWindows);
        });
        dustRenderer?.render(0, dustWindows);

        return () => {
          timeline.eventCallback('onUpdate', null);
          dustRenderer?.destroy();
          timeline.scrollTrigger?.kill();
          timeline.kill();
        };
      };

      media.add(
        '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
        () => buildTimeline(false),
      );
      media.add(
        '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
        () => buildTimeline(true),
      );
    }, root);

    return () => {
      media.revert();
      context.revert();
    };
  }, [onChapterChange, scene, sceneIndex]);

  const style = {
    '--scene-scroll': `${scene.scrollVh}vh`,
    '--scene-scroll-mobile': `${scene.mobileScrollVh}svh`,
  } as CSSProperties;

  return (
    <section
      ref={rootRef}
      id={scene.id}
      className={`comic-scene comic-scene--${scene.layout}`}
      data-layout={scene.layout}
      data-preset={scene.motionPreset}
      style={style}
      aria-labelledby={`${scene.id}-title`}
    >
      <div className="comic-stage" data-comic-stage>
        <div className="comic-camera" data-comic-camera aria-hidden="true">
          <img
            className="comic-backdrop"
            src={scene.images[0].src}
            alt=""
            width={768}
            height={1376}
            loading={sceneIndex === 0 ? 'eager' : 'lazy'}
            fetchPriority={sceneIndex === 0 ? 'high' : 'auto'}
          />
        </div>
        <div className="comic-vignette" aria-hidden="true" />
        <div className="comic-grid" aria-hidden="true" />

        <div className="comic-stage__safe" data-comic-assembly>
          <header
            className="comic-scene__copy"
            data-scene-copy
            data-dust-visual
            data-dust-role="primary"
            data-dust-reveal-at="0"
          >
            <span className="comic-scene__chapter">{scene.chapter}</span>
            <p className="comic-scene__eyebrow">{scene.eyebrow}</p>
            <h2 id={`${scene.id}-title`}>{scene.title}</h2>
            <p className="comic-scene__description">{scene.description}</p>
          </header>

          <div
            className="comic-frame"
            data-comic-frame
          >
            {scene.images.map((image, imageIndex) => {
              const isBanner = image.src.endsWith('/banner.png');
              const imageStyle = {
                '--image-object-position': image.objectPosition ?? '50% 50%',
                '--image-mobile-object-position':
                  image.mobileObjectPosition ?? image.objectPosition ?? '50% 50%',
              } as CSSProperties;

              return (
                <figure
                  key={`${scene.id}-${imageIndex}-${image.src}`}
                  className="comic-frame__image"
                  data-scene-image
                  data-image-kind={isBanner ? 'banner' : 'portrait'}
                  style={imageStyle}
                >
                  {scene.finale && (
                    <img
                      className="comic-frame__ambient"
                      src={image.src}
                      alt=""
                      aria-hidden="true"
                      width={isBanner ? 2171 : 768}
                      height={isBanner ? 724 : 1376}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <img
                    className="comic-frame__subject"
                    data-dust-source
                    src={image.src}
                    alt={image.alt}
                    width={isBanner ? 2171 : 768}
                    height={isBanner ? 724 : 1376}
                    loading={sceneIndex === 0 && imageIndex === 0 ? 'eager' : 'lazy'}
                    fetchPriority={sceneIndex === 0 && imageIndex === 0 ? 'high' : 'auto'}
                    decoding={sceneIndex === 0 && imageIndex === 0 ? 'sync' : 'async'}
                  />
                </figure>
              );
            })}
            <span className="comic-frame__corner comic-frame__corner--tl" aria-hidden="true" />
            <span className="comic-frame__corner comic-frame__corner--br" aria-hidden="true" />
          </div>

          {scene.facts && (
            <div className="comic-facts" aria-label="Scene facts">
              {scene.facts.map((fact, factIndex) => (
                <div
                  className="comic-fact"
                  data-comic-fact
                  data-dust-visual
                  data-dust-reveal-at={0.34 + factIndex * 0.095}
                  key={fact.label}
                >
                  <strong>{fact.label}</strong>
                  <span>{fact.text}</span>
                </div>
              ))}
            </div>
          )}

          <div className="comic-dialogue">
            {scene.bubbles.map((bubble, bubbleIndex) => (
              <SpeechBubble
                key={`${scene.id}-${bubble.text}`}
                bubble={bubble}
                revealAt={0.2 + bubbleIndex * (0.48 / Math.max(1, scene.bubbles.length))}
              />
            ))}
          </div>

          <div className="comic-effects" aria-hidden="true">
            {scene.soundEffects.map((effect, effectIndex) => (
              <SoundEffect
                key={`${scene.id}-${effect.text}`}
                effect={effect}
                revealAt={0.5 + effectIndex * (0.29 / Math.max(1, scene.soundEffects.length))}
              />
            ))}
          </div>

          {scene.impact && (
            <div className="comic-impact-lines" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => (
                <span
                  key={index}
                  data-speed-line
                  style={{ '--line-index': index } as CSSProperties}
                />
              ))}
            </div>
          )}

          {scene.finale && (
            <div
              className="comic-finale-cta"
              data-comic-cta
              data-dust-visual
              data-dust-reveal-at="0.8"
            >
              <a
                className="comic-primary-cta"
                href={TELEGRAM_APP_URL}
                target="_blank"
                rel="noreferrer"
              >
                PLAY REDOAPP
                <span aria-hidden="true">→</span>
              </a>
              <a href={TELEGRAM_APP_URL} target="_blank" rel="noreferrer">
                OPEN IN TELEGRAM
              </a>
              <p>Telegram Mini App · practice · PVP · private rooms</p>
            </div>
          )}
        </div>

        <ParticleDust />

        {sceneIndex === 0 && (
          <div className="comic-scroll-cue" aria-hidden="true">
            <span>SCROLL TO DEAL</span>
            <i />
          </div>
        )}

        {scene.impact && <div className="comic-impact-flash" data-impact-flash aria-hidden="true" />}
      </div>
    </section>
  );
}
