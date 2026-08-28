import { useEffect, useRef, useState } from 'react';
import type { TableVisualEvent } from '../types/poker';

type VisualPlayback = {
  message: string;
  type: TableVisualEvent['type'];
  key: string;
} | null;

/**
 * Plays server-issued table events in order.  State remains authoritative and
 * immediately usable; this hook only gates the visual reveal, so a delayed
 * packet can never delay or duplicate a game action.
 */
export function useTableVisualEvents(events: TableVisualEvent[] | undefined, epoch = 1) {
  const [playback, setPlayback] = useState<VisualPlayback>(null);
  const [revealedCardIds, setRevealedCardIds] = useState<Set<string>>(() => new Set());
  const [isReplaying, setIsReplaying] = useState(false);
  const lastSequenceRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => () => timersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    lastSequenceRef.current = null;
    setRevealedCardIds(new Set());
    setPlayback(null);
    setIsReplaying(false);
  }, [epoch]);

  useEffect(() => {
    if (!events?.length) return;
    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    if (lastSequenceRef.current === null) {
      // First snapshot is the current table, not a replay from a previous
      // screen.  Preserve its visible cards while remembering the cursor.
      lastSequenceRef.current = ordered[ordered.length - 1].sequence;
      ordered.filter((event) => event.cardId).forEach((event) => {
        setRevealedCardIds((previous) => new Set(previous).add(event.cardId!));
      });
      return;
    }

    const pending = ordered.filter((event) => event.sequence > (lastSequenceRef.current || 0));
    if (!pending.length) return;
    setIsReplaying(true);
    lastSequenceRef.current = pending[pending.length - 1].sequence;
    let delay = 0;
    pending.forEach((event) => {
      const timer = window.setTimeout(() => {
        setPlayback({ message: event.message, type: event.type, key: event.id });
        if (event.cardId) {
          setRevealedCardIds((previous) => new Set(previous).add(event.cardId!));
        }
      }, delay);
      timersRef.current.push(timer);
      delay += event.type === 'community_card' || event.type === 'dealer_draw' ? 420 : 700;
    });
    const clearTimer = window.setTimeout(() => { setPlayback(null); setIsReplaying(false); }, delay + 1_400);
    timersRef.current.push(clearTimer);
  }, [events]);

  return { playback, revealedCardIds, isReplaying };
}
