import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/UI';
import { useLanguage } from '../context/LanguageContext';
import { heroBackground } from '../utils/heroBackground';
import styles from './Auth.module.css';

export default function RegisterPage() {
  const { t } = useLanguage();
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
    if (form.password !== form.confirmPassword) { toast(t('register.toastMismatch'), 'error'); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        fullName: form.fullName, email: form.email, phoneNumber: form.phoneNumber,
        dateOfBirth: form.dateOfBirth, district: Number(form.district),
        institutionType: form.institutionType, password: form.password,
      });
      toast(t('register.toastCreated'), 'success');
      navigate('/login');
    } catch (err) {
      toast(err.response?.data?.error || t('register.toastFailed'), 'error');
      const details = err.response?.data?.details;
      if (details?.length) toast(details[0].message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page} style={heroBackground}>
      <div className={styles.panel}>
        <div className={styles.logoRow}>
          <Leaf size={28} color="var(--accent-strong)" />
          <span className={styles.logoText}>IMIZI</span>
        </div>
        <h1 className={styles.heading}>{t('register.heading')}</h1>
        <p className={styles.sub}>{t('register.alreadyRegistered')} <Link to="/login" className={styles.link}>{t('register.signIn')}</Link></p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">{t('register.fullName')}</label>
            <input className="input" value={form.fullName} onChange={set('fullName')} required placeholder={t('register.fullNamePlaceholder')} />
          </div>
          <div className={styles.field}>
            <label className="label">{t('register.email')}</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div className={styles.field}>
              <label className="label">{t('register.phone')}</label>
              <input className="input" type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="+250..." />
            </div>
            <div className={styles.field}>
              <label className="label">{t('register.dateOfBirth')}</label>
              <input className="input" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div className={styles.field}>
              <label className="label">{t('register.district')}</label>
              <select className="input" value={form.district} onChange={set('district')} required>
                <option value="">{t('register.selectDistrict')}</option>
                {districts.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.province})</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className="label">{t('register.accountType')}</label>
              <select className="input" value={form.institutionType} onChange={set('institutionType')}>
                <option value="personal">{t('register.personal')}</option>
                <option value="business">{t('register.business')}</option>
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label className="label">{t('register.password')}</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={8} />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-soft)', marginTop: 4 }}>
              {t('register.passwordHint')}
            </span>
          </div>
          <div className={styles.field}>
            <label className="label">{t('register.confirmPassword')}</label>
            <input className="input" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.25rem' }} disabled={loading}>
            {loading ? t('register.submitting') : t('register.submit')}
          </button>
        </form>
      </div>
      <div className={styles.deco}>
        <div className={styles.decoInner}>
          <h2>{t('register.decoTitle')}</h2>
          <p>{t('register.decoBody')}</p>
        </div>
      </div>
    </div>
  );
}
