import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Leaf, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { toast } from '../components/UI';
import styles from './Auth.module.css';

export default function LoginPage() {
  const { login } = useAuth();
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
      toast('Welcome back!', 'success');
      navigate('/dashboard');
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed.';
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
      toast('If that email needs verifying, a new link is on its way.', 'success');
    } catch {
      toast('Something went wrong. Please try again.', 'error');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
      
        <h1 className={styles.heading}>Sign in to your garden</h1>
        <p className={styles.sub}>Don't have an account? <Link to="/register" className={styles.link}>Create one</Link></p>

        {/* Demo credentials banner */}
       

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">Email address</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required placeholder="you@example.com" />
          </div>
          <div className={styles.field}>
            <label className="label">Password</label>
            <div className={styles.passwordWrap}>
              <input className="input" type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')} required placeholder="••••••••" />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(s => !s)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Link to="/forgot-password" className={styles.forgot}>Forgot password?</Link>
          </div>

          {unverified && (
            <div className={styles.demoBanner}>
              {resent ? (
                <span>New verification link sent — check your inbox.</span>
              ) : (
                <>
                  <span>Your email isn't verified yet. </span>
                  <button type="button" className={styles.link} style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={handleResend}>
                    Resend verification email
                  </button>
                </>
              )}
            </div>
          )}

          {requires2FA && (
            <div className={styles.field}>
              <label className="label">Two-factor authentication code</label>
              <input className="input" type="text" inputMode="numeric" maxLength={6} value={form.twoFactorCode} onChange={set('twoFactorCode')} placeholder="6-digit code" />
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      {/* Decorative panel */}
      <div className={styles.deco}>
        <div className={styles.decoInner}>
          <h2>Rwanda's garden design & plant studio</h2>
          <p>Order plants, book landscape designs, and track installations.</p>
        </div>
      </div>
    </div>
  );
}
