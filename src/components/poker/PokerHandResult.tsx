import React, { useEffect, useRef, useState } from 'react';
import type { PokerGameState } from '../../types/poker';
import { evaluate7CardHand } from '../../utils/pokerEvaluator';
import { ChipValue } from './PokerTable';
import { getPokerHandWinners, getResultHoleCards } from './handResult';
import { PokerCardView } from './PokerCard';
import { ResistanceAvatar } from './ResistanceAvatar';
import { playPokerFeedback } from '../../utils/pokerFeedback';
import './poker-result.css';

export function PokerHandResult({ state, countdown, onNextHand, onLobby }: {
  state: PokerGameState;
  countdown: number;
  onNextHand?: () => void;
  onLobby: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(true);
  const sessionEnded = state.isMatchOver || state.stage === 'match_ended';
  const winners = getPokerHandWinners(state);
  const winnerIds = new Set(winners.map(w => w.player.id));
  const otherPlayers = state.players.filter(p => !winnerIds.has(p.id));
  useEffect(() => { if (sessionEnded) playPokerFeedback('game_over'); }, [sessionEnded]);
  const leave = () => { dialogRef.current?.close(); setOpen(false); onLobby(); };
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    // The native top layer escapes table clipping, transforms and page scroll.
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, [open]);
  const description = (player: PokerGameState['players'][number]) => {
    if (player.folded) return 'FOLD';
    if (player.mucked) return 'MUCKED';
    return getResultHoleCards(state, player).every(Boolean) && state.communityCards.length >= 3
      ? evaluate7CardHand([...player.holeCards, ...state.communityCards]).description
      : state.players.filter(p => !p.folded && !p.eliminated).length === 1 ? 'Uncontested pot' : 'Cards not shown';
  };
  return <>
    {!open && <button type="button" className="rp-result-reopen" onClick={() => setOpen(true)}>
      {winners.length === 1 ? `${winners[0].player.name} WINS` : 'HAND RESULTS'} · VIEW
    </button>}
    <dialog ref={dialogRef} className="rp-hand-result" aria-labelledby="poker-result-title" onCancel={() => setOpen(false)} onClose={() => { if (!dialogRef.current?.open) setOpen(false); }}>
      <header className="rp-hand-result__header">
        <span>{sessionEnded ? 'SESSION ENDED · LAST HAND' : 'HAND COMPLETE'}</span>
        <h2 id="poker-result-title">{winners.length > 1 ? 'POT WINNERS' : winners.length ? `${winners[0].player.id === 'player' ? 'YOU WIN' : 'WINNER'}` : 'HAND RESULTS'}</h2>
        <small className="rp-hand-result__session-label">{sessionEnded ? 'GAME OVER · SESSION CLOSED_' : 'POT CAPTURED'}</small>
      </header>
      <div className="rp-hand-result__body">
        <div className={`rp-hand-result__winners${winners.length > 3 ? ' rp-hand-result__winners--grid' : ''}`}>
          {winners.map(({ player, amount }) => <article className="rp-hand-result__winner" key={player.id}>
            <div className="rp-hand-result__portrait"><ResistanceAvatar name={player.name} photoUrl={player.photoUrl} fallbackAvatar={player.avatar} state="winner" size={32} /></div>
            <div className="rp-hand-result__identity"><strong>{player.name}{player.id === 'player' ? ' (YOU)' : ''}</strong><span>{description(player)}</span></div>
            <ResultCards state={state} player={player} />
            {amount !== null && <ChipValue amount={amount} prefix="+" ariaLabel={`${player.name} won ${amount} chips`} />}
          </article>)}
        </div>
        {winners.length === 0 && <p>Result details are unavailable.</p>}
        {sessionEnded && state.matchWinnerName && <p className="rp-hand-result__session">MATCH WINNER: {state.matchWinnerName}</p>}
        <details className="rp-hand-result__details">
          <summary>ALL HANDS · {state.players.length} PLAYERS</summary>
          <div>{[...winners.map(w => w.player), ...otherPlayers].map(player => <div className="rp-hand-result__row" key={player.id}>
            <strong>{player.name}</strong><ResultCards state={state} player={player} /><span>{description(player)}</span>
          </div>)}</div>
        </details>
      </div>
      <footer className="rp-hand-result__actions">
        {!sessionEnded && <p>NEXT HAND IN {Math.max(0, countdown)}S</p>}
        <div>
          <button type="button" autoFocus onClick={() => setOpen(false)}>VIEW TABLE</button>
          {state.mode === 'offline' && !sessionEnded && onNextHand
            ? <button type="button" className="rp-hand-result__primary" onClick={onNextHand}>NEXT HAND</button>
            : <button type="button" onClick={leave}>LOBBY</button>}
        </div>
      </footer>
    </dialog>
  </>;
}

function ResultCards({ state, player }: { state: PokerGameState; player: PokerGameState['players'][number] }) {
  const cards = getResultHoleCards(state, player);
  return <div className="rp-result-cards" role="group" aria-label={`${player.name}: ${cards.every(Boolean) ? 'hole cards' : 'cards not revealed'}`}>
    {cards.map((card, index) => <PokerCardView key={index} card={card} faceDown={!card} dealIndex={0} />)}
  </div>;
}
