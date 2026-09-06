import { createInstance } from 'i18next';
import { ru } from './ru';

export type Language = 'en' | 'ru';
export const languageStorageKey = 'redoapp_language';

function initialLanguage(): Language {
  try { return localStorage.getItem(languageStorageKey) === 'ru' ? 'ru' : 'en'; }
  catch { return 'en'; }
}

export const i18n = createInstance();
// Shell resources are synchronous; the lazy game entry owns its own catalogs.
void i18n.init({
  lng: initialLanguage(), fallbackLng: 'en', supportedLngs: ['en', 'ru'],
  defaultNS: 'common', ns: ['common'], keySeparator: false, nsSeparator: false,
  interpolation: { escapeValue: false }, // React escapes rendered text.
  resources: {
    en: { common: Object.fromEntries(Object.keys(ru).map(key => [key, key])) },
    ru: { common: ru },
  },
});
