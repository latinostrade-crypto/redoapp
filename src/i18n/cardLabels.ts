import type { CardColor } from '../types';
export const cardColorKeys = { red: 'colorRed', blue: 'colorBlue', yellow: 'colorYellow', green: 'colorPurple', wild: 'colorWild' } as const satisfies Record<CardColor, string>;
