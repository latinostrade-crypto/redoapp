export type PokerRebuyReceipt = {
  tableId: string;
  chips: number;
  energyCost: number;
  casinoChips?: number;
  energy?: number;
  replayed?: boolean;
};

type RebuyPlayer = {
  chips: number; eliminated: boolean; isAi?: boolean; isConnected?: boolean;
  rebuyPending?: boolean; tableBuyInChips?: number; pendingTableRemoval?: boolean;
};

export function canRebuyPoker(stage: string, player?: RebuyPlayer): boolean {
  return Boolean(player && !player.isAi && player.isConnected !== false
    && !player.pendingTableRemoval && !player.rebuyPending && player.chips === 0
    && (stage === 'idle' || stage === 'ended' || player.eliminated));
}

export function pokerRebuyPrice(mode: 'free' | 'public', requested: unknown, minBuyIn: number) {
  if (mode === 'free') return { chips: 100, energyCost: 2 };
  const chips = Number(requested);
  if (!Number.isSafeInteger(chips) || chips < minBuyIn || chips > 100_000) {
    throw new Error(`Buy-in must be an integer between ${minBuyIn} and 100000 chips.`);
  }
  return { chips, energyCost: 0 };
}

export function applyPokerRebuy<T extends RebuyPlayer>(player: T, chips: number) {
  return {
    ...player, chips, rebuyPending: true,
    // Unknown legacy cost bases stay unknown; never invent realised profit.
    tableBuyInChips: player.tableBuyInChips === undefined ? undefined : player.tableBuyInChips + chips,
  };
}
