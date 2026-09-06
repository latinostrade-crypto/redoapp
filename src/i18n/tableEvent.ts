import type { MessageKey, MessageValues } from './message';

/** Match complete server-owned templates; interpolated player names stay intact. */
export function translateTableEvent(text: string, tr: (key: MessageKey, values?: MessageValues) => string) {
  const fixed: Record<string, MessageKey> = {
    'Uncontested - All opponents folded': 'uncontestedFold',
    'Round completed! Dealing next hand...': 'roundFinishedNext',
    'ULTRA RARE! Tournament Bracelet added to your collection.': 'braceletAdded',
    'Energy boost! +5 Energy added.': 'energyFiveAdded',
    'Nice! +2 Energy added.': 'energyTwoAdded',
  };
  if (fixed[text]) return tr(fixed[text]);
  const templates: Array<[RegExp, MessageKey, string[]]> = [
    [/^RARE DROP! \+([\d.]+) TKT added to your balance\.$/, 'rareTicketsAdded', ['amount']],
    [/^🏆 (.+) WINS THE MATCH WITH ([\d.]+) CHIPS!$/, 'matchWonChips', ['name', 'chips']],
    [/^🏆 (.+) WINS WITH ([\d.]+) CHIPS!$/, 'wonChips', ['name', 'chips']],
    [/^🏆 (.+) WINS THE POKER MATCH!$/, 'pokerMatchWon', ['name']],
    [/^All opponents folded\. (.+) wins pot of ([\d.]+) chips!$/, 'foldPotWon', ['name', 'chips']],
    [/^DEALER BUSTED \((\d+)\)! Standing players win chips!$/, 'dealerBustStanding', ['score']],
    [/^Dealer score: (\d+)\. Hand (\d+)\/(\d+) complete\.$/, 'dealerHandDone', ['score', 'hand', 'total']],
    [/^Dealer busted \((\d+)\)! Hand (\d+)\/(\d+) in 6s\.\.\.$/, 'dealerBustNext', ['score', 'hand', 'total']],
    [/^Dealer won Hand (\d+) \((\d+)\)\. Hand (\d+)\/(\d+) in 6s\.\.\.$/, 'dealerWonNext', ['previous', 'score', 'hand', 'total']],
    [/^⭐ (.+) won Hand (\d+)! Dealer: (.+)\. Hand (\d+)\/(\d+) in 6s\.\.\.$/, 'playersWonNext', ['name', 'previous', 'score', 'hand', 'total']],
  ];
  for (const [pattern, key, parameters] of templates) {
    const captures = pattern.exec(text);
    if (captures) return tr(key, Object.fromEntries(parameters.map((name, index) => [name, captures[index + 1]])));
  }
  const won = /^(.+) won with (.+)!$/.exec(text);
  if (won) return tr('wonWithHand', { name: won[1], hand: translateHandDescription(won[2], tr) });
  if (text === 'Dealer reveals the hole card') return tr('dealerReveals');
  let match = /^Dealer draws \((\d+)\)$/.exec(text);
  if (match) return tr('dealerDrawScore', { score: match[1] });
  match = /^(.+) (hits|stands|doubles down)$/.exec(text);
  if (match) return tr(match[2] === 'hits' ? 'playerHits' : match[2] === 'stands' ? 'playerStands' : 'playerDoubles', { name: match[1] });
  match = /^Hand (\d+)\/(\d+) dealt with ([\d.]+) chips bet!$/.exec(text);
  if (match) return tr('handDealtBet', { hand: match[1], total: match[2], chips: match[3] });
  return translateHandDescription(text, tr);
}

/** Compatibility with existing server snapshots; no parsing of player identities. */
function translateHandDescription(text: string, tr: (key: MessageKey, values?: MessageValues) => string) {
  const rank = '(Ace|King|Queen|Jack|10|[2-9])';
  const patterns: Array<[string, MessageKey]> = [
    [`^High Card,? ${rank}$`, 'handHigh'], [`^Pair of ${rank}s$`, 'handPair'],
    [`^Two Pair, ${rank}s and ${rank}s$`, 'handTwoPair'],
    [`^Three of a Kind, ${rank}s$`, 'handThree'], [`^Four of a Kind, ${rank}s$`, 'handFour'],
    [`^Full House, ${rank}s full of ${rank}s$`, 'handFull'],
    [`^Straight, ${rank}-High$`, 'handStraight'], [`^Flush, ${rank}-High$`, 'handFlush'],
    [`^Straight Flush, ${rank}-High$`, 'handStraightFlush'],
  ];
  const symbol = (value: string) => ({ Ace: 'A', King: 'K', Queen: 'Q', Jack: 'J' }[value] || value);
  for (const [pattern, key] of patterns) {
    const match = new RegExp(pattern).exec(text);
    if (match) return tr(key, { rank: symbol(match[1]), other: symbol(match[2] || '') });
  }
  const royal = /^Royal Flush of ([♠♥♦♣])$/.exec(text);
  return royal ? tr('handRoyal', { suit: royal[1] }) : text;
}
