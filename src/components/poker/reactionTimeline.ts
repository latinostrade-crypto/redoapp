export type SeatReaction = { emojiId: string; key: number };
export const REACTION_DURATION_MS = 5000;

/** One finite timer per sender, never one global reaction for the whole table. */
export function createReactionTimeline(
  publish: (items: Record<string, SeatReaction>) => void,
  schedule = (fn: () => void, ms: number) => setTimeout(fn, ms),
  cancel = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
) {
  const items = new Map<string, SeatReaction>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let sequence = 0;
  let disposed = false;
  const emit = () => { if (!disposed) publish(Object.fromEntries(items)); };
  const remove = (sender: string, key: number) => {
    if (disposed || items.get(sender)?.key !== key) return false;
    cancel(timers.get(sender)!);
    timers.delete(sender);
    items.delete(sender);
    emit();
    return true;
  };
  return {
    show(sender: string, emojiId: string) {
      if (disposed || !sender) return -1;
      const key = ++sequence;
      if (timers.has(sender)) cancel(timers.get(sender)!);
      items.set(sender, { emojiId, key });
      timers.set(sender, schedule(() => remove(sender, key), REACTION_DURATION_MS));
      emit();
      return key;
    },
    remove,
    dispose() {
      disposed = true;
      timers.forEach(cancel);
      timers.clear();
      items.clear();
    },
  };
}
