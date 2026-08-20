/* src/utils/matchmaking.ts */
/**
 * Matchmaking service utilities.
 * Provides helper functions for active match session management.
 */

/** Helper to clear stored match when finished or cancelled */
export function clearMatch(matchId?: string) {
  try {
    const raw = localStorage.getItem('redoapp_active_match');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!matchId || parsed?.matchId === matchId) {
        localStorage.removeItem('redoapp_active_match');
      }
    }
  } catch {}
}
