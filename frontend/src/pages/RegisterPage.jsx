import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/UI';
import styles from './Auth.module.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: '', email: '', phoneNumber: '', dateOfBirth: '',
    district: '', institutionType: 'personal', password: '', confirmPassword: '',
  });

  useEffect(() => {
    api.get('/users/districts').then((r) => setDistricts(r.data.districts || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast('Passwords do not match.', 'error'); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        fullName: form.fullName, email: form.email, phoneNumber: form.phoneNumber,
        dateOfBirth: form.dateOfBirth, district: Number(form.district),
        institutionType: form.institutionType, password: form.password,
      });
      toast('Account created! Please check your email to verify your address.', 'success');
      navigate('/login');
    } catch (err) {
      toast(err.response?.data?.error || 'Registration failed.', 'error');
      const details = err.response?.data?.details;
      if (details?.length) toast(details[0].message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.logoRow}>
          <Leaf size={28} color="var(--color-terracotta)" />
          <span className={styles.logoText}>IMIZI</span>
        </div>
        <h1 className={styles.heading}>Create your account</h1>
        <p className={styles.sub}>Already registered? <Link to="/login" className={styles.link}>Sign in</Link></p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">Full name</label>
            <input className="input" value={form.fullName} onChange={set('fullName')} required placeholder="Your full name" />
          </div>
          <div className={styles.field}>
            <label className="label">Email address</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div className={styles.field}>
              <label className="label">Phone number</label>
              <input className="input" type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="+250..." />
            </div>
            <div className={styles.field}>
              <label className="label">Date of birth</label>
              <input className="input" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div className={styles.field}>
              <label className="label">District</label>
              <select className="input" value={form.district} onChange={set('district')} required>
                <option value="">Select district…</option>
                {districts.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.province})</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className="label">Account type</label>
              <select className="input" value={form.institutionType} onChange={set('institutionType')}>
                <option value="personal">Personal garden</option>
                <option value="business">Business / institution</option>
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={8} />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-soft)', marginTop: 4 }}>
              Min 8 characters, 1 uppercase letter, 1 number.
            </span>
          </div>
          <div className={styles.field}>
            <label className="label">Confirm password</label>
            <input className="input" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.25rem' }} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
      <div className={styles.deco}>
        <div className={styles.decoInner}>
          <h2>Grow something beautiful in Rwanda</h2>
          <p>Join thousands of households and institutions across all provinces designing greener spaces with IMIZI.</p>
        </div>
      </div>
    </div>
  );
}
