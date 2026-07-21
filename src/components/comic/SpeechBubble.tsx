import type { CSSProperties, Key } from 'react';
import type { ComicBubble } from '../../types/comic';

interface SpeechBubbleProps {
  bubble: ComicBubble;
  revealAt?: number;
  key?: Key;
}

export function SpeechBubble({ bubble, revealAt = 0 }: SpeechBubbleProps) {
  const style = {
    '--bubble-x': `${bubble.x}%`,
    '--bubble-y': `${bubble.y}%`,
    '--bubble-mobile-x': `${bubble.mobileX}%`,
    '--bubble-mobile-y': `${bubble.mobileY}%`,
    '--bubble-rotate': `${bubble.rotate ?? 0}deg`,
  } as CSSProperties;

  return (
    <p
      className={`comic-bubble comic-bubble--${bubble.tone}`}
      data-comic-bubble
      data-dust-visual
      data-dust-reveal-at={revealAt}
      style={style}
    >
      {bubble.text}
    </p>
  );
}
