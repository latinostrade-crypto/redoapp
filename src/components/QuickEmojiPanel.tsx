import { useLanguage } from '../i18n/LanguageProvider';
import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { sound } from '../utils/sound';
import { Smile, X } from 'lucide-react';
import { PixelSpeechBubble } from './poker/PokerOverlays';

const LottieSticker = React.lazy(() => import('./LottieSticker').then((module) => ({ default: module.LottieSticker })));
const PixelSticker = React.lazy(() => import('./poker/PixelSticker').then(module => ({ default: module.PixelSticker })));

export interface EmojiItem {
  id: string;
  label: string;
  file: string;
}

export const EMOJI_LIST: EmojiItem[] = [
  { id: 'Cool', label: 'COOL', file: '/emoji/Cool.json' },
  { id: 'Fire', label: 'FIRE', file: '/emoji/Fire.json' },
  { id: 'HAHA', label: 'HAHA', file: '/emoji/HAHA.json' },
  { id: 'LIKE', label: 'LIKE', file: '/emoji/LIKE.json' },
  { id: 'CRY', label: 'CRY', file: '/emoji/CRY.json' },
  { id: 'Gun', label: 'GUN', file: '/emoji/Gun.json' },
  { id: 'SOLD', label: 'SOLD', file: '/emoji/SOLD.json' },
  { id: 'toilet', label: 'SKIBIDI', file: '/emoji/toilet.json' },
];

const PIXEL_REACTIONS: Record<string, string> = {
  Cool: '⌐■_■', Fire: '▲', HAHA: 'HA!', LIKE: '+1', CRY: 'T_T', Gun: '⌁', SOLD: '$', toilet: '?!',
};

function PixelReaction({ item, large = false }: { item: EmojiItem; large?: boolean }) {
  const reduced = useReducedMotion();
  return <span className={`rp-pixel-reaction${large ? ' rp-pixel-reaction--large' : ''}`} aria-label={item.label}><React.Suspense fallback={<i>{PIXEL_REACTIONS[item.id] || item.label}</i>}><PixelSticker path={item.file} label={item.label} animate={large} reduced={Boolean(reduced)} /></React.Suspense></span>;
}

interface QuickEmojiPanelProps {
  onSendEmoji: (emoji: EmojiItem) => void;
  className?: string;
  resistance?: boolean;
}

export const QuickEmojiPanel: React.FC<QuickEmojiPanelProps> = ({ onSendEmoji, className = '', resistance = false }) => {
  const { tr } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleSelect = (emoji: EmojiItem) => {
    sound.playPop();
    onSendEmoji(emoji);
    setIsOpen(false);
  };

  return (
    <div className={`relative z-40 ${className}`}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={reduceMotion ? false : resistance ? { clipPath: 'inset(100% 0 0)' } : { opacity: 0, scale: 0.85, y: 10 }}
            animate={reduceMotion ? undefined : resistance ? { clipPath: 'inset(0)' } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : resistance ? { clipPath: 'inset(0 0 100%)' } : { opacity: 0, scale: 0.85, y: 10 }}
            transition={reduceMotion ? { duration: 0 } : resistance ? { duration: 0.18, ease: 'linear' } : { type: 'spring', stiffness: 380, damping: 26 }}
            className={`absolute bottom-12 left-0 mb-1 p-2 select-none w-56 z-50 ${resistance ? 'rp-reaction-panel' : 'bg-[#090d14]/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-[0_8px_25px_rgba(0,0,0,0.85)] font-mono'}`}
          >
            <div className="grid grid-cols-4 gap-1.5">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className={`flex items-center justify-center p-1 cursor-pointer aspect-square ${resistance ? 'rp-reaction-choice' : 'bg-transparent hover:bg-slate-800/60 rounded-xl active:scale-90 transition-transform'}`}
                  title={emoji.label}
                  aria-label={emoji.label}
                >
                  {resistance ? <PixelReaction item={emoji} /> : (
                    <React.Suspense fallback={<span className="w-10 h-10" aria-hidden="true" />}>
                      <LottieSticker path={emoji.file} className="w-10 h-10 hover:scale-110 transition-transform duration-150" />
                    </React.Suspense>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => {
          sound.playPop();
          setIsOpen((prev) => !prev);
        }}
        className={`flex items-center gap-1.5 px-3 py-1.5 font-black text-[10px] uppercase border-2 border-black shadow-[2px_2px_0_#000] pixel-btn-interactive cursor-pointer ${resistance ? `rp-reaction-trigger${isOpen ? ' rp-reaction-trigger--open' : ''}` : `${isOpen ? 'bg-[#ffcc00] text-black ring-2 ring-[#ffcc00]/50' : 'bg-[#08131f] text-slate-200 hover:bg-[#00d2ff] hover:text-black'} rounded-full transition-all`}`}
      >
        {isOpen ? (
          <>
            <X className="w-3.5 h-3.5" />
            <span>{tr("close")}</span>
          </>
        ) : (
          <>
            <Smile className={`w-3.5 h-3.5 ${resistance ? 'text-[#ff5448]' : 'text-[#ffcc00]'}`} />
            <span>{tr("emoji")}</span>
          </>
        )}
      </button>
    </div>
  );
};

export const EmojiDisplayBadge: React.FC<{ emoji: EmojiItem | string; className?: string; resistance?: boolean }> = ({ emoji, className = '', resistance = false }) => {
  const reduceMotion = useReducedMotion();
  const item = typeof emoji === 'string'
    ? EMOJI_LIST.find((e) => e.id.toLowerCase() === emoji.toLowerCase() || e.label.toLowerCase() === emoji.toLowerCase()) || { id: 'emoji', label: emoji, file: `/emoji/${emoji}.json` }
    : emoji;

  return (
    <motion.div
      initial={reduceMotion ? false : resistance ? { clipPath: 'inset(100% 0 0)' } : { scale: 0, y: 10, opacity: 0 }}
      animate={reduceMotion ? undefined : resistance ? { clipPath: 'inset(0)' } : { scale: [1, 1.2, 1], y: [-5, -18, -25], opacity: 1 }}
      exit={reduceMotion ? undefined : resistance ? { clipPath: 'inset(0 0 100%)' } : { scale: 0, opacity: 0, y: -35 }}
      transition={reduceMotion ? { duration: 0 } : resistance ? { duration: 0.22, ease: 'linear' } : { duration: 2.8, ease: 'easeOut' }}
      className={`absolute -top-14 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center pointer-events-none select-none ${resistance ? 'rp-reaction-bubble' : 'drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]'} ${className}`}
    >
      {resistance ? <PixelSpeechBubble><PixelReaction item={item} large /></PixelSpeechBubble> : (
        <React.Suspense fallback={<span className="w-14 h-14" aria-hidden="true" />}>
          <LottieSticker path={item.file} className="w-14 h-14" />
        </React.Suspense>
      )}
    </motion.div>
  );
};
