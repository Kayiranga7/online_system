import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { AUTH0_CALLBACK_PATH } from '../services/auth0';
import styles from '../pages/Auth.module.css';

/**
 * Rendered only when Auth0 is configured, so `useAuth0` always has the provider
 * above it (the provider is mounted conditionally in App.jsx).
 */
export default function Auth0Button() {
  const { loginWithRedirect } = useAuth0();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await loginWithRedirect({ appState: { returnTo: AUTH0_CALLBACK_PATH } });
    } catch {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`btn btn-secondary ${styles.ssoBtn}`} onClick={start} disabled={busy}>
      {busy ? <Loader2 size={16} className={styles.spin} /> : <ShieldCheck size={16} />}
      {busy ? t('auth0.redirecting') : t('auth0.continue')}
    </button>
  );
}
