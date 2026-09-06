import { useLanguage } from '../../i18n/LanguageProvider';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pixelMaskStyle } from './motion/pixelMasks';

type PixelPrimitiveProps = {
  children: React.ReactNode;
  className?: string;
};

export function PixelBuild({ children, className = '' }: PixelPrimitiveProps) {
  return <div style={pixelMaskStyle} className={`rp-pixel-build ${className}`}>{children}</div>;
}

export function PixelDissolve({
  children,
  className = '',
  as: Element = 'div',
  ariaLabel,
}: PixelPrimitiveProps & { as?: 'div' | 'span'; ariaLabel?: string }) {
  return <Element style={pixelMaskStyle} className={`rp-pixel-dissolve ${className}`} aria-label={ariaLabel}>{children}</Element>;
}

export function PixelTextReveal({ children, className = '' }: PixelPrimitiveProps) {
  return <span className={`rp-pixel-text-reveal ${className}`}>{children}</span>;
}

export function PixelCounter({ value, className = '' }: { value: number; className?: string }) {
  // Financial numbers change atomically. Animate their pixels, never fake money.
  return <span key={value} className={`rp-pixel-counter rp-counter-step ${className}`} aria-label={String(value)}>{value}</span>;
}

export function PixelTimer({ value, max, danger = false }: { value: number; max: number; danger?: boolean }) {
  const { tr } = useLanguage();
  const progress = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <span
      className={`rp-pixel-timer${danger ? ' rp-pixel-timer--danger' : ''}`}
      style={{ '--rp-timer-progress': progress } as React.CSSProperties}
      aria-label={tr('secondsRemainingLabel', { count: value })}
    >
      <i aria-hidden="true" />
      <strong>{value}S</strong>
    </span>
  );
}

export function PixelBorderProgress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span
      className={`rp-pixel-border-progress ${className}`}
      style={{ '--rp-border-progress': Math.max(0, Math.min(1, value)) } as React.CSSProperties}
      aria-hidden="true"
    ><svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" pathLength="100" fill="none" vectorEffect="non-scaling-stroke" stroke="currentColor" strokeWidth="2" strokeDasharray={`${Math.max(0, Math.min(1, value)) * 100} 100`} /></svg></span>
  );
}

export function PixelCardDeal({
  children,
  className = '',
  fromX = 0,
  delay = 0,
}: PixelPrimitiveProps & { fromX?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const table = element?.closest('.rp-table');
    if (!element || !table || element.closest('.rp-hand-result')) return;
    // Measure the destination, not the translated/scaled first animation frame.
    const previousAnimation = element.style.animation;
    element.style.animation = 'none';
    const origin = table.getBoundingClientRect(), target = element.getBoundingClientRect();
    element.style.setProperty('--rp-card-from-x', `${Math.round(origin.left + origin.width / 2 - target.left - target.width / 2)}px`);
    element.style.setProperty('--rp-card-from-y', `${Math.round(origin.top + origin.height * .3 - target.top - target.height / 2)}px`);
    element.style.animation = previousAnimation;
  }, []);
  return (
    <div
      ref={ref}
      className={`rp-pixel-card-deal ${className}`}
      style={{ '--rp-card-from-x': `${fromX}px`, '--rp-card-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function PixelCardFlip({ children, className = '' }: PixelPrimitiveProps) {
  return <div className={`rp-pixel-card-flip ${className}`}>{children}</div>;
}

export function PixelSnap({ children, className = '' }: PixelPrimitiveProps) {
  return <span className={`rp-pixel-snap ${className}`}>{children}</span>;
}

export function PixelBurst({ active = true, className = '' }: { active?: boolean; className?: string }) {
  if (!active) return null;
  return <span className={`rp-pixel-burst ${className}`} aria-hidden="true" />;
}

export function SignalGlitch({ children, active = true, className = '' }: PixelPrimitiveProps & { active?: boolean }) {
  return <div className={`${active ? 'rp-signal-glitch' : ''} ${className}`}>{children}</div>;
}

export function ScreenGlitch({ active }: { active: boolean }) {
  if (!active) return null;
  return <div className="rp-screen-glitch" aria-hidden="true" />;
}

export function ScreenShake({ children, active = false, className = '', style }: PixelPrimitiveProps & { active?: boolean; style?: React.CSSProperties }) {
  return <div className={`${active ? 'rp-screen-shake' : ''} ${className}`} style={style}>{children}</div>;
}

export function PlayerSignalState({ children, state, className = '' }: PixelPrimitiveProps & { state: 'online' | 'lost' | 'restored' }) {
  return <div className={`rp-player-signal-state rp-player-signal-state--${state} ${className}`}>{children}</div>;
}

export function PlayerElimination({ children, eliminated, className = '' }: PixelPrimitiveProps & { eliminated: boolean }) {
  return <div className={`${eliminated ? 'rp-player-elimination' : ''} ${className}`}>{children}</div>;
}

export function PixelModalTransition({ children, className = '' }: PixelPrimitiveProps) {
  return <div className={`rp-pixel-modal-transition ${className}`}>{children}</div>;
}

export function PixelLoader({ label = 'SYNCING TABLE' }: { label?: string }) {
  return (
    <span className="rp-loader" role="status" aria-label={label}>
      <span className="rp-loader__blocks" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
      <span>{label}</span>
    </span>
  );
}

export function PixelToast({
  message,
  tone = 'signal',
}: {
  message: string;
  tone?: 'signal' | 'danger' | 'neutral';
}) {
  return (
    <div className={`rp-pixel-toast rp-pixel-toast--${tone}`} role="status" aria-live="polite">
      <PixelTextReveal>{message}</PixelTextReveal>
    </div>
  );
}

export function ArcadeAnnouncement({
  message,
  detail,
  tone = 'signal',
}: {
  message: string;
  detail?: string;
  tone?: 'signal' | 'danger' | 'winner';
  key?: React.Key;
}) {
  return (
    <div className={`rp-announcement rp-announcement--${tone}`} role="status" aria-live="polite">
      <span className="rp-announcement__eyebrow">RESISTANCE NETWORK</span>
      <strong>{message}</strong>
      {detail && <span className="rp-announcement__detail">{detail}</span>}
    </div>
  );
}

export function BlackPixelWipe({ active, retract = false }: { active: boolean; retract?: boolean }) {
  if (!active) return null;
  return <div className={`rp-black-wipe${retract ? ' rp-black-wipe--retract' : ''}`} aria-hidden="true" />;
}

export function PixelSceneTransition({ active, retract = false }: { active: boolean; retract?: boolean }) {
  return <BlackPixelWipe active={active} retract={retract} />;
}
