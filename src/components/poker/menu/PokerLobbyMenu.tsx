import { useLanguage } from '../../../i18n/LanguageProvider';
import React, { useState } from 'react';
import banner from '../../../assets/resistance/poker-network-banner.lossless.webp';
import { ChipStackIcon, ChipValue } from '../PokerTable';
import { MenuIcon } from './MenuIcon';

type Table = {id: string; name?: string; minBuyIn: number; maxPlayers: number; playersCount: number; humanPlayersCount?: number};
export function PokerLobbyMenu({game = 'poker', bannerSrc = banner, mode, onMode, tables, status, balance, onRefresh, onOpen, onInvite, onPractice}: {
  game?: 'poker' | 'blackjack'; bannerSrc?: string;
  mode: string; onMode: (mode: 'public' | 'free' | 'practice') => void; tables: Table[];
  status: 'idle' | 'refreshing' | 'ready' | 'offline'; balance: number; onRefresh: () => void;
  onOpen: (table: Table) => void; onInvite: (table: Table) => void; onPractice: (botCount?: number) => void;
}) {
  const { t, tr } = useLanguage();
  const [practiceBotCount, setPracticeBotCount] = useState(() => {
    if (game !== 'poker' || typeof window === 'undefined') return 3;
    const stored = Number(window.localStorage.getItem('redoapp:poker-practice-bots'));
    return [1, 3, 5, 9].includes(stored) ? stored : 3;
  });
  const title = game === 'poker' ? 'Poker' : 'Blackjack';
  return <section className="rp-menu-poker" aria-label={tr('lobbyForGame', { game: title })}>
    <figure className="rp-menu-poker__banner" data-menu-banner={game}><img src={bannerSrc} width={2172} height={724} alt={tr(game === 'poker' ? 'pokerBannerAlt' : 'blackjackBannerAlt')} /></figure>
    <div className="rp-menu-poker__modes">
      <nav aria-label={tr('modeForGame', { game: title })}>{(['public','free','practice'] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} onClick={()=>onMode(item)}><span>{t(item)}</span></button>)}</nav>
    </div>
    {mode === 'practice' ? <div className="rp-menu-practice"><p>{game === 'poker' ? t("Practice Texas Hold’em against the Resistance AI table. No entry fee.") : t("Practice Blackjack 21 against the house. No entry fee.")}</p>
      {game === 'poker' && <fieldset className="rp-practice-bots"><legend>{t("OPPONENTS")}</legend><div role="group" aria-label={t("Number of poker opponents")}>{[1, 3, 5, 9].map(count => <button key={count} type="button" aria-pressed={practiceBotCount === count} onClick={() => { setPracticeBotCount(count); window.localStorage.setItem('redoapp:poker-practice-bots', String(count)); }}>{count}</button>)}</div></fieldset>}
      <button type="button" className="rp-menu-open" onClick={() => onPractice(game === 'poker' ? practiceBotCount : undefined)}><MenuIcon name={game} />{tr('practiceGameFree', { game: title.toUpperCase() })}</button></div> : <>
      <header className="rp-menu-tables-heading"><h2><MenuIcon name={game} />{tr(mode === 'free' ? 'freeGameTables' : 'publicGameTables', { game: title.toUpperCase() })}</h2><ChipValue prefix={<span>{t("BAL")}</span>} amount={balance} iconClassName="rp-menu-currency" /><button type="button" aria-label={tr('refreshGameTables', { game: title })} disabled={status === 'refreshing'} onClick={onRefresh}><MenuIcon name="refresh" /></button></header>
      {mode === 'free' && <p className="rp-menu-table-status rp-menu-table-status--currencies"><span>{t("ENTRY")}: 2</span><span aria-hidden="true">⚡</span><span>· 100</span><ChipStackIcon className="w-4 h-4" /></p>}
      {status !== 'ready' && <p className="rp-menu-table-status" role="status">{status === 'offline' ? t("LIVE SEATS UNAVAILABLE · RETRY TO UPDATE") : t("UPDATING LIVE SEATS…")}</p>}
      <div className="rp-menu-table-list">{tables.map(table=><article className="rp-menu-table" key={table.id} aria-label={tr('tableNamed', { name: table.name || table.id.split('-').pop() || '' })}>
        <div className="rp-menu-table__name"><h3><span className="rp-menu-table__chips" aria-hidden="true"><ChipStackIcon /><ChipStackIcon style={{'--chip-color':'#727e93','--chip-top':'#b3becb'} as React.CSSProperties} /></span>{t("Table")} {table.name || table.id.split('-').pop()}</h3><div className="rp-menu-table__meta"><span>{table.maxPlayers} {t("Seats")}{table.minBuyIn > 0 && <> · {tr('minimumShort')} <ChipValue amount={table.minBuyIn} /></>}</span><button type="button" className="rp-menu-table__invite" aria-label={tr('inviteTableNamed', { name: table.name || table.id.split('-').pop() || '' })} title={t("Invite to this table")} onClick={()=>onInvite(table)}><MenuIcon name="invite" />{t("INVITE")}</button></div></div>
        <div className="rp-menu-table__occupancy"><MenuIcon name="user" /><span><strong>{status === 'ready' ? `${table.humanPlayersCount ?? table.playersCount}/${table.maxPlayers}` : '—'}</strong><small>{t("Players")}</small></span></div>
        <button type="button" className="rp-menu-open" onClick={()=>onOpen(table)}>{t("OPEN")}<MenuIcon name="chevron" /></button>
      </article>)}</div>
      {tables.length === 0 && <p className="rp-menu-table-status" role="status">{t("No tables available right now.")}</p>}
    </>}
  </section>;
}
