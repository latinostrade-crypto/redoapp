import React, { useEffect, useRef } from 'react';
import { ArcadeAnnouncement, PixelBuild, PixelBurst, PixelLoader, PixelModalTransition, PixelTextReveal } from './PixelPrimitives';

export type AnnouncementTone = 'signal' | 'danger' | 'winner';

export function GameAnnouncement({ message, detail, tone = 'signal' }: { message: string; detail?: string; tone?: AnnouncementTone; key?: React.Key }) {
  return <ArcadeAnnouncement message={message} detail={detail} tone={tone} />;
}

export function GameStartSequence({ phase = 'start' }: { phase?: 'ready' | 'start'; key?: React.Key }) {
  return phase === 'ready'
    ? <GameAnnouncement message="READY?" detail="LINKING TABLE SIGNAL" />
    : <GameAnnouncement message="GAME START!" detail="CARDS IN MOTION" />;
}

export function GameOverSequence() {
  return <GameAnnouncement message="GAME OVER" detail="SESSION CLOSED_" tone="danger" />;
}

export function WinnerSequence({ playerName }: { playerName: string; key?: React.Key }) {
  return (
    <>
      <PixelBurst className="rp-winner-burst" />
      <GameAnnouncement message="WINNER IDENTIFIED" detail={playerName.toUpperCase()} tone="winner" />
    </>
  );
}

export function AllInSequence({ playerName }: { playerName: string; key?: React.Key }) {
  return <div className="rp-all-in-sequence"><GameAnnouncement message="ALL IN" detail={playerName.toUpperCase()} tone="danger" /></div>;
}

export function ShowdownSequence() {
  return <GameAnnouncement message="SHOWDOWN" detail="IDENTITIES REVEALED" />;
}

export function PixelModal({
  children,
  labelledBy,
  className = '',
  onRequestClose,
}: {
  children: React.ReactNode;
  labelledBy?: string;
  className?: string;
  onRequestClose?: () => void;
}) {
  const modalRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = modalRef.current;
    if (!modal) return;
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const preferred = modal.querySelector<HTMLElement>('[data-modal-autofocus], [data-modal-cancel]');
    const fallback = modal.querySelector<HTMLElement>(focusableSelector);
    (preferred || fallback || modal).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onRequestClose) {
        event.preventDefault();
        onRequestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)) as HTMLElement[];
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onRequestClose]);

  return (
    <PixelModalTransition>
      <section ref={modalRef} tabIndex={-1} className={`rp-modal border-2 p-4 ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </section>
    </PixelModalTransition>
  );
}

export function PixelSpeechBubble({ children }: { children: React.ReactNode }) {
  return <span className="rp-pixel-speech-bubble" role="status">{children}</span>;
}

export function ConnectionStatus({ waitingForOpponent = false }: { waitingForOpponent?: boolean }) {
  return (
    <div className="rp-table-signal rp-table-signal--waiting">
      <PixelLoader label={waitingForOpponent ? 'WAITING FOR ONE MORE PLAYER' : 'SYNCING PLAYERS'} />
    </div>
  );
}

export function PokerBootSequence({ phase }: { phase: 0 | 1 | 2 }) {
  const labels = ['LINKING SECURE TABLE', 'VERIFYING PLAYERS', 'TABLE READY'];
  return (
    <div className="rp-boot-sequence" role="status" aria-live="polite">
      <PixelBuild className="rp-boot-sequence__frame">
        <span className="rp-boot-sequence__eyebrow">RESISTANCE POKER // BOOT</span>
        <PixelLoader label={labels[phase]} />
        <PixelTextReveal className="rp-boot-sequence__progress">[{phase + 1}/3]</PixelTextReveal>
      </PixelBuild>
    </div>
  );
}
