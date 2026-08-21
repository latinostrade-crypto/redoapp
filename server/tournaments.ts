export interface TournamentParticipant {
  userId: string;
  username: string;
  avatarId: string;
  registeredAt: number;
  chatId?: number;
}

export interface TournamentMatch {
  matchId: string;
  round: number;
  tableIndex: number;
  playerIds: string[];
  winnerId: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  waitingTimerEndAt?: number | null;
  playerWins?: Record<string, number>;
}

export interface TournamentData {
  id: string;
  title: string;
  gameType?: 'uno' | 'poker' | 'blackjack';
  description: string;
  nftLink: string;
  nftImage?: string;
  startAt: number;
  status: 'upcoming' | 'in_progress' | 'finished';
  rules: string;
  maxPlayers: number;
  entryTicketCost: number;
  winsRequired?: number;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  currentRound: number;
  winnerUserId: string | null;
  winnerName: string | null;
  winnerAvatar: string | null;
  finishedAt: number | null;
  createdAt: number;
}

/**
 * Distributes dynamic number of players (e.g. 8, 10, 12, 14) into balanced tables.
 * Returns array of player ID arrays (each represents a room/table).
 */
export function distributePlayersIntoTables(playerIds: string[]): string[][] {
  const n = playerIds.length;
  if (n <= 0) return [];
  if (n <= 4) return [playerIds];

  // Prefer 4 players per table if divisible by 4
  if (n % 4 === 0) {
    const tables: string[][] = [];
    for (let i = 0; i < n; i += 4) {
      tables.push(playerIds.slice(i, i + 4));
    }
    return tables;
  }

  // Prefer 3 players per table if divisible by 3
  if (n % 3 === 0) {
    const tables: string[][] = [];
    for (let i = 0; i < n; i += 3) {
      tables.push(playerIds.slice(i, i + 3));
    }
    return tables;
  }

  // Prefer 2 players (1v1) per table if divisible by 2
  if (n % 2 === 0 && n <= 8) {
    const tables: string[][] = [];
    for (let i = 0; i < n; i += 2) {
      tables.push(playerIds.slice(i, i + 2));
    }
    return tables;
  }

  // General partitioning for uneven numbers like 10, 14, etc.
  // We divide into tables of size 3 and 4 (or 2 and 3).
  let remaining = n;
  let idx = 0;
  const tables: string[][] = [];

  while (remaining > 0) {
    let chunkSize = 4;
    if (remaining === 5) chunkSize = 3; // 3 + 2
    else if (remaining === 6) chunkSize = 3; // 3 + 3
    else if (remaining === 7) chunkSize = 4; // 4 + 3
    else if (remaining === 3) chunkSize = 3;
    else if (remaining === 2) chunkSize = 2;
    else if (remaining < 2) chunkSize = remaining;

    tables.push(playerIds.slice(idx, idx + chunkSize));
    idx += chunkSize;
    remaining -= chunkSize;
  }

  return tables;
}
