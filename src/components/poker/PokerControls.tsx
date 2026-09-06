import React from 'react';
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

export function RaiseControl({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { clipPath: 'inset(100% 0 0 0)' }}
      animate={reduceMotion ? undefined : { clipPath: 'inset(0 0 0 0)' }}
      exit={reduceMotion ? undefined : { clipPath: 'inset(0 0 100% 0)' }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'linear' }}
      className="rp-action-panel rp-raise-panel border-2 p-3 z-30 space-y-2.5"
    >
      {children}
    </motion.div>
  );
}
