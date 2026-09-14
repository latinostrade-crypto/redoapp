import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PokerGameState } from '../../../types/poker';
import { ChipValue, PokerChipStack } from '../PokerTable';
import type { ChipFlight, ChipTimeline } from './chipModel';
import './chip-field.css';

type Point = { x: number; y: number; ownerAngle?: number };
type BoardBounds = { left: number; right: number; top: number; bottom: number };
type Layout = { seats: Record<string, Point>; pots: Point[]; board?: BoardBounds };
type View = ReturnType<ChipTimeline['view']>;

// Dedicated betting lanes inside the felt. They intentionally do not follow
// the outside edge of the player card: every stack remains on the table and
// keeps the same visual ownership for 2–10 player layouts.
const SEAT_CHIP_LANES: Record<number, Point> = {
  0: { x: .22, y: .34 },
  1: { x: .22, y: .50 },
  2: { x: .22, y: .66 },
  3: { x: .30, y: .32 },
  4: { x: .50, y: .32 },
  5: { x: .70, y: .32 },
  6: { x: .78, y: .34 },
  7: { x: .78, y: .50 },
  8: { x: .78, y: .66 },
  9: { x: .50, y: .76 },
};

/** One table-owned coordinate system, never a child of a clipped avatar. */
export function ChipField({ state, view }: { state: PokerGameState; view: View }) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>({ seats: {}, pots: [] });
  const playerKey = state.players.map(p => p.id).join('|');
  const potCount = view.pots.length;
  useLayoutEffect(() => {
    const table = root.current?.parentElement;
    if (!table) return;
    const measure = () => {
      const bounds = table.getBoundingClientRect();
      const sx = table.offsetWidth / bounds.width;
      const sy = table.offsetHeight / bounds.height;
      const width = table.clientWidth, height = table.clientHeight;
      const seats: Record<string, Point> = {};
      const localBox = (r: DOMRect) => ({ left: (r.left - bounds.left) * sx - table.clientLeft, right: (r.right - bounds.left) * sx - table.clientLeft, top: (r.top - bounds.top) * sy - table.clientTop, bottom: (r.bottom - bounds.top) * sy - table.clientTop });
      const board = table.querySelector('.rp-community-board');
      const bankTop = board ? localBox(board.getBoundingClientRect()).top - 35 : height * .35;
      const columns = Math.min(potCount > 3 ? 4 : 3, Math.max(1, potCount));
      const step = 38;
      const pots = Array.from({ length: potCount }, (_, i) => ({
        x: Math.round(width / 2 + ((i % columns) - (Math.min(columns, potCount - Math.floor(i / columns) * columns) - 1) / 2) * step),
        y: Math.round(bankTop - (Math.ceil(potCount / columns) - 1 - Math.floor(i / columns)) * 30),
      }));
      table.querySelectorAll<HTMLElement>('[data-chip-seat]').forEach(el => {
        const r = localBox(el.getBoundingClientRect());
        const slot = Number(el.closest('[data-seat-slot]')?.getAttribute('data-seat-slot'));
        const lane = SEAT_CHIP_LANES[slot] || SEAT_CHIP_LANES[9];
        const x = Math.round(width * lane.x);
        const y = Math.round(height * lane.y);
        const ownerX = (r.left + r.right) / 2;
        const ownerY = (r.top + r.bottom) / 2;
        seats[el.dataset.chipSeat!] = {
          x,
          y,
          ownerAngle: Math.atan2(ownerY - y, ownerX - x) * 180 / Math.PI,
        };
      });
      const community = table.querySelector('.rp-community-board');
      setLayout({ seats, pots, board: community ? localBox(community.getBoundingClientRect()) : undefined });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    const boardGroup = table.querySelector('.rp-board-position');
    if (boardGroup) observer.observe(boardGroup);
    table.querySelectorAll('[data-chip-seat]').forEach(el => observer.observe(el));
    // Seat entrance animation finishes after the initial layout read.
    const timer = setTimeout(measure, 350);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [playerKey, potCount]);

  const position = (p: Point): React.CSSProperties => ({
    left: p.x,
    top: p.y,
    '--chip-owner-angle': `${p.ownerAngle || 0}deg`,
  } as React.CSSProperties);
  return <div ref={root} className="rp-chip-field" data-chip-busy={view.busy}>
    {state.players.map(p => {
      const point = layout.seats[p.id];
      const amount = view.balances[p.id] ?? p.chips;
      return point && amount > 0 && !p.eliminated ? <div key={p.id} className={`rp-chip-bankroll${p.id === 'player' ? ' rp-chip-bankroll--local' : ''}`} style={position(point)} data-chip-bankroll={p.id} aria-hidden="true">
        <PokerChipStack key={amount} amount={amount} showValue={false} />
      </div> : null;
    })}
    {view.pots.map((amount, i) => {
      const point = layout.pots[i];
      return point && amount > 0 ? <div key={i} className={`rp-chip-bank${potCount > 1 ? ' rp-chip-bank--split' : ''}`} style={position(point)} data-chip-pot={i}>
        <PokerChipStack key={amount} amount={amount} showValue={false} ariaHidden />
        {potCount > 1 && <ChipValue amount={amount} prefix={<span>{i ? `S${i}` : 'M'}</span>} iconClassName="w-2 h-2" />}
      </div> : null;
    })}
    {view.flights.map(flight => {
      const seat = layout.seats[flight.playerId];
      const pot = layout.pots[flight.potIndex] || layout.pots[0];
      if (!seat || !pot) return null;
      return <Transfer key={flight.id} flight={flight} seat={seat} pot={pot} board={layout.board} />;
    })}
  </div>;
}

function Transfer({ flight, seat, pot, board }: { key?: React.Key; flight: ChipFlight; seat: Point; pot: Point; board?: BoardBounds }) {
  const mountedAt = useRef(performance.now());
  const from = flight.kind === 'bet' ? seat : pot;
  const to = flight.kind === 'bet' ? pot : seat;
  const stop = { x: from.x + (to.x - from.x) * .18, y: from.y + (to.y - from.y) * .18 };
  let route1 = { x: from.x + (to.x - from.x) * .45, y: from.y + (to.y - from.y) * .45 };
  let route2 = { x: from.x + (to.x - from.x) * .75, y: from.y + (to.y - from.y) * .75 };
  if (board && Math.min(from.y, to.y) < board.top && Math.max(from.y, to.y) > board.bottom) {
    const sideX = seat.x < (board.left + board.right) / 2 ? board.left - 15 : board.right + 15;
    route1 = { x: sideX, y: from.y < to.y ? board.top - 15 : board.bottom + 15 };
    route2 = { x: sideX, y: from.y < to.y ? board.bottom + 15 : board.top - 15 };
  }
  return <div className={`rp-chip-flight rp-chip-flight--${flight.kind}`} data-chip-transfer={flight.amount} aria-hidden="true" style={{
    '--from-x': `${from.x}px`, '--from-y': `${from.y}px`, '--stop-x': `${stop.x}px`, '--stop-y': `${stop.y}px`,
    '--to-x': `${to.x}px`, '--to-y': `${to.y}px`,
    '--route1-x': `${Math.round(route1.x)}px`, '--route1-y': `${Math.round(route1.y)}px`,
    '--route2-x': `${Math.round(route2.x)}px`, '--route2-y': `${Math.round(route2.y)}px`,
    animationDuration: `${flight.end - flight.start}ms`, animationDelay: `${flight.start - mountedAt.current}ms`,
  } as React.CSSProperties}><PokerChipStack amount={flight.amount} showValue={false} ariaHidden /></div>;
}
