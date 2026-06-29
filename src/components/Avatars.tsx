import React from 'react';
import { AvatarId } from '../types';

interface AvatarProps {
  id: AvatarId;
  emotion: 'happy' | 'thinking' | 'worried' | 'angry' | 'celebrating';
  isActive: boolean;
  size?: number;
}

const COLOR_PALETTE: Record<string, string> = {
  '.': 'transparent',
  'b': '#111116', // Black/Outline
  'w': '#ffffff', // White
  'p': '#ff9eb5', // Pink
  'r': '#ff4b4b', // Red
  'u': '#00d2ff', // Blue
  'y': '#ffcc00', // Yellow
  'o': '#ff823b', // Orange
  'g': '#94a3b8', // Gray
  'd': '#926239', // Brown
  't': '#00f0ff', // Teal
  'k': '#475569', // Dark Gray
  'm': '#ec4899', // Magenta
  'e': '#5c3e26', // Dark Brown
};

const AVATAR_PIXELS: Record<AvatarId, string[]> = {
  rabbit: [
    "....m......m....",
    "....m......m....",
    "...mwm....mwm...",
    "...mwm....mwm...",
    "..wwww....wwww..",
    "..wwww....wwww..",
    ".wwwwwwwwwwwwww.",
    ".wwwwwwwwwwwwww.",
    "wwwbbwwwwwwbbwww",
    "wwwbbwwwwwwbbwww",
    "wwwwwwwwwwwwwwww",
    "wwwwwmpppmwwwww",
    ".wwwwmpppmwwww.",
    "..wwwwmwmwwww..",
    "...wwwwwwwww...",
    "....wwwww......."
  ],
  bear: [
    "....e......e....",
    "...eee....eee...",
    "..dddddddddddd..",
    ".dddddddddddddd.",
    "dddddddddddddddd",
    "ddyybbddddbbyydd",
    "ddyyyyddddyyyydd",
    "dddddddddddddddd",
    "ddddddppppdddddd",
    "ddddddpbbpdddddd",
    ".ddddddppdddddd.",
    "..dddddddddddd..",
    "...dddddddddd...",
    "....dddddddd....",
    ".....dddddd.....",
    "......dddd......"
  ],
  fox: [
    "o..............o",
    "oo............oo",
    "ooo..........ooo",
    ".oooo......oooo.",
    ".ooooo....ooooo.",
    "oooooooooooooooo",
    "oouubboooooouubb",
    "oouuuuoooooouuuu",
    "oooooooooooooooo",
    "oowwwwwwwwwwwwoo",
    ".owwwwwwwwwwww.",
    "..owwwwwwwwww..",
    "...owwbbwwo...",
    "....owwwwo....",
    ".....owwo.....",
    "......oo......"
  ],
  panda: [
    "....b......b....",
    "...bbb....bbb...",
    "..wwwwwwwwwwww..",
    ".wwwwwwwwwwwwww.",
    "wwwwwwwwwwwwwwww",
    "wwbbbbwwwwbbbbww",
    "wwbbbbwwwwbbbbww",
    "wwwwwwwwwwwwwwww",
    "wwwwwwbbbbwwwwww",
    "wwwwwwwbbwwwwwww",
    ".wwwwwwwwwwwwww.",
    "..wwwwwwwwwwww..",
    "...wwwwwwwwww...",
    "....bbbbbbbb....",
    ".....bbbbbb.....",
    "......bbbb......"
  ],
  cat: [
    "m..............m",
    "mm............mm",
    "mmm..........mmm",
    "mmmm........mmmm",
    "mmmmmmmmmmmmmmmm",
    "mmmbbmmmmmmbbmmm",
    "mmmbbmmmmmmbbmmm",
    "mmmmmmmmmmmmmmmm",
    "mmmmmmppppmmmmmm",
    "mmmmmmmppmmmmmmm",
    "mmmwbwwwwwwbwmmm",
    ".mmmwbwwwwbwmmm.",
    "..mmmmmmmmmmmm..",
    "...mmmmmmmmmm...",
    "....mmmmmmmm....",
    ".....mmmmmm....."
  ],
  koala: [
    "...gg......gg...",
    "..gggg....gggg..",
    ".gggggggggggggg.",
    "gggggggggggggggg",
    "gggggggggggggggg",
    "ggyybbggggbbyygg",
    "ggyyyyggggyyyygg",
    "gggggggggggggggg",
    "gggggbbbbbbggggg",
    "gggggbbbbbbggggg",
    ".gggggbbbbggggg.",
    "..gggggggggggg..",
    "...gggggggggg...",
    "....gggggggg....",
    ".....gggggg.....",
    "......gggg......"
  ]
};

export const Avatar: React.FC<AvatarProps> = ({ id, emotion, isActive, size = 64 }) => {
  const getAvatarStyle = () => {
    let animClass = 'pixel-box-sm relative flex items-center justify-center overflow-hidden ';
    
    if (isActive) {
      animClass += ' border-[#00d2ff] bg-slate-900 ring-4 ring-[#00d2ff]/40 animate-pulse ';
    } else {
      animClass += ' border-black bg-slate-950 ';
    }

    if (emotion === 'thinking') {
      animClass += ' -translate-y-1 ';
    } else if (emotion === 'worried') {
      animClass += ' scale-95 opacity-80 ';
    } else if (emotion === 'angry') {
      animClass += ' border-[#ff4b4b] ';
    } else if (emotion === 'celebrating') {
      animClass += ' rotate-[2deg] scale-105 ';
    }

    return animClass;
  };

  const rows = AVATAR_PIXELS[id] || AVATAR_PIXELS.rabbit;

  return (
    <div
      role="img"
      aria-label={`Pixel avatar ${id} showing ${emotion}`}
      className={`transition-all duration-200 ${getAvatarStyle()}`}
      style={{ width: size, height: size, padding: '4px' }}
    >
      <svg viewBox="0 0 16 16" className="w-full h-full" style={{ shapeRendering: 'crispEdges' }}>
        {rows.map((row, rIdx) => 
          row.split('').map((char, cIdx) => {
            const fill = COLOR_PALETTE[char] || 'transparent';
            if (fill === 'transparent') return null;
            return (
              <rect
                key={`${rIdx}-${cIdx}`}
                x={cIdx}
                y={rIdx}
                width="1"
                height="1"
                fill={fill}
              />
            );
          })
        )}
      </svg>

      {/* Floating Status Pixel Icons */}
      {emotion === 'thinking' && (
        <span className="absolute top-0.5 right-0.5 text-[8px] bg-blue-600 text-white font-black px-1 rounded-sm border border-black leading-none font-mono">
          ?
        </span>
      )}
      {emotion === 'angry' && (
        <span className="absolute top-0.5 right-0.5 text-[8px] bg-red-600 text-white font-black px-1 rounded-sm border border-black leading-none font-mono">
          !
        </span>
      )}
      {emotion === 'celebrating' && (
        <span className="absolute -top-1 -left-1 text-[12px] animate-bounce">
          🎉
        </span>
      )}
    </div>
  );
};


