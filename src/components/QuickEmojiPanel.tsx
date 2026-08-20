import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sound } from '../utils/sound';
import { Smile, X } from 'lucide-react';
import { LottieSticker } from './LottieSticker';

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

interface QuickEmojiPanelProps {
  onSendEmoji: (emoji: EmojiItem) => void;
  className?: string;
}

export const QuickEmojiPanel: React.FC<QuickEmojiPanelProps> = ({ onSendEmoji, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);

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
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="absolute bottom-12 left-0 mb-1 bg-[#090d14]/95 backdrop-blur-xl border border-slate-800 rounded-2xl p-2 shadow-[0_8px_25px_rgba(0,0,0,0.85)] font-mono select-none w-56 z-50"
          >
            <div className="grid grid-cols-4 gap-1.5">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className="flex items-center justify-center p-1 bg-transparent hover:bg-slate-800/60 rounded-xl active:scale-90 transition-transform cursor-pointer aspect-square"
                  title={emoji.label}
                >
                  <LottieSticker
                    path={emoji.file}
                    className="w-10 h-10 hover:scale-110 transition-transform duration-150"
                  />
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
        className={`flex items-center gap-1.5 px-3 py-1.5 font-black text-[10px] uppercase rounded-full border-2 border-black shadow-[2px_2px_0_#000] pixel-btn-interactive cursor-pointer transition-all ${
          isOpen
            ? 'bg-[#ffcc00] text-black ring-2 ring-[#ffcc00]/50'
            : 'bg-[#08131f] text-slate-200 hover:bg-[#00d2ff] hover:text-black'
        }`}
      >
        {isOpen ? (
          <>
            <X className="w-3.5 h-3.5" />
            <span>CLOSE</span>
          </>
        ) : (
          <>
            <Smile className="w-3.5 h-3.5 text-[#ffcc00]" />
            <span>EMOJI</span>
          </>
        )}
      </button>
    </div>
  );
};

export const EmojiDisplayBadge: React.FC<{ emoji: EmojiItem | string; className?: string }> = ({ emoji, className = '' }) => {
  const item = typeof emoji === 'string'
    ? EMOJI_LIST.find((e) => e.id.toLowerCase() === emoji.toLowerCase() || e.label.toLowerCase() === emoji.toLowerCase()) || { id: 'emoji', label: emoji, file: `/emoji/${emoji}.json` }
    : emoji;

  return (
    <motion.div
      initial={{ scale: 0, y: 10, opacity: 0 }}
      animate={{ scale: [1, 1.2, 1], y: [-5, -18, -25], opacity: 1 }}
      exit={{ scale: 0, opacity: 0, y: -35 }}
      transition={{ duration: 2.8, ease: 'easeOut' }}
      className={`absolute -top-14 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center pointer-events-none select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] ${className}`}
    >
      <LottieSticker path={item.file} className="w-14 h-14" />
    </motion.div>
  );
};
