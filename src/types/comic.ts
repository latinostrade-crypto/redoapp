export type SceneLayout = 'left' | 'right' | 'center' | 'finale';

export type MotionPreset =
  | 'rain-windows'
  | 'hallway-split'
  | 'center-iris'
  | 'rivalry'
  | 'impact'
  | 'connection'
  | 'finale';

export type BubbleTone = 'speech' | 'thought' | 'shout' | 'system' | 'reaction';

export interface ComicImage {
  src: string;
  alt: string;
  objectPosition?: string;
  mobileObjectPosition?: string;
}

export interface ComicBubble {
  text: string;
  tone: BubbleTone;
  x: number;
  y: number;
  mobileX: number;
  mobileY: number;
  rotate?: number;
}

export interface ComicSoundEffect {
  text: string;
  tone: 'cyan' | 'pink' | 'yellow' | 'red' | 'white';
  x: number;
  y: number;
  mobileX: number;
  mobileY: number;
  rotate?: number;
}

export interface ComicFact {
  label: string;
  text: string;
}

export interface ComicSceneConfig {
  id: string;
  chapter: string;
  eyebrow: string;
  title: string;
  description: string;
  scrollVh: number;
  mobileScrollVh: number;
  layout: SceneLayout;
  motionPreset: MotionPreset;
  images: ComicImage[];
  bubbles: ComicBubble[];
  soundEffects: ComicSoundEffect[];
  facts?: ComicFact[];
  impact?: boolean;
  finale?: boolean;
}
