import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'imizi:theme';        // explicit choice only: 'light' | 'dark'
const LEGACY_MANUAL_KEY = 'imizi:theme-manual'; // set by older builds when the user picked
const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme() {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Returns 'system', 'light' or 'dark'. No stored value means "follow the
 * browser", which is the default for everyone.
 *
 * Older builds wrote the system-derived theme into STORAGE_KEY on every load,
 * so an entry there without LEGACY_MANUAL_KEY is not a real choice.
 */
function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (localStorage.getItem(LEGACY_MANUAL_KEY) && (saved === 'light' || saved === 'dark')) {
      return saved;
    }
  } catch {
    // Storage disabled (private mode, blocked cookies): follow the browser.
  }
  return 'system';
}

// One-time cleanup of the old auto-persisted value so returning visitors start
// following the browser again instead of being stuck on their last visit's
// theme. Idempotent, safe to run on every mount.
function clearLegacySystemTheme() {
  try {
    if (!localStorage.getItem(LEGACY_MANUAL_KEY)) localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up.
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    clearLegacySystemTheme();
    return readPreference();
  });
  // Holds 'light' | 'dark' - the live browser/OS appearance, not a boolean.
  const [system, setSystem] = useState(systemTheme);

  const theme = preference === 'system' ? system : preference;

  // Keep following the browser while the tab stays open: flipping the OS or
  // browser appearance updates the app without a reload.
  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return undefined;
    const handler = (event) => setSystem(event.matches ? 'dark' : 'light');
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler); // Safari < 14
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Keep other tabs of the app in sync when one of them changes the theme.
  useEffect(() => {
    let timer;
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY && event.key !== LEGACY_MANUAL_KEY) return;
      // A choice writes two keys in a row; wait for both before reading so the
      // tab never briefly falls back to "system" between the writes.
      clearTimeout(timer);
      timer = setTimeout(() => setPreference(readPreference()), 0);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const chooseTheme = useCallback((next) => {
    setPreference(next);
    try {
      if (next === 'system') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_MANUAL_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
        localStorage.setItem(LEGACY_MANUAL_KEY, '1');
      }
    } catch {
      // The choice still applies to this tab even if it cannot be remembered.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    chooseTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, chooseTheme]);

  const value = useMemo(
    () => ({ theme, preference, setPreference: chooseTheme, toggleTheme }),
    [theme, preference, chooseTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
