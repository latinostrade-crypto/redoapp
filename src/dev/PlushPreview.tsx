import React, { useState } from 'react';
import '../i18n/registerGame';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { CommunityCards, PokerTable } from '../components/poker/PokerTable';
import { usePokerPresentation } from '../components/poker/motion/usePokerPresentation';
import type { PokerGameState, PokerCard } from '../types/poker';
import '../index.css';
import '../components/poker/poker-resistance.css';
import '../components/poker/poker-layout.css';
import '../components/poker/motion/resistance-motion.css';
import './plush-preview.css';

const cards: PokerCard[] = [
  { id: 'a', rank: 14, suit: 'spades' }, { id: 'k', rank: 13, suit: 'hearts' },
  { id: 'q', rank: 12, suit: 'clubs' }, { id: 'j', rank: 11, suit: 'diamonds' }, { id: 't', rank: 10, suit: 'spades' },
];
function Preview() {
  const [count, setCount] = useState(0);
  const [epoch, setEpoch] = useState(1);
  const [frame, setFrame] = useState<number | null>(null);
  const [reduced, setReduced] = useState(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const state = { mode: 'offline', stage: count === 5 ? 'river' : count === 4 ? 'turn' : count === 3 ? 'flop' : 'preflop',
    matchId: 'plush-preview', visualEpoch: epoch, players: [], communityCards: cards.slice(0, count), winnerIds: [] } as unknown as PokerGameState;
  const view = usePokerPresentation(state, reduced);
  const reset = () => { setEpoch(n => n + 1); setCount(0); };
  return <main className="plush-preview">
    <header><p>REDO / CARD CREW</p><h1>Плюшевая раздача</h1><p>Герои стягивают карты сверху на себя. Карта закрывает героя и переворачивается на его месте.</p></header>
    <div className={`resistance-poker plush-preview-table${reduced ? ' resistance-poker--reduced-motion' : ''}${frame !== null ? ' plush-preview--frame' : ''}`} style={{ '--preview-frame': `${-(frame ?? 0)}ms` } as React.CSSProperties}>
      <PokerTable><div className="rp-board-position absolute"><CommunityCards key={`${epoch}-${frame !== null}`} cards={frame === null ? state.communityCards : cards} revealedCardIds={frame === null ? view.boardIds : new Set(frame >= 900 ? cards.map(c => c.id) : [])} deliveries={frame === null ? view.boardDeliveries : cards.map(c => ({ id: c.id, start: 0, at: 900, end: 1350 }))} reduced={reduced} /></div></PokerTable>
    </div>
    <nav aria-label="Проверка раздачи"><button onClick={() => setCount(n => n < 3 ? 3 : Math.min(5, n + 1))} disabled={count === 5}>{count < 3 ? 'Открыть флоп' : count === 3 ? 'Открыть тёрн' : 'Открыть ривер'}</button><button onClick={reset}>Заново</button><button onClick={() => setCount(5)} disabled={count === 5}>Все пять</button></nav>
    <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> Без анимаций</label>
    <label><input type="checkbox" checked={frame !== null} onChange={e => setFrame(e.target.checked ? 405 : null)} /> Покадровая проверка</label>
    {frame !== null && <label>Момент: {frame} мс <input aria-label="Момент анимации" type="range" min="0" max="1350" step="15" value={frame} onChange={e => setFrame(Number(e.target.value))} /></label>}
    <p className="plush-preview-note">Те же персонажи и анимации, что на игровом столе.</p><a href="/?play=1">Открыть игру →</a>
  </main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview /></LanguageProvider>);
