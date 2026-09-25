import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, SkeletonTable, Pagination, toast } from '../components/UI';
import styles from './Orders.module.css';

const STATUS_OPTS = ['pending_payment','paid','processing','assigned','in_progress','delivered','installed','completed','cancelled'];

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const LIMIT = 15;

  useEffect(() => {
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (statusFilter) params.set('status', statusFilter);
    setLoading(true);
    api.get(`/orders?${params}`)
      .then((r) => { setOrders(r.data.orders || []); setTotal(r.data.pagination?.total || 0); })
      .catch(() => toast('Failed to load orders.', 'error'))
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>
            {user?.role === 'customer' ? 'My orders' : 'Orders'}
          </h1>
          <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : orders.length === 0 ? (
          <div className={styles.empty}>
            <ShoppingBag size={40} color="var(--color-line)" />
            <p>No orders found.</p>
            {user?.role === 'customer' && <Link to="/plants" className="btn btn-primary">Shop now</Link>}
          </div>
        ) : (
          <>
            <div className={`card ${styles.tableCard}`}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Order #</th>
                      {user?.role !== 'customer' && <th className={styles.th}>Customer</th>}
                      {user?.role !== 'customer' && <th className={styles.th}>District</th>}
                      <th className={styles.th}>Status</th>
                      <th className={styles.th} style={{ textAlign: 'right' }}>Total</th>
                      <th className={styles.th}>Date</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className={styles.tr}>
                        <td className={styles.td}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{o.order_number}</span></td>
                        {user?.role !== 'customer' && <td className={styles.td}>{o.customer_name}</td>}
                        {user?.role !== 'customer' && <td className={styles.td}>{o.district_name}</td>}
                        <td className={styles.td}><StatusBadge status={o.status} /></td>
                        <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>RWF {Number(o.total_amount).toLocaleString()}</td>
                        <td className={styles.td} style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-soft)' }}>
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className={styles.td}>
                          <Link to={`/orders/${o.id}`} className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}>
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
