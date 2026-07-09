/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UnoCardType, CardColor, CardValue } from '../types';
import { RefreshCw, Ban } from 'lucide-react';

interface UnoCardProps {
  card: UnoCardType;
  isBack?: boolean;
  onClick?: () => void;
  isPlayable?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'responsive';
  indexOffset?: number; // useful for overlapping fanning hand
}

function getDeterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getCardImageUrl(color: CardColor, value: CardValue, id: string): string {
  if (value === 'wild') {
    if (color === 'wild') {
      const hash = getDeterministicHash(id || 'wild');
      const index = (hash % 4) + 1;
      return `./cards/wild ${index}.jpeg`;
    } else {
      let colorName = '';
      if (color === 'red') colorName = 'red';
      else if (color === 'blue') colorName = 'blue';
      else if (color === 'yellow') colorName = 'gold';
      else if (color === 'green') colorName = 'purp';
      return `./cards/wild ${colorName}.jpeg`;
    }
  }

  if (value === 'wild_draw4') {
    let colorName = '';
    if (color === 'wild') {
      const hash = getDeterministicHash(id || 'draw4');
      const colors = ['red', 'blue', 'gold', 'purp'];
      colorName = colors[hash % 4];
    } else {
      if (color === 'red') colorName = 'red';
      else if (color === 'blue') colorName = 'blue';
      else if (color === 'yellow') colorName = 'gold';
      else if (color === 'green') colorName = 'purp';
    }
    return `./cards/plus4_${colorName}_v2.jpeg`;
  }

  // Regular color cards
  let colorName = '';
  if (color === 'red') {
    colorName = 'red';
  } else if (color === 'blue') {
    colorName = 'blue';
  } else if (color === 'yellow') {
    colorName = 'gold';
  } else if (color === 'green') {
    const usePurple = ['1', '2', '5', '6', 'reverse'];
    if (usePurple.includes(value)) {
      colorName = 'purple';
    } else {
      colorName = 'purp';
    }
  }

  if (value === 'draw2') {
    return `./cards/plus2_${colorName}_v2.jpeg`;
  }

  if (value === 'skip') {
    const skipWord = color === 'green' ? 'rug' : 'Rug';
    return `./cards/${skipWord} ${colorName}.jpeg`;
  }

  if (value === 'reverse') {
    return `./cards/Flip ${colorName}.jpeg`;
  }

  if (value >= '0' && value <= '9') {
    if (value === '3' && color === 'yellow') {
      return `./cards/3gold.jpeg`;
    }
    return `./cards/${value} ${colorName}.jpeg`;
  }

  return '';
}

function getEncodedCardImageUrl(color: CardColor, value: CardValue, id: string): string {
  const path = getCardImageUrl(color, value, id);
  if (!path) return '';
  return encodeURI(path);
}

export const UnoCard: React.FC<UnoCardProps> = ({
  card,
  isBack = false,
  onClick,
  isPlayable = false,
  size = 'md',
  indexOffset = 0,
}) => {
  const { color, value } = card;
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [card.id, card.color, card.value, isBack]);

  const imageUrl = getEncodedCardImageUrl(color, value, card.id);

  // Pixel palettes
  const getPalette = (c: CardColor) => {
    switch (c) {
      case 'red':
        return {
          bg: 'bg-[#ff4b4b]',
          text: 'text-[#ff4b4b]',
          border: 'border-[#ff4b4b]',
          pixelShadow: 'shadow-[#ff4b4b]/20',
        };
      case 'blue':
        return {
          bg: 'bg-[#00d2ff]',
          text: 'text-[#00d2ff]',
          border: 'border-[#00d2ff]',
          pixelShadow: 'shadow-[#00d2ff]/20',
        };
      case 'green':
        return {
          bg: 'bg-[#a855f7]',
          text: 'text-[#a855f7]',
          border: 'border-[#a855f7]',
          pixelShadow: 'shadow-[#a855f7]/20',
        };
      case 'yellow':
        return {
          bg: 'bg-[#ffcc00]',
          text: 'text-[#ffcc00]',
          border: 'border-[#ffcc00]',
          pixelShadow: 'shadow-[#ffcc00]/20',
        };
      case 'wild':
      default:
        return {
          bg: 'bg-[#1e293b]',
          text: 'text-[#f8fafc]',
          border: 'border-black',
          pixelShadow: 'shadow-slate-800',
        };
    }
  };

  const palette = getPalette(color);

  // Sizing styles suited for pixel grids
  const sizeClasses = {
    sm: {
      card: 'w-14 h-20 text-[10px] border-2 border-black',
      centerBox: 'w-10 h-12',
      centerIcon: 'w-5 h-5',
      badgeNum: 'text-[8px] top-1 left-1.5',
      badgeNumBottom: 'text-[8px] bottom-1 right-1.5',
      symbolText: 'text-sm font-black font-mono',
    },
    md: {
      card: 'w-[82px] h-[122px] border-[3px] border-black',
      centerBox: 'w-[62px] h-[86px]',
      centerIcon: 'w-8 h-8',
      badgeNum: 'text-[10px] top-1.5 left-2',
      badgeNumBottom: 'text-[10px] bottom-1.5 right-2',
      symbolText: 'text-2xl font-black font-mono',
    },
    lg: {
      card: 'w-[104px] h-[154px] border-4 border-black',
      centerBox: 'w-[82px] h-[112px]',
      centerIcon: 'w-10 h-10',
      badgeNum: 'text-xs top-2 left-2.5',
      badgeNumBottom: 'text-xs bottom-2 right-2.5',
      symbolText: 'text-4xl font-black font-mono',
    },
    responsive: {
      card: 'w-[54px] h-[80px] min-[370px]:w-[68px] min-[370px]:h-[100px] sm:w-[82px] sm:h-[122px] border-2 min-[370px]:border-[3px] border-black text-[8px] min-[370px]:text-[10px]',
      centerBox: 'w-[38px] h-[52px] min-[370px]:w-[48px] min-[370px]:h-[68px] sm:w-[62px] sm:h-[86px]',
      centerIcon: 'w-4 h-4 min-[370px]:w-6 min-[370px]:h-6 sm:w-8 sm:h-8',
      badgeNum: 'text-[8px] min-[370px]:text-[9px] sm:text-[10px] top-0.5 left-1 min-[370px]:top-1 min-[370px]:left-1.5 sm:top-1.5 sm:left-2',
      badgeNumBottom: 'text-[8px] min-[370px]:text-[9px] sm:text-[10px] bottom-0.5 right-1 min-[370px]:bottom-1 min-[370px]:right-1.5 sm:bottom-1.5 sm:right-2',
      symbolText: 'text-xs min-[370px]:text-lg sm:text-2xl font-black font-mono',
    },
  }[size];

  const renderSymbol = (val: CardValue) => {
    switch (val) {
      case 'skip':
        return <Ban className={`${sizeClasses.centerIcon} ${palette.text} stroke-[3.5]`} />;
      case 'reverse':
        return <RefreshCw className={`${sizeClasses.centerIcon} ${palette.text} stroke-[3.5]`} />;
      case 'draw2':
        return (
          <span className={`${sizeClasses.symbolText} ${palette.text}`}>
            +2
          </span>
        );
      case 'wild':
        return (
          <div className="w-5 h-5 min-[370px]:w-7 min-[370px]:h-7 sm:w-9 sm:h-9 border-2 border-black grid grid-cols-2">
            <div className="bg-[#ff4b4b]"></div>
            <div className="bg-[#00d2ff]"></div>
            <div className="bg-[#ffcc00]"></div>
            <div className="bg-[#a855f7]"></div>
          </div>
        );
      case 'wild_draw4':
        return (
          <div className="flex flex-col items-center justify-center">
            <div className="w-4 h-4 min-[370px]:w-6 min-[370px]:h-6 sm:w-8 sm:h-8 border border-black grid grid-cols-2">
              <div className="bg-[#ff4b4b]"></div>
              <div className="bg-[#00d2ff]"></div>
              <div className="bg-[#ffcc00]"></div>
              <div className="bg-[#a855f7]"></div>
            </div>
            <span className="text-[7px] min-[370px]:text-[9px] sm:text-[11px] font-black text-white bg-black px-0.5 mt-0.5 border border-white font-mono">
              +4
            </span>
          </div>
        );
      default:
        return (
          <span className={`${sizeClasses.symbolText} ${palette.text} font-black font-mono select-none`}>
            {val}
          </span>
        );
    }
  };

  const getBadgeSymbol = (val: CardValue) => {
    if (val === 'skip') return 'S';
    if (val === 'reverse') return 'R';
    if (val === 'draw2') return '+2';
    if (val === 'wild') return 'W';
    if (val === 'wild_draw4') return '+4';
    return val;
  };

  // Card Back Design (Minimalist Pixel Retro style)
  if (isBack) {
    return (
      <div
        id={card.id || `cardback-${indexOffset}`}
        className={`relative ${sizeClasses.card} select-none bg-[#ff4b4b] text-white flex items-center justify-center overflow-hidden rounded-[8px] transition-transform active:scale-95 shadow-[4px_4px_0_#000000]`}
      >
        <img
          src="./face-20260701.png"
          alt="Card Back"
          className="w-full h-full object-cover select-none pointer-events-none"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    );
  }

  return (
    <button
      id={card.id}
      onClick={onClick}
      disabled={!onClick}
      className={`relative ${sizeClasses.card} ${palette.bg} transition-all duration-100 select-none overflow-hidden rounded-[8px] flex items-center justify-center text-white
        ${isPlayable
          ? 'cursor-pointer hover:-translate-y-2 active:translate-y-1 hover:rotate-[-1deg] border-[#ffcc00] animate-bounce-subtle outline-none shadow-[4px_4px_0_#000000] z-20'
          : 'cursor-default opacity-90 shadow-[2px_2px_0_#000000]'
        }
      `}
      style={{ imageRendering: 'pixelated' }}
    >
      {imageUrl && !imgError ? (
        <div className="w-full h-full relative flex items-center justify-center bg-black/10">
          <img
            src={imageUrl}
            alt={`${color} ${value}`}
            onError={() => {
              console.warn(`Failed to load card image: ${imageUrl}.`);
            }}
            className="w-full h-full object-cover select-none pointer-events-none"
            style={{ imageRendering: 'pixelated', transform: 'scale(1.06)' }}
          />
          {/* Subtle neon filter overlay if playable */}
          {isPlayable && (
            <div className="absolute inset-0 bg-[#ffcc00]/10 pointer-events-none"></div>
          )}
        </div>
      ) : (
        <>
          {/* Top highlight shine (Pixel block) */}
          <div className="absolute top-0.5 left-0.5 w-[85%] h-1 bg-white/25"></div>

          {/* Corners Badge text */}
          <div className={`absolute ${sizeClasses.badgeNum} font-bold font-mono select-none tracking-tighter text-black bg-white px-0.5 border border-black shadow-[1px_1px_0_#000]`}>
            {getBadgeSymbol(value)}
          </div>

          <div className={`absolute ${sizeClasses.badgeNumBottom} font-bold font-mono select-none tracking-tighter text-black bg-white px-0.5 border border-black rotate-180 shadow-[1px_1px_0_#000]`}>
            {getBadgeSymbol(value)}
          </div>

          {/* Center container box - retro styled */}
          <div
            className={`${sizeClasses.centerBox} bg-black border border-black flex items-center justify-center shadow-[2px_2px_0_#000000]`}
          >
            <div className="flex items-center justify-center">
              {renderSymbol(value)}
            </div>
          </div>
        </>
      )}
    </button>
  );
};
