import React from 'react';

export type MenuIconName = 'user' | 'events' | 'poker' | 'shop' | 'uno' | 'blackjack' | 'filter' | 'refresh' | 'chevron' | 'menu' | 'ticket' | 'invite';
const paths: Record<MenuIconName, string> = {
  user: 'M6 1h4v1h1v5h-1v1H6V7H5V2h1ZM4 10h8v1h2v4H2v-4h2Z',
  events: 'M3 3h10v12H1V3h2Zm1-3v6M10 0v6M1 7h12M4 9h1v1H4Zm4 0h1v1H8Zm-4 3h1v1H4Zm4 0h1v1H8Z',
  poker: 'M7 1h2v2h2v2h2v2h2v4h-1v2h-3v-1H9v2h2v1H5v-1h2v-2H5v1H2v-2H1V7h2V5h2V3h2Z',
  shop: 'M0 1h3l2 10h8l2-7H4M6 13h1v2H6Zm6 0h1v2h-1Z',
  uno: 'M4 3h8v1h2v3h1v6h-3l-2-3H6l-2 3H1V7h1V4h2Zm0 2v4M2 7h4M10 6h1M12 8h1',
  blackjack: 'M3 1h10v14H3ZM7 5h2v2h2v2H9v2H7V9H5V7h2Z',
  filter: 'M0 3h16M0 8h16M0 13h16M4 1v4M11 6v4M6 11v4',
  refresh: 'M13 5A6 6 0 1 0 14 10M14 0v6H8',
  chevron: 'M5 2l6 6-6 6',
  menu: 'M1 3h14M1 8h14M1 13h14',
  ticket: 'M4 1h8v2h2v2h1v6h-1v2h-2v2H4v-2H2v-2H1V5h1V3h2Zm3 3h3M8 4v8M6 12h4',
  invite: 'M5 1h6v2h2v4h-2v2H5V7H3V3h2ZM1 15v-3h7M12 10v6M9 13h6',
};
export function MenuIcon({name, className = ''}: {name: MenuIconName; className?: string}) {
  const solid = name === 'poker';
  return <svg aria-hidden="true" className={`rp-menu-icon ${className}`} viewBox="0 0 16 16" fill={solid ? 'currentColor' : 'none'} stroke={solid ? 'none' : 'currentColor'} strokeWidth="1.5" strokeLinejoin="miter" shapeRendering="crispEdges"><path d={paths[name]} /></svg>;
}
