import type { CSSProperties, Key } from 'react';
import { useLanguage } from '../../../i18n/LanguageProvider';
import { translateGameLabel } from '../../../i18n/gameLabels';
import { translateTableEvent } from '../../../i18n/tableEvent';
import type { TableCue } from './presentation';

export function TableAnnouncement({ cue }: { cue: TableCue; key?: Key }) {
  const { tr } = useLanguage();
  const system = ['READY?', 'GAME START!', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN', 'POT CAPTURED'].includes(cue.label);
  return <div className={`rp-event-cue${cue.impact ? ' rp-event-cue--impact' : ''}`}
    style={{ '--cue-duration': `${cue.end - cue.start}ms`, '--cue-elapsed': `${-Math.max(0, performance.now() - cue.start)}ms` } as CSSProperties}>
    <span>{system ? translateTableEvent(translateGameLabel(cue.detail, tr), tr) : cue.detail}</span>
    <strong>{translateGameLabel(cue.label, tr)}</strong>
    <i className="rp-event-cue__lifetime" aria-hidden="true" />
  </div>;
}
