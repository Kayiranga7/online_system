import { useState, useEffect } from 'react';
import { ShieldAlert, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import styles from './Ops.module.css';

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/payments/flagged')
      .then((r) => setPayments(r.data.flaggedPayments || []))
      .catch(() => toast('Failed to load flagged payments.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Payments</h1>
        </div>

        <div className={`card ${styles.createForm}`} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ShieldAlert size={20} color="var(--color-warning)" />
          <p style={{ fontSize: '0.9rem', color: 'var(--color-charcoal-soft)' }}>
            These payments were automatically flagged by fraud scoring and may need manual review.
          </p>
        </div>

        {loading ? <FullPageSpinner /> : payments.length === 0 ? (
          <div className={styles.empty}><CreditCard size={40} color="var(--color-line)" /><p>No flagged payments right now.</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Order</th>
                    <th className={styles.th}>Customer</th>
                    <th className={styles.th}>Provider</th>
                    <th className={styles.th}>Amount</th>
                    <th className={styles.th}>Fraud score</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className={styles.tr}>
                      <td className={styles.td}>
                        <Link to={`/orders/${p.order_id}`} style={{ color: 'var(--color-forest)', fontWeight: 600 }}>{p.order_number}</Link>
                      </td>
                      <td className={styles.td}>{p.customer_name}</td>
                      <td className={styles.td}><span className="badge badge-neutral">{p.provider?.replace('_', ' ')}</span></td>
                      <td className={styles.td}>{p.amount} {p.currency}</td>
                      <td className={styles.td} style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{p.fraud_score}</td>
                      <td className={styles.td}><StatusBadge status={p.status} /></td>
                      <td className={styles.td} style={{ fontSize: '0.8rem' }}>{new Date(p.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
