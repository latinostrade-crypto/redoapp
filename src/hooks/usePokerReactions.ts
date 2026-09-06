import { useCallback, useEffect, useRef, useState } from 'react';
import { createReactionTimeline, type SeatReaction } from '../components/poker/reactionTimeline';

export function usePokerReactions(scope: string) {
  const [state, setState] = useState<{ scope: string; items: Record<string, SeatReaction> }>({ scope, items: {} });
  const timeline = useRef<ReturnType<typeof createReactionTimeline> | null>(null);
  useEffect(() => {
    const current = createReactionTimeline(items => setState({ scope, items }));
    timeline.current = current;
    setState({ scope, items: {} });
    return () => { current.dispose(); timeline.current = null; };
  }, [scope]);
  const show = useCallback((sender: string, emojiId: string) => timeline.current?.show(sender, emojiId) ?? -1, []);
  // Capture the original timeline: a failed old request must not clear a new table.
  const optimistic = useCallback((sender: string, emojiId: string) => {
    const current = timeline.current;
    const key = current?.show(sender, emojiId) ?? -1;
    return () => current?.remove(sender, key) ?? false;
  }, []);
  return { reactions: state.scope === scope ? state.items : {}, show, optimistic };
}
