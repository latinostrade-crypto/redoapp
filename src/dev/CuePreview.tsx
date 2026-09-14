import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n/registerGame';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { CommunityCards, PokerTable } from '../components/poker/PokerTable';
import { TableAnnouncement } from '../components/poker/motion/TableAnnouncement';
import { usePokerPresentation } from '../components/poker/motion/usePokerPresentation';
import type { PokerGameState } from '../types/poker';
import '../index.css';
import '../components/poker/poker-resistance.css';
import '../components/poker/poker-layout.css';
import '../components/poker/motion/resistance-motion.css';
import './plush-preview.css';

function Preview() {
  const [action, setAction] = useState({ count: 0, label: '', allIns: 0 });
  const [epoch, setEpoch] = useState(1);
  const state = { mode: 'offline', stage: 'preflop', visualEpoch: epoch, communityCards: [], winnerIds: [],
    players: ['Pepe', 'Shark Fin', 'Panda Pot'].map((name, i) => ({ id: String(i), name, chips: 100, holeCards: [], folded: false,
      isAllIn: i < action.allIns, lastAction: i === 2 ? action.label : '', totalMatchInvested: i === 2 ? action.count : 0 })) } as unknown as PokerGameState;
  const view = usePokerPresentation(state, false);
  return <main className="plush-preview"><header><h1>Действия за столом</h1><p>Олл-ин — 2,2 секунды. Обычное действие — 1,4 секунды.</p></header>
    <div className="resistance-poker plush-preview-table" style={{ height: 430 }}><PokerTable announcement={view.cue ? <TableAnnouncement key={view.cue.id} cue={view.cue} /> : null}>
      <div className="rp-board-position absolute"><CommunityCards cards={[]} /></div>
    </PokerTable></div>
    <nav><button onClick={() => setAction(a => ({ ...a, allIns: Math.min(2, a.allIns + 1) }))}>Олл-ин</button>
      <button onClick={() => setAction(a => ({ ...a, label: 'RAISE 20', count: a.count + 20 }))}>Повысить</button>
      <button onClick={() => { setEpoch(e => e + 1); setAction({ count: 0, label: '', allIns: 0 }); }}>Заново</button></nav>
  </main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview /></LanguageProvider>);
