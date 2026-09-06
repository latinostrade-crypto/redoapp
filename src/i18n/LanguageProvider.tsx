import React, { useEffect, useMemo } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { i18n, languageStorageKey, type Language } from './instance';
import type { gameMessages } from './gameMessages';
import { renderUiMessage, type UiMessage } from './message';

export type { Language } from './instance';
export type GameMessageKey = keyof typeof gameMessages;

function LanguageEffects() {
  const { i18n: instance } = useTranslation('common');
  const language = instance.resolvedLanguage === 'ru' ? 'ru' : 'en';
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(languageStorageKey, language); } catch { /* Optional persistence. */ }
  }, [language]);
  useEffect(() => () => { document.documentElement.lang = 'en'; }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === languageStorageKey || event.key === null) {
        void instance.changeLanguage(event.newValue === 'ru' ? 'ru' : 'en');
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [instance]);
  return null;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={i18n}><LanguageEffects />{children}</I18nextProvider>;
}

export function useLanguage(): {
  language: Language;
  locale: 'ru-RU' | 'en-US';
  setLanguage: (language: Language) => void;
  t: (text: string) => string;
  tr: (key: GameMessageKey, values?: Record<string, string | number>) => string;
  renderMessage: (value: UiMessage) => string;
  renderError: (value: UiMessage) => string;
} {
  const { i18n: instance } = useTranslation('common', { useSuspense: false });
  const language: Language = instance.resolvedLanguage === 'ru' ? 'ru' : 'en';
  return useMemo(() => ({
    language,
    locale: language === 'ru' ? 'ru-RU' : 'en-US',
    setLanguage: (next: Language) => { void instance.changeLanguage(next); },
    // Compatibility for the first lobby translations, migrated separately.
    t: (text: string) => String(instance.t(text, { lng: language, ns: 'common', defaultValue: text })),
    tr: (key: GameMessageKey, values?: Record<string, string | number>) =>
      String(instance.t(key, { ...values, lng: language, ns: 'game' })),
    renderMessage: (value: UiMessage) => typeof value === 'string'
      ? String(instance.t(value, { lng: language, ns: 'server', defaultValue: value }))
      : renderUiMessage(value, (key, values) =>
        String(instance.t(key, { ...values, lng: language, ns: 'game' }))),
    renderError: (value: UiMessage) => {
      if (typeof value !== 'string') return renderUiMessage(value, (key, values) =>
        String(instance.t(key, { ...values, lng: language, ns: 'game' })));
      if (!value) return '';
      if (instance.exists(value, { lng: language, ns: 'server' }))
        return String(instance.t(value, { lng: language, ns: 'server' }));
      // Unknown upstream diagnostics are not UI copy; avoid displaying raw
      // implementation errors or guessing their cause. Classification remains
      // in the request handler, against the original error object.
      return String(instance.t('requestFailedRetry', { lng: language, ns: 'game' }));
    },
  }), [instance, language]);
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return <button type="button" className="language-switch" lang={language === 'en' ? 'ru' : 'en'}
    aria-label={language === 'en' ? 'Переключить на русский' : 'Switch to English'}
    onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}>
    <span aria-hidden="true">{language === 'en' ? 'EN → RU' : 'RU → EN'}</span>
  </button>;
}

/** Reactive shell copy usable inside the class-based root error boundary. */
export function CommonText({ text }: { text: string }) {
  const { t } = useLanguage();
  return <>{t(text)}</>;
}
