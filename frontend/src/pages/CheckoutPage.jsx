import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { toast } from '../components/UI';
import styles from './Checkout.module.css';

export default function CheckoutPage() {
  const { subtotal, refresh } = useCart();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [kycStatus, setKycStatus] = useState(null);
  const [step, setStep] = useState('address'); // 'address' | 'payment'
  const [form, setForm] = useState({ deliveryAddress: '', requiresInstallation: false, notes: '' });
  const [momoPhone, setMomoPhone] = useState('');
  const [orderId, setOrderId] = useState(null);
  const [loading, setLoading] = useState(false);

  // MoMo polling
  const [momoStatus, setMomoStatus] = useState(null);
  const pollRef = useRef(null);


  // Check KYC status for business customers
  useEffect(() => {
    if (user?.institutionType === 'business') {
      api.get('/kyc/status').then(({ data }) => setKycStatus(data.kycStatus)).catch(() => {});
    }
  }, [user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => () => clearInterval(pollRef.current), []);

  const createOrder = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/orders', form);
      setOrderId(res.data.order.id);
      setStep('payment');
    } catch (err) {
      toast(err.response?.data?.error || t('checkout.toastOrderFailed'), 'error');
    } finally { setLoading(false); }
  };

  const handleMomo = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/payments/momo/pay', { orderId, phoneNumber: momoPhone });
      if (data.simulated) {
        await refresh();
        toast(t('checkout.toastMomoSim'), 'success');
        navigate(`/orders/${orderId}`);
        return;
      }
      setMomoStatus('PENDING');
      toast(t('checkout.toastApprove'), 'success');
      pollRef.current = setInterval(async () => {
        const statusRes = await api.get(`/payments/momo/status/${data.referenceId}`);
        setMomoStatus(statusRes.data.status);
        if (statusRes.data.status === 'SUCCESSFUL') {
          clearInterval(pollRef.current);
          await refresh();
          toast(t('checkout.toastMomoConfirmed'), 'success');
          navigate(`/orders/${orderId}`);
        } else if (statusRes.data.status === 'FAILED') {
          clearInterval(pollRef.current);
          toast(t('checkout.toastMomoFailed'), 'error');
        }
      }, 3000);
    } catch (err) {
      toast(err.response?.data?.error || t('checkout.toastMomoGeneric'), 'error');
    } finally { setLoading(false); }
  };

  const TAX = subtotal * 0.18;
  const DELIVERY = form.requiresInstallation ? 25 : 10;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.layout}>
          <div>
            <div className={styles.steps}>
              <div className={`${styles.step} ${step === 'address' ? styles.stepActive : styles.stepDone}`}>1. {t('checkout.step1')}</div>
              <div className={`${styles.step} ${step === 'payment' ? styles.stepActive : ''}`}>2. {t('checkout.step2')}</div>
            </div>

            {/* KYC warning for business customers */}
            {user?.institutionType === 'business' && kycStatus && kycStatus !== 'approved' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '1rem 1.25rem', borderRadius: 'var(--radius)',
                background: 'var(--tile-red-soft, #fef2f2)', border: '1px solid rgba(248, 113, 113, 0.35)',
                marginBottom: '1rem',
              }}>
                <ShieldAlert size={20} color="var(--color-danger, #ef4444)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('checkout.kycTitle')}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-soft)' }}>
                    {kycStatus === 'submitted' || kycStatus === 'pending'
                      ? t('checkout.kycReviewing')
                      : t('checkout.kycSubmitFirst')}
                  </div>
                </div>
                <a href="/kyc" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flexShrink: 0 }}>
                  {kycStatus === 'submitted' || kycStatus === 'pending' ? t('checkout.kycViewStatus') : t('checkout.kycSubmitDocs')}
                </a>
              </div>
            )}

            {step === 'address' && (
              <form onSubmit={createOrder} className={`card ${styles.formCard}`}>
                <h2 className={styles.formTitle}>{t('checkout.step1')}</h2>
                <div className={styles.field}>
                  <label className="label">{t('checkout.addressLabel')}</label>
                  <textarea className="input" rows={3} value={form.deliveryAddress} onChange={set('deliveryAddress')} required placeholder={t('checkout.addressPlaceholder')} />
                </div>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={form.requiresInstallation} onChange={set('requiresInstallation')} />
                  <span>{t('checkout.installOpt')}</span>
                </label>
                <div className={styles.field}>
                  <label className="label">{t('checkout.notesLabel')}</label>
                  <input className="input" value={form.notes} onChange={set('notes')} placeholder={t('checkout.notesPlaceholder')} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-3)' }} disabled={loading}>
                  {loading ? t('checkout.processing') : t('checkout.continuePayment')}
                </button>
              </form>
            )}

            {step === 'payment' && (
              <div className={`card ${styles.formCard}`}>
                <h2 className={styles.formTitle}>{t('checkout.payTitle')}</h2>
                <div className={styles.methodCard} style={{ marginBottom: 'var(--space-3)' }}>
                  <Smartphone size={22} />
                  <div>
                    <div className={styles.methodLabel}>{t('checkout.method.momo.label')}</div>
                    <div className={styles.methodNote}>{t('checkout.method.momo.note')}</div>
                  </div>
                </div>
                <form onSubmit={handleMomo} className={styles.stripeFields}>
                    <div className={styles.field}>
                      <label className="label">{t('checkout.fw.phoneMtn')}</label>
                      <input className="input" placeholder="+250788123456" value={momoPhone} onChange={(e) => setMomoPhone(e.target.value)} required />
                    </div>
                    {momoStatus && (
                      <div className="badge badge-amber" style={{ alignSelf: 'flex-start' }}>
                        {t('checkout.statusLine', { status: momoStatus })} {momoStatus === 'PENDING' && t('checkout.checkPhone')}
                      </div>
                    )}
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-3)' }} disabled={loading || momoStatus === 'PENDING'}>
                      {loading ? t('checkout.sendingRequest') : momoStatus === 'PENDING' ? t('checkout.waitingApproval') : t('checkout.payMomo', { amount: (subtotal + TAX + DELIVERY).toLocaleString() })}
                    </button>
                </form>
              </div>
            )}
          </div>

          {/* Order summary sidebar */}
          <div className={`card ${styles.sidebar}`}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('checkout.summary')}</h3>
            <div className={styles.summRow}><span>{t('cart.subtotal')}</span><span>RWF {subtotal.toLocaleString()}</span></div>
            <div className={styles.summRow}><span>{t('cart.vat')}</span><span>RWF {TAX.toLocaleString()}</span></div>
            <div className={styles.summRow}><span>{t('cart.delivery')}{form.requiresInstallation ? t('checkout.installSuffix') : ''}</span><span>RWF {DELIVERY.toLocaleString()}</span></div>
            <div className={`${styles.summRow} ${styles.summTotal}`}><span>{t('dash.total')}</span><span>RWF {(subtotal + TAX + DELIVERY).toLocaleString()}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
