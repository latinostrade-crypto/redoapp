import { evaluate7CardHand } from '../src/utils/pokerEvaluator';
import { PokerCard, PokerSuit } from '../src/types/poker';
import { randomInt } from 'node:crypto';
import { buildPokerSidePots, calculatePokerPotAwards, pokerPotTransferKind } from './pokerPots';

export type ServerPokerStage = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';

export interface ServerPokerPlayer {
  userId: string;
  username: string;
  avatarId: string;
  chips: number;
  /** Original bankroll for this seat; used to settle a cash-game profit on exit. */
  tableBuyInChips?: number;
  currentBet: number;
  totalMatchInvested: number;
  holeCards: PokerCard[];
  folded: boolean;
  isAllIn: boolean;
  hasActedThisStage: boolean;
  eliminated: boolean;
  handScore?: number;
  handDesc?: string;
  isAi?: boolean;
  isConnected?: boolean;
}

export interface ServerPokerGameState {
  id: string;
  deck: PokerCard[];
  communityCards: PokerCard[];
  stage: ServerPokerStage;
  pot: number;
  sidePots?: Array<{ amount: number; eligibleUserIds: string[] }>;
  chipAwards?: Array<{ userId: string; amount: number; potIndex: number; kind: 'win' | 'return' }>;
  visualEpoch?: number;
  currentBet: number;
  minRaise: number;
  players: ServerPokerPlayer[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  currentPlayerIndex: number;
  smallBlindAmount: number;
  bigBlindAmount: number;
  winnerUserIds: string[];
  winningCardIds: string[];
  winningHandDesc?: string;
  logs: Array<{ id: string; timestamp: string; message: string; type: string }>;
  turnStartedAt: number;
  turnTimeoutSec: number;
}

export function createShuffledDeck(): PokerCard[] {
  const suits: PokerSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const deck: PokerCard[] = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ id: `card-${suit}-${rank}`, suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export class PokerEngine {
  public state: ServerPokerGameState;

  constructor(id: string, smallBlind: number, bigBlind: number) {
    this.state = {
      id,
      deck: [],
      communityCards: [],
      stage: 'ended',
      pot: 0,
      currentBet: 0,
      minRaise: bigBlind,
      players: [],
      dealerIndex: 0,
      smallBlindIndex: 0,
      bigBlindIndex: 0,
      currentPlayerIndex: 0,
      smallBlindAmount: smallBlind,
      bigBlindAmount: bigBlind,
      winnerUserIds: [],
      winningCardIds: [],
      logs: [],
      turnStartedAt: Date.now(),
      turnTimeoutSec: 15,
    };
  }

  addPlayer(userId: string, username: string, avatarId: string, chips: number, isAi = false) {
    const existing = this.state.players.find(p => p.userId === userId);
    if (existing) {
      existing.isConnected = true;
      existing.chips += chips;
      existing.username = username;
      existing.avatarId = avatarId;
      return;
    }

    if (this.state.players.length >= 10) throw new Error("Table full");
    const isMidGame = this.state.stage !== 'ended';
    this.state.players.push({
      userId,
      username,
      avatarId,
      chips,
      tableBuyInChips: isAi ? 0 : chips,
      currentBet: 0,
      totalMatchInvested: 0,
      holeCards: [],
      folded: isMidGame,
      isAllIn: false,
      hasActedThisStage: isMidGame,
      eliminated: false,
      isAi,
      isConnected: true
    });
  }

  removePlayer(userId: string): number {
    const pIdx = this.state.players.findIndex(p => p.userId === userId);
    if (pIdx === -1) return 0;
    const player = this.state.players[pIdx];

    if (this.state.stage === 'ended') {
      this.state.players.splice(pIdx, 1);
      const refund = player.chips;
      player.chips = 0;
      return refund;
    }

    // Mid-game removal (disconnect / leave)
    player.isConnected = false;
    player.folded = true;
    player.eliminated = true;
    
    // A departure can leave no eligible players (two users leave at nearly
    // the same time) or exactly one winner. Resolve that state immediately;
    // waiting for a no-longer-valid turn used to reach showdown with [] and
    // crash the Node process.
    const remainingActive = this.state.players.filter((entry) =>
      !entry.folded && !entry.eliminated && entry.isConnected !== false
    );
    if (remainingActive.length <= 1) {
      this.doShowdown();
    // Fast-forward turn if it was their turn.
    } else if (pIdx === this.state.currentPlayerIndex) {
      player.hasActedThisStage = true;
      this.advanceTurn();
    }
    
    const refund = player.chips;
    player.chips = 0;
    return refund;
  }

  log(msg: string, type = 'info') {
    this.state.logs.unshift({
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      message: msg,
      type
    });
  }

  startHand() {
    this.state.players = this.state.players.filter(p => p.isConnected !== false);
    const activePlayers = this.state.players.filter(p => !p.eliminated && p.chips > 0);
    if (activePlayers.length < 2) return false;

    this.state.deck = createShuffledDeck();
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.chipAwards = [];
    this.state.visualEpoch = (this.state.visualEpoch || 0) + 1;
    this.state.currentBet = this.state.bigBlindAmount;
    this.state.minRaise = this.state.bigBlindAmount;
    this.state.winnerUserIds = [];
    this.state.winningCardIds = [];
    this.state.winningHandDesc = '';
    this.state.stage = 'preflop';

    // Move dealer button
    this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    while(this.state.players[this.state.dealerIndex].eliminated || this.state.players[this.state.dealerIndex].chips <= 0) {
      this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    }

    // Reset players
    this.state.players.forEach(p => {
      p.currentBet = 0;
      p.totalMatchInvested = 0;
      p.holeCards = [];
      p.folded = p.eliminated || p.chips <= 0;
      p.isAllIn = false;
      p.hasActedThisStage = false;
    });

    // Deal cards
    activePlayers.forEach(p => {
      p.holeCards = [this.state.deck.pop()!, this.state.deck.pop()!];
    });

    // Blinds
    const getNextActive = (idx: number) => {
      let next = (idx + 1) % this.state.players.length;
      while (this.state.players[next].folded) {
        next = (next + 1) % this.state.players.length;
      }
      return next;
    };

    this.state.smallBlindIndex = activePlayers.length === 2 ? this.state.dealerIndex : getNextActive(this.state.dealerIndex);
    this.state.bigBlindIndex = getNextActive(this.state.smallBlindIndex);

    const sbPlayer = this.state.players[this.state.smallBlindIndex];
    const bbPlayer = this.state.players[this.state.bigBlindIndex];

    const actualSb = Math.min(sbPlayer.chips, this.state.smallBlindAmount);
    sbPlayer.chips -= actualSb;
    sbPlayer.currentBet = actualSb;
    sbPlayer.totalMatchInvested += actualSb;
    this.state.pot += actualSb;
    if (sbPlayer.chips === 0) sbPlayer.isAllIn = true;

    const actualBb = Math.min(bbPlayer.chips, this.state.bigBlindAmount);
    bbPlayer.chips -= actualBb;
    bbPlayer.currentBet = actualBb;
    bbPlayer.totalMatchInvested += actualBb;
    this.state.pot += actualBb;
    if (bbPlayer.chips === 0) bbPlayer.isAllIn = true;

    this.state.currentPlayerIndex = getNextActive(this.state.bigBlindIndex);
    this.state.turnStartedAt = Date.now();
    this.log(`Hand started. Dealer: ${this.state.players[this.state.dealerIndex].username}`, 'deal');
    return true;
  }

  handleAction(userId: string, action: 'fold' | 'call' | 'raise', raiseAmount: number = 0) {
    const pIdx = this.state.players.findIndex(p => p.userId === userId);
    if (pIdx !== this.state.currentPlayerIndex || this.state.players[pIdx].folded) return false;
    
    const p = this.state.players[pIdx];
    
    if (action === 'fold') {
      p.folded = true;
      this.log(`${p.username} folded.`, 'fold');
    } else if (action === 'call') {
      const toCall = this.state.currentBet - p.currentBet;
      const actualCall = Math.min(p.chips, toCall);
      p.chips -= actualCall;
      p.currentBet += actualCall;
      p.totalMatchInvested += actualCall;
      this.state.pot += actualCall;
      if (p.chips === 0) p.isAllIn = true;
      this.log(`${p.username} called ${actualCall}.`, 'action');
    } else if (action === 'raise') {
      const toCall = this.state.currentBet - p.currentBet;
      const totalRaise = toCall + raiseAmount;
      const actualRaise = Math.min(p.chips, totalRaise);
      
      p.chips -= actualRaise;
      p.currentBet += actualRaise;
      p.totalMatchInvested += actualRaise;
      this.state.pot += actualRaise;
      
      if (p.currentBet > this.state.currentBet) {
         this.state.minRaise = p.currentBet - this.state.currentBet;
         this.state.currentBet = p.currentBet;
         // Reset acts
         this.state.players.forEach(op => { if(!op.folded && !op.isAllIn) op.hasActedThisStage = false; });
      }
      
      if (p.chips === 0) p.isAllIn = true;
      this.log(`${p.username} raised to ${p.currentBet}.`, 'bet');
    }
    
    p.hasActedThisStage = true;
    this.advanceTurn();
    return true;
  }

  advanceTurn() {
    const active = this.state.players.filter(p => !p.folded && !p.eliminated && p.isConnected !== false);
    if (active.length <= 1) {
      this.doShowdown();
      return;
    }

    const needsAction = active.some(p => !p.isAllIn && (!p.hasActedThisStage || p.currentBet < this.state.currentBet));
    
    if (!needsAction) {
      // Advance stage
      this.state.players.forEach(p => { p.currentBet = 0; p.hasActedThisStage = false; });
      this.state.currentBet = 0;
      this.state.minRaise = this.state.bigBlindAmount;
      
      if (this.state.stage === 'preflop') {
        this.state.stage = 'flop';
        this.state.communityCards.push(this.state.deck.pop()!, this.state.deck.pop()!, this.state.deck.pop()!);
        this.log(`Flop dealt.`, 'deal');
      } else if (this.state.stage === 'flop') {
        this.state.stage = 'turn';
        this.state.communityCards.push(this.state.deck.pop()!);
        this.log(`Turn dealt.`, 'deal');
      } else if (this.state.stage === 'turn') {
        this.state.stage = 'river';
        this.state.communityCards.push(this.state.deck.pop()!);
        this.log(`River dealt.`, 'deal');
      } else if (this.state.stage === 'river') {
        this.doShowdown();
        return;
      }

      const notAllIn = active.filter(p => !p.isAllIn);
      if (notAllIn.length <= 1) {
        // Fast forward to showdown
        while(this.state.stage !== 'showdown' && this.state.stage !== 'ended') {
          if (this.state.stage === 'flop') {
            this.state.communityCards.push(this.state.deck.pop()!);
            this.state.stage = 'turn';
          } else if (this.state.stage === 'turn') {
            this.state.communityCards.push(this.state.deck.pop()!);
            this.state.stage = 'river';
          } else {
            break;
          }
        }
        this.doShowdown();
        return;
      }
      
      // Start betting from SB
      let next = this.state.smallBlindIndex;
      while (this.state.players[next].folded || this.state.players[next].isAllIn) {
        next = (next + 1) % this.state.players.length;
      }
      this.state.currentPlayerIndex = next;
    } else {
      let next = (this.state.currentPlayerIndex + 1) % this.state.players.length;
      while (this.state.players[next].folded || this.state.players[next].isAllIn) {
        next = (next + 1) % this.state.players.length;
      }
      this.state.currentPlayerIndex = next;
    }
    
    this.state.turnStartedAt = Date.now();
  }

  doShowdown() {
    this.state.stage = 'showdown';
    const active = this.state.players.filter(p => !p.folded && !p.eliminated && p.isConnected !== false);

    // It is valid for every participant to leave/disconnect in one tick.
    // There is no winner to evaluate, but the hand must still close cleanly.
    if (active.length === 0) {
      this.state.winnerUserIds = [];
      this.state.winningCardIds = [];
      this.state.winningHandDesc = 'Hand cancelled';
      this.state.pot = 0;
      this.log('Hand cancelled because all players left the table.', 'info');
      this.state.stage = 'ended';
      this.state.turnStartedAt = Date.now();
      return;
    }
    
    if (active.length === 1) {
      const winner = active[0];
      winner.chips += this.state.pot;
      this.state.sidePots = [{ amount: this.state.pot, eligibleUserIds: [winner.userId] }];
      const returned = Math.max(0, winner.totalMatchInvested - Math.max(0, ...this.state.players.filter(p => p !== winner).map(p => p.totalMatchInvested)));
      this.state.chipAwards = [
        { userId: winner.userId, amount: this.state.pot - returned, potIndex: 0, kind: 'win' as const },
        { userId: winner.userId, amount: returned, potIndex: 0, kind: 'return' as const },
      ].filter(a => a.amount > 0);
      this.state.winnerUserIds = [winner.userId];
      this.log(`${winner.username} wins ${this.state.pot} (everyone else folded).`, 'win');
    } else {
      // Evaluate hands
      active.forEach(p => {
        const ev = evaluate7CardHand([...p.holeCards, ...this.state.communityCards]);
        p.handScore = ev.score;
        p.handDesc = ev.description;
      });
      
      active.sort((a, b) => (b.handScore || 0) - (a.handScore || 0));
      this.state.sidePots = buildPokerSidePots(this.state.players);
      this.state.chipAwards = [];
      this.state.sidePots.forEach((pot, potIndex) => {
        const split = calculatePokerPotAwards(pot, active.map(p => ({ userId: p.userId, handScore: p.handScore || 0, seatIndex: this.state.players.indexOf(p) })), this.state.dealerIndex, this.state.players.length);
        split.awards.forEach((amount, userId) => {
          active.find(p => p.userId === userId)!.chips += amount;
          this.state.chipAwards!.push({ userId, amount, potIndex, kind: pokerPotTransferKind(this.state.players, potIndex) });
        });
      });
      this.state.winnerUserIds = [...new Set(this.state.chipAwards.filter(a => a.kind === 'win').map(a => a.userId))];
      this.state.winningHandDesc = active[0].handDesc;
      this.log(`${this.state.winnerUserIds.map(id => active.find(p => p.userId === id)!.username).join(', ')} wins with ${this.state.winningHandDesc}.`, 'win');
    }
    
    this.state.stage = 'ended';
  }
}
