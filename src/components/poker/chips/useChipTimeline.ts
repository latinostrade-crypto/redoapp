import { useEffect, useRef, useState } from 'react';
import type { PokerGameState } from '../../../types/poker';
import { ChipTimeline } from './chipModel';

export function useChipTimeline(state: PokerGameState, reduced: boolean, payoutNotBefore = 0) {
  const timeline = useRef(new ChipTimeline());
  const [view, setView] = useState(() => timeline.current.view(0));
  const [resync, setResync] = useState(0);
  const lastResync = useRef(0);
  useEffect(() => {
    const restore = () => { if (!document.hidden) setResync(n => n + 1); };
    document.addEventListener('visibilitychange', restore);
    window.addEventListener('online', restore);
    return () => { document.removeEventListener('visibilitychange', restore); window.removeEventListener('online', restore); };
  }, []);
  useEffect(() => {
    const now = performance.now();
    timeline.current.sync({
      table: state.matchId || state.tableId || 'practice',
      hand: `${state.matchId || state.tableId || 'practice'}:${state.visualEpoch || 0}`,
      version: state.stateVersion || 0, pot: state.pot,
      ended: ['ended', 'match_ended'].includes(state.stage),
      players: state.players.map(p => ({ id: p.id, chips: p.chips, invested: p.totalMatchInvested || 0 })),
      pots: state.sidePots?.map(p => p.amount) || [], awards: state.chipAwards,
      resync: resync !== lastResync.current,
      payoutNotBefore,
    }, now, reduced);
    lastResync.current = resync;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const current = timeline.current.view(performance.now());
      setView(current);
      if (current.nextTick) timer = setTimeout(update, Math.max(1, current.nextTick - performance.now() + 1));
    };
    update();
    return () => clearTimeout(timer);
  }, [state, reduced, resync, payoutNotBefore]);
  return view;
}
