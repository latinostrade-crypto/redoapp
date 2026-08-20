import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sound } from '../utils/sound';
import { Smile, X } from 'lucide-react';

export interface EmojiItem {
  id: string;
  symbol: string;
  label: string;
  file: string;
  color: string;
}

export const EMOJI_LIST: EmojiItem[] = [
  { id: 'Fire', symbol: '🔥', label: 'Fire', file: '/emoji/Fire.json', color: 'from-amber-500 to-red-600' },
  { id: 'HAHA', symbol: '😂', label: 'Haha', file: '/emoji/HAHA.json', color: 'from-yellow-400 to-amber-500' },
  { id: 'Cool', symbol: '😎', label: 'Cool', file: '/emoji/Cool.json', color: 'from-blue-400 to-indigo-600' },
  { id: 'LIKE', symbol: '👍', label: 'Like', file: '/emoji/LIKE.json', color: 'from-emerald-400 to-teal-600' },
  { id: 'CRY', symbol: '😭', label: 'Cry', file: '/emoji/CRY.json', color: 'from-cyan-400 to-blue-500' },
  { id: 'Gun', symbol: '🔫', label: 'Gun', file: '/emoji/Gun.json', color: 'from-purple-500 to-pink-600' },
  { id: 'SOLD', symbol: '💰', label: 'Sold', file: '/emoji/SOLD.json', color: 'from-yellow-300 to-emerald-500' },
  { id: 'toilet', symbol: '🚽', label: 'Skibidi', file: '/emoji/toilet.json', color: 'from-slate-400 to-zinc-600' },
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
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="absolute bottom-12 left-0 mb-1 flex items-center gap-1.5 p-1.5 bg-[#0a0f16]/95 backdrop-blur-md border-2 border-black rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.8)] font-mono select-none"
          >
            <div className="grid grid-cols-4 gap-1.5 p-1">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className="group relative flex flex-col items-center justify-center w-10 h-10 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-[#00d2ff] rounded-xl active:scale-95 transition-all shadow-md cursor-pointer"
                  title={emoji.label}
                >
                  <span className="text-xl group-hover:scale-125 transition-transform duration-150">
                    {emoji.symbol}
                  </span>
                  <span className="text-[7px] font-black text-slate-400 group-hover:text-[#00d2ff] uppercase leading-none mt-0.5">
                    {emoji.label}
                  </span>
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
    ? EMOJI_LIST.find((e) => e.id.toLowerCase() === emoji.toLowerCase() || e.symbol === emoji) || { id: 'emoji', symbol: emoji, label: '', file: '', color: 'from-amber-500 to-red-600' }
    : emoji;

  return (
    <motion.div
      initial={{ scale: 0, y: 15, rotate: -10 }}
      animate={{ scale: [1, 1.25, 1], y: [-5, -15, -20], rotate: [0, 5, 0] }}
      exit={{ scale: 0, opacity: 0, y: -30 }}
      transition={{ duration: 2.5, ease: 'easeOut' }}
      className={`absolute -top-10 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center p-2 rounded-2xl bg-black/90 border-2 border-[#00d2ff] shadow-[0_0_12px_rgba(0,210,255,0.6)] pointer-events-none ${className}`}
    >
      <span className="text-3xl animate-bounce leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
        {item.symbol}
      </span>
    </motion.div>
  );
};
