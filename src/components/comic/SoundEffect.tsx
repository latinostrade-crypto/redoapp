import type { CSSProperties, Key } from 'react';
import type { ComicSoundEffect as ComicSoundEffectConfig } from '../../types/comic';

interface SoundEffectProps {
  effect: ComicSoundEffectConfig;
  revealAt?: number;
  key?: Key;
}

export function SoundEffect({ effect, revealAt = 0 }: SoundEffectProps) {
  const style = {
    '--effect-x': `${effect.x}%`,
    '--effect-y': `${effect.y}%`,
    '--effect-mobile-x': `${effect.mobileX}%`,
    '--effect-mobile-y': `${effect.mobileY}%`,
    '--effect-rotate': `${effect.rotate ?? 0}deg`,
  } as CSSProperties;

  return (
    <span
      className={`comic-sound comic-sound--${effect.tone}`}
      data-comic-sound
      data-dust-visual
      data-dust-reveal-at={revealAt}
      style={style}
      aria-hidden="true"
    >
      {effect.text}
    </span>
  );
}
