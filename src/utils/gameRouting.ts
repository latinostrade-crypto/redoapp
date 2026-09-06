/** Return to the canonical game lobby without leaving the game surface.
 * Room/watch/referral launch parameters are intentionally consumed; keeping
 * them would replay auto-join after a refresh. */
export function buildGameLobbyUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  const keepReducedMotionQa = url.searchParams.get('reducedMotion') === '1';
  url.search = '';
  url.hash = '';
  url.searchParams.set('play', '1');
  if (keepReducedMotionQa) url.searchParams.set('reducedMotion', '1');
  return url.toString();
}
