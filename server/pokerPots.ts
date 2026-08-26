export interface PokerPotContributor {
  userId: string;
  totalMatchInvested: number;
  folded: boolean;
  eliminated: boolean;
}

export interface CalculatedPokerPot {
  amount: number;
  eligibleUserIds: string[];
}

export interface PokerPotEligiblePlayer {
  userId: string;
  handScore: number;
  seatIndex: number;
}

/**
 * Reconstruct main and side pots from total hand investment. Folded players
 * remain contributors, but are excluded from winning eligibility.
 */
export function buildPokerSidePots(players: PokerPotContributor[]): CalculatedPokerPot[] {
  const levels = [...new Set(players
    .map((player) => Math.max(0, Math.floor(player.totalMatchInvested || 0)))
    .filter((amount) => amount > 0))].sort((a, b) => a - b);
  let previous = 0;
  return levels.map((level) => {
    const contributors = players.filter((player) => (player.totalMatchInvested || 0) >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    return {
      amount,
      eligibleUserIds: contributors
        .filter((player) => !player.folded && !player.eliminated)
        .map((player) => player.userId),
    };
  }).filter((pot) => pot.amount > 0);
}

/** Splits one pot and assigns odd chips in deterministic seat order. */
export function calculatePokerPotAwards(
  pot: CalculatedPokerPot,
  eligiblePlayers: PokerPotEligiblePlayer[],
  dealerIndex: number,
  playerCount: number,
) {
  const eligible = eligiblePlayers.filter((player) => pot.eligibleUserIds.includes(player.userId));
  if (eligible.length === 0) return { winnerUserIds: [] as string[], awards: new Map<string, number>() };
  const bestScore = Math.max(...eligible.map((player) => player.handScore));
  const winners = eligible
    .filter((player) => player.handScore === bestScore)
    .sort((a, b) => {
      const aSeat = (a.seatIndex - dealerIndex + playerCount) % playerCount;
      const bSeat = (b.seatIndex - dealerIndex + playerCount) % playerCount;
      return aSeat - bSeat;
    });
  const share = Math.floor(pot.amount / winners.length);
  let remainder = pot.amount % winners.length;
  const awards = new Map<string, number>();
  winners.forEach((winner) => awards.set(winner.userId, share + (remainder-- > 0 ? 1 : 0)));
  return { winnerUserIds: winners.map((winner) => winner.userId), awards };
}
