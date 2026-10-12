import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { translations, LOCALES } from '../i18n/translations';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'imizi:lang';

function isValidLocale(value) {
  return typeof value === 'string' && !!translations[value];
}

function getInitialLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (isValidLocale(saved)) return saved;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  if (translations[browser]) return browser;
  return 'en';
}

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(getInitialLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  const t = useCallback(
    (key, params) => {
      let str = translations[locale]?.[key] ?? translations.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replaceAll(`{${k}}`, v);
        }
      }
      return str;
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      locales: LOCALES,
    }),
    [locale, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// Mounted inside AuthProvider (see App.jsx). Two-way sync between this
// device's language and the user's profile so the preference follows them
// across devices:
//  - pull: when a session arrives, the profile's language wins over this
//    device's localStorage (unless a local change is still being pushed),
//  - push: while logged in, every switch is PATCHed to /auth/me; guests keep
//    the device-local behaviour with no network calls.
export function AuthenticatedLanguageSync() {
  const { locale, setLocale } = useLanguage();
  const { user } = useAuth();
  const pendingLanguage = useRef(null);
  const prevLocale = useRef(locale);

  // Pull the profile's language when a session becomes available.
  useEffect(() => {
    if (!user) return;
    const serverLanguage = user.language;
    if (isValidLocale(serverLanguage) && !pendingLanguage.current) {
      setLocale((current) => (current === serverLanguage ? current : serverLanguage));
    }
  }, [user, setLocale]);

  // Push local switches to the profile while logged in. Fires only on genuine
  // locale changes, never on session arrival - otherwise the stale pre-pull
  // locale would overwrite the profile value we are about to adopt.
  useEffect(() => {
    const changed = prevLocale.current !== locale;
    prevLocale.current = locale;
    if (!user || !changed) return undefined;

    pendingLanguage.current = locale;
    let cancelled = false;
    api.patch('/auth/me', { language: locale })
      .catch(() => {
        // Offline or unauthorized: the device keeps its localStorage choice
        // and the change is retried by the next switch after login.
      })
      .finally(() => {
        if (!cancelled) pendingLanguage.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [user, locale]);

  return null;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
