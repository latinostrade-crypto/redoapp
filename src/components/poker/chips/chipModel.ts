/** Integer chip values only. Artwork is bounded; denomination counts remain exact. */
export const CHIP_DENOMINATIONS = [10000, 2500, 500, 100, 25, 5, 1] as const;
export interface ChipPile { denomination: number; count: number; columns: number; layers: number }
export function decomposeChips(amount: number): ChipPile[] {
  let remaining = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  return CHIP_DENOMINATIONS.flatMap((denomination) => {
    const count = Math.floor(remaining / denomination);
    remaining %= denomination;
    return count ? [{ denomination, count, columns: Math.min(3, count), layers: Math.min(5, Math.ceil(count / 3)) }] : [];
  });
}

export interface ChipAward { playerId: string; amount: number; potIndex: number; kind: 'win' | 'return' }
export interface ChipSnapshot {
  table?: string;
  hand: string;
  version: number;
  pot: number;
  ended: boolean;
  players: Array<{ id: string; chips: number; invested: number }>;
  pots: number[];
  awards?: ChipAward[];
  resync?: boolean;
  payoutNotBefore?: number;
}
export interface ChipFlight {
  id: string;
  playerId: string;
  amount: number;
  kind: 'bet' | 'win' | 'return';
  potIndex: number;
  start: number;
  arrival: number;
  end: number;
}
export const CHIP_TIMING = { bet: 960, award: 780, arrival: 820, pause: 220, stagger: 65 } as const;

/** Presentation ledger: never mutates authoritative balances or settlement. */
export class ChipTimeline {
  snapshot: ChipSnapshot | null = null;
  flights: ChipFlight[] = [];
  private awarded = false;
  private settled = false;
  private pending: ChipSnapshot | null = null;
  private serial = 0;

  sync(next: ChipSnapshot, now: number, reduced = false) {
    if (this.snapshot?.table === next.table && next.version && next.version < (this.pending?.version || this.snapshot?.version || 0)) return;
    if (this.snapshot && next.hand !== this.snapshot.hand && this.flights.some(f => f.end > now) && !reduced && !next.resync) {
      this.pending = next;
      return;
    }
    const previous = this.snapshot;
    const changedHand = previous?.hand !== next.hand;
    if (changedHand) { this.flights = []; this.awarded = false; this.settled = false; }
    if (reduced || next.resync || !previous) {
      this.snapshot = next;
      this.flights = [];
      this.awarded = next.ended;
      this.settled = next.ended;
      this.pending = null;
      return;
    }
    this.flights = this.flights.filter(f => f.kind !== 'bet' || f.end > now);

    let start = Math.max(now, ...this.flights.filter(f => f.kind === 'bet').map(f => f.start + CHIP_TIMING.stagger));
    for (const player of next.players) {
      const before = changedHand ? 0 : previous.players.find(p => p.id === player.id)?.invested ?? player.invested;
      const amount = player.invested - before;
      if (amount <= 0) continue;
      this.flights.push({ id: `chip-${++this.serial}`, playerId: player.id, amount, kind: 'bet', potIndex: 0,
        start, arrival: start + CHIP_TIMING.arrival, end: start + CHIP_TIMING.bet });
      start += CHIP_TIMING.stagger;
    }
    this.snapshot = next;
    // Legacy/recovered states without exact transfers must never invent winnings.
    if (next.ended && !next.awards?.length) this.settled = true;
    if (next.ended && !this.awarded && next.awards?.length) {
      this.settled = false;
      let payoutStart = Math.max(now, next.payoutNotBefore || 0, ...this.flights.map(f => f.end)) + CHIP_TIMING.pause;
      for (const award of next.awards) {
        if (award.amount <= 0) continue;
        this.flights.push({ ...award, id: `chip-${++this.serial}`, start: payoutStart,
          arrival: payoutStart + 650, end: payoutStart + CHIP_TIMING.award });
        payoutStart += CHIP_TIMING.stagger;
      }
      this.awarded = true;
    }
  }

  view(now: number) {
    if (this.pending && !this.flights.some(f => f.end > now)) {
      const pending = this.pending;
      this.pending = null;
      this.sync(pending, now);
    }
    const snapshot = this.snapshot;
    if (!snapshot) return { flights: [] as ChipFlight[], pots: [0], balances: {} as Record<string, number>, busy: false, nextTick: 0 };
    const incoming = this.flights.filter(f => f.kind === 'bet' && f.arrival > now).reduce((sum, f) => sum + f.amount, 0);
    const pots = this.settled ? (snapshot.pots.length ? snapshot.pots : [0]).map(() => 0) : snapshot.pots.length ? [...snapshot.pots] : [snapshot.pot];
    // Contributions in transit have not joined the visible pot yet.
    let withheld = incoming;
    for (let i = pots.length - 1; i >= 0; i--) { const take = Math.min(pots[i], withheld); pots[i] -= take; withheld -= take; }
    const balances = Object.fromEntries(snapshot.players.map(p => [p.id, p.chips]));
    for (const flight of this.flights.filter(f => f.kind !== 'bet')) {
      // The payout leaves the pot at launch; the player's number resolves at arrival.
      if (now >= flight.start) pots[flight.potIndex] = Math.max(0, (pots[flight.potIndex] || 0) - flight.amount);
      if (now < flight.arrival) balances[flight.playerId] = Math.max(0, (balances[flight.playerId] || 0) - flight.amount);
    }
    const active = this.flights.filter(f => f.end > now);
    const boundaries = active.flatMap(f => [f.start, f.arrival, f.end]).filter(t => t > now);
    return { flights: active.filter(f => f.arrival > now), pots, balances, busy: active.length > 0, nextTick: boundaries.length ? Math.min(...boundaries) : 0 };
  }
}
