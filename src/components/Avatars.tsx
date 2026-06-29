import React from 'react';
import { AvatarId } from '../types';

interface AvatarProps {
  id: AvatarId;
  emotion: 'happy' | 'thinking' | 'worried' | 'angry' | 'celebrating';
  isActive: boolean;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ id, emotion, isActive, size = 64 }) => {
  const getAvatarStyle = () => {
    let animClass = 'rounded-full overflow-hidden ';
    if (isActive) {
      animClass += ' ring-4 ring-cyan-400 animate-pulse ';
    } else {
      animClass += ' border border-slate-800 ';
    }

    if (emotion === 'thinking') {
      animClass += ' translate-y-[-2px] ';
    } else if (emotion === 'worried') {
      animClass += ' scale-95 opacity-80 ';
    } else if (emotion === 'angry') {
      animClass += ' scale-90 border-red-500 ';
    } else if (emotion === 'celebrating') {
      animClass += ' scale-105 rotate-[3deg] ';
    }

    return animClass;
  };

  const renderSvg = () => {
    const emotionColor = {
      happy: '#00E676',
      thinking: '#29B6F6',
      worried: '#FFA726',
      angry: '#EF5350',
      celebrating: '#EC407A',
    }[emotion];

    // Colors mapping for surfers
    const themes = {
      bear: { bg: '#0D47A1', primary: '#29B6F6', secondary: '#00E676' }, // Ocean Deep
      fox: { bg: '#E65100', primary: '#FFB74D', secondary: '#FF5722' },  // Sunset Glide
      rabbit: { bg: '#4A148C', primary: '#BA68C8', secondary: '#EA80FC' }, // Twilight Wave
      panda: { bg: '#004D40', primary: '#4DB6AC', secondary: '#80CBC4' }, // Lagoon Teal
      cat: { bg: '#880E4F', primary: '#F06292', secondary: '#FF80AB' }, // Coral Surf
      koala: { bg: '#37474F', primary: '#90A4AE', secondary: '#CFD8DC' } // Storm Rider
    }[id];

    return (
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect x="0" y="0" width="100" height="100" fill={themes.bg} />
        <circle cx="50" cy="40" r="28" fill={themes.primary} opacity="0.3" />
        <circle cx="50" cy="40" r="20" fill={themes.secondary} opacity="0.4" />
        <path d="M 0 75 Q 25 65 50 75 T 100 75 L 100 100 L 0 100 Z" fill="#0091EA" opacity="0.5" />
        <path d="M 0 83 Q 25 78 50 83 T 100 83 L 100 100 L 0 100 Z" fill="#00B0FF" opacity="0.7" />
        <g transform="translate(15, 10)">
          <path d="M 10 70 L 25 35 Q 30 50 35 70 Z" fill="#FF9100" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="22" y1="40" x2="22" y2="70" stroke="#FFFFFF" strokeWidth="1" />
          <circle cx="50" cy="45" r="16" fill="#ECEFF1" stroke="#37474F" strokeWidth="2" />
          <path d="M 36 43 Q 50 35 64 43 L 60 52 Q 50 48 40 52 Z" fill="#263238" />
          <path d="M 40 45 Q 50 41 60 45" fill="none" stroke={emotionColor} strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <circle cx="50" cy="50" r="48" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.2" />
      </svg>
    );
  };

  return (
    <div
      role="img"
      aria-label={`Surfer identity ${id} displaying ${emotion} status`}
      className={`relative flex items-center justify-center transition-all duration-300 ${getAvatarStyle()}`}
      style={{ width: size, height: size }}
    >
      {renderSvg()}
    </div>
  );
};

