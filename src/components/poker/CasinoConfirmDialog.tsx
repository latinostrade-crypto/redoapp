import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChipStackIcon } from './PokerTable';
import { useTelegramSafeArea } from '../../hooks/useTelegramSafeArea';

export type CasinoConfirmationRequest = {
  key: number;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  tone?: 'signal' | 'danger';
};

export type CasinoNotice = { key: number; message: string; tone: 'signal' | 'danger' | 'neutral' };

export function CasinoNoticeToast({ notice }: { notice: CasinoNotice | null }) {
  const reduceMotion = useReducedMotion();
  const telegramSafeArea = useTelegramSafeArea();
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.key}
          className={`rp-lobby-notice rp-lobby-notice--${notice.tone}`}
          initial={reduceMotion ? false : { clipPath: 'inset(0 100% 0 0)', opacity: 0 }}
          animate={{ clipPath: 'inset(0)', opacity: 1 }}
          exit={{ clipPath: 'inset(0 0 0 100%)', opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'linear' }}
          role="status"
          aria-live="polite"
          style={{ '--tg-safe-top': `${telegramSafeArea.top}px` } as React.CSSProperties}
        >
          <span>NETWORK MESSAGE</span>
          <strong>{notice.message}</strong>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CasinoConfirmDialog({
  request,
  onConfirm,
  onCancel,
}: {
  request: CasinoConfirmationRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const telegramSafeArea = useTelegramSafeArea();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!request) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const first = cancelButtonRef.current;
      const last = confirmButtonRef.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [onCancel, request]);

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          key={request.key}
          className="rp-lobby-confirm"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.12 }}
          role="presentation"
          style={{
            '--tg-safe-top': `${telegramSafeArea.top}px`,
            '--tg-safe-right': `${telegramSafeArea.right}px`,
            '--tg-safe-bottom': `${telegramSafeArea.bottom}px`,
            '--tg-safe-left': `${telegramSafeArea.left}px`,
          } as React.CSSProperties}
        >
          <motion.section
            className={`rp-lobby-confirm__panel rp-lobby-confirm__panel--${request.tone || 'signal'}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="casino-confirm-title"
            aria-describedby="casino-confirm-message"
            exit={reduceMotion ? undefined : { clipPath: 'inset(48% 50%)', opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : .18, delay: reduceMotion ? 0 : .22, ease: 'linear' }}
          >
            <motion.header className="rp-lobby-confirm__header" exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .06, delay: reduceMotion ? 0 : .16 }}>
              <span>RESISTANCE NETWORK // AUTHORIZATION</span>
              <h2 id="casino-confirm-title">{request.title}</h2>
            </motion.header>
            <motion.div className="rp-lobby-confirm__content" exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .06, delay: reduceMotion ? 0 : .1 }}>
              <ChipStackIcon className="w-6 h-6" />
              <p id="casino-confirm-message">{request.message}</p>
              {request.detail && <small>{request.detail}</small>}
            </motion.div>
            <motion.div className="rp-lobby-confirm__actions" exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .06 }}>
              <button ref={cancelButtonRef} type="button" onClick={onCancel} className="rp-lobby-secondary">CANCEL</button>
              <button ref={confirmButtonRef} type="button" onClick={onConfirm} className="rp-lobby-primary">{request.confirmLabel || 'CONFIRM'}</button>
            </motion.div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
