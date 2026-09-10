import { useLanguage } from '../../i18n/LanguageProvider';
import React from 'react';
import type { PokerCard } from '../../types/poker';
import { PixelCounter } from './PixelPrimitives';
import { PokerCardView } from './PokerCard';
import { decomposeChips } from './chips/chipModel';
import cleanTableAsset from '../../assets/resistance/poker-table-clean.png';
import { ChipStackIcon } from '../ChipStackIcon';
export { ChipStackIcon } from '../ChipStackIcon';

export function ChipValue({
  amount,
  className = '',
  iconClassName = 'w-3 h-3',
  prefix,
  suffix,
  animate = false,
  ariaLabel,
}: {
  key?: React.Key;
  amount: number;
  className?: string;
  iconClassName?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  animate?: boolean;
  ariaLabel?: string;
}) {
  const { tr } = useLanguage();
  return (
    <span className={`rp-chip-value inline-flex items-center gap-1 ${className}`} aria-label={ariaLabel || tr('chipCount', { count: amount })}>
      {prefix}
      <ChipStackIcon className={iconClassName} />
      {animate ? <PixelCounter value={amount} /> : <strong>{amount}</strong>}
      {suffix}
    </span>
  );
}

export function PokerChipStack({
  amount,
  className = '',
  showValue = true,
  style,
  ariaHidden = false,
}: {
  key?: React.Key;
  amount: number;
  className?: string;
  showValue?: boolean;
  style?: React.CSSProperties;
  ariaHidden?: boolean;
}) {
  const { tr } = useLanguage();
  if (amount <= 0) return null;
  const piles = decomposeChips(amount);
  // Multiple denominations form a compact cluster, not a long horizontal bar.
  const columns = piles.map(pile => piles.length === 1 ? Math.min(3, pile.columns) : 1);
  const count = columns.reduce((sum, n) => sum + n, 0);
  let columnIndex = 0;
  return (
    <span className={`rp-chip-stack ${className}`} style={style} aria-hidden={ariaHidden || undefined} aria-label={ariaHidden ? undefined : tr('chipCount', { count: amount })}>
      <span className="rp-chip-piles" aria-hidden="true" style={{ '--pile-count': count } as React.CSSProperties}>
        {piles.map((pile, i) => <span key={pile.denomination} className={`rp-chip-denomination rp-chip-denomination--${pile.denomination}`} data-denomination={pile.denomination} data-count={pile.count}>
          {Array.from({ length: columns[i] }, (_, column) => {
            const index = columnIndex++;
            const row = Math.floor(index / 4);
            const rowCount = Math.min(4, count - row * 4);
            return <ChipStackIcon key={column} className="rp-chip-pile" style={{ '--pile-position': rowCount === 1 ? .5 : (index % 4) / (rowCount - 1), '--pile-row': row, '--pile-rise': `${Math.min(5, pile.count) - 1}px` } as React.CSSProperties} />;
          })}
        </span>)}
      </span>
      {showValue && <strong>{amount}</strong>}
    </span>
  );
}

export function PokerTable({ children, bankCount = 1 }: { children: React.ReactNode; bankCount?: number }) {
  return (
    <div
      className={`rp-table${bankCount > 3 ? ' rp-table--many-pots' : ''} w-full relative overflow-hidden flex flex-col items-center justify-center z-10`}
      style={{ '--rp-table-art': `url(${cleanTableAsset})` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function Deck() {
  const { tr } = useLanguage();
  return <div className="rp-deck" aria-hidden="true"><i /><span>{tr("deckUpper")}</span></div>;
}

export function Pot({ amount }: { amount: number }) {
  const { tr } = useLanguage();
  return (
    <div key={amount} className="rp-pot-cluster rp-pixel-snap" aria-label={tr('potAmount', { chips: tr('chipCount', { count: amount }) })}>
      <div className="rp-pot px-3 py-0.5 flex items-center gap-1.5">
        <span>{tr("pot")}</span>
        <ChipStackIcon className="w-3 h-3" />
        <PixelCounter value={amount} />
      </div>
    </div>
  );
}

export function BetDisplay({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return <PokerChipStack key={amount} amount={amount} showValue={false} />;
}

export function CommunityCards({
  cards,
  revealedCardIds,
  revealAll = false,
  winningCardIds = [],
}: {
  cards: PokerCard[];
  revealedCardIds?: Set<string>;
  revealAll?: boolean;
  winningCardIds?: string[];
}) {
  const { tr } = useLanguage();
  return (
    <div className="rp-community-board relative flex items-center">
      <div className="flex gap-1" role="group" aria-label={tr("communityCards")}>
        {[0, 1, 2, 3, 4].map((slotIndex) => {
          const card = cards[slotIndex];
          const visible = card && (!revealedCardIds || revealedCardIds.has(card.id) || revealAll);
          return (
            <div key={slotIndex} className="rp-card-slot w-9 h-13 min-[380px]:w-10 min-[380px]:h-14 border-2 border-dashed flex items-center justify-center shrink-0 shadow-inner" aria-label={visible ? undefined : tr('emptyCommunitySlot', { slot: slotIndex + 1 })}>
              {visible
                ? <PokerCardView card={card} isWinning={winningCardIds.includes(card.id)} dealIndex={slotIndex} />
                : <img src="/card-thumbs/back.jpeg" alt="" aria-hidden="true" className="rp-community-card-back" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HoleCards({ cards, winningCardIds = [] }: { cards: PokerCard[]; winningCardIds?: string[] }) {
  const { tr } = useLanguage();
  return (
    <div className="flex -space-x-3 shrink-0" role="group" aria-label={tr("holeCards")}>
      {cards.map((card, index) => (
        <PokerCardView
          key={card?.id || index}
          card={card}
          isLarge
          isWinning={Boolean(card && winningCardIds.includes(card.id))}
          faceDown={!card}
          dealIndex={index + 1}
          className={index === 1 ? 'rotate-6 origin-bottom-left' : '-rotate-6 origin-bottom-right'}
        />
      ))}
    </div>
  );
}
