import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { toast } from '../components/UI';
import { heroBackground } from '../utils/heroBackground';
import styles from './Auth.module.css';

/**
 * Landing point for the Auth0 redirect.
 *
 * Auth0 hands the browser back an authorization code; the SDK exchanges it for
 * a token, which this page sends to the API. The API verifies it, maps it to a
 * user row and returns the app's usual session - from then on nothing about the
 * app's auth differs from a password login.
 *
 * Two things can interrupt that: a first-time Auth0 user needs a district and
 * account type (Auth0 knows neither), and an account with local 2FA enabled
 * still has to prove the second factor.
 */
export default function Auth0CallbackPage() {
  const { isLoading, isAuthenticated, error, getAccessTokenSilently } = useAuth0();
  const { completeAuth0Login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // working | profile | twofactor | error
  const [stage, setStage] = useState('working');
  const [message, setMessage] = useState('');
  const [districts, setDistricts] = useState([]);
  const [form, setForm] = useState({ district: '', institutionType: 'personal', code: '' });
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const finish = useCallback(
    async (extra = {}) => {
      setBusy(true);
      setMessage('');
      try {
        const token = await getAccessTokenSilently();
        if (!token) throw new Error(t('auth0.failed'));
        const result = await completeAuth0Login(token, extra);

        if (result.requiresProfileCompletion) {
          setStage('profile');
          return;
        }
        if (result.requiresTwoFactor) {
          setStage('twofactor');
          return;
        }

        toast(t('login.toastWelcome'), 'success');
        navigate('/dashboard', { replace: true });
      } catch (err) {
        setMessage(err.response?.data?.error || err.message || t('auth0.failed'));
        setStage('error');
      } finally {
        setBusy(false);
      }
    },
    [completeAuth0Login, getAccessTokenSilently, navigate, t]
  );

  useEffect(() => {
    if (isLoading || started.current) return;
    started.current = true;

    if (error) {
      setMessage(error.message || t('auth0.failed'));
      setStage('error');
      return;
    }
    if (!isAuthenticated) {
      setMessage(t('auth0.notCompleted'));
      setStage('error');
      return;
    }
    finish();
  }, [isLoading, isAuthenticated, error, finish, t]);

  useEffect(() => {
    if (stage !== 'profile' || districts.length) return;
    api.get('/users/districts')
      .then((r) => setDistricts(r.data.districts || []))
      .catch(() => {});
  }, [stage, districts.length]);

  const submitProfile = (e) => {
    e.preventDefault();
    finish({ district: Number(form.district), institutionType: form.institutionType });
  };

  const submitCode = (e) => {
    e.preventDefault();
    finish({ twoFactorCode: form.code });
  };

  return (
    <div className={styles.page} style={heroBackground}>
      <div className={styles.panel}>
        <div className={styles.logoRow}>
          <ShieldCheck size={26} color="var(--accent-strong)" />
          <span className={styles.logoText}>Auth0</span>
        </div>

        {stage === 'working' && (
          <>
            <h1 className={styles.heading}>{t('auth0.callbackTitle')}</h1>
            <p className={styles.sub}>
              <Loader2 size={16} className={styles.spin} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {t('auth0.callbackBody')}
            </p>
          </>
        )}

        {stage === 'profile' && (
          <>
            <h1 className={styles.heading}>{t('auth0.finishProfile')}</h1>
            <p className={styles.sub}>{t('auth0.finishProfileBody')}</p>
            <form className={styles.form} onSubmit={submitProfile}>
              <div className={styles.field}>
                <label className="label">{t('register.district')}</label>
                <select
                  className="input"
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  required
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
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? t('login.submitting') : t('auth0.complete')}
              </button>
            </form>
          </>
        )}

        {stage === 'twofactor' && (
          <>
            <h1 className={styles.heading}>{t('login.twoFactor')}</h1>
            <p className={styles.sub}>{t('auth0.twoFactorBody')}</p>
            <form className={styles.form} onSubmit={submitCode}>
              <div className={styles.field}>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="000000"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? t('login.submitting') : t('auth0.verify')}
              </button>
            </form>
          </>
        )}

        {stage === 'error' && (
          <>
            <h1 className={styles.heading}>{t('auth0.failed')}</h1>
            <p className={styles.sub}>
              <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {message}
            </p>
            <Link to="/login" className={styles.link}>{t('auth0.backToLogin')}</Link>
          </>
        )}
      </div>
    </div>
  );
}
