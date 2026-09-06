export type PokerPreAction = 'fold' | 'check';

export type PokerPreActionResolution = 'none' | 'wait' | 'fold' | 'check' | 'cancel';

export function canQueuePokerPreCheck(callNeeded: number): boolean {
  return Number.isFinite(callNeeded) && callNeeded === 0;
}

export function resolvePokerPreAction({
  queued,
  canRemainQueued,
  isHumanTurn,
  canAct,
  callNeeded,
}: {
  queued: PokerPreAction | null;
  canRemainQueued: boolean;
  isHumanTurn: boolean;
  canAct: boolean;
  callNeeded: number;
}): PokerPreActionResolution {
  if (!queued) return 'none';
  if (!canRemainQueued) return 'cancel';
  if (!isHumanTurn) return 'wait';
  if (!canAct) return 'cancel';
  if (queued === 'fold') return 'fold';
  return canQueuePokerPreCheck(callNeeded) ? 'check' : 'cancel';
}
