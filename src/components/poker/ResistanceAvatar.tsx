import React, { useEffect, useId, useRef, useState } from 'react';
import { AvatarId } from '../../types';
import { Avatar } from '../Avatars';
import hoodAsset from '../../assets/resistance/resistance-hood.png';
import './resistance-avatar.css';
import { pixelMaskStyle } from './motion/pixelMasks';

export type ResistanceAvatarState = 'online' | 'folded' | 'disconnected' | 'eliminated' | 'winner';

interface ResistanceAvatarProps {
  name: string;
  fallbackAvatar?: AvatarId;
  photoUrl?: string | null;
  size?: number;
  active?: boolean;
  state?: ResistanceAvatarState;
}

/**
 * The supplied hood is the canonical Resistance identity. The Telegram photo
 * is clipped to the dark opening so it reads as a face inside the garment,
 * while local pixel avatars remain a resilient offline/bot fallback.
 */
export function ResistanceAvatar({
  name,
  fallbackAvatar,
  photoUrl,
  size = 52,
  active = false,
  state = 'online',
}: ResistanceAvatarProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoodMaskId = `resistance-hood-${useId().replace(/:/g, '')}`;
  const showPhoto = Boolean(photoUrl && !photoFailed);
  const logicalWidth = Math.max(12, Math.min(48, Math.round(size * .38)));
  const emotion = state === 'winner' ? 'celebrating' : state === 'folded' ? 'worried' : active ? 'thinking' : 'happy';

  useEffect(() => setPhotoFailed(false), [photoUrl]);
  useEffect(() => {
    if (!photoUrl) return;
    const canvas = photoCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let cancelled = false;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (cancelled) return;
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const sourceWidth = canvas.width / scale;
      const sourceHeight = canvas.height / scale;
      const sourceX = (image.naturalWidth - sourceWidth) / 2;
      const sourceY = (image.naturalHeight - sourceHeight) / 2;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    };
    image.onerror = () => { if (!cancelled) setPhotoFailed(true); };
    image.src = photoUrl;
    return () => { cancelled = true; };
  }, [photoUrl, logicalWidth, showPhoto]);

  return (
    <div
      className={`resistance-avatar resistance-avatar--${state}${active ? ' resistance-avatar--active' : ''}`}
      style={{ ...pixelMaskStyle, '--resistance-avatar-size': `${size}px` } as React.CSSProperties}
      role="img"
      aria-label={`${name}, ${state}${active ? ', active turn' : ''}`}
    >
      <img className="resistance-avatar__hood resistance-avatar__hood--base" src={hoodAsset} alt="" aria-hidden="true" draggable={false} />
      <div className="resistance-avatar__face" aria-hidden="true">
        {showPhoto ? (
          <canvas
            ref={photoCanvasRef}
            width={logicalWidth}
            height={Math.round(logicalWidth * 1.33)}
            className="resistance-avatar__photo"
            aria-hidden="true"
          />
        ) : (
          <div className="resistance-avatar__fallback">
            {fallbackAvatar ? <Avatar id={fallbackAvatar} emotion={emotion} isActive={false} size={Math.max(24, size * 0.55)} /> : <span className="resistance-avatar__initials">{name.trim().slice(0, 2).toUpperCase() || '·'}</span>}
          </div>
        )}
      </div>
      <svg
        className="resistance-avatar__hood resistance-avatar__hood--foreground"
        viewBox="0 0 100 91.4"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <mask id={hoodMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="91.4">
            <rect width="100" height="91.4" fill="white" />
            <path d="M50 21 L61.5 25.5 L66.7 38.5 L66 58.5 L58.4 71.5 L50 77 L41.6 71.5 L34 58.5 L33.3 38.5 L38.5 25.5 Z" fill="black" />
          </mask>
        </defs>
        <image href={hoodAsset} width="100" height="91.4" mask={`url(#${hoodMaskId})`} preserveAspectRatio="xMidYMid meet" />
      </svg>
      <span className="resistance-avatar__signal" aria-hidden="true" />
    </div>
  );
}
