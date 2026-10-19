import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import { toast } from '../components/UI';
import { heroBackground } from '../utils/heroBackground';
import { isAuth0Configured } from '../services/auth0';
import { isGoogleConfigured } from '../services/google';
import Auth0Button from '../components/Auth0Button';
import GoogleSignIn from '../components/GoogleSignIn';
import styles from './Auth.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', twoFactorCode: '' });
  const [requires2FA, setRequires2FA] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUnverified(false);
    try {
      const result = await login(form.email, form.password, requires2FA ? form.twoFactorCode : undefined);
      if (result.requiresTwoFactor) { setRequires2FA(true); return; }
      toast(t('login.toastWelcome'), 'success');
      navigate('/dashboard');
    } catch (err) {
      const message = err.response?.data?.error || t('login.toastFailed');
      toast(message, 'error');
      if (message.toLowerCase().includes('verify your email')) setUnverified(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await api.post('/auth/resend-verification', { email: form.email });
      setResent(true);
      toast(t('login.verificationSent'), 'success');
    } catch {
      toast(t('login.toastGenericError'), 'error');
    }
  };

  return (
    <div className={styles.page} style={heroBackground}>
      <div className={styles.panel}>
      
        <h1 className={styles.heading}>{t('login.heading')}</h1>
        <p className={styles.sub}>{t('login.noAccount')} <Link to="/register" className={styles.link}>{t('login.createOne')}</Link></p>

        {(isGoogleConfigured || isAuth0Configured) && (
          <>
            <GoogleSignIn />
            {isAuth0Configured && <Auth0Button />}
            <div className={styles.divider}><span>{t('auth0.or')}</span></div>
          </>
        )}

        {/* Demo credentials banner */}
       

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">{t('login.email')}</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required placeholder="you@example.com" />
          </div>
          <div className={styles.field}>
            <label className="label">{t('login.password')}</label>
            <div className={styles.passwordWrap}>
              <input className="input" type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')} required placeholder="••••••••" />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(s => !s)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Link to="/forgot-password" className={styles.forgot}>{t('login.forgot')}</Link>
          </div>

          {unverified && (
            <div className={styles.demoBanner}>
              {resent ? (
                <span>{t('login.verificationSent')}</span>
              ) : (
                <>
                  <span>{t('login.verificationPending')} </span>
                  <button type="button" className={styles.link} style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={handleResend}>
                    {t('login.resendVerification')}
                  </button>
                </>
              )}
            </div>
          )}

          {requires2FA && (
            <div className={styles.field}>
              <label className="label">{t('login.twoFactor')}</label>
              <input className="input" type="text" inputMode="numeric" maxLength={6} value={form.twoFactorCode} onChange={set('twoFactorCode')} placeholder="6-digit code" />
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>

      {/* Decorative panel */}
      <div className={styles.deco}>
        <div className={styles.decoInner}>
          <h2>{t('login.decoTitle')}</h2>
          <p>{t('login.decoBody')}</p>
        </div>
      </div>
    </div>
  );
}
