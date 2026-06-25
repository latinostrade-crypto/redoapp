/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AvatarId } from '../types';

interface AvatarProps {
  id: AvatarId;
  emotion: 'happy' | 'thinking' | 'worried' | 'angry' | 'celebrating';
  isActive: boolean;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ id, emotion, isActive, size = 64 }) => {
  // Common animations or transformations based on emotions
  const getAvatarStyle = () => {
    let animClass = '';
    if (isActive) {
      animClass += ' animate-pulse border-4 border-yellow-400 ';
    } else {
      animClass += ' border-2 border-slate-200 ';
    }

    if (emotion === 'thinking') {
      animClass += ' translate-y-[-2px] rotate-[2deg] ';
    } else if (emotion === 'worried') {
      animClass += ' animate-bounce ';
    } else if (emotion === 'angry') {
      animClass += ' duration-75 scale-95 ';
    } else if (emotion === 'celebrating') {
      animClass += ' duration-500 scale-105 rotate-[-3deg] ';
    }

    return animClass;
  };

  // Render high quality custom cartoon SVGs for each cute character
  const renderSvg = () => {
    const emotionColor = {
      happy: '#FCD34D', // sunny yellow blush
      thinking: '#93C5FD', // soft blue blush
      worried: '#FCA5A5', // light coral blush
      angry: '#EF4444', // red blush
      celebrating: '#34D399', // green mint blush
    }[emotion];

    switch (id) {
      case 'bear':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Background Circle */}
            <circle cx="50" cy="50" r="48" fill="#FCE8E6" stroke="#92400E" strokeWidth="3" />
            
            {/* Ears */}
            <circle cx="22" cy="22" r="14" fill="#B45309" stroke="#92400E" strokeWidth="3" />
            <circle cx="22" cy="22" r="8" fill="#FCA5A5" />
            <circle cx="78" cy="22" r="14" fill="#B45309" stroke="#92400E" strokeWidth="3" />
            <circle cx="78" cy="22" r="8" fill="#FCA5A5" />

            {/* Bear Face Base */}
            <circle cx="50" cy="56" r="34" fill="#D97706" stroke="#92400E" strokeWidth="3" />

            {/* Cheeks blush */}
            <circle cx="28" cy="62" r="6" fill={emotionColor} opacity="0.6" />
            <circle cx="72" cy="62" r="6" fill={emotionColor} opacity="0.6" />

            {/* Snout */}
            <ellipse cx="50" cy="64" rx="14" ry="10" fill="#FEF3C7" stroke="#92400E" strokeWidth="2" />
            {/* Nose */}
            <path d="M 44 60 Q 50 66 56 60 Z" fill="#78350F" />
            {/* Mouth */}
            {emotion === 'angry' ? (
              <path d="M 45 69 Q 50 64 55 69" fill="none" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
            ) : emotion === 'worried' ? (
              <path d="M 46 68 Q 50 66 54 68" fill="none" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
            ) : (
              <path d="M 44 66 Q 50 72 56 66" fill="none" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
            )}

            {/* Eyes */}
            {emotion === 'thinking' ? (
              <>
                <path d="M 33 46 Q 37 42 41 46" fill="none" stroke="#78350F" strokeWidth="3" strokeLinecap="round" />
                <path d="M 59 46 Q 63 42 67 46" fill="none" stroke="#78350F" strokeWidth="3" strokeLinecap="round" />
              </>
            ) : emotion === 'worried' ? (
              <>
                <ellipse cx="37" cy="46" rx="4" ry="3" fill="#78350F" />
                <ellipse cx="63" cy="46" rx="4" ry="3" fill="#78350F" />
                <path d="M 34 38 L 40 40" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 66 38 L 60 40" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
              </>
            ) : emotion === 'angry' ? (
              <>
                <ellipse cx="37" cy="46" rx="4" ry="4" fill="#78350F" />
                <ellipse cx="63" cy="46" rx="4" ry="4" fill="#78350F" />
                <path d="M 32 38 L 42 43" stroke="#78350F" strokeWidth="3" strokeLinecap="round" />
                <path d="M 68 38 L 58 43" stroke="#78350F" strokeWidth="3" strokeLinecap="round" />
              </>
            ) : (
              <>
                <circle cx="37" cy="46" r="4.5" fill="#78350F" />
                <circle cx="63" cy="46" r="4.5" fill="#78350F" />
                {/* Highlights */}
                <circle cx="35" cy="44" r="1.5" fill="#FFFFFF" />
                <circle cx="61" cy="44" r="1.5" fill="#FFFFFF" />
              </>
            )}
          </svg>
        );

      case 'fox':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Background Circle */}
            <circle cx="50" cy="50" r="48" fill="#F0FDF4" stroke="#9A3412" strokeWidth="3" />
            
            {/* Large Fox Ears */}
            <path d="M 16 34 L 14 10 L 38 28 Z" fill="#EA580C" stroke="#9A3412" strokeWidth="3" strokeLinejoin="round" />
            <path d="M 20 30 L 18 16 L 32 26 Z" fill="#FDBA74" />
            <path d="M 84 34 L 86 10 L 62 28 Z" fill="#EA580C" stroke="#9A3412" strokeWidth="3" strokeLinejoin="round" />
            <path d="M 80 30 L 82 16 L 68 26 Z" fill="#FDBA74" />

            {/* Fox Head Base */}
            <path d="M 18 50 Q 50 24 82 50 Q 84 72 50 86 Q 16 72 18 50 Z" fill="#F97316" stroke="#9A3412" strokeWidth="3" />

            {/* Side Cheeks */}
            <path d="M 18 50 Q 32 68 50 68 Q 68 68 82 50 Q 75 76 50 86 Q 25 76 18 50 Z" fill="#FFFFFF" stroke="#9A3412" strokeWidth="2" />

            {/* Blush cheeks */}
            <circle cx="28" cy="58" r="6" fill={emotionColor} opacity="0.6" />
            <circle cx="72" cy="58" r="6" fill={emotionColor} opacity="0.6" />

            {/* Cheek fur lines */}
            <path d="M 14 52 L 20 52 M 16 56 L 22 55" stroke="#9A3412" strokeWidth="1.5" />
            <path d="M 86 52 L 80 52 M 84 56 L 78 55" stroke="#9A3412" strokeWidth="1.5" />

            {/* Nose */}
            <ellipse cx="50" cy="80" rx="6" ry="4" fill="#1C1917" />

            {/* Smile / mouth */}
            {emotion === 'angry' ? (
              <path d="M 45 76 Q 50 72 55 76" fill="none" stroke="#1C1917" strokeWidth="2.5" />
            ) : (
              <path d="M 44 74 Q 50 78 56 74" fill="none" stroke="#1C1917" strokeWidth="2" strokeLinecap="round" />
            )}

            {/* Slanted Eyes for Cheeky Fox */}
            {emotion === 'worried' ? (
              <>
                <path d="M 30 46 Q 36 50 42 46" fill="none" stroke="#1C1917" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 70 46 Q 64 50 58 46" fill="none" stroke="#1C1917" strokeWidth="3.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M 28 42 L 40 46" fill="none" stroke="#9A3412" strokeWidth="3" strokeLinecap="round" />
                <path d="M 72 42 L 60 46" fill="none" stroke="#9A3412" strokeWidth="3" strokeLinecap="round" />
                <circle cx="35" cy="48" r="4.5" fill="#1C1917" />
                <circle cx="65" cy="48" r="4.5" fill="#1C1917" />
                <circle cx="34" cy="46" r="1.5" fill="#FFFFFF" />
                <circle cx="64" cy="46" r="1.5" fill="#FFFFFF" />
              </>
            )}
          </svg>
        );

      case 'rabbit':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Background Circle */}
            <circle cx="50" cy="50" r="48" fill="#FEF3C7" stroke="#A21CAF" strokeWidth="3" />
            
            {/* Cute Long Bunny Ears */}
            <path d="M 32 30 Q 18 2 34 2 Q 46 2 40 30" fill="#F472B6" stroke="#A21CAF" strokeWidth="3" strokeLinejoin="round" />
            <path d="M 32 26 Q 24 8 32 8 Q 40 8 38 26" fill="#FBCFE8" />

            <path d="M 68 30 Q 82 2 66 2 Q 54 2 60 30" fill="#F472B6" stroke="#A21CAF" strokeWidth="3" strokeLinejoin="round" />
            <path d="M 68 26 Q 76 8 68 8 Q 60 8 62 26" fill="#FBCFE8" />

            {/* Rabbit Head */}
            <circle cx="50" cy="58" r="28" fill="#FDF2F8" stroke="#A21CAF" strokeWidth="3" />

            {/* Blush cheeks */}
            <circle cx="32" cy="62" r="5" fill={emotionColor} opacity="0.6" />
            <circle cx="68" cy="62" r="5" fill={emotionColor} opacity="0.6" />

            {/* Big Eyes */}
            {emotion === 'thinking' ? (
              <>
                <path d="M 34 48 Q 38 52 42 48" fill="none" stroke="#A21CAF" strokeWidth="3;5" strokeLinecap="round" />
                <path d="M 66 48 Q 62 52 58 48" fill="none" stroke="#A21CAF" strokeWidth="3.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <circle cx="38" cy="48" r="5" fill="#4A044E" />
                <circle cx="62" cy="48" r="5" fill="#4A044E" />
                <circle cx="36" cy="46" r="1.8" fill="#FFFFFF" />
                <circle cx="60" cy="46" r="1.8" fill="#FFFFFF" />
                <circle cx="40" cy="50" r="1" fill="#FFFFFF" />
                <circle cx="64" cy="50" r="1" fill="#FFFFFF" />
              </>
            )}

            {/* Muzzle */}
            <ellipse cx="50" cy="60" rx="6" ry="4" fill="#FBCFE8" />
            <path d="M 47 59 L 53 59" stroke="#A21CAF" strokeWidth="1.5" />
            {/* Teeth */}
            <rect x="47" y="62" width="6" height="5" fill="#FFFFFF" stroke="#A21CAF" strokeWidth="1.5" />
            <line x1="50" y1="62" x2="50" y2="67" stroke="#A21CAF" strokeWidth="1" />

            {/* Whiskers */}
            <path d="M 22 58 Q 12 56 2 60 M 22 62 Q 10 63 4 68" stroke="#A21CAF" strokeWidth="1.5" />
            <path d="M 78 58 Q 88 56 98 60 M 78 62 Q 90 63 96 68" stroke="#A21CAF" strokeWidth="1.5" />
          </svg>
        );

      case 'panda':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Background Circle */}
            <circle cx="50" cy="50" r="48" fill="#EFF6FF" stroke="#0F172A" strokeWidth="3" />
            
            {/* Panda Ears */}
            <circle cx="25" cy="28" r="12" fill="#1E293B" stroke="#0F172A" strokeWidth="3" />
            <circle cx="75" cy="28" r="12" fill="#1E293B" stroke="#0F172A" strokeWidth="3" />

            {/* Head Base */}
            <circle cx="50" cy="58" r="30" fill="#FFFFFF" stroke="#0F172A" strokeWidth="3" />

            {/* Black Eye Rings */}
            <ellipse cx="38" cy="54" rx="9" ry="12" fill="#1E293B" transform="rotate(-15 38 54)" />
            <ellipse cx="62" cy="54" rx="9" ry="12" fill="#1E293B" transform="rotate(15 62 54)" />

            {/* Blush cheeks */}
            <circle cx="26" cy="66" r="5" fill={emotionColor} opacity="0.6" />
            <circle cx="74" cy="66" r="5" fill={emotionColor} opacity="0.6" />

            {/* Inner Shiny Eyes */}
            {emotion === 'worried' ? (
              <>
                <path d="M 35 52 L 41 56" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
                <path d="M 65 52 L 59 56" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
              </>
            ) : (
              <>
                <circle cx="39" cy="52" r="3.5" fill="#FFFFFF" />
                <circle cx="61" cy="52" r="3.5" fill="#FFFFFF" />
                <circle cx="40" cy="51" r="1.2" fill="#1E293B" />
                <circle cx="60" cy="51" r="1.2" fill="#1E293B" />
              </>
            )}

            {/* Snout */}
            <ellipse cx="50" cy="64" rx="8" ry="5" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.5" />
            <path d="M 46 62 Q 50 66 54 62 Z" fill="#0F172A" />
            {/* Smile */}
            <path d="M 46 67 Q 50 71 54 67" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      case 'cat':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Background Circle */}
            <circle cx="50" cy="50" r="48" fill="#FAF5FF" stroke="#5B21B6" strokeWidth="3" />
            
            {/* Cat Ears */}
            <path d="M 18 36 L 15 10 L 40 28 Z" fill="#8B5CF6" stroke="#5B21B6" strokeWidth="3" strokeLinejoin="round" />
            <path d="M 22 32 L 20 18 L 34 26 Z" fill="#F5D0FE" />
            <path d="M 82 36 L 85 10 L 60 28 Z" fill="#8B5CF6" stroke="#5B21B6" strokeWidth="3" strokeLinejoin="round" />
            <path d="M 78 32 L 80 18 L 66 26 Z" fill="#F5D0FE" />

            {/* Cat Head Base */}
            <ellipse cx="50" cy="58" rx="32" ry="26" fill="#A78BFA" stroke="#5B21B6" strokeWidth="3" />

            {/* Blush cheeks */}
            <circle cx="28" cy="65" r="5.5" fill={emotionColor} opacity="0.6" />
            <circle cx="72" cy="65" r="5.5" fill={emotionColor} opacity="0.6" />

            {/* Cute Whiskers */}
            <line x1="16" y1="60" x2="2" y2="58" stroke="#5B21B6" strokeWidth="2" strokeLinecap="round" />
            <line x1="16" y1="64" x2="0" y2="67" stroke="#5B21B6" strokeWidth="2" strokeLinecap="round" />
            <line x1="84" y1="60" x2="98" y2="58" stroke="#5B21B6" strokeWidth="2" strokeLinecap="round" />
            <line x1="84" y1="64" x2="100" y2="67" stroke="#5B21B6" strokeWidth="2" strokeLinecap="round" />

            {/* Eyes */}
            <circle cx="36" cy="50" r="5" fill="#4C1D95" />
            <circle cx="64" cy="50" r="5" fill="#4C1D95" />
            <circle cx="34" cy="48" r="2" fill="#FFFFFF" />
            <circle cx="62" cy="48" r="2" fill="#FFFFFF" />

            {/* Cute Cat Nose */}
            <path d="M 47 58 L 53 58 L 50 61 Z" fill="#F472B6" stroke="#5B21B6" strokeWidth="1" />
            <path d="M 50 61 Q 47 65 45 64 M 50 61 Q 53 65 55 64" fill="none" stroke="#5B21B6" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        );

      case 'koala':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Background Circle */}
            <circle cx="50" cy="50" r="48" fill="#ECFDF5" stroke="#374151" strokeWidth="3" />
            
            {/* Huge Fluffy Ears */}
            <circle cx="18" cy="38" r="16" fill="#9CA3AF" stroke="#374151" strokeWidth="3" />
            <circle cx="18" cy="38" r="11" fill="#E5E7EB" />
            <path d="M 6 36 L 12 30 Q 15 36 12 42 Z" fill="#FFFFFF" />

            <circle cx="82" cy="38" r="16" fill="#9CA3AF" stroke="#374151" strokeWidth="3" />
            <circle cx="82" cy="38" r="11" fill="#E5E7EB" />
            <path d="M 94 36 L 88 30 Q 85 36 88 42 Z" fill="#FFFFFF" />

            {/* Koala Head */}
            <circle cx="50" cy="58" r="28" fill="#D1D5DB" stroke="#374151" strokeWidth="3" />

            {/* Blush cheeks */}
            <circle cx="30" cy="64" r="5" fill={emotionColor} opacity="0.6" />
            <circle cx="70" cy="64" r="5" fill={emotionColor} opacity="0.6" />

            {/* Sparkly Eyes */}
            <circle cx="36" cy="48" r="4.5" fill="#1F2937" />
            <circle cx="64" cy="48" r="4.5" fill="#1F2937" />
            <circle cx="34" cy="46" r="1.5" fill="#FFFFFF" />
            <circle cx="62" cy="46" r="1.5" fill="#FFFFFF" />

            {/* Big Shiny Koala Nose */}
            <ellipse cx="50" cy="56" rx="8" ry="11" fill="#111827" />
            <ellipse cx="48" cy="52" rx="2.5" ry="4" fill="#9CA3AF" opacity="0.4" />

            {/* Smile */}
            <path d="M 45 69 Q 50 73 55 69" fill="none" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        );

      default:
        return null;
    }
  };

  return (
    <div
      role="img"
      aria-label={`Cartoon avatar of ${id} expressing ${emotion}`}
      className={`relative rounded-full bg-white flex items-center justify-center overflow-visible transition-all duration-300 ${getAvatarStyle()}`}
      style={{ width: size, height: size }}
    >
      {renderSvg()}
    </div>
  );
};
