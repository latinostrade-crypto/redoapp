import React from 'react';
import type { PokerCard } from '../../types/poker';
import { PixelCardDeal, PixelCardFlip } from './PixelPrimitives';

const SUIT_SYMBOLS: Record<string, { symbol: string; color: string; label: string }> = {
  spades: { symbol: '♠', color: 'text-slate-950', label: 'spades' },
  hearts: { symbol: '♥', color: 'text-red-600', label: 'hearts' },
  diamonds: { symbol: '♦', color: 'text-blue-600', label: 'diamonds' },
  clubs: { symbol: '♣', color: 'text-emerald-700', label: 'clubs' },
};

const RANK_LABELS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const RANK_NAMES: Record<number, string> = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };

export function PokerCardView({
  card,
  hidden = false,
  faceDown = false,
  isLarge = false,
  isWinning = false,
  className = '',
  dealIndex = 0,
}: {
  card?: PokerCard;
  hidden?: boolean;
  faceDown?: boolean;
  isLarge?: boolean;
  isWinning?: boolean;
  className?: string;
  dealIndex?: number;
  key?: React.Key;
}) {
  const cardSizeClass = isLarge
    ? 'w-12 h-[68px] min-[380px]:w-13 min-[380px]:h-[74px]'
    : 'w-9 h-13 min-[380px]:w-10 min-[380px]:h-14';

  if (hidden || faceDown || !card) {
    return (
      <PixelCardDeal className={cardSizeClass} fromX={(2 - dealIndex) * 28} delay={dealIndex * 45}>
        <div className={`rp-card w-full h-full border-2 border-black shadow-md overflow-hidden bg-slate-950 select-none ${className}`}>
          <img src="/card-thumbs/back.jpeg" alt="Face-down playing card" className="w-full h-full object-cover" />
        </div>
      </PixelCardDeal>
    );
  }

  const suitInfo = SUIT_SYMBOLS[card.suit] || { symbol: '?', color: 'text-black', label: 'unknown suit' };
  const rankLabel = RANK_LABELS[card.rank] || String(card.rank);
  const accessibleLabel = `${RANK_NAMES[card.rank] || rankLabel} of ${suitInfo.label}`;

  return (
    <PixelCardDeal className={cardSizeClass} fromX={(2 - dealIndex) * 28} delay={dealIndex * 45}>
      <PixelCardFlip>
        <div
          className={`rp-card w-full h-full bg-slate-100 border-2 ${
            isWinning ? 'rp-card--winning border-white ring-2 ring-white shadow-[0_0_12px_rgba(255,255,255,.55)]' : 'border-black'
          } p-1 flex flex-col justify-between select-none shadow-[2px_2px_0_#000] relative overflow-hidden ${className}`}
          role="img"
          aria-label={`${accessibleLabel}${isWinning ? ', part of winning hand' : ''}`}
        >
          <div className={`text-[10px] min-[380px]:text-[11px] font-black leading-none ${suitInfo.color}`}>{rankLabel}</div>
          <div className={`text-base min-[380px]:text-lg self-center leading-none ${suitInfo.color}`} aria-hidden="true">{suitInfo.symbol}</div>
          <div className={`text-[10px] min-[380px]:text-[11px] font-black leading-none self-end rotate-180 ${suitInfo.color}`} aria-hidden="true">{rankLabel}</div>
        </div>
      </PixelCardFlip>
    </PixelCardDeal>
  );
}
