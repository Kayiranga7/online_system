import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { StatusBadge, SkeletonTable, Pagination, toast } from '../components/UI';
import styles from './Orders.module.css';

const STATUS_OPTS = ['pending_payment','paid','processing','assigned','in_progress','delivered','installed','completed','cancelled'];

export default function OrdersPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
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
      .catch(() => toast(t('orders.loadFailed'), 'error'))
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>
            {user?.role === 'customer' ? t('orders.myOrders') : t('orders.title')}
          </h1>
          <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">{t('orders.allStatuses')}</option>
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : orders.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><ShoppingBag size={30} /></div>
            <p className={styles.emptyTitle}>{t('orders.empty')}</p>
            {user?.role === 'customer' && <Link to="/plants" className="btn btn-primary">{t('orders.shopNow')}</Link>}
          </div>
        ) : (
          <>
            <div className={`card ${styles.tableCard}`}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>{t('orders.orderNumber')}</th>
                      {user?.role !== 'customer' && <th className={styles.th}>{t('dash.customer')}</th>}
                      {user?.role !== 'customer' && <th className={styles.th}>{t('orders.district')}</th>}
                      <th className={styles.th}>{t('dash.status')}</th>
                      <th className={styles.th} style={{ textAlign: 'right' }}>{t('dash.total')}</th>
                      <th className={styles.th}>{t('orders.date')}</th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={o.id} className={`${styles.tr} row-in`} style={{ '--stagger-i': i }}>
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
                            {t('ui.view')} →
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
