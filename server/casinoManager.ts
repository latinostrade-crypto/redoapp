import { PokerEngine } from './pokerEngine';
import { BlackjackEngine } from './blackjackEngine';

export type CasinoGameType = 'poker' | 'blackjack';
export type CasinoTableMode = 'public' | 'free';

export interface CasinoTable {
  id: string;
  name: string;
  gameType: CasinoGameType;
  mode: CasinoTableMode;
  minBuyIn: number;
  playersCount: number;
  humanPlayersCount: number;
  maxPlayers: number;
  engine: PokerEngine | BlackjackEngine | null;
  activatedAt: number | null;
  lastActivityAt: number;
}

const BOT_ROSTER = [
  ['bot_table_bear', 'Bear Ace', 'bear'],
  ['bot_table_fox', 'Fox River', 'fox'],
] as const;

/** Permanent table catalogue with lazily allocated game runtimes. */
export class CasinoManager {
  private tables = new Map<string, CasinoTable>();

  constructor() {
    for (const gameType of ['poker', 'blackjack'] as const) {
      for (const mode of ['public', 'free'] as const) {
        for (let number = 1; number <= 2; number += 1) {
          const id = `table-${gameType}-${mode}-${number}`;
          this.tables.set(id, {
            id,
            name: String(number),
            gameType,
            mode,
            minBuyIn: mode === 'free' ? 100 : 50,
            playersCount: 0,
            humanPlayersCount: 0,
            maxPlayers: gameType === 'poker' ? 10 : 4,
            engine: null,
            activatedAt: null,
            lastActivityAt: Date.now(),
          });
        }
      }
    }
  }

  private updateCounts(table: CasinoTable) {
    const players = (table.engine as any)?.state?.players || [];
    table.playersCount = players.length;
    table.humanPlayersCount = players.filter((player: any) =>
      !player.isAi && !String(player.userId).startsWith('bot_') && player.isConnected !== false
    ).length;
  }

  /**
   * Bots are visual ambience for an empty table only. A human must never join
   * an in-progress bot hand: that mixes two rule sets and leaves the client
   * waiting on a bot turn after it has already paid for a human seat.
   */
  private removeBotsForHumanTable(table: CasinoTable) {
    const state = (table.engine as any)?.state;
    if (!state) return;
    state.players = state.players.filter((player: any) =>
      !player.isAi && !String(player.userId).startsWith('bot_')
    );

    if (table.gameType === 'poker') {
      state.stage = 'idle';
      state.pot = 0;
      state.currentBet = 0;
      state.communityCards = [];
      state.winnerUserIds = [];
      state.winningCardIds = [];
      state.winningHandDesc = undefined;
      state.nextRoundStartsAt = null;
    } else {
      state.stage = 'round_ended';
      state.pot = 0;
      state.nextRoundStartsAt = null;
      state.winningHandDesc = undefined;
      state.dealer.cards = [];
      state.players.forEach((player: any) => {
        player.cards = [];
        player.bet = 0;
        player.score = 0;
        player.status = 'playing';
      });
    }
    state.turnStartedAt = Date.now();
  }

  public activateTable(tableId: string): CasinoTable | undefined {
    const table = this.tables.get(tableId);
    if (!table) return undefined;
    table.lastActivityAt = Date.now();
    if (table.engine) return table;

    table.engine = table.gameType === 'poker'
      ? new PokerEngine(table.id, 1, 2)
      : new BlackjackEngine(table.id);
    table.activatedAt = Date.now();
    BOT_ROSTER.forEach(([userId, username, avatarId]) => {
      table.engine!.addPlayer(userId, username, avatarId, 100, true);
    });
    const state = (table.engine as any).state;
    if (table.gameType === 'poker') {
      (table.engine as PokerEngine).startHand();
    } else if (state.stage === 'round_ended') {
      (table.engine as BlackjackEngine).startRound();
    }
    this.updateCounts(table);
    return table;
  }

  public getTables(gameType?: CasinoGameType, mode?: CasinoTableMode): CasinoTable[] {
    const result = Array.from(this.tables.values()).filter((table) =>
      (!gameType || table.gameType === gameType) && (!mode || table.mode === mode)
    );
    result.forEach((table) => this.updateCounts(table));
    return result;
  }

  public getTable(id: string): CasinoTable | undefined {
    return this.tables.get(id);
  }

  public openTable(id: string): CasinoTable | undefined {
    return this.activateTable(id);
  }

  /** Restores only a server-created snapshot; clients never supply this. */
  public restoreRuntime(id: string, state: unknown, lastActivityAt = Date.now()): CasinoTable | undefined {
    const table = this.activateTable(id);
    if (!table?.engine || !state || typeof state !== 'object') return table;
    const restored = state as { id?: unknown; players?: unknown };
    if (restored.id !== table.id || !Array.isArray(restored.players)) return table;
    (table.engine as any).state = restored;
    table.activatedAt = lastActivityAt;
    table.lastActivityAt = lastActivityAt;
    this.updateCounts(table);
    return table;
  }

  public getRuntimeState(id: string) {
    const table = this.tables.get(id);
    return table?.engine ? (table.engine as any).state : null;
  }

  public touchTable(id: string) {
    const table = this.tables.get(id);
    if (table) table.lastActivityAt = Date.now();
    return table;
  }

  /** Check capacity before a durable wallet transaction is attempted. */
  public canJoinTable(tableId: string, userId: string) {
    const table = this.activateTable(tableId);
    if (!table?.engine) return false;
    const players = (table.engine as any).state.players as Array<{ userId: string }>;
    return players.some((player) => player.userId === userId) || players.length < table.maxPlayers;
  }

  public joinTable(tableId: string, userId: string, username: string, avatarId: string, chips: number) {
    const table = this.activateTable(tableId);
    if (!table?.engine) throw new Error('Table not found');
    const state = (table.engine as any).state;
    const existingIndex = state.players.findIndex((player: any) => player.userId === userId);
    const existing = existingIndex >= 0 ? state.players[existingIndex] : undefined;
    if (existing) {
      // Leaving during a hand deliberately keeps a folded/disconnected player
      // until that hand is safe to resolve. A later explicit buy-in is a new
      // seat, not a reconnect to the zero-stack shell left by removePlayer.
      if (existing.isConnected === false || existing.eliminated) {
        state.players.splice(existingIndex, 1);
      } else {
        existing.isConnected = true;
        existing.lastSeenAt = Date.now();
        existing.presenceExpiresAt = Date.now() + 60_000;
        this.updateCounts(table);
        return { table, joined: false, alreadySeated: true };
      }
    }
    this.updateCounts(table);
    if (table.humanPlayersCount === 0) {
      this.removeBotsForHumanTable(table);
      this.updateCounts(table);
    }
    if (table.playersCount >= table.maxPlayers) throw new Error('Table is full');
    table.engine.addPlayer(userId, username, avatarId, chips, false);
    const joinedPlayer = state.players.find((player: any) => player.userId === userId);
    if (joinedPlayer) {
      joinedPlayer.lastSeenAt = Date.now();
      joinedPlayer.presenceExpiresAt = Date.now() + 60_000;
    }
    table.lastActivityAt = Date.now();
    this.updateCounts(table);
    return { table, joined: true, alreadySeated: false };
  }

  public leaveTable(tableId: string, userId: string): { chips: number; mode: CasinoTableMode } | null {
    const table = this.tables.get(tableId);
    if (!table?.engine) return null;
    const state = (table.engine as any).state;
    if (!state.players.some((player: any) => player.userId === userId)) return null;
    const chips = table.engine.removePlayer(userId);
    table.lastActivityAt = Date.now();
    this.updateCounts(table);
    return { chips, mode: table.mode };
  }

  public getLeaveQuote(tableId: string, userId: string): { chips: number; mode: CasinoTableMode } | null {
    const table = this.tables.get(tableId);
    if (!table?.engine) return null;
    const player = (table.engine as any).state.players.find((entry: any) => entry.userId === userId);
    return player && !player.isAi ? { chips: Math.max(0, Math.floor(Number(player.chips) || 0)), mode: table.mode } : null;
  }

  public releaseDormantRuntimes(now = Date.now(), idleMs = 60_000): string[] {
    const released: string[] = [];
    this.tables.forEach((table) => {
      if (!table.engine || now - table.lastActivityAt < idleMs) return;
      this.updateCounts(table);
      if (table.humanPlayersCount === 0) {
        table.engine = null;
        table.activatedAt = null;
        table.playersCount = 0;
        table.humanPlayersCount = 0;
        released.push(table.id);
      }
    });
    return released;
  }
}

export const casinoManager = new CasinoManager();
