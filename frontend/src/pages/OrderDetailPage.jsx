import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Package, MapPin, Truck, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, FullPageSpinner, ConfirmModal, toast } from '../components/UI';
import styles from './OrderDetail.module.css';

const NEXT_STATUS = {
  paid: ['processing'],
  processing: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['delivered', 'installed'],
  delivered: ['completed'],
  installed: ['completed'],
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get(`/orders/${id}`).then((r) => setData(r.data)).catch(() => toast('Failed to load order.', 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [id]);

  // Returning from Flutterwave's hosted checkout (?payment=success|failed)
  useEffect(() => {
    const payment = params.get('payment');
    if (!payment) return;
    toast(
      payment === 'success' ? 'Payment confirmed! Thank you.' : 'Payment was not completed. You can try again from Checkout.',
      payment === 'success' ? 'success' : 'error'
    );
    navigate(`/orders/${id}`, { replace: true }); // strip the query param
    if (payment === 'success') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const handleCancel = async () => {
    try {
      await api.post(`/orders/${id}/cancel`, {});
      toast('Order cancelled.', 'success');
      setConfirmCancel(false);
      load();
    } catch (err) { toast(err.response?.data?.error || 'Could not cancel order.', 'error'); }
  };

  const advanceStatus = async (status) => {
    try {
      await api.patch(`/orders/${id}/status`, { status });
      toast(`Order marked as ${status.replace('_', ' ')}.`, 'success');
      load();
    } catch (err) { toast(err.response?.data?.error || 'Could not update status.', 'error'); }
  };

  if (loading) return <FullPageSpinner />;
  if (!data) return null;

  const { order, items, tracking, payments } = data;
  const canCancel = user.role === 'customer' && ['pending_payment', 'paid'].includes(order.status);
  const nextOptions = (user.role === 'manager' || user.role === 'admin') ? (NEXT_STATUS[order.status] || []) : [];

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <div>
            <span className={styles.orderNum}>{order.order_number}</span>
            <h1 className={styles.heading}>Order details</h1>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className={styles.layout}>
          <div className={styles.main}>
            {/* Items */}
            <div className={`card ${styles.section}`}>
              <h3 className={styles.sectionTitle}><Package size={16} /> Items</h3>
              {items.map((it) => (
                <div key={it.id} className={styles.lineItem}>
                  <span>{it.item_name_snapshot} <span style={{ color: 'var(--color-charcoal-soft)' }}>× {it.quantity}</span></span>
                  <span style={{ fontWeight: 600 }}>RWF {Number(it.line_total).toLocaleString()}</span>
                </div>
              ))}
              <div className={styles.totalsBlock}>
                <div className={styles.totalRow}><span>Subtotal</span><span>RWF {Number(order.subtotal).toLocaleString()}</span></div>
                <div className={styles.totalRow}><span>Tax</span><span>RWF {Number(order.tax_amount).toLocaleString()}</span></div>
                <div className={styles.totalRow}><span>Delivery</span><span>RWF {Number(order.delivery_fee).toLocaleString()}</span></div>
                <div className={`${styles.totalRow} ${styles.grandTotal}`}><span>Total</span><span>RWF {Number(order.total_amount).toLocaleString()}</span></div>
              </div>
            </div>

            {/* Delivery info */}
            <div className={`card ${styles.section}`}>
              <h3 className={styles.sectionTitle}><MapPin size={16} /> Delivery address</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>{order.delivery_address}</p>
              {order.requires_installation === 1 && <span className="badge badge-amber" style={{ marginTop: 8 }}>Installation requested</span>}
            </div>

            {/* Tracking */}
            {tracking.length > 0 && (
              <div className={`card ${styles.section}`}>
                <h3 className={styles.sectionTitle}><Truck size={16} /> Tracking history</h3>
                <div className={styles.timeline}>
                  {tracking.map((t) => (
                    <div key={t.id} className={styles.timelineItem}>
                      <div className={styles.timelineDot} />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '0.88rem', textTransform: 'capitalize' }}>{t.status.replace('_', ' ')}</p>
                        <p style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-soft)' }}>{new Date(t.updated_at).toLocaleString()}</p>
                        {t.notes && <p style={{ fontSize: '0.82rem', marginTop: 4 }}>{t.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar actions */}
          <div className={`card ${styles.sidebar}`}>
            <h3 className={styles.sectionTitle}>Actions</h3>
            {nextOptions.length > 0 && (
              <div className={styles.actionGroup}>
                <p className={styles.actionLabel}>Update status:</p>
                {nextOptions.map((s) => (
                  <button key={s} className="btn btn-secondary" style={{ width: '100%', marginBottom: 6 }} onClick={() => advanceStatus(s)}>
                    Mark as {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}
            {canCancel && (
              <button className="btn btn-outline" style={{ width: '100%', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={() => setConfirmCancel(true)}>
                <X size={15} /> Cancel order
              </button>
            )}
            {payments?.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <p className={styles.actionLabel}>Payment</p>
                {payments.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.4rem 0' }}>
                    <span style={{ textTransform: 'capitalize' }}>{p.provider.replace('_', ' ')}</span>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            )}
            <Link to="/orders" className="btn btn-ghost" style={{ width: '100%', marginTop: 'var(--space-3)' }}>← Back to orders</Link>
          </div>
        </div>
      </div>

      {confirmCancel && (
        <ConfirmModal message="Cancel this order? This cannot be undone." dangerous onConfirm={handleCancel} onCancel={() => setConfirmCancel(false)} />
      )}
    </div>
  );
}
