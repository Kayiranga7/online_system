import { useState, useEffect } from 'react';
import { ShoppingBag, Users, Leaf, ClipboardList, AlertCircle, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { StatusBadge, SkeletonLine, SkeletonCard } from '../components/UI';
import styles from './Dashboard.module.css';

const TONES = {
  green: {
    tile: 'var(--tile-green-bg)',
    icon: 'var(--on-solid, #D1FAE5)',
    ring: 'rgba(209, 250, 229, 0.22)',
  },
  gold: {
    tile: 'var(--tile-gold-bg)',
    icon: 'var(--on-solid, #FEF3C7)',
    ring: 'rgba(254, 243, 199, 0.22)',
  },
  red: {
    tile: 'var(--tile-red-bg)',
    icon: 'var(--on-solid, #FEE2E2)',
    ring: 'rgba(254, 226, 226, 0.22)',
  },
  neutral: {
    tile: 'var(--tile-neutral-bg)',
    icon: 'var(--on-solid, #E5E7EB)',
    ring: 'rgba(229, 231, 235, 0.2)',
  },
};

function StatCard({ icon: Icon, label, value, tone = 'green', index = 0 }) {
  const t = TONES[tone] || TONES.green;
  return (
    <div
      className={`${styles.statCard} card-enter`}
      style={{ animationDelay: `${index * 0.08}s`, animationFillMode: 'both' }}
    >
      <div
        className={styles.statIcon}
        style={{ '--tile': t.tile, '--tile-ring': t.ring, color: t.icon }}
      >
        <Icon size={22} />
      </div>
      <div>
        <div className={styles.statValue}>{value ?? '—'}</div>
        <div className={styles.statLabel}>{label}</div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.page}>
      <div className="container">
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <SkeletonLine width="300px" height="1.75rem" style={{ marginBottom: 'var(--space-2)' }} />
          <SkeletonLine width="200px" height="0.9rem" />
        </div>
        <div className={styles.statsGrid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`${styles.statCard} card-enter`} style={{ animationDelay: `${i * 0.08}s`, animationFillMode: 'both' }}>
              <SkeletonLine width="50px" height="50px" style={{ borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <SkeletonLine width="60px" height="1.75rem" style={{ marginBottom: 'var(--space-2)' }} />
                <SkeletonLine width="80px" height="0.75rem" />
              </div>
            </div>
          ))}
        </div>
        <SkeletonCard />
      </div>
    </div>
  );
}

function OrderRow({ order, index = 0 }) {
  return (
    <tr className={`${styles.tr} row-in`} style={{ '--stagger-i': index }}>
      <td className={styles.td}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{order.order_number}</span></td>
      <td className={styles.td}>{order.customer_name || '—'}</td>
      <td className={styles.td}><StatusBadge status={order.status} /></td>
      <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>RWF {Number(order.total_amount).toLocaleString()}</td>
    </tr>
  );
}

function TaskRow({ task, index = 0 }) {
  return (
    <tr className={`${styles.tr} row-in`} style={{ '--stagger-i': index }}>
      <td className={styles.td}>{task.title}</td>
      <td className={styles.td}><StatusBadge status={task.status} /></td>
      <td className={styles.td}><StatusBadge status={task.priority} /></td>
      <td className={styles.td} style={{ fontSize: '0.8rem' }}>{task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}</td>
    </tr>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (!data) return <div className={styles.page}><p>{t('dash.loadFailed')}</p></div>;

  const { stats, recentOrders = [], upcomingTasks = [], ordersByDistrict = [] } = data;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={`${styles.topRow} card-enter`}>
          <div>
            <h1 className={styles.heading}>
              {new Date().getHours() < 12
                ? t('dash.greeting.morning', { name: user?.fullName?.split(' ')[0] })
                : new Date().getHours() < 17
                  ? t('dash.greeting.afternoon', { name: user?.fullName?.split(' ')[0] })
                  : t('dash.greeting.evening', { name: user?.fullName?.split(' ')[0] })}
              👋
            </h1>
            <p className={styles.sub}>
              {new Date().toLocaleDateString(locale === 'rw' ? 'rw-RW' : locale === 'fr' ? 'fr-FR' : 'en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className={`badge ${user.role === 'admin' ? 'badge-red' : user.role === 'manager' ? 'badge-amber' : user.role === 'employee' ? 'badge-green' : 'badge-neutral'}`} style={{ fontSize: '0.8rem', padding: '0.3rem 0.9rem' }}>
            {user.role}
          </div>
        </div>

        {/* Stats grid */}
        {user.role === 'admin' && (
          <div className={styles.statsGrid}>
            <StatCard icon={Users} label={t('dash.totalUsers')} value={stats.totalUsers} tone="neutral" index={0} />
            <StatCard icon={ShoppingBag} label={t('dash.totalOrders')} value={stats.totalOrders} tone="green" index={1} />
            <StatCard icon={TrendingUp} label={t('dash.revenue')} value={`RWF ${Number(stats.totalRevenue || 0).toLocaleString()}`} tone="gold" index={2} />
            <StatCard icon={AlertCircle} label={t('dash.flaggedPayments')} value={stats.flaggedPayments} tone="red" index={3} />
          </div>
        )}
        {user.role === 'manager' && (
          <div className={styles.statsGrid}>
            <StatCard icon={ShoppingBag} label={t('dash.districtOrders')} value={stats.districtOrders} tone="green" index={0} />
            <StatCard icon={ClipboardList} label={t('dash.unassignedTasks')} value={stats.pendingTasks} tone="gold" index={1} />
            <StatCard icon={Users} label={t('dash.activeEmployees')} value={stats.activeEmployees} tone="neutral" index={2} />
            <StatCard icon={AlertCircle} label={t('dash.pendingTransfers')} value={stats.pendingTransfers} tone="gold" index={3} />
          </div>
        )}
        {user.role === 'employee' && (
          <div className={styles.statsGrid}>
            <StatCard icon={ClipboardList} label={t('dash.activeTasks')} value={stats.activeTasks} tone="green" index={0} />
            <StatCard icon={Leaf} label={t('dash.tasksCompleted')} value={stats.tasksCompleted} tone="green" index={1} />
          </div>
        )}
        {user.role === 'customer' && (
          <div className={styles.statsGrid}>
            <StatCard icon={ShoppingBag} label={t('dash.myOrders')} value={stats.totalOrders} tone="green" index={0} />
            <StatCard icon={Leaf} label={t('dash.wishlistItems')} value={stats.wishlistItems} tone="green" index={1} />
          </div>
        )}

        <div className={`${styles.mainGrid} card-enter`} style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
          {/* Recent orders table */}
          {recentOrders.length > 0 && (
            <div className={`card ${styles.tableCard}`}>
              <h3 className={styles.sectionTitle}>
                {user.role === 'customer' ? t('dash.yourRecentOrders') : t('dash.recentOrders')}
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>{t('dash.order')}</th>
                      {user.role !== 'customer' && <th className={styles.th}>{t('dash.customer')}</th>}
                      {user.role === 'customer' && <th className={styles.th}>{t('dash.status')}</th>}
                      {user.role !== 'customer' && <th className={styles.th}>{t('dash.status')}</th>}
                      <th className={styles.th} style={{ textAlign: 'right' }}>{t('dash.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o, i) => <OrderRow key={o.id} order={o} index={i} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Admin: orders by district chart */}
          {user.role === 'admin' && ordersByDistrict.length > 0 && (
            <div className={`card ${styles.chartCard}`}>
              <h3 className={styles.sectionTitle}>{t('dash.ordersByDistrict')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ordersByDistrict} barCategoryGap="35%">
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-charcoal-soft)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-charcoal-soft)' }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: 'var(--shadow-md)', fontSize: '0.85rem' }} />
                  <Bar dataKey="orderCount" fill="var(--accent-strong)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Employee: upcoming tasks */}
          {user.role === 'employee' && upcomingTasks.length > 0 && (
            <div className={`card ${styles.tableCard}`}>
              <h3 className={styles.sectionTitle}>{t('dash.upcomingTasks')}</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>{t('dash.task')}</th>
                      <th className={styles.th}>{t('dash.status')}</th>
                      <th className={styles.th}>{t('dash.priority')}</th>
                      <th className={styles.th}>{t('dash.due')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingTasks.map((t, i) => <TaskRow key={t.id} task={t} index={i} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
