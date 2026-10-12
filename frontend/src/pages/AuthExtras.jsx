import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Leaf } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/UI';
import { heroBackground } from '../utils/heroBackground';
import styles from './Auth.module.css';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [email, setEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);
  // The verification token is single-use: the backend clears it as soon as it's
  // redeemed. In dev, React 18 StrictMode intentionally mounts/runs effects
  // twice, so without this guard the effect fired the request twice - the
  // first call verified the account, and the second call then failed
  // ("invalid or expired") because the token was already gone. That made the
  // page always show "Verification failed" even though the account was
  // actually verified (hence login working right after). This ref makes the
  // request fire only once per token, regardless of how many times the
  // effect itself runs.
  const requestedTokenRef = useRef(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setStatus('error'); return; }
    if (requestedTokenRef.current === token) return;
    requestedTokenRef.current = token;
    api.get(`/auth/verify-email?token=${token}`)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [params]);

  const handleResend = async (e) => {
    e.preventDefault();
    setResending(true);
    try { await api.post('/auth/resend-verification', { email }); setResendSent(true); }
    catch { toast('Something went wrong. Please try again.', 'error'); }
    finally { setResending(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {status === 'loading' && <p>Verifying your email…</p>}
      {status === 'success' && (
        <>
          <CheckCircle size={48} color="var(--color-success)" />
          <h2>Email verified!</h2>
          <p style={{ color: 'var(--color-charcoal-soft)' }}>You can now sign in to your account.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </>
      )}
      {status === 'error' && (
        <>
          <XCircle size={48} color="var(--color-danger)" />
          <h2>Verification failed</h2>
          <p style={{ color: 'var(--color-charcoal-soft)' }}>
            This link is invalid or has expired (links are valid for 24 hours). Request a new one below.
          </p>
          {resendSent ? (
            <p style={{ color: 'var(--color-charcoal-soft)', maxWidth: 340, textAlign: 'center' }}>
              If that email is registered and not yet verified, a new link is on its way. Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: 280 }}>
              <input className="input" type="email" placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <button type="submit" className="btn btn-primary" disabled={resending}>{resending ? 'Sending…' : 'Resend verification email'}</button>
            </form>
          )}
          <Link to="/login" className="btn btn-outline">Back to sign in</Link>
        </>
      )}
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await api.post('/auth/forgot-password', { email }); setSent(true); }
    catch { toast('Something went wrong. Please try again.', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.page} style={heroBackground}>
      <div className={styles.panel}>
        <div className={styles.logoRow}><Leaf size={28} color="var(--accent-strong)" /><span className={styles.logoText}>IMIZI</span></div>
        <h1 className={styles.heading}>Reset your password</h1>
        {sent ? (
          <p className={styles.sub}>If that email is registered, a reset link has been sent. Check your inbox.</p>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className="label">Email address</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
          </form>
        )}
        <p className={styles.sub} style={{ marginTop: 'var(--space-4)' }}><Link to="/login" className={styles.link}>← Back to sign in</Link></p>
      </div>
      <div className={styles.deco}><div className={styles.decoInner}><h2>We've got you covered</h2><p>Password resets are sent securely to your registered email address.</p></div></div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: params.get('token'), newPassword });
      toast('Password reset! Please sign in.', 'success');
      navigate('/login');
    } catch (err) { toast(err.response?.data?.error || 'Reset failed.', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className={styles.page} style={heroBackground}>
      <div className={styles.panel}>
        <div className={styles.logoRow}><Leaf size={28} color="var(--accent-strong)" /><span className={styles.logoText}>IMIZI</span></div>
        <h1 className={styles.heading}>Set a new password</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">New password</label>
            <input className="input" type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</button>
        </form>
      </div>
      <div className={styles.deco}><div className={styles.decoInner}><h2>Almost there</h2><p>Choose a strong new password to secure your account.</p></div></div>
    </div>
  );
}
