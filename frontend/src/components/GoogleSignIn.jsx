import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { toast } from './UI';
import { GOOGLE_CLIENT_ID, isGoogleConfigured, loadGoogleIdentity } from '../services/google';
import styles from './GoogleSignIn.module.css';

/**
 * "Continue with Google" using Google Identity Services.
 *
 * Google renders its own button (that is the supported way to get an ID token
 * from a click), and hands us a signed JWT. The JWT goes to POST /auth/google,
 * which verifies it against GOOGLE_CLIENT_ID and issues the app's usual session.
 *
 * Google knows nothing about districts, so a first-time sign-in comes back as
 * `requiresProfileCompletion` (HTTP 206). The same token is then re-sent with
 * the district and account type chosen in the modal below.
 *
 * Everything is inert unless VITE_GOOGLE_CLIENT_ID is set at build time.
 */
export default function GoogleSignIn({ defaultDistrict = '', defaultInstitutionType = 'personal' }) {
  const { loginWithGoogle } = useAuth();
  const { t, locale } = useLanguage();
  const navigate = useNavigate();

  const holder = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { idToken } while the profile is incomplete
  const [districts, setDistricts] = useState([]);
  const [form, setForm] = useState({ district: '', institutionType: 'personal' });

  const finish = useCallback(
    async (idToken, extra = {}) => {
      setBusy(true);
      try {
        const result = await loginWithGoogle(idToken, extra);
        if (result.requiresProfileCompletion) {
          setPending({ idToken });
          return false;
        }
        toast(t('login.toastWelcome'), 'success');
        navigate('/dashboard');
        return true;
      } catch (err) {
        toast(err.response?.data?.error || t('google.failed'), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [loginWithGoogle, navigate, t]
  );

  // The GIS callback is registered once, so route it through a ref instead of
  // re-initialising Google every time a dependency changes.
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; }, [finish]);

  useEffect(() => {
    if (!isGoogleConfigured) return undefined;
    let alive = true;

    loadGoogleIdentity()
      .then((id) => {
        if (!alive) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          auto_select: false,
          callback: (response) => {
            if (!response?.credential) return;
            // The register page already knows the district; skip the extra step
            // when the person picked one before pressing the button.
            const extra = defaultDistrict
              ? { district: Number(defaultDistrict), institutionType: defaultInstitutionType || 'personal' }
              : {};
            finishRef.current(response.credential, extra);
          },
        });
        setReady(true);
      })
      .catch((err) => {
        // Blocked script or offline: password and Auth0 sign-in still work.
        if (alive) console.warn('[google]', err.message);
      });

    return () => { alive = false; };
  }, [defaultDistrict, defaultInstitutionType]);

  useEffect(() => {
    if (!ready || !holder.current || !window.google?.accounts?.id) return undefined;
    const id = window.google.accounts.id;

    // GIS wants a pixel width (max 400). Measure the panel so the button lines
    // up with the password form on phone-sized viewports too.
    const render = () => {
      const el = holder.current;
      if (!el) return;
      const width = Math.max(200, Math.min(Math.round(el.clientWidth) || 320, 400));
      el.innerHTML = '';
      id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width,
        locale: locale === 'fr' ? 'fr' : 'en',
      });
    };

    render();
    if (typeof ResizeObserver === 'undefined') return undefined;

    let lastWidth = holder.current.clientWidth;
    const observer = new ResizeObserver(() => {
      const next = holder.current?.clientWidth || 0;
      if (Math.abs(next - lastWidth) < 2) return;
      lastWidth = next;
      render();
    });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [ready, locale]);

  useEffect(() => {
    if (!pending || districts.length) return undefined;
    let alive = true;
    api.get('/users/districts')
      .then((r) => { if (alive) setDistricts(r.data.districts || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pending, districts.length]);

  const submitProfile = async (e) => {
    e.preventDefault();
    if (!pending) return;
    const ok = await finish(pending.idToken, {
      district: Number(form.district),
      institutionType: form.institutionType,
    });
    if (ok) setPending(null);
  };

  if (!isGoogleConfigured) return null;

  return (
    <>
      <div ref={holder} className={`${styles.button} ${busy ? styles.busy : ''}`} />

      {pending && (
        <div className={styles.scrim} role="dialog" aria-modal="true" aria-labelledby="google-profile-title">
          <div className={styles.card}>
            <h2 id="google-profile-title" className={styles.title}>{t('google.finishProfile')}</h2>
            <p className={styles.body}>{t('google.finishProfileBody')}</p>
            <form onSubmit={submitProfile}>
              <div className={styles.field}>
                <label className="label">{t('register.district')}</label>
                <select
                  className="input"
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  required
                  autoFocus
                >
                  <option value="">{t('register.selectDistrict')}</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.province})</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className="label">{t('register.accountType')}</label>
                <select
                  className="input"
                  value={form.institutionType}
                  onChange={(e) => setForm((f) => ({ ...f, institutionType: e.target.value }))}
                >
                  <option value="personal">{t('register.personal')}</option>
                  <option value="business">{t('register.business')}</option>
                </select>
              </div>
              <div className={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={() => setPending(null)} disabled={busy}>
                  {t('ui.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy || !form.district}>
                  {busy ? t('google.completing') : t('google.complete')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
