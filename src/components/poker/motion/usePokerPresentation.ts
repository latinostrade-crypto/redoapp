import { useEffect, useMemo, useRef, useState } from 'react';
import type { PokerGameState } from '../../../types/poker';
import { PokerPresentation } from './presentation';
import { playPokerFeedback } from '../../../utils/pokerFeedback';

export function usePokerPresentation(state: PokerGameState, reduced: boolean) {
  const model = useRef(new PokerPresentation());
  const [, tick] = useState(0);
  const [recovery, setRecovery] = useState(0);
  const syncedRecovery = useRef(0);
  useMemo(() => {
    model.current.sync(state, performance.now(), reduced, recovery !== syncedRecovery.current);
    syncedRecovery.current = recovery;
  }, [state, reduced, recovery]);
  const view = model.current.view(performance.now());
  useEffect(() => {
    if (!view.nextTick) return;
    const timer = setTimeout(() => tick(n => n + 1), Math.max(1, view.nextTick - performance.now() + 1));
    return () => clearTimeout(timer);
  }, [view.nextTick]);
  useEffect(() => {
    const restore = () => { if (!document.hidden) setRecovery(n => n + 1); };
    document.addEventListener('visibilitychange', restore); window.addEventListener('online', restore);
    return () => { document.removeEventListener('visibilitychange', restore); window.removeEventListener('online', restore); };
  }, []);
  const played = useRef(0);
  const flipped = useRef(0);
  useEffect(() => {
    const count = view.revealedPlayers.size;
    if (count > flipped.current && !reduced && model.current.resultAt > 0) playPokerFeedback('card_flip');
    flipped.current = count;
  }, [view.revealedPlayers.size, reduced]);
  useEffect(() => {
    const cue = view.cue;
    if (!cue || played.current === cue.id) return;
    played.current = cue.id;
    if (cue.label === 'GAME START!') { playPokerFeedback('game_start'); playPokerFeedback('card_deal'); }
    else if (cue.label === 'ALL IN') playPokerFeedback('all_in');
    else if (cue.label === 'SHOWDOWN') playPokerFeedback('showdown');
    else if (['RIVER', 'TURN', 'FLOP'].includes(cue.label)) playPokerFeedback('card_flip');
  }, [view.cue]);
  return view;
}
