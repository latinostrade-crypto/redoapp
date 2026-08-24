import { PokerEngine } from './pokerEngine';
import { BlackjackEngine } from './blackjackEngine';

export interface CasinoTable {
  id: string;
  name: string;
  gameType: 'poker' | 'blackjack';
  mode: 'public' | 'free' | 'practice';
  minBuyIn: number;
  playersCount: number;
  maxPlayers: number;
  engine: PokerEngine | BlackjackEngine;
}

export class CasinoManager {
  private tables: Map<string, CasinoTable> = new Map();

  constructor() {
    this.ensureTables();
  }

  public ensureTables() {
    const configs = [
      { gameType: 'poker', mode: 'free', minBuyIn: 100, maxPlayers: 10 },
      { gameType: 'poker', mode: 'public', minBuyIn: 50, maxPlayers: 10 },
      { gameType: 'poker', mode: 'practice', minBuyIn: 100, maxPlayers: 10 },
      { gameType: 'blackjack', mode: 'free', minBuyIn: 100, maxPlayers: 4 },
      { gameType: 'blackjack', mode: 'public', minBuyIn: 50, maxPlayers: 4 },
      { gameType: 'blackjack', mode: 'practice', minBuyIn: 100, maxPlayers: 4 }
    ] as const;

    for (const config of configs) {
      const allTables = this.getTables(config.gameType, config.mode);
      const targetCount = 3;
      if (allTables.length < targetCount) {
        for (let i = 0; i < targetCount - allTables.length; i++) {
          this.createTable(config.gameType, config.mode, config.minBuyIn, config.maxPlayers);
        }
      }
    }
  }

  public createTable(gameType: 'poker' | 'blackjack', mode: 'public' | 'free' | 'practice', minBuyIn: number, maxPlayers: number = 10): CasinoTable {
    const existingSameType = this.getTables(gameType, mode);
    const maxIndex = existingSameType.reduce((max, t) => Math.max(max, parseInt(t.name) || 0), 0);
    const name = String(maxIndex + 1);
    const id = `table-${gameType}-${mode}-${name}-${Date.now()}`;
    const engine = gameType === 'poker' ? new PokerEngine(id, minBuyIn/10, minBuyIn/5) : new BlackjackEngine(id);
    
    const table: CasinoTable = {
      id,
      name,
      gameType,
      mode,
      minBuyIn,
      playersCount: 0,
      maxPlayers,
      engine
    };
    this.tables.set(id, table);
    return table;
  }

  public getTables(gameType?: 'poker' | 'blackjack', mode?: 'public' | 'free' | 'practice'): CasinoTable[] {
    return Array.from(this.tables.values()).filter(t => 
      (!gameType || t.gameType === gameType) && 
      (!mode || t.mode === mode)
    );
  }

  public getTable(id: string): CasinoTable | undefined {
    return this.tables.get(id);
  }

  public joinTable(tableId: string, userId: string, username: string, avatarId: string, chips: number, isAi: boolean = false) {
    const table = this.tables.get(tableId);
    if (!table) throw new Error("Table not found");
    if (table.playersCount >= table.maxPlayers) throw new Error("Table is full");
    if (isAi && (table.mode === 'public' || table.mode === 'free')) {
      throw new Error("AI is not allowed on public/free tables");
    }

    table.engine.addPlayer(userId, username, avatarId, chips, isAi);
    table.playersCount++;

    // Auto-start game if waiting
    if (table.gameType === 'poker') {
      const state = (table.engine as any).state;
      if (state.stage === 'idle' || state.stage === 'ended' || state.stage === 'match_ended') {
        const activePlayers = state.players.filter((p: any) => !p.eliminated && p.chips > 0);
        const realPlayersCount = activePlayers.filter((p: any) => !p.isAi).length;
        if (activePlayers.length >= 2 && (table.mode === 'practice' || realPlayersCount >= 2)) {
          (table.engine as any).startHand();
        }
      }
    } else if (table.gameType === 'blackjack') {
      const state = (table.engine as any).state;
      if (state.stage === 'idle' || state.stage === 'round_ended' || state.stage === 'match_ended') {
        const activePlayers = state.players.filter((p: any) => !p.isBusted && p.chips > 0);
        if (activePlayers.length >= 1) {
          (table.engine as any).startRound();
        }
      }
    }

    return table;
  }

  public leaveTable(tableId: string, userId: string): { chips: number, mode: 'public' | 'free' | 'practice' } | null {
    const table = this.tables.get(tableId);
    if (!table) return null;

    const state = (table.engine as any).state;
    const playerExisted = state && state.players && state.players.some((p: any) => p.userId === userId);

    const remainingChips = table.engine.removePlayer(userId);
    
    if (playerExisted) {
      table.playersCount = Math.max(0, table.playersCount - 1);
      return { chips: remainingChips, mode: table.mode };
    }
    
    return null;
  }
}

export const casinoManager = new CasinoManager();
