import { CardColor, CardValue } from '../types';

export const CARD_ASSETS_READY_EVENT = 'redoapp:card-assets-ready';

function getDeterministicHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getCardImageUrl(color: CardColor, value: CardValue, id: string): string {
  if (value === 'wild') {
    if (color === 'wild') {
      return `/card-thumbs/wild ${(getDeterministicHash(id || 'wild') % 4) + 1}.jpeg`;
    }
    const colorName = color === 'yellow' ? 'gold' : color === 'green' ? 'purp' : color;
    return `/card-thumbs/wild ${colorName}.jpeg`;
  }

  if (value === 'wild_draw4') {
    const colors = ['red', 'blue', 'gold', 'purp'];
    const colorName = color === 'wild'
      ? colors[getDeterministicHash(id || 'draw4') % colors.length]
      : color === 'yellow' ? 'gold' : color === 'green' ? 'purp' : color;
    return `/card-thumbs/plus4_${colorName}_v2.jpeg`;
  }

  let colorName = color === 'yellow' ? 'gold' : color === 'green' ? 'purp' : color;
  if (color === 'green' && ['1', '2', '5', '6', 'reverse'].includes(value)) colorName = 'purple';

  if (value === 'draw2') return `/card-thumbs/plus2_${colorName}_v2.jpeg`;
  if (value === 'skip') return `/card-thumbs/${color === 'green' ? 'rug' : 'Rug'} ${colorName}.jpeg`;
  if (value === 'reverse') return `/card-thumbs/Flip ${colorName}.jpeg`;
  if (value >= '0' && value <= '9') {
    if (value === '3' && color === 'yellow') return '/card-thumbs/3gold.jpeg';
    return `/card-thumbs/${value} ${colorName}.jpeg`;
  }
  return '';
}

export function getEncodedCardImageUrl(color: CardColor, value: CardValue, id: string): string {
  const path = getCardImageUrl(color, value, id);
  return path ? encodeURI(path) : '';
}

const standardColors: CardColor[] = ['red', 'blue', 'yellow', 'green'];
const standardValues: CardValue[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2',
];

export const REQUIRED_GAME_IMAGE_URLS = (() => {
  const urls = new Set<string>([
    '/banner.png',
    '/text(logo).jpg',
    '/card-thumbs/back.jpeg',
    '/card-thumbs/wild%201.jpeg',
    '/card-thumbs/wild%202.jpeg',
    '/card-thumbs/wild%203.jpeg',
    '/card-thumbs/wild%204.jpeg',
  ]);
  for (const color of standardColors) {
    for (const value of standardValues) urls.add(getEncodedCardImageUrl(color, value, `${color}-${value}`));
    urls.add(getEncodedCardImageUrl(color, 'wild', `${color}-wild`));
    urls.add(getEncodedCardImageUrl(color, 'wild_draw4', `${color}-wild-draw4`));
  }
  return Array.from(urls).filter(Boolean);
})();

const retainedImages = new Map<string, HTMLImageElement>();
let preloadPromise: Promise<void> | null = null;

function loadAndDecodeImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error(`Timed out loading ${url}`));
    }, 20_000);

    image.decoding = 'async';
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
        window.clearTimeout(timeout);
        retainedImages.set(url, image);
        resolve();
      } catch (error) {
        window.clearTimeout(timeout);
        reject(error);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`Failed to load ${url}`));
    };
    image.src = url;
  });
}

export function preloadRequiredGameImages() {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const pending = REQUIRED_GAME_IMAGE_URLS.filter((url) => !retainedImages.has(url));
    // Images improve the first round but must never prevent the Mini App from
    // opening. A missing asset is handled by UnoCard's existing fallback.
    await Promise.allSettled(pending.map((url) => loadAndDecodeImage(url)));
  })();
  return preloadPromise;
}

export function initializeRequiredGameImages() {
  // Preload in the background. Do not register it as a full-screen blocking
  // load: Render/CDN hiccups previously kept the app on LOADING forever.
  void preloadRequiredGameImages().finally(() => {
    window.dispatchEvent(new CustomEvent(CARD_ASSETS_READY_EVENT));
  });
}
