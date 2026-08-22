import { evaluateBlackjackHand } from '../src/utils/blackjackEvaluator';
import { PokerCard, PokerSuit } from '../src/types/poker';

export interface ServerBlackjackCard {
  id: string;
  suit: PokerSuit;
  rank: number;
  value: number;
  hidden?: boolean;
}

export interface ServerBlackjackPlayer {
  userId: string;
  username: string;
  avatarId: string;
  chips: number;
  bet: number;
  cards: ServerBlackjackCard[];
  score: number;
  isSoft: boolean;
  isBusted: boolean;
  hasBlackjack: boolean;
  status: 'playing' | 'stood' | 'busted' | 'blackjack';
  isAi?: boolean;
}

export interface ServerBlackjackGameState {
  id: string;
  shoe: ServerBlackjackCard[];
  dealer: ServerBlackjackPlayer;
  players: ServerBlackjackPlayer[];
  currentPlayerIndex: number;
  stage: 'player_turn' | 'dealer_turn' | 'round_ended' | 'match_ended';
  turnStartedAt: number;
  turnTimeoutSec: number;
  logs: Array<{ id: string; timestamp: string; message: string; type: string }>;
}

export function createShoe(decks = 4): ServerBlackjackCard[] {
  const suits: PokerSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const shoe: ServerBlackjackCard[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        const value = rank === 14 ? 11 : Math.min(10, rank);
        shoe.push({ id: `card-${d}-${suit}-${rank}`, suit, rank, value });
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export class BlackjackEngine {
  public state: ServerBlackjackGameState;
  private defaultBet = 10;

  constructor(id: string) {
    this.state = {
      id,
      shoe: createShoe(),
      dealer: {
        userId: 'dealer',
        username: 'Dealer',
        avatarId: 'fox',
        chips: 0,
        bet: 0,
        cards: [],
        score: 0,
        isSoft: false,
        isBusted: false,
        hasBlackjack: false,
        status: 'playing'
      },
      players: [],
      currentPlayerIndex: 0,
      stage: 'round_ended',
      turnStartedAt: Date.now(),
      turnTimeoutSec: 15,
      logs: []
    };
  }

  addPlayer(userId: string, username: string, avatarId: string, chips: number, isAi = false) {
    if (this.state.players.length >= 10) throw new Error("Table full");
    const isMidGame = this.state.stage !== 'match_ended' && this.state.stage !== 'round_ended';
    this.state.players.push({
      userId,
      username,
      avatarId,
      chips,
      bet: 0,
      cards: [],
      score: 0,
      isSoft: false,
      isBusted: false,
      hasBlackjack: false,
      status: isMidGame ? 'stood' : 'playing',
      isAi
    });
  }

  removePlayer(userId: string): number {
    const player = this.state.players.find(p => p.userId === userId);
    this.state.players = this.state.players.filter(p => p.userId !== userId);
    return player ? player.chips : 0;
  }

  log(msg: string) {
    this.state.logs.unshift({
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      message: msg,
      type: 'info'
    });
  }

  updatePlayerScore(p: ServerBlackjackPlayer) {
    const ev = evaluateBlackjackHand(p.cards);
    p.score = ev.score;
    p.isSoft = ev.isSoft;
    p.isBusted = ev.isBusted;
    p.hasBlackjack = ev.hasBlackjack;
    if (p.isBusted) p.status = 'busted';
    else if (p.hasBlackjack) p.status = 'blackjack';
  }

  startRound() {
    if (this.state.shoe.length < 52) {
      this.state.shoe = createShoe();
    }
    
    this.state.dealer.cards = [];
    this.state.dealer.status = 'playing';
    
    const active = this.state.players.filter(p => p.chips >= this.defaultBet);
    if (active.length === 0) return false;

    active.forEach(p => {
      p.cards = [];
      p.bet = this.defaultBet;
      p.chips -= this.defaultBet;
      p.status = 'playing';
    });

    // Deal 2 cards
    for(let i=0; i<2; i++) {
      active.forEach(p => p.cards.push(this.state.shoe.pop()!));
      this.state.dealer.cards.push(this.state.shoe.pop()!);
    }
    
    this.state.dealer.cards[1].hidden = true;

    active.forEach(p => this.updatePlayerScore(p));
    this.updatePlayerScore(this.state.dealer); // score is for open cards (will evaluate both but we hide one)
    
    this.state.stage = 'player_turn';
    this.state.currentPlayerIndex = 0;
    while(this.state.currentPlayerIndex < this.state.players.length && this.state.players[this.state.currentPlayerIndex].status !== 'playing') {
      this.state.currentPlayerIndex++;
    }

    if (this.state.currentPlayerIndex >= this.state.players.length) {
      this.startDealerTurn();
    } else {
      this.state.turnStartedAt = Date.now();
    }
    return true;
  }

  handleAction(userId: string, action: 'hit' | 'stand' | 'double') {
    const p = this.state.players[this.state.currentPlayerIndex];
    if (!p || p.userId !== userId || this.state.stage !== 'player_turn') return false;

    if (action === 'hit') {
      p.cards.push(this.state.shoe.pop()!);
      this.updatePlayerScore(p);
      this.log(`${p.username} hits. Score: ${p.score}`);
    } else if (action === 'double') {
      if (p.chips >= p.bet) {
        p.chips -= p.bet;
        p.bet *= 2;
        p.cards.push(this.state.shoe.pop()!);
        this.updatePlayerScore(p);
        p.status = p.isBusted ? 'busted' : 'stood';
        this.log(`${p.username} doubles down. Score: ${p.score}`);
      }
    } else if (action === 'stand') {
      p.status = 'stood';
      this.log(`${p.username} stands at ${p.score}.`);
    }

    if (p.status !== 'playing') {
      this.nextPlayer();
    }
    return true;
  }

  nextPlayer() {
    this.state.currentPlayerIndex++;
    while(this.state.currentPlayerIndex < this.state.players.length && this.state.players[this.state.currentPlayerIndex].status !== 'playing') {
      this.state.currentPlayerIndex++;
    }
    if (this.state.currentPlayerIndex >= this.state.players.length) {
      this.startDealerTurn();
    } else {
      this.state.turnStartedAt = Date.now();
    }
  }

  startDealerTurn() {
    this.state.stage = 'dealer_turn';
    this.state.dealer.cards[1].hidden = false;
    this.updatePlayerScore(this.state.dealer);

    while(this.state.dealer.score < 17 || (this.state.dealer.score === 17 && this.state.dealer.isSoft)) {
      this.state.dealer.cards.push(this.state.shoe.pop()!);
      this.updatePlayerScore(this.state.dealer);
    }
    
    this.state.dealer.status = this.state.dealer.isBusted ? 'busted' : 'stood';
    this.log(`Dealer finishes with ${this.state.dealer.score}.`);
    this.endRound();
  }

  endRound() {
    const ds = this.state.dealer.score;
    const db = this.state.dealer.isBusted;
    const dh = this.state.dealer.hasBlackjack;

    this.state.players.filter(p => p.cards.length > 0).forEach(p => {
      if (p.isBusted) {
        // lost
      } else if (p.hasBlackjack && !dh) {
        p.chips += p.bet + (p.bet * 1.5);
      } else if (p.hasBlackjack && dh) {
        p.chips += p.bet; // push
      } else if (db || p.score > ds) {
        p.chips += p.bet * 2;
      } else if (p.score === ds) {
        p.chips += p.bet; // push
      }
    });

    this.state.stage = 'round_ended';
  }
}
