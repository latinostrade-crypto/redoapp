import type { RefObject } from 'react';

interface StoryProgressProps {
  currentChapter: number;
  totalChapters: number;
  progressRef: RefObject<HTMLSpanElement | null>;
}

export function StoryProgress({
  currentChapter,
  totalChapters,
  progressRef,
}: StoryProgressProps) {
  return (
    <aside className="story-progress" aria-label={`Story chapter ${currentChapter} of ${totalChapters}`}>
      <span className="story-progress__chapter">
        {String(currentChapter).padStart(2, '0')}
      </span>
      <span className="story-progress__track" aria-hidden="true">
        <span ref={progressRef} className="story-progress__fill" />
      </span>
      <span className="story-progress__total">{String(totalChapters).padStart(2, '0')}</span>
    </aside>
  );
}
