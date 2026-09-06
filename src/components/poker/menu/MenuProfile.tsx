import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ResistanceAvatar } from '../ResistanceAvatar';
import { ChipValue } from '../PokerTable';
import { MenuIcon } from './MenuIcon';
import type { AvatarId } from '../../../types';
import { LanguageSwitch, useLanguage } from '../../../i18n/LanguageProvider';

export function MenuProfile({bannerTarget, name, photoUrl, avatar, level, xp, xpNeeded, tickets, chips, children}: {
  bannerTarget?: 'uno' | 'poker' | 'blackjack';
  name: string; photoUrl?: string; avatar: AvatarId; level: number; xp: number; xpNeeded: number; tickets: number; chips: number; children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const [toolsTarget, setToolsTarget] = useState<HTMLElement | null>(null);
  const toolsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const findTarget = () => {
      const target = bannerTarget ? document.querySelector<HTMLElement>(`[data-menu-banner="${bannerTarget}"]`) : document.getElementById('redo-lobby-tools');
      if (target) { setToolsTarget(target); return true; }
      return false;
    };
    if (findTarget()) return;
    const root = document.querySelector('.rp-main-menu');
    if (!root) return;
    const observer = new MutationObserver(() => { if (findTarget()) observer.disconnect(); });
    observer.observe(root, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, [bannerTarget]);
  useEffect(() => {
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !toolsRef.current?.contains(event.target as Node)) {
        if (toolsRef.current?.open) {
          toolsRef.current.open = false;
          if (event instanceof KeyboardEvent) toolsRef.current.querySelector('summary')?.focus();
        }
      }
    };
    document.addEventListener('keydown', close); document.addEventListener('pointerdown', close);
    return () => {document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close);};
  }, []);
  const tools = <details ref={toolsRef} className="rp-menu-tools">
    <summary aria-label={t('Account menu')}><MenuIcon name="menu" /></summary>
    <div className="rp-menu-tools__panel"><strong>{t('ACCOUNT & SETTINGS')}</strong><LanguageSwitch />{children}</div>
  </details>;
  return <>
    {toolsTarget ? createPortal(tools, toolsTarget) : tools}
    <section className="rp-menu-profile" aria-label={t('Player account')}>
      <div className="rp-menu-profile__avatar"><ResistanceAvatar name={name} photoUrl={photoUrl} fallbackAvatar={avatar} size={60} /></div>
      <div className="rp-menu-profile__identity">
        <strong title={name}>{name}</strong>
        <div className="rp-menu-profile__level"><span>{t('LVL')} {level}</span><progress aria-label={t('Level XP')} max={xpNeeded} value={xp} /><span>{xp} / {xpNeeded} XP</span></div>
      </div>
      <div className="rp-menu-profile__funds">
        <div><span>TKT</span><strong><MenuIcon name="ticket" />{tickets}</strong></div>
        <div><span>{t('BAL')}</span><ChipValue amount={chips} iconClassName="rp-menu-currency" /></div>
      </div>
    </section>
  </>;
}
