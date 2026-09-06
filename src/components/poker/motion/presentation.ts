import type { PokerGameState } from '../../../types/poker';

export const handKey = (s: PokerGameState) => `${s.matchId || s.tableId || 'practice'}:${s.visualEpoch || 0}`;
export const isFinished = (s: PokerGameState) => s.stage === 'ended' || s.stage === 'match_ended';
export type TableCue = { id: number; label: string; detail: string; impact: boolean; start: number; end: number };

/** Only choreography. Server state, turn deadlines and money remain authoritative. */
export class PokerPresentation {
  previous: PokerGameState | null = null;
  cues: TableCue[] = [];
  board: Array<{ id: string; at: number }> = [];
  reveals: Array<{ id: string; at: number }> = [];
  payoutAt = 0;
  resultAt = 0;
  dealAt = 0;
  private serial = 0;
  private allIns = new Set<string>();
  private finalized = false;

  private cue(label: string, detail: string, at: number, duration = 600, impact = false) {
    this.cues.push({ id: ++this.serial, label, detail, impact, start: at, end: at + duration });
  }

  sync(s: PokerGameState, now: number, reduced = false, recover = false) {
    const prev = this.previous;
    if (!recover && prev && handKey(prev) === handKey(s) && s.stateVersion && s.stateVersion < (prev.stateVersion || 0)) return;
    const fresh = !prev || handKey(prev) !== handKey(s) || (isFinished(prev) && !isFinished(s));
    if (fresh || recover) {
      this.cues = []; this.allIns.clear(); this.board = []; this.reveals = [];
      this.payoutAt = 0; this.resultAt = 0; this.dealAt = 0; this.finalized = false;
    }
    if (reduced || recover || (!prev && isFinished(s))) {
      this.cues = []; this.board = s.communityCards.map(c => ({ id: c.id, at: 0 }));
      this.reveals = s.players.map(p => ({ id: p.id, at: 0 }));
      this.payoutAt = 0; this.resultAt = 0; this.dealAt = 0;
      this.finalized = isFinished(s);
      s.players.filter(p => p.isAllIn).forEach(p => this.allIns.add(p.id));
      this.previous = s; return;
    }
    if ((fresh || prev?.waitingForPlayers) && s.stage === 'preflop' && !s.waitingForPlayers) {
      // A late join must not pretend a partly played hand has just begun.
      const untouched = s.players.every(p => !p.lastAction || /BLIND|DEAL/i.test(p.lastAction));
      if (prev || untouched) {
        this.cue('READY?', 'RESISTANCE POKER', now, 220);
        this.cue('GAME START!', 'NEW HAND', now + 220, 460, true);
        this.dealAt = now + 300;
      }
    }
    let actionAt = now;
    for (const p of s.players) {
      const before = fresh ? undefined : prev?.players.find(x => x.id === p.id);
      if (p.isAllIn && !this.allIns.has(p.id)) {
        this.allIns.add(p.id);
        if (prev && !fresh) { this.cue('ALL IN', p.name, actionAt, 360, true); actionAt += 380; }
      } else if (before && p.lastAction && (p.lastAction !== before.lastAction || p.totalMatchInvested !== before.totalMatchInvested)) {
        if (!/ALL[- ]?IN/i.test(p.lastAction)) this.cue(p.lastAction, p.name, now, 540);
      }
      if (prev && !fresh && !before) this.cue('OPERATIVE JOINED', p.name, now);
      if (before?.isConnected !== false && p.isConnected === false) this.cue('SIGNAL LOST', p.name, now);
      if (before?.isConnected === false && p.isConnected !== false) this.cue('SIGNAL RESTORED', p.name, now);
      if (before && !before.eliminated && p.eliminated) this.cue('ELIMINATED', p.name, now);
    }
    const added = s.communityCards.filter(c => !this.board.some(b => b.id === c.id));
    added.forEach((c, i) => this.board.push({ id: c.id, at: !prev || fresh ? 0 : actionAt + i * 130 }));
    if (prev && !fresh && added.length && !isFinished(s)) this.cue(s.communityCards.length === 5 ? 'RIVER' : s.communityCards.length === 4 ? 'TURN' : 'FLOP', 'BOARD UPDATED', now, 440);
    if (isFinished(s) && !this.finalized) {
      this.finalized = true;
      this.cues = this.cues.filter(c => c.label === 'ALL IN' && c.end > now);
      const eligible = s.players.filter(p => !p.folded && !p.mucked && p.holeCards.length === 2 && p.holeCards.every(c => !c.hidden));
      const contested = s.players.filter(p => !p.folded && !p.eliminated).length > 1 && s.communityCards.length === 5;
      const boardReady = Math.max(actionAt, ...this.board.map(c => c.at)) + (added.length ? 240 : 0);
      if (contested) {
        this.cue('SHOWDOWN', 'IDENTITIES REVEALED', boardReady, 540);
        const step = Math.min(170, Math.floor(850 / Math.max(1, eligible.length)));
        this.reveals = eligible.map((p, i) => ({ id: p.id, at: boardReady + 200 + i * step }));
        this.payoutAt = boardReady + 380 + eligible.length * step;
      } else { this.reveals = eligible.map(p => ({ id: p.id, at: now })); this.payoutAt = now + 280; }
      this.cue('POT CAPTURED', s.winningHandDesc || (contested ? 'WINNING HAND LOCKED' : 'UNCONTESTED POT'), this.payoutAt, 650);
      this.resultAt = this.payoutAt + 360;
    }
    this.cues = this.cues.filter(c => c.end > now).slice(-12);
    this.previous = s;
  }

  view(now: number) {
    const cue = this.cues.filter(c => c.start <= now && c.end > now).at(-1) || null;
    const boundaries = [...this.cues.flatMap(c => [c.start, c.end]), ...this.board.map(c => c.at), ...this.reveals.map(p => p.at), this.payoutAt, this.resultAt, this.dealAt].filter(t => t > now);
    return { cue, boardIds: new Set(this.board.filter(c => c.at <= now).map(c => c.id)),
      revealedPlayers: new Set(this.reveals.filter(p => p.at <= now).map(p => p.id)),
      resultReady: now >= this.resultAt, winnerReady: now >= this.payoutAt,
      payoutAt: this.payoutAt, dealAt: this.dealAt,
      nextTick: boundaries.length ? Math.min(...boundaries) : 0 };
  }
}
