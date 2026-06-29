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
  // Check wild values first, regardless of the card's active color state
  if (value === 'wild') {
    const hash = getDeterministicHash(id || 'wild');
    const index = (hash % 4) + 1;
    return `/cards/wild ${index}.jpeg`;
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
    return `/cards/+4 ${colorName}.jpeg`;
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
    const displayColor = color === 'red' ? 'Red' : colorName;
    return `/cards/+2 ${displayColor}.jpeg`;
  }

  if (value === 'skip') {
    const skipWord = color === 'green' ? 'rug' : 'Rug';
    return `/cards/${skipWord} ${colorName}.jpeg`;
  }

  if (value === 'reverse') {
    return `/cards/Flip ${colorName}.jpeg`;
  }

  if (value >= '0' && value <= '9') {
    if (value === '3' && color === 'yellow') {
      return `/cards/3gold.jpeg`;
    }
    return `/cards/${value} ${colorName}.jpeg`;
  }

  return '';
}

function getEncodedCardImageUrl(color: CardColor, value: CardValue, id: string): string {
  const path = getCardImageUrl(color, value, id);
  if (!path) return '';
  // Encode spaces to %20 and pluses to %2B for clean local server requests
  return encodeURI(path).replace(/\+/g, '%2B');
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
  const isPlayedWild = (value === 'wild' || value === 'wild_draw4') && color !== 'wild';

  const getBorderClass = (c: CardColor, isWild: boolean) => {
    if (!isWild) return 'border-white';
    switch (c) {
      case 'red': return 'border-[#EF233C]';
      case 'blue': return 'border-[#0077B6]';
      case 'green': return 'border-[#38B000]';
      case 'yellow': return 'border-[#FFD60A]';
      default: return 'border-white';
    }
  };

  const borderClass = getBorderClass(color, isPlayedWild);

  // Background and border colors based on cartoony palettes (for CSS fallback)
  const getPalette = (c: CardColor) => {
    switch (c) {
      case 'red':
        return {
          bg: 'bg-[#EF233C]',
          border: 'border-white',
          text: 'text-[#EF233C]',
          lightBg: 'bg-[#EF233C]/10',
          shadow: 'shadow-[#EF233C]/20',
        };
      case 'blue':
        return {
          bg: 'bg-[#0077B6]',
          border: 'border-white',
          text: 'text-[#0077B6]',
          lightBg: 'bg-[#0077B6]/10',
          shadow: 'shadow-[#0077B6]/20',
        };
      case 'green':
        return {
          bg: 'bg-[#38B000]',
          border: 'border-white',
          text: 'text-[#38B000]',
          lightBg: 'bg-[#38B000]/10',
          shadow: 'shadow-[#38B000]/20',
        };
      case 'yellow':
        return {
          bg: 'bg-[#FFD60A]',
          border: 'border-white',
          text: 'text-[#FFD60A]',
          lightBg: 'bg-[#FFD60A]/10',
          shadow: 'shadow-[#FFD60A]/20',
        };
      case 'wild':
      default:
        return {
          bg: 'bg-zinc-950',
          border: 'border-white',
          text: 'text-zinc-950',
          lightBg: 'bg-slate-200',
          shadow: 'shadow-slate-350',
        };
    }
  };

  const palette = getPalette(color);

  // Size definitions for smart responsive layouts on phones
  const sizeClasses = {
    sm: {
      card: 'w-14 h-20 text-xs border-[3px] rounded-xl shadow-md',
      centerOval: 'w-10 h-14 rounded-[50%]',
      centerIcon: 'w-6 h-6',
      badgeNum: 'text-[9px] top-1 left-1.5',
      badgeNumBottom: 'text-[9px] bottom-1 right-1.5',
      symbolText: 'text-xl font-black font-sans',
    },
    md: {
      card: 'w-[82px] h-[122px] border-[4px] rounded-2xl shadow-lg',
      centerOval: 'w-[60px] h-[90px] rounded-[50%]',
      centerIcon: 'w-9 h-9',
      badgeNum: 'text-xs top-1.5 left-2',
      badgeNumBottom: 'text-xs bottom-1.5 right-2',
      symbolText: 'text-3xl font-black font-sans',
    },
    lg: {
      card: 'w-[104px] h-[154px] border-[5px] rounded-[22px] shadow-xl',
      centerOval: 'w-[80px] h-[116px] rounded-[50%]',
      centerIcon: 'w-12 h-12',
      badgeNum: 'text-sm top-2 left-2.5',
      badgeNumBottom: 'text-sm bottom-2 right-2.5',
      symbolText: 'text-5xl font-black font-sans',
    },
    responsive: {
      card: 'w-[54px] h-[80px] min-[370px]:w-[68px] min-[370px]:h-[100px] sm:w-[82px] sm:h-[122px] border-[2px] min-[370px]:border-[3px] sm:border-[4px] rounded-xl shadow-md text-[10px] min-[370px]:text-xs',
      centerOval: 'w-[38px] h-[54px] min-[370px]:w-[48px] min-[370px]:h-[72px] sm:w-[60px] sm:h-[90px] rounded-[50%]',
      centerIcon: 'w-5 h-5 min-[370px]:w-7 min-[370px]:h-7 sm:w-9 sm:h-9',
      badgeNum: 'text-[8px] min-[370px]:text-[10px] sm:text-xs top-0.5 left-1 min-[370px]:top-1 min-[370px]:left-1.5 sm:top-1.5 sm:left-2',
      badgeNumBottom: 'text-[8px] min-[370px]:text-[10px] sm:text-xs bottom-0.5 right-1 min-[370px]:bottom-1 min-[370px]:right-1.5 sm:bottom-1.5 sm:right-2',
      symbolText: 'text-lg min-[370px]:text-2xl sm:text-3xl font-black font-sans',
    },
  }[size];

  // Specific content renders
  const renderSymbol = (val: CardValue, c: CardColor) => {
    switch (val) {
      case 'skip':
        return <Ban className={`${sizeClasses.centerIcon} ${palette.text} stroke-[4] drop-shadow-[0_2px_1px_rgba(0,0,0,0.15)]`} />;
      case 'reverse':
        return <RefreshCw className={`${sizeClasses.centerIcon} ${palette.text} stroke-[4] drop-shadow-[0_2px_1px_rgba(0,0,0,0.15)]`} />;
      case 'draw2':
        return (
          <div className="relative flex items-center justify-center">
            <span className={`${sizeClasses.symbolText} ${palette.text} drop-shadow-[0_2px_1px_rgba(0,0,0,0.25)]`}>+2</span>
          </div>
        );
      case 'wild':
        return (
          <div className="w-6 h-6 min-[370px]:w-8 min-[370px]:h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full overflow-hidden border border-white grid grid-cols-2 rotate-45 transform scale-105 shadow-md">
            <div className="bg-[#EF233C]"></div>
            <div className="bg-[#0077B6]"></div>
            <div className="bg-[#FFD60A]"></div>
            <div className="bg-[#38B000]"></div>
          </div>
        );
      case 'wild_draw4':
        return (
          <div className="relative flex flex-col items-center justify-center">
            <div className="w-5 h-5 min-[370px]:w-7 min-[370px]:h-7 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-white grid grid-cols-2 shadow-sm rotate-12">
              <div className="bg-[#EF233C]"></div>
              <div className="bg-[#0077B6]"></div>
              <div className="bg-[#FFD60A]"></div>
              <div className="bg-[#38B000]"></div>
            </div>
            <span className="absolute text-[8px] min-[370px]:text-[11px] sm:text-[13px] font-black text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.4)] tracking-wide font-sans bg-zinc-950 px-1 rounded-sm border border-white mt-1">
              +4
            </span>
          </div>
        );
      default:
        // Numeric values 0-9
        return (
          <span className={`${sizeClasses.symbolText} ${palette.text} font-extrabold font-sans select-none drop-shadow-[0_2px_1px_rgba(0,0,0,0.15)]`}>
            {val}
          </span>
        );
    }
  };

  const getBadgeSymbol = (val: CardValue) => {
    if (val === 'skip') return '⊘';
    if (val === 'reverse') return '⇄';
    if (val === 'draw2') return '+2';
    if (val === 'wild') return 'W';
    if (val === 'wild_draw4') return '+4';
    return val;
  };

  if (isBack) {
    // UNO Card Back Design: Solid red #D90429, clean white border, solid white tilted oval, bold red text
    return (
      <div
        id={card.id || `cardback-${indexOffset}`}
        className={`relative ${sizeClasses.card} select-none bg-[#D90429] border-white text-white flex items-center justify-center overflow-hidden transition-transform active:scale-95 shadow-md`}
        style={{
          boxShadow: '2px 2px 10px rgba(0,0,0,0.35), inset 0 2px 4px 0 rgba(255,255,255,0.25)',
        }}
      >
        {/* White inner border line */}
        <div className="absolute inset-1 rounded-lg border border-white/20"></div>

        {/* Diagonal striped subtle background */}
        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.03)_50%,rgba(255,255,255,0.03)_75%,transparent_75%,transparent)] bg-[size:12px_12px]"></div>

        {/* Oval Background - rotated 45 degrees, solid white background */}
        <div className="w-[110%] h-[68%] bg-white rounded-[50%] rotate-[-45deg] absolute flex items-center justify-center shadow-lg border border-white/10 z-1">
          {/* Bold italicized text inside, returning 45deg */}
          <span
            className="text-[#D90429] font-black font-sans text-[11px] min-[370px]:text-sm sm:text-xl md:text-3xl italic tracking-tighter drop-shadow-[2px_2px_0_rgba(0,0,0,0.15)] transform rotate-[45deg] scale-x-110"
          >
            YO
          </span>
        </div>

        {/* Geometric accent dots */}
        <div className="absolute top-1.5 left-2 text-[8px] opacity-80 text-[#FFD60A]">★</div>
        <div className="absolute bottom-1.5 right-2 text-[8px] opacity-80 text-[#FFD60A]">★</div>
      </div>
    );
  }

  return (
    <button
      id={card.id}
      onClick={onClick}
      disabled={!onClick}
      className={`relative ${sizeClasses.card} ${borderClass} ${palette.bg} transition-all duration-300 select-none overflow-hidden flex items-center justify-center text-white
        ${isPlayable
          ? 'cursor-pointer hover:scale-110 active:scale-95 ring-4 ring-[#FFD60A] hover:rotate-[-2deg] animate-bounce-subtle outline-none shadow-[0_0_15px_rgba(250,204,21,0.5)] z-20'
          : 'cursor-default opacity-90'
        }
      `}
      style={{
        boxShadow: isPlayable
          ? '0 10px 20px rgba(0,0,0,0.3), inset 0 2px 4px 1px rgba(255,255,255,0.35)'
          : '0 4px 8px rgba(0,0,0,0.15), inset 0 2px 4px 0 rgba(255,255,255,0.2)',
      }}
    >
      {imageUrl && !imgError ? (
        <div className="w-full h-full relative flex items-center justify-center bg-black/5">
          <img
            src={imageUrl}
            alt={`${color} ${value}`}
            onError={() => {
              console.warn(`Failed to load card image: ${imageUrl}. Falling back to CSS render.`);
              setImgError(true);
            }}
            className="w-full h-full object-cover select-none pointer-events-none"
          />
          {/* Subtle cartoon glow if playable */}
          {isPlayable && (
            <div className="absolute inset-0 bg-[#FFD60A]/10 animate-pulse pointer-events-none"></div>
          )}
        </div>
      ) : (
        <>
          {/* Cartoon inside highlight bubble overlay */}
          <div className="absolute top-1 left-1 w-2/3 h-5 bg-white/20 rounded-full rotate-[-12deg] filter blur-[0.5px]"></div>

          {/* Tiny badge numbers in corners - bold crisp white */}
          <div className={`absolute ${sizeClasses.badgeNum} font-extrabold select-none tracking-widest drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]`}>
            {getBadgeSymbol(value)}
          </div>

          <div className={`absolute ${sizeClasses.badgeNumBottom} font-extrabold select-none tracking-widest rotate-180 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]`}>
            {getBadgeSymbol(value)}
          </div>

          {/* Center White Oval: solid white background to pop the content */}
          <div
            className={`${sizeClasses.centerOval} bg-white rotate-[15deg] flex items-center justify-center transform hover:scale-105 transition-transform`}
            style={{
              boxShadow: '0 2px 5px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.1)',
            }}
          >
            {/* Playable Star Burst effect */}
            {isPlayable && (
              <div className="absolute inset-0 bg-[#FFD60A]/10 rounded-full animate-pulse"></div>
            )}

            <div className="rotate-[-15deg] flex items-center justify-center transform active:scale-110">
              {renderSymbol(value, color)}
            </div>
          </div>
        </>
      )}
    </button>
  );
};
