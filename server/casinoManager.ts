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
    this.initializeTables();
  }

  private initializeTables() {
    const configs = [
      { gameType: 'poker', mode: 'free', minBuyIn: 100, maxPlayers: 10 },
      { gameType: 'poker', mode: 'public', minBuyIn: 50, maxPlayers: 10 },
      { gameType: 'poker', mode: 'practice', minBuyIn: 100, maxPlayers: 10 },
      { gameType: 'blackjack', mode: 'free', minBuyIn: 100, maxPlayers: 4 },
      { gameType: 'blackjack', mode: 'public', minBuyIn: 50, maxPlayers: 4 },
      { gameType: 'blackjack', mode: 'practice', minBuyIn: 100, maxPlayers: 4 }
    ] as const;

    for (const config of configs) {
      for (let i = 1; i <= 3; i++) {
        const id = `table-${config.gameType}-${config.mode}-${i}`;
        const name = String(i);
        
        const engine = config.gameType === 'poker' 
          ? new PokerEngine(id, config.minBuyIn / 10, config.minBuyIn / 5) 
          : new BlackjackEngine(id);
        
        const table: CasinoTable = {
          id,
          name,
          gameType: config.gameType,
          mode: config.mode,
          minBuyIn: config.minBuyIn,
          playersCount: 0,
          maxPlayers: config.maxPlayers,
          engine
        };
        this.tables.set(id, table);
      }
    }
  }

  public getTables(gameType?: 'poker' | 'blackjack', mode?: 'public' | 'free' | 'practice'): CasinoTable[] {
    const arr = Array.from(this.tables.values()).filter(t => 
      (!gameType || t.gameType === gameType) && 
      (!mode || t.mode === mode)
    );
    // dynamically compute true players count
    arr.forEach(t => {
      const state = (t.engine as any).state;
      t.playersCount = state && state.players ? state.players.length : 0;
    });
    return arr;
  }

  public getTable(id: string): CasinoTable | undefined {
    return this.tables.get(id);
  }

  public joinTable(tableId: string, userId: string, username: string, avatarId: string, chips: number, isAi: boolean = false) {
    const table = this.tables.get(tableId);
    if (!table) throw new Error("Table not found");
    
    const state = (table.engine as any).state;
    const playerExisted = state && state.players && state.players.some((p: any) => p.userId === userId);
    
    // dynamically compute true players count
    table.playersCount = state && state.players ? state.players.length : 0;
    if (!playerExisted && table.playersCount >= table.maxPlayers) throw new Error("Table is full");
    if (isAi && (table.mode === 'public' || table.mode === 'free')) {
      throw new Error("AI is not allowed on public/free tables");
    }

    table.engine.addPlayer(userId, username, avatarId, chips, isAi);
    
    // update count
    table.playersCount = state && state.players ? state.players.length : 0;

    // Auto-start game if waiting
    if (table.gameType === 'poker') {
      if (state.stage === 'idle' || state.stage === 'ended' || state.stage === 'match_ended') {
        const activePlayers = state.players.filter((p: any) => !p.eliminated && p.chips > 0);
        const realPlayersCount = activePlayers.filter((p: any) => !p.isAi).length;
        if (activePlayers.length >= 2 && (table.mode === 'practice' || realPlayersCount >= 2)) {
          (table.engine as any).startHand();
        }
      }
    } else if (table.gameType === 'blackjack') {
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
    table.playersCount = state && state.players ? state.players.length : 0;
    
    if (playerExisted) {
      return { chips: remainingChips, mode: table.mode };
    }
    
    return null;
  }
}

export const casinoManager = new CasinoManager();
