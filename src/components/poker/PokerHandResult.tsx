import { describePokerHand } from '../../i18n/pokerHand';
import { useLanguage } from '../../i18n/LanguageProvider';
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
  const { tr } = useLanguage();
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
      ? describePokerHand(evaluate7CardHand([...player.holeCards, ...state.communityCards]), tr)
      : state.players.filter(p => !p.folded && !p.eliminated).length === 1 ? tr('uncontestedPot') : tr('cardsNotShown');
  };
  return <>
    {!open && <button type="button" className="rp-result-reopen" onClick={() => setOpen(true)}>
      {winners.length === 1 ? tr('playerWinsName', { name: winners[0].player.name }) : tr("handResults")}{' '}{tr("viewSuffix")}</button>}
    <dialog ref={dialogRef} className="rp-hand-result" aria-labelledby="poker-result-title" onCancel={() => setOpen(false)} onClose={() => { if (!dialogRef.current?.open) setOpen(false); }}>
      <header className="rp-hand-result__header">
        <span>{sessionEnded ? tr("sessionEnded") : tr("handComplete")}</span>
        <h2 id="poker-result-title">{winners.length > 1 ? tr("potWinners") : winners.length ? tr(winners[0].player.id === 'player' ? 'resultYouWin' : 'resultWinner') : tr("handResults")}</h2>
        <small className="rp-hand-result__session-label">{sessionEnded ? tr("sessionClosed") : tr("potCaptured")}</small>
      </header>
      <div className="rp-hand-result__body">
        <div className={`rp-hand-result__winners${winners.length > 3 ? ' rp-hand-result__winners--grid' : ''}`}>
          {winners.map(({ player, amount }) => <article className="rp-hand-result__winner" key={player.id}>
            <div className="rp-hand-result__portrait"><ResistanceAvatar name={player.name} photoUrl={player.photoUrl} fallbackAvatar={player.avatar} state="winner" size={32} /></div>
            <div className="rp-hand-result__identity"><strong>{player.name}{player.id === 'player' ? tr("youUpper") : ''}</strong><span>{description(player)}</span></div>
            <ResultCards state={state} player={player} />
            {amount !== null && <ChipValue amount={amount} prefix="+" ariaLabel={tr('playerWonChips', { name: player.name, amount })} />}
          </article>)}
        </div>
        {winners.length === 0 && <p>{tr("resultUnavailable")}</p>}
        {sessionEnded && state.matchWinnerName && <p className="rp-hand-result__session">{tr("matchWinner")}{' '}{state.matchWinnerName}</p>}
        <details className="rp-hand-result__details">
          <summary>{tr("allHands")}{' '}{state.players.length}{' '}{tr("players")}</summary>
          <div>{[...winners.map(w => w.player), ...otherPlayers].map(player => <div className="rp-hand-result__row" key={player.id}>
            <strong>{player.name}</strong><ResultCards state={state} player={player} /><span>{description(player)}</span>
          </div>)}</div>
        </details>
      </div>
      <footer className="rp-hand-result__actions">
        {!sessionEnded && <p>{tr("nextHandIn")}{' '}{Math.max(0, countdown)}S</p>}
        <div>
          <button type="button" autoFocus onClick={() => setOpen(false)}>{tr("viewTable")}</button>
          {state.mode === 'offline' && !sessionEnded && onNextHand
            ? <button type="button" className="rp-hand-result__primary" onClick={onNextHand}>{tr("nextHand")}</button>
            : <button type="button" onClick={leave}>{tr("lobby")}</button>}
        </div>
      </footer>
    </dialog>
  </>;
}

function ResultCards({ state, player }: { state: PokerGameState; player: PokerGameState['players'][number] }) {
  const { tr } = useLanguage();
  const cards = getResultHoleCards(state, player);
  return <div className="rp-result-cards" role="group" aria-label={tr(cards.every(Boolean) ? 'playerHoleCards' : 'playerCardsHidden', { name: player.name })}>
    {cards.map((card, index) => <PokerCardView key={index} card={card} faceDown={!card} dealIndex={0} />)}
  </div>;
}
