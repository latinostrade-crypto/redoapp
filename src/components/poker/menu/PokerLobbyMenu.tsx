import React, { useMemo, useState } from 'react';
import banner from '../../../assets/resistance/poker-network-banner.lossless.webp';
import { ChipStackIcon, ChipValue } from '../PokerTable';
import { MenuIcon } from './MenuIcon';

type Table = {id: string; name?: string; minBuyIn: number; maxPlayers: number; playersCount: number; humanPlayersCount?: number};
export function PokerLobbyMenu({game = 'poker', bannerSrc = banner, mode, onMode, tables, status, balance, onRefresh, onOpen, onInvite, onPractice}: {
  game?: 'poker' | 'blackjack'; bannerSrc?: string;
  mode: string; onMode: (mode: 'public' | 'free' | 'practice') => void; tables: Table[];
  status: 'idle' | 'refreshing' | 'ready' | 'offline'; balance: number; onRefresh: () => void;
  onOpen: (table: Table) => void; onInvite: (table: Table) => void; onPractice: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [sort, setSort] = useState('default');
  const title = game === 'poker' ? 'Poker' : 'Blackjack';
  const filtered = useMemo(() => {
    const result = tables.filter(table => (!availableOnly || status !== 'ready' || table.playersCount < table.maxPlayers) && (mode !== 'public' || !affordableOnly || table.minBuyIn <= balance));
    if (sort === 'buy-in') result.sort((a,b)=>a.minBuyIn-b.minBuyIn);
    if (sort === 'players' && status === 'ready') result.sort((a,b)=>b.playersCount-a.playersCount);
    return result;
  }, [tables, availableOnly, affordableOnly, balance, sort, status, mode]);
  return <section className="rp-menu-poker" aria-label={`${title} lobby`}>
    <figure className="rp-menu-poker__banner" data-menu-banner={game}><img src={bannerSrc} width={2172} height={724} alt={game === 'poker' ? 'REDOapp Resistance Poker. Three hooded operatives. Play, resist, win. A small game, a bigger freedom.' : 'REDOapp Resistance Blackjack. Four familiar heroes in dark Resistance hoods.'} /></figure>
    <div className="rp-menu-poker__modes">
      <nav aria-label={`${title} mode`}>{(['public','free','practice'] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} onClick={()=>onMode(item)}>{item}</button>)}</nav>
      {mode !== 'practice' && <button className="rp-menu-filter" type="button" aria-expanded={filtersOpen} aria-controls="poker-filters" onClick={()=>setFiltersOpen(value=>!value)}><MenuIcon name="filter" /><span>FILTERS{availableOnly || affordableOnly || sort !== 'default' ? ' ·' : ''}</span></button>}
    </div>
    {filtersOpen && mode !== 'practice' && <div id="poker-filters" className="rp-menu-filters">
      <label><input type="checkbox" checked={availableOnly} onChange={event=>setAvailableOnly(event.target.checked)} />Available seats</label>
      {mode === 'public' && <label><input type="checkbox" checked={affordableOnly} onChange={event=>setAffordableOnly(event.target.checked)} />Within my balance</label>}
      <label>Sort<select value={sort} onChange={event=>setSort(event.target.value)}><option value="default">Table number</option><option value="buy-in">Lowest buy-in</option><option value="players">Most players</option></select></label>
      <button type="button" onClick={()=>{setAvailableOnly(false);setAffordableOnly(false);setSort('default');}}>RESET</button>
    </div>}
    {mode === 'practice' ? <div className="rp-menu-practice"><p>{game === 'poker' ? 'Practice Texas Hold’em against the Resistance AI table. No entry fee.' : 'Practice Blackjack 21 against the house. No entry fee.'}</p><button type="button" className="rp-menu-open" onClick={onPractice}><MenuIcon name={game} />PLAY {title.toUpperCase()} PRACTICE (FREE)</button></div> : <>
      <header className="rp-menu-tables-heading"><h2><MenuIcon name={game} />{mode === 'free' ? 'FREE' : 'PUBLIC'} {title.toUpperCase()} TABLES</h2><ChipValue prefix={<span>BAL</span>} amount={balance} iconClassName="rp-menu-currency" /><button type="button" aria-label={`Refresh ${game} tables`} disabled={status === 'refreshing'} onClick={onRefresh}><MenuIcon name="refresh" /></button></header>
      {mode === 'free' && <p className="rp-menu-table-status">ENTRY: 2 ENERGY · 100 PLAY CHIPS</p>}
      {status !== 'ready' && <p className="rp-menu-table-status" role="status">{status === 'offline' ? 'LIVE SEATS UNAVAILABLE · RETRY TO UPDATE' : 'UPDATING LIVE SEATS…'}</p>}
      <div className="rp-menu-table-list">{filtered.map(table=><article className="rp-menu-table" key={table.id} aria-label={`Table ${table.name || table.id.split('-').pop()}`}>
        <button type="button" className="rp-menu-table__invite" aria-label={`Invite to Table ${table.name || table.id.split('-').pop()}`} title="Invite to this table" onClick={()=>onInvite(table)}><span className="rp-menu-table__chips" aria-hidden="true"><ChipStackIcon /><ChipStackIcon style={{'--chip-color':'#727e93','--chip-top':'#b3becb'} as React.CSSProperties} /></span><span className="rp-menu-table__invite-label"><MenuIcon name="invite" />INVITE</span></button>
        <div className="rp-menu-table__name"><h3>Table {table.name || table.id.split('-').pop()}</h3><span>{table.maxPlayers} Seats{table.minBuyIn > 0 && <> · MIN <ChipValue amount={table.minBuyIn} /></>}</span></div>
        <div className="rp-menu-table__occupancy"><MenuIcon name="user" /><span><strong>{status === 'ready' ? `${table.humanPlayersCount ?? table.playersCount}/${table.maxPlayers}` : '—'}</strong><small>Players</small></span></div>
        <button type="button" className="rp-menu-open" onClick={()=>onOpen(table)}>OPEN<MenuIcon name="chevron" /></button>
      </article>)}</div>
      {filtered.length === 0 && <p className="rp-menu-table-status" role="status">No tables match these filters. Reset filters to see all tables.</p>}
    </>}
  </section>;
}
