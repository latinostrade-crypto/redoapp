import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n/registerGame';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { ResistancePlayerSeat } from '../components/poker/ResistancePlayerSeat';
import { isPokerSeatBusted } from '../components/poker/motion/seatBusted';
import type { PokerPlayer, PokerStage } from '../types/poker';
import '../index.css';
import '../components/poker/poker-resistance.css';
import '../components/poker/poker-layout.css';
import '../components/poker/motion/resistance-motion.css';
import './plush-preview.css';

function Preview() {
  const [mode, setMode] = useState<'normal' | 'allin' | 'busted'>('normal');
  const [reduced, setReduced] = useState(false);
  const player: PokerPlayer = { id: 'preview', name: 'Pepe', avatar: 'panda', chips: mode === 'normal' ? 100 : 0,
    currentBet: 0, totalMatchInvested: 0, holeCards: [], folded: false, isAllIn: mode === 'allin', isAi: false };
  const stage: PokerStage = mode === 'busted' ? 'ended' : 'preflop';
  const busted = isPokerSeatBusted(player, stage, true);
  return <main className="plush-preview"><header><h1>Нет фишек</h1><p>Красный маркер после проигранной раздачи. Олл-ин остаётся активным.</p></header>
    <div className={reduced ? 'resistance-poker--reduced-motion' : ''} style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', minHeight: 180 }}>
      <ResistancePlayerSeat player={player} state="online" busted={busted} compact />
      <ResistancePlayerSeat player={{ ...player, id: 'local', name: 'Your player' }} state="online" busted={busted} compact={false} showCards={false} />
    </div>
    <nav><button onClick={() => setMode('normal')}>Пополнить / Сброс</button><button onClick={() => setMode('allin')}>Олл-ин: 0</button><button onClick={() => setMode('busted')}>Проигрыш: 0</button></nav>
    <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> Без анимаций</label>
  </main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview /></LanguageProvider>);
