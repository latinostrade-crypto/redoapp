import type { PokerAudioMode } from './sound';

/** Countdown-driven alerts. Repeated renders never repeat the same second. */
export class PokerTurnAlerts {
  private wasMyTurn = false;
  private lastTick = '';

  update(myTurn: boolean, mode: PokerAudioMode, turnKey: string, seconds: number) {
    const tick = `${turnKey}:${seconds}`;
    const notify = myTurn && (!this.wasMyTurn || (mode === 'self' && seconds > 0 && tick !== this.lastTick));
    this.wasMyTurn = myTurn;
    this.lastTick = myTurn ? tick : '';
    return notify;
  }
}
