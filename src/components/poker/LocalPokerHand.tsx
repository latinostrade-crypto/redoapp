import React, { useEffect, useRef, useState } from 'react';
import type { PokerCard } from '../../types/poker';
import { HoleCards } from './PokerTable';
import { PixelDissolve } from './PixelPrimitives';

export function LocalPokerHand({ cards, folded, eliminated, winningCardIds, reduced }: { cards: PokerCard[]; folded: boolean; eliminated?: boolean; winningCardIds?: string[]; reduced: boolean }) {
  const lastCards = useRef(cards);
  const wasFolded = useRef(folded);
  const [withdrawing, setWithdrawing] = useState(false);
  useEffect(() => { if (!folded) lastCards.current = cards; }, [cards, folded]);
  useEffect(() => {
    const changed = !wasFolded.current && folded;
    wasFolded.current = folded;
    if (!changed || reduced) { if (!folded || reduced) setWithdrawing(false); return; }
    setWithdrawing(true);
    const timer = setTimeout(() => setWithdrawing(false), 280);
    return () => clearTimeout(timer);
  }, [folded, reduced]);
  if (withdrawing && !reduced) return <PixelDissolve><HoleCards cards={lastCards.current} /></PixelDissolve>;
  if (!folded && !eliminated && cards.length) return <HoleCards cards={cards} winningCardIds={winningCardIds} />;
  return <div className="rp-system-module rp-waiting-hand px-2 py-1">{eliminated ? 'ELIMINATED' : folded ? 'FOLDED · NEXT HAND' : 'WAITING FOR CARDS'}</div>;
}
