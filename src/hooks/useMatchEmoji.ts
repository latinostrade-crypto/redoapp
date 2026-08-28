import { useCallback, useEffect } from 'react';
import { apiRequest, buildAuthenticatedUrl } from '../utils/api';
import { EmojiItem } from '../components/QuickEmojiPanel';

export type MatchEmojiEvent = {
  emojiId: string;
  sentAt: number;
};

/** Keeps short-lived table reactions on the match realtime channel. */
export function useMatchEmoji(
  matchId: string | undefined,
  enabled: boolean,
  onEmoji: (event: MatchEmojiEvent) => void,
) {
  useEffect(() => {
    if (!enabled || !matchId) return;

    const stream = new EventSource(buildAuthenticatedUrl(`/api/matches/stream/${encodeURIComponent(matchId)}`));
    const handleEmoji = (event: Event) => {
      try {
        onEmoji(JSON.parse((event as MessageEvent).data) as MatchEmojiEvent);
      } catch {
        // Ignore malformed transient realtime frames.
      }
    };

    stream.addEventListener('match-emoji', handleEmoji);
    return () => {
      stream.removeEventListener('match-emoji', handleEmoji);
      stream.close();
    };
  }, [enabled, matchId, onEmoji]);

  return useCallback(async (emoji: EmojiItem) => {
    if (!enabled || !matchId) return false;
    await apiRequest<{ success: boolean }>(`/api/matches/${encodeURIComponent(matchId)}/emoji`, {
      method: 'POST',
      body: JSON.stringify({ emojiId: emoji.id }),
      timeoutMs: 10_000,
    });
    return true;
  }, [enabled, matchId]);
}
