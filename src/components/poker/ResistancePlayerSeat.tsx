import { translateGameLabel } from '../../i18n/gameLabels';
import { useLanguage } from '../../i18n/LanguageProvider';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PokerPlayer } from '../../types/poker';
import { ResistanceAvatar, ResistanceAvatarState } from './ResistanceAvatar';
import { PixelBorderProgress, PixelBuild, PixelDissolve, PlayerElimination, PlayerSignalState, SignalGlitch } from './PixelPrimitives';
import { ChipValue } from './PokerTable';

interface ResistancePlayerSeatProps {
  player: PokerPlayer;
  state: ResistanceAvatarState;
  active?: boolean;
  dealer?: boolean;
  blind?: 'SB' | 'BB';
  turnProgress?: number;
  turnSeconds?: number;
  photoUrl?: string | null;
  compact?: boolean;
  showCards?: boolean;
  revealCards?: boolean;
  reaction?: React.ReactNode;
  displayBalance?: number;
  dealAt?: number;
  dealIndex?: number;
}

const MINI_SUIT: Record<string, { symbol: string; red: boolean }> = {
  hearts: { symbol: '♥', red: true },
  diamonds: { symbol: '♦', red: true },
  clubs: { symbol: '♣', red: false },
  spades: { symbol: '♠', red: false },
};

const MINI_RANK: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

/** Compact, reusable poker identity module. Cards, stack, bet and signal state
 * share one footprint so ten-player mobile tables do not become a pile of
 * unrelated floating badges. */
export function ResistancePlayerSeat({
  player,
  state,
  active = false,
  dealer = false,
  blind,
  turnProgress = 1,
  turnSeconds,
  photoUrl,
  compact = true,
  showCards = true,
  revealCards = false,
  reaction,
  displayBalance = player.chips,
  dealAt = 0,
  dealIndex = 0,
}: ResistancePlayerSeatProps) {
  const { tr } = useLanguage();
  const previousConnectedRef = useRef(player.isConnected !== false);
  const seatRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const seat = seatRef.current, table = seat?.closest('.rp-table');
    if (!seat || !table || !dealAt) return;
    const pair = seat.querySelector('.rp-seat-hole-cards');
    if (!pair) return;
    const target = pair.getBoundingClientRect(), origin = table.getBoundingClientRect();
    seat.style.setProperty('--seat-card-from-x', `${Math.round(origin.left + origin.width / 2 - target.left)}px`);
    seat.style.setProperty('--seat-card-from-y', `${Math.round(origin.top + origin.height * .3 - target.top)}px`);
  }, [dealAt]);
  const [signalState, setSignalState] = useState<'online' | 'lost' | 'restored'>(
    player.isConnected === false ? 'lost' : 'online'
  );

  useEffect(() => {
    const connected = player.isConnected !== false;
    const wasConnected = previousConnectedRef.current;
    previousConnectedRef.current = connected;
    if (!connected) {
      setSignalState('lost');
      return;
    }
    if (!wasConnected) {
      setSignalState('restored');
      const timer = window.setTimeout(() => setSignalState('online'), 520);
      return () => window.clearTimeout(timer);
    }
    setSignalState('online');
  }, [player.isConnected]);

  const criticalAction = /ALL[- ]?IN|FOLD/i.test(player.lastAction || '') ? player.lastAction : '';
  const status = state === 'disconnected'
    ? 'SIGNAL LOST'
    : state === 'eliminated'
    ? 'OFFLINE'
    : state === 'winner'
    ? 'WINNER'
    : criticalAction || (active ? player.lastAction : '');

  return (
    <div className="rp-seat-identity">
    <PixelBuild className="rp-seat-build-shell">
    <div
      className={`rp-player-seat${compact ? ' rp-player-seat--compact' : ''} rp-player-seat--${state}${active ? ' rp-player-seat--active' : ''}`}
      data-chip-seat={player.id}
      ref={seatRef}
      style={{
        '--turn-progress': Math.max(0, Math.min(1, turnProgress)),
        '--seat-deal-delay': `${Math.max(0, dealAt - performance.now()) + dealIndex * 35}ms`,
      } as React.CSSProperties}
      role="group"
      aria-label={`${player.name}, ${tr('chipCount', { count: player.chips })}${active ? `, ${tr('avatarActiveTurn')}` : ''}${status ? `, ${translateGameLabel(status, tr)}` : ''}`}
    >
      {showCards && state !== 'eliminated' && (state === 'folded' ? (
        <PixelDissolve as="span" className="rp-seat-hole-cards rp-seat-hole-cards--folded" ariaLabel={translateGameLabel('Two withdrawn hole cards', tr)}>
          {[0, 1].map((index) => {
            const card = player.holeCards?.[index];
            const suit = card ? MINI_SUIT[card.suit] : null;
            return (
              <i key={card?.id || index} className={suit?.red ? 'rp-mini-card--red' : ''}>
                {revealCards && card ? <><b>{MINI_RANK[card.rank] || card.rank}</b><em>{suit?.symbol || '?'}</em></> : null}
              </i>
            );
          })}
        </PixelDissolve>
      ) : (
        <span key={`${player.holeCards.map(c => c.id).join(':')}:${revealCards}`} className={`rp-seat-hole-cards${revealCards ? ' rp-seat-hole-cards--revealed' : dealAt ? ' rp-seat-hole-cards--dealt' : ''}`} aria-label={translateGameLabel(revealCards ? 'Revealed hole cards' : 'Two hidden hole cards', tr)}>
          {[0, 1].map((index) => {
            const card = player.holeCards?.[index];
            const suit = card ? MINI_SUIT[card.suit] : null;
            return (
              <i key={card?.id || index} className={suit?.red ? 'rp-mini-card--red' : ''}>
                {revealCards && card && !card.hidden ? <><b>{MINI_RANK[card.rank] || card.rank}</b><em>{suit?.symbol || '?'}</em></> : null}
              </i>
            );
          })}
        </span>
      ))}
      <div className="rp-player-seat__portrait">
        <PlayerElimination eliminated={state === 'eliminated'}>
          <PlayerSignalState state={signalState}>
            <SignalGlitch active={state === 'disconnected'}>
              <ResistanceAvatar
                name={player.name || 'Player'}
                fallbackAvatar={player.avatar || 'rabbit'}
                photoUrl={photoUrl}
                active={active}
                state={state}
                size={compact ? 34 : 50}
              />
            </SignalGlitch>
          </PlayerSignalState>
        </PlayerElimination>
        {dealer && <span className="rp-dealer-chip" aria-label={tr("dealerSentence")}>D</span>}
        {blind && <span className={`rp-blind-chip rp-blind-chip--${blind.toLowerCase()}`} aria-label={translateGameLabel(blind === 'SB' ? 'Small blind' : 'Big blind', tr)}>{blind}</span>}
      </div>
      <div className="rp-player-seat__meta">
        <strong>{player.name || 'Player'}</strong>
        <ChipValue amount={Math.max(0, displayBalance || 0)} iconClassName="rp-seat-balance-logo" animate />
      </div>
      {status && <PlayerStatus>{translateGameLabel(status, tr)}</PlayerStatus>}
      {active && <PlayerTimer value={turnProgress} />}
      {active && turnSeconds !== undefined && turnSeconds <= 3 && <span className="rp-seat-countdown" aria-label={tr('secondsRemainingLabel', { count: turnSeconds })}>{Math.max(0, Math.ceil(turnSeconds))}</span>}
    </div>
    </PixelBuild>
    {reaction && <div className={`rp-seat-reaction-anchor${compact ? ' rp-seat-reaction-anchor--compact' : ''}`} role="status" aria-label={`${player.name} reaction`}>
      {reaction}
    </div>}
    </div>
  );
}

export const PlayerSeat = ResistancePlayerSeat;
export const PlayerAvatar = ResistanceAvatar;

export function EmptyPlayerSeat({ seatNumber }: { seatNumber: number }) {
  const { tr } = useLanguage();
  return (
    <PixelBuild className="rp-seat-build-shell">
      <div className="rp-player-seat rp-player-seat--compact rp-player-seat--empty" role="group" aria-label={`Open poker seat ${seatNumber}`}>
        <div className="rp-player-seat__portrait">
          <ResistanceAvatar name={`Open seat ${seatNumber}`} fallbackAvatar="rabbit" state="eliminated" size={34} />
        </div>
        <div className="rp-player-seat__meta">
          <strong>{tr("open")}{' '}{String(seatNumber).padStart(2, '0')}</strong>
          <span>{tr("noSignal")}</span>
        </div>
      </div>
    </PixelBuild>
  );
}

export function PlayerStatus({ children }: { children: React.ReactNode }) {
  return <span className="rp-seat-state">{children}</span>;
}

export function PlayerTimer({ value }: { value: number }) {
  return <PixelBorderProgress value={value} className="rp-seat-timer" />;
}
