import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';

export function ActionButton({
  tone,
  children,
  disabled,
  onClick,
  pressed,
}: {
  tone: 'fold' | 'primary' | 'raise';
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={`rp-action-button rp-action-button--${tone} py-2.5 font-black text-[9px] uppercase disabled:opacity-40 disabled:pointer-events-none min-h-[44px] flex items-center justify-center gap-1 cursor-pointer`}
    >
      {children}
    </button>
  );
}

export function BetControls({ children }: { children: React.ReactNode }) {
  return <div className="rp-action-panel border p-2 z-20 flex flex-col gap-1.5">{children}</div>;
}

export function PokerDialog({ children, onClose, label, safeBottom = 0 }: { children: React.ReactNode; onClose: () => void; label: string; safeBottom?: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className="resistance-poker rp-raise-dialog" aria-label={label}
      style={{ '--tg-safe-bottom': `${safeBottom}px` } as React.CSSProperties}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      {children}
    </dialog>, document.body
  );
}

export function RaiseControl(props: { children: React.ReactNode; onClose: () => void; label: string; safeBottom?: number }) {
  const reduceMotion = useReducedMotion();
  const { children } = props;
  return <PokerDialog {...props}>
    <motion.div
      initial={reduceMotion ? false : { y: '100%', opacity: .72 }}
      animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
      exit={reduceMotion ? undefined : { y: '100%', opacity: .72 }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rp-action-panel rp-raise-panel border-2 p-2 z-30 space-y-1.5"
    >
      {children}
    </motion.div>
  </PokerDialog>;
}
