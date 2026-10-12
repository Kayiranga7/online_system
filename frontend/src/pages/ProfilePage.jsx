import { useState } from 'react';
import { ShieldCheck, Mail, Phone, MapPin, KeyRound, Pencil } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { toast } from '../components/UI';
import styles from './Profile.module.css';

export default function ProfilePage() {
  const { user, storeToken, setUser } = useAuth();
  const { t } = useLanguage();
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);

  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: user?.fullName || '', phoneNumber: user?.phoneNumber || '' });
  const [profileLoading, setProfileLoading] = useState(false);

  const startEditing = () => {
    setProfileForm({ fullName: user.fullName || '', phoneNumber: user.phoneNumber || '' });
    setEditing(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const r = await api.patch('/auth/me', profileForm);
      setUser(r.data.user);
      toast(t('profile.toastUpdated'), 'success');
      setEditing(false);
    } catch (err) {
      toast(err.response?.data?.error || t('profile.toastUpdateFailed'), 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast(t('profile.toastPwMismatch'), 'error');
      return;
    }
    setPwLoading(true);
    try {
      const r = await api.patch('/auth/update-password', { currentPassword, newPassword });
      storeToken(r.data.accessToken);
      toast(t('profile.toastPwUpdated'), 'success');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast(err.response?.data?.error || t('profile.toastPwFailed'), 'error');
    } finally {
      setPwLoading(false);
    }
  };

  const startSetup = async () => {
    try { const r = await api.post('/auth/2fa/setup'); setQr(r.data.qrCode); }
    catch { toast(t('profile.toast2faStartFailed'), 'error'); }
  };

  const enable2FA = async () => {
    try {
      const r = await api.post('/auth/2fa/enable', { code });
      setBackupCodes(r.data.backupCodes);
      toast(t('profile.toast2faEnabled'), 'success');
      setQr(null);
    } catch (err) { toast(err.response?.data?.error || t('profile.toast2faCode'), 'error'); }
  };

  const disable2FA = async () => {
    try { await api.post('/auth/2fa/disable'); toast(t('profile.toast2faDisabled'), 'success'); }
    catch { toast(t('profile.toast2faDisableFailed'), 'error'); }
  };

  if (!user) return null;

  return (
    <div className={styles.page}>
      <div className="container" style={{ maxWidth: 640 }}>
        <h1 className={styles.heading}>{t('profile.heading')}</h1>

        <div className={`card ${styles.section}`}>
          <div className={styles.avatarRow}>
            <div className={styles.avatar}>{user.fullName?.[0]?.toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.2rem' }}>{user.fullName}</h2>
              <span className="badge badge-neutral" style={{ marginTop: 4 }}>{user.role}</span>
            </div>
            {!editing && (
              <button className="btn btn-outline" style={{ fontSize: '0.82rem', padding: '0.4rem 0.7rem' }} onClick={startEditing}>
                <Pencil size={14} /> {t('profile.edit')}
              </button>
            )}
          </div>

          {editing ? (
            <form onSubmit={handleSaveProfile} className={styles.form}>
              <div className={styles.field}>
                <label className="label">{t('profile.fullName')}</label>
                <input
                  className="input" required minLength={2}
                  value={profileForm.fullName} onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className="label">{t('profile.phoneNumber')}</label>
                <input
                  className="input"
                  value={profileForm.phoneNumber} onChange={(e) => setProfileForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                />
              </div>
              <div className={styles.infoRow} style={{ color: 'var(--color-charcoal-soft)', fontSize: '0.85rem' }}>
                <Mail size={15} /> {user.email} <span style={{ fontSize: '0.78rem' }}>{t('profile.emailNote')}</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>{t('ui.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={profileLoading}>{profileLoading ? t('profile.saving') : t('profile.saveChanges')}</button>
              </div>
            </form>
          ) : (
            <div className={styles.infoList}>
              <div className={styles.infoRow}><Mail size={15} /> {user.email}</div>
              {user.phoneNumber && <div className={styles.infoRow}><Phone size={15} /> {user.phoneNumber}</div>}
              {user.institutionType && <div className={styles.infoRow}><MapPin size={15} /> {t('profile.accountType', { type: user.institutionType })}</div>}
            </div>
          )}
        </div>

        <div className={`card ${styles.section}`}>
          <h3 className={styles.sectionTitle}><KeyRound size={17} /> {t('profile.changePassword')}</h3>
          <form onSubmit={handleChangePassword} className={styles.form}>
            <div className={styles.field}>
              <label className="label">{t('profile.currentPassword')}</label>
              <input
                className="input" type="password" required
                value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className="label">{t('profile.newPassword')}</label>
              <input
                className="input" type="password" minLength={8} required
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className="label">{t('profile.confirmNewPassword')}</label>
              <input
                className="input" type="password" minLength={8} required
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={pwLoading}>
              {pwLoading ? t('profile.updating') : t('profile.updatePassword')}
            </button>
          </form>
        </div>

        <div className={`card ${styles.section}`}>
          <h3 className={styles.sectionTitle}><ShieldCheck size={17} /> {t('profile.twoFactor')}</h3>
          {user.twoFactorEnabled ? (
            <>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-soft)', marginBottom: 'var(--space-3)' }}>
                {t('profile.twoFactorOn')}
              </p>
              <button className="btn btn-outline" onClick={disable2FA}>{t('profile.disable2FA')}</button>
            </>
          ) : qr ? (
            <div>
              <p style={{ fontSize: '0.88rem', marginBottom: 'var(--space-3)' }}>{t('profile.twoFactorScan')}</p>
              <img src={qr} alt={t('profile.twoFactor')} style={{ width: 160, height: 160, marginBottom: 'var(--space-3)' }} />
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <input className="input" placeholder="123456" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 140 }} />
                <button className="btn btn-primary" onClick={enable2FA}>Verify & enable</button>
              </div>
            </div>
          ) : backupCodes ? (
            <div>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>{t('profile.backupCodes')}</p>
              <div className={styles.backupGrid}>
                {backupCodes.map((c) => <code key={c} className={styles.backupCode}>{c}</code>)}
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-soft)', marginBottom: 'var(--space-3)' }}>
                {t('profile.twoFactorDesc')}
              </p>
              <button className="btn btn-primary" onClick={startSetup}>{t('profile.enable2FA')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
