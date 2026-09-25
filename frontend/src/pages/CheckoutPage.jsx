import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Smartphone, Wallet, Landmark, Loader2, ShieldAlert } from 'lucide-react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import api from '../services/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { toast } from '../components/UI';
import StripePaymentForm from '../components/StripePaymentForm';
import styles from './Checkout.module.css';

// Loaded once per app load. Falls back gracefully if no publishable key is
// configured server-side - the Stripe option simply won't render its form.
let stripePromise = null;
function getStripe(publishableKey) {
  if (!stripePromise && publishableKey) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

const PAYMENT_METHODS = [
  { id: 'momo', label: 'MTN Mobile Money', icon: Smartphone, note: 'Pay with your phone — USSD prompt sent to your device' },
  { id: 'flutterwave', label: 'MoMo / Airtel / Card / Bank', icon: Landmark, note: 'MTN, Airtel Money, card, or bank transfer via Flutterwave' },
  { id: 'stripe', label: 'Card (Stripe)', icon: CreditCard, note: 'Pay by card — Stripe test mode' },
  { id: 'paypal', label: 'PayPal', icon: Wallet, note: 'PayPal checkout redirect' },
];

export default function CheckoutPage() {
  const { subtotal, refresh } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kycStatus, setKycStatus] = useState(null);
  const [params] = useSearchParams();
  const [step, setStep] = useState('address'); // 'address' | 'payment'
  const [form, setForm] = useState({ deliveryAddress: '', requiresInstallation: false, notes: '' });
  const [payMethod, setPayMethod] = useState('momo');
  const [momoPhone, setMomoPhone] = useState('');
  const [orderId, setOrderId] = useState(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Stripe
  const [stripeClientSecret, setStripeClientSecret] = useState(null);
  const [stripePublishableKey, setStripePublishableKey] = useState(null);

  // MoMo polling
  const [momoReference, setMomoReference] = useState(null);
  const [momoStatus, setMomoStatus] = useState(null);
  const pollRef = useRef(null);

  // Flutterwave: direct MTN/Airtel charge, or redirect for card/bank transfer
  const [fwMode, setFwMode] = useState('momo'); // 'momo' | 'redirect'
  const [fwNetwork, setFwNetwork] = useState('mtn');
  const [fwPhone, setFwPhone] = useState('');
  const [fwTxRef, setFwTxRef] = useState(null);
  const [fwStatus, setFwStatus] = useState(null);
  const fwPollRef = useRef(null);

  useEffect(() => () => clearInterval(fwPollRef.current), []);

  // Check KYC status for business customers
  useEffect(() => {
    if (user?.institutionType === 'business') {
      api.get('/kyc/status').then(({ data }) => setKycStatus(data.kycStatus)).catch(() => {});
    }
  }, [user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // Resume after returning from a real PayPal redirect (?paypal=success&orderId=&paypalOrderId=)
  useEffect(() => {
    const paypalOrderId = params.get('token') || params.get('paypalOrderId');
    const resumeOrderId = params.get('orderId');
    if (params.get('paypal') === 'success' && paypalOrderId && resumeOrderId) {
      api.post('/payments/paypal/capture', { orderId: Number(resumeOrderId), paypalOrderId })
        .then(async () => { await refresh(); toast('PayPal payment confirmed!', 'success'); navigate(`/orders/${resumeOrderId}`); })
        .catch((err) => toast(err.response?.data?.error || 'PayPal capture failed.', 'error'));
    }
  }, [params]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const createOrder = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/orders', form);
      setOrderId(res.data.order.id);
      setOrderTotal(res.data.order.totalAmount);
      setStep('payment');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create order.', 'error');
    } finally { setLoading(false); }
  };

  const startStripe = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/payments/stripe/create-intent', { orderId });
      setStripeClientSecret(data.clientSecret);
      setStripePublishableKey(data.publishableKey);
    } catch (err) {
      toast(err.response?.data?.error || 'Could not start Stripe payment.', 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (payMethod === 'stripe' && step === 'payment' && !stripeClientSecret) startStripe(); }, [payMethod, step]);

  const handleStripeSuccess = async () => {
    await refresh();
    toast('Payment successful!', 'success');
    navigate(`/orders/${orderId}`);
  };

  const handlePaypal = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/payments/paypal/create-order', { orderId });
      if (data.simulated) {
        // No real sandbox creds - capture immediately so the demo flow still completes.
        await api.post('/payments/paypal/capture', { orderId, paypalOrderId: data.paypalOrderId });
        await refresh();
        toast('PayPal payment successful (simulated).', 'success');
        navigate(`/orders/${orderId}`);
      } else {
        // Real sandbox: redirect the customer to PayPal to approve, then they return here.
        window.location.href = `${data.approveLink}&orderId=${orderId}`;
      }
    } catch (err) {
      toast(err.response?.data?.error || 'PayPal payment failed.', 'error');
    } finally { setLoading(false); }
  };

  const handleFlutterwaveRedirect = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/payments/flutterwave/initiate', { orderId });
      if (data.simulated) {
        await refresh();
        toast('Payment successful (simulated - no Flutterwave credentials configured).', 'success');
        navigate(`/orders/${orderId}`);
        return;
      }
      // Hosted checkout: Flutterwave's own page handles card entry or bank transfer instructions.
      window.location.href = data.link;
    } catch (err) {
      toast(err.response?.data?.error || 'Could not start payment.', 'error');
    } finally { setLoading(false); }
  };

  const handleFlutterwaveMomo = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/payments/flutterwave/momo', { orderId, phoneNumber: fwPhone, network: fwNetwork });
      if (data.simulated) {
        await refresh();
        toast('Payment successful (simulated - no Flutterwave credentials configured).', 'success');
        navigate(`/orders/${orderId}`);
        return;
      }
      setFwTxRef(data.txRef);
      setFwStatus('pending');
      toast('Approve the payment prompt on your phone…', 'success');
      fwPollRef.current = setInterval(async () => {
        const statusRes = await api.get(`/payments/flutterwave/status/${data.txRef}`);
        setFwStatus(statusRes.data.status);
        if (statusRes.data.status === 'successful') {
          clearInterval(fwPollRef.current);
          await refresh();
          toast('Payment confirmed!', 'success');
          navigate(`/orders/${orderId}`);
        } else if (statusRes.data.status === 'failed') {
          clearInterval(fwPollRef.current);
          toast('Payment failed or was declined.', 'error');
        }
      }, 3000);
    } catch (err) {
      toast(err.response?.data?.error || 'Could not initiate payment.', 'error');
    } finally { setLoading(false); }
  };

  const handleMomo = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/payments/momo/pay', { orderId, phoneNumber: momoPhone });
      if (data.simulated) {
        await refresh();
        toast('MTN MoMo payment successful (simulated).', 'success');
        navigate(`/orders/${orderId}`);
        return;
      }
      setMomoReference(data.referenceId);
      setMomoStatus('PENDING');
      toast('Approve the payment prompt on your phone…', 'success');
      pollRef.current = setInterval(async () => {
        const statusRes = await api.get(`/payments/momo/status/${data.referenceId}`);
        setMomoStatus(statusRes.data.status);
        if (statusRes.data.status === 'SUCCESSFUL') {
          clearInterval(pollRef.current);
          await refresh();
          toast('MTN MoMo payment confirmed!', 'success');
          navigate(`/orders/${orderId}`);
        } else if (statusRes.data.status === 'FAILED') {
          clearInterval(pollRef.current);
          toast('MTN MoMo payment failed or was declined.', 'error');
        }
      }, 3000);
    } catch (err) {
      toast(err.response?.data?.error || 'MTN MoMo payment failed.', 'error');
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
              <div className={`${styles.step} ${step === 'address' ? styles.stepActive : styles.stepDone}`}>1. Delivery details</div>
              <div className={`${styles.step} ${step === 'payment' ? styles.stepActive : ''}`}>2. Payment</div>
            </div>

            {/* KYC warning for business customers */}
            {user?.institutionType === 'business' && kycStatus && kycStatus !== 'approved' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '1rem 1.25rem', borderRadius: 'var(--radius)',
                background: '#fef2f2', border: '1px solid #fecaca',
                marginBottom: '1rem',
              }}>
                <ShieldAlert size={20} color="var(--color-danger, #ef4444)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>KYC verification required</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-soft)' }}>
                    {kycStatus === 'submitted' || kycStatus === 'pending'
                      ? 'Your documents are under review. You will be able to complete your order once approved.'
                      : 'Please submit your KYC documents before placing an order as a business account.'}
                  </div>
                </div>
                <a href="/kyc" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flexShrink: 0 }}>
                  {kycStatus === 'submitted' || kycStatus === 'pending' ? 'View status' : 'Submit documents'}
                </a>
              </div>
            )}

            {step === 'address' && (
              <form onSubmit={createOrder} className={`card ${styles.formCard}`}>
                <h2 className={styles.formTitle}>Delivery details</h2>
                <div className={styles.field}>
                  <label className="label">Delivery address</label>
                  <textarea className="input" rows={3} value={form.deliveryAddress} onChange={set('deliveryAddress')} required placeholder="Full address including street, cell, sector…" />
                </div>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={form.requiresInstallation} onChange={set('requiresInstallation')} />
                  <span>Include professional installation (+RWF 15,000)</span>
                </label>
                <div className={styles.field}>
                  <label className="label">Order notes (optional)</label>
                  <input className="input" value={form.notes} onChange={set('notes')} placeholder="Special instructions for delivery…" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-3)' }} disabled={loading}>
                  {loading ? 'Processing…' : 'Continue to payment'}
                </button>
              </form>
            )}

            {step === 'payment' && (
              <div className={`card ${styles.formCard}`}>
                <h2 className={styles.formTitle}>Payment method</h2>
                <div className={styles.methodGrid}>
                  {PAYMENT_METHODS.map((m) => (
                    <label key={m.id} className={`${styles.methodCard} ${payMethod === m.id ? styles.methodCardActive : ''}`}>
                      <input type="radio" name="method" value={m.id} checked={payMethod === m.id} onChange={() => { setPayMethod(m.id); setStripeClientSecret(null); }} hidden />
                      <m.icon size={22} />
                      <div>
                        <div className={styles.methodLabel}>{m.label}</div>
                        <div className={styles.methodNote}>{m.note}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {payMethod === 'flutterwave' && (
                  <div style={{ paddingTop: 'var(--space-3)' }}>
                    <div className={styles.methodGrid} style={{ marginBottom: 'var(--space-4)' }}>
                      <label className={`${styles.methodCard} ${fwMode === 'momo' ? styles.methodCardActive : ''}`}>
                        <input type="radio" name="fwMode" value="momo" checked={fwMode === 'momo'} onChange={() => setFwMode('momo')} hidden />
                        <Smartphone size={20} />
                        <div>
                          <div className={styles.methodLabel}>MTN / Airtel Money</div>
                          <div className={styles.methodNote}>Pay directly with your phone number</div>
                        </div>
                      </label>
                      <label className={`${styles.methodCard} ${fwMode === 'redirect' ? styles.methodCardActive : ''}`}>
                        <input type="radio" name="fwMode" value="redirect" checked={fwMode === 'redirect'} onChange={() => setFwMode('redirect')} hidden />
                        <Landmark size={20} />
                        <div>
                          <div className={styles.methodLabel}>Card / Bank transfer</div>
                          <div className={styles.methodNote}>Secure Flutterwave checkout page</div>
                        </div>
                      </label>
                    </div>

                    {fwMode === 'momo' && (
                      <form onSubmit={handleFlutterwaveMomo} className={styles.stripeFields}>
                        <div className={styles.field}>
                          <label className="label">Network</label>
                          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <input type="radio" name="fwNetwork" checked={fwNetwork === 'mtn'} onChange={() => setFwNetwork('mtn')} /> MTN
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <input type="radio" name="fwNetwork" checked={fwNetwork === 'airtel'} onChange={() => setFwNetwork('airtel')} /> Airtel
                            </label>
                          </div>
                        </div>
                        <div className={styles.field}>
                          <label className="label">{fwNetwork === 'airtel' ? 'Airtel Money number' : 'MTN Mobile Money number'}</label>
                          <input className="input" placeholder="+250..." value={fwPhone} onChange={(e) => setFwPhone(e.target.value)} required />
                        </div>
                        {fwStatus && (
                          <div className="badge badge-amber" style={{ alignSelf: 'flex-start' }}>
                            Status: {fwStatus} {fwStatus === 'pending' && '— check your phone'}
                          </div>
                        )}
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-3)' }} disabled={loading || fwStatus === 'pending'}>
                          {loading ? 'Sending request…' : fwStatus === 'pending' ? 'Waiting for approval…' : `Pay RWF ${(subtotal + TAX + DELIVERY).toLocaleString()}`}
                        </button>
                      </form>
                    )}

                    {fwMode === 'redirect' && (
                      <>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-soft)', marginBottom: 'var(--space-3)' }}>
                          You'll be taken to a secure Flutterwave checkout page to pay by card or bank transfer.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleFlutterwaveRedirect} disabled={loading}>
                          {loading ? 'Redirecting…' : `Continue — RWF ${(subtotal + TAX + DELIVERY).toLocaleString()}`}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {payMethod === 'stripe' && (
                  stripeClientSecret && stripePublishableKey ? (
                    <Elements stripe={getStripe(stripePublishableKey)} options={{ clientSecret: stripeClientSecret }}>
                      <StripePaymentForm
                        clientSecret={stripeClientSecret}
                        amount={(subtotal + TAX + DELIVERY).toLocaleString()}
                        onSuccess={handleStripeSuccess}
                        onError={(msg) => toast(msg, 'error')}
                      />
                    </Elements>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-4) 0', color: 'var(--color-charcoal-soft)' }}>
                      <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Preparing secure payment form…
                    </div>
                  )
                )}

                {payMethod === 'momo' && (
                  <form onSubmit={handleMomo} className={styles.stripeFields}>
                    <div className={styles.field}>
                      <label className="label">MTN Mobile Money number</label>
                      <input className="input" placeholder="+250788123456" value={momoPhone} onChange={(e) => setMomoPhone(e.target.value)} required />
                    </div>
                    {momoStatus && (
                      <div className="badge badge-amber" style={{ alignSelf: 'flex-start' }}>
                        Status: {momoStatus} {momoStatus === 'PENDING' && '— check your phone'}
                      </div>
                    )}
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-3)' }} disabled={loading || momoStatus === 'PENDING'}>
                      {loading ? 'Sending request…' : momoStatus === 'PENDING' ? 'Waiting for approval…' : `Pay RWF ${(subtotal + TAX + DELIVERY).toLocaleString()} via MoMo`}
                    </button>
                  </form>
                )}

                {payMethod === 'paypal' && (
                  <div style={{ paddingTop: 'var(--space-3)' }}>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handlePaypal} disabled={loading}>
                      {loading ? 'Redirecting…' : `Continue with PayPal — RWF ${(subtotal + TAX + DELIVERY).toLocaleString()}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order summary sidebar */}
          <div className={`card ${styles.sidebar}`}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Summary</h3>
            <div className={styles.summRow}><span>Subtotal</span><span>RWF {subtotal.toLocaleString()}</span></div>
            <div className={styles.summRow}><span>VAT (18%)</span><span>RWF {TAX.toLocaleString()}</span></div>
            <div className={styles.summRow}><span>Delivery{form.requiresInstallation ? ' + Install' : ''}</span><span>RWF {DELIVERY.toLocaleString()}</span></div>
            <div className={`${styles.summRow} ${styles.summTotal}`}><span>Total</span><span>RWF {(subtotal + TAX + DELIVERY).toLocaleString()}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
