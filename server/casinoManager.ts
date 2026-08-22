import { PokerEngine } from './pokerEngine';
import { BlackjackEngine } from './blackjackEngine';

export interface CasinoTable {
  id: string;
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
      { gameType: 'poker', mode: 'free', minBuyIn: 10, maxPlayers: 10 },
      { gameType: 'poker', mode: 'public', minBuyIn: 50, maxPlayers: 10 },
      { gameType: 'blackjack', mode: 'free', minBuyIn: 10, maxPlayers: 4 },
      { gameType: 'blackjack', mode: 'public', minBuyIn: 50, maxPlayers: 4 }
    ] as const;

    for (const config of configs) {
      const tables = this.getTables(config.gameType, config.mode);
      const hasEmptyTable = tables.some(t => t.playersCount === 0);
      if (!hasEmptyTable) {
        this.createTable(config.gameType, config.mode, config.minBuyIn, config.maxPlayers);
      }
    }
  }

  public createTable(gameType: 'poker' | 'blackjack', mode: 'public' | 'free' | 'practice', minBuyIn: number, maxPlayers: number = 10): CasinoTable {
    const id = `table-${gameType}-${mode}-${Date.now()}`;
    const engine = gameType === 'poker' ? new PokerEngine(id, minBuyIn/10, minBuyIn/5) : new BlackjackEngine(id);
    
    const table: CasinoTable = {
      id,
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

    table.engine.addPlayer(userId, username, avatarId, chips, isAi);
    table.playersCount++;
    this.ensureTables();
    return table;
  }

  public leaveTable(tableId: string, userId: string): { chips: number, mode: 'public' | 'free' | 'practice' } | null {
    const table = this.tables.get(tableId);
    if (!table) return null;

    const remainingChips = table.engine.removePlayer(userId);
    table.playersCount--;
    return { chips: remainingChips, mode: table.mode };
  }
}

export const casinoManager = new CasinoManager();
