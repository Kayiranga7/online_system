import { useState, useEffect } from 'react';
import { ShoppingBag, Users, Leaf, ClipboardList, AlertCircle, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, SkeletonLine, SkeletonCard } from '../components/UI';
import styles from './Dashboard.module.css';

function StatCard({ icon: Icon, label, value, color = 'var(--color-forest)', index = 0 }) {
  return (
    <div
      className={`${styles.statCard} card-enter`}
      style={{ animationDelay: `${index * 0.08}s`, animationFillMode: 'both' }}
    >
      <div className={styles.statIcon} style={{ background: `${color}18`, color }}>
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

function OrderRow({ order }) {
  return (
    <tr className={styles.tr}>
      <td className={styles.td}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{order.order_number}</span></td>
      <td className={styles.td}>{order.customer_name || '—'}</td>
      <td className={styles.td}><StatusBadge status={order.status} /></td>
      <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>RWF {Number(order.total_amount).toLocaleString()}</td>
    </tr>
  );
}

function TaskRow({ task }) {
  return (
    <tr className={styles.tr}>
      <td className={styles.td}>{task.title}</td>
      <td className={styles.td}><StatusBadge status={task.status} /></td>
      <td className={styles.td}><StatusBadge status={task.priority} /></td>
      <td className={styles.td} style={{ fontSize: '0.8rem' }}>{task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}</td>
    </tr>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (!data) return <div className={styles.page}><p>Failed to load dashboard.</p></div>;

  const { stats, recentOrders = [], upcomingTasks = [], ordersByDistrict = [] } = data;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={`${styles.topRow} card-enter`}>
          <div>
            <h1 className={styles.heading}>
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},&nbsp;
              {user?.fullName?.split(' ')[0]} 👋
            </h1>
            <p className={styles.sub}>
              {new Date().toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className={`badge ${user.role === 'admin' ? 'badge-red' : user.role === 'manager' ? 'badge-amber' : user.role === 'employee' ? 'badge-green' : 'badge-neutral'}`} style={{ fontSize: '0.8rem', padding: '0.3rem 0.9rem' }}>
            {user.role}
          </div>
        </div>

        {/* Stats grid */}
        {user.role === 'admin' && (
          <div className={styles.statsGrid}>
            <StatCard icon={Users} label="Total users" value={stats.totalUsers} index={0} />
            <StatCard icon={ShoppingBag} label="Total orders" value={stats.totalOrders} color="var(--color-terracotta)" index={1} />
            <StatCard icon={TrendingUp} label="Revenue" value={`RWF ${Number(stats.totalRevenue || 0).toLocaleString()}`} color="var(--color-gold)" index={2} />
            <StatCard icon={AlertCircle} label="Flagged payments" value={stats.flaggedPayments} color="var(--color-danger)" index={3} />
          </div>
        )}
        {user.role === 'manager' && (
          <div className={styles.statsGrid}>
            <StatCard icon={ShoppingBag} label="District orders" value={stats.districtOrders} index={0} />
            <StatCard icon={ClipboardList} label="Unassigned tasks" value={stats.pendingTasks} color="var(--color-terracotta)" index={1} />
            <StatCard icon={Users} label="Active employees" value={stats.activeEmployees} color="var(--color-moss)" index={2} />
            <StatCard icon={AlertCircle} label="Pending transfers" value={stats.pendingTransfers} color="var(--color-gold)" index={3} />
          </div>
        )}
        {user.role === 'employee' && (
          <div className={styles.statsGrid}>
            <StatCard icon={ClipboardList} label="Active tasks" value={stats.activeTasks} color="var(--color-terracotta)" index={0} />
            <StatCard icon={Leaf} label="Tasks completed" value={stats.tasksCompleted} color="var(--color-success)" index={1} />
          </div>
        )}
        {user.role === 'customer' && (
          <div className={styles.statsGrid}>
            <StatCard icon={ShoppingBag} label="My orders" value={stats.totalOrders} index={0} />
            <StatCard icon={Leaf} label="Wishlist items" value={stats.wishlistItems} color="var(--color-terracotta)" index={1} />
          </div>
        )}

        <div className={`${styles.mainGrid} card-enter`} style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
          {/* Recent orders table */}
          {recentOrders.length > 0 && (
            <div className={`card ${styles.tableCard}`}>
              <h3 className={styles.sectionTitle}>
                {user.role === 'customer' ? 'Your recent orders' : 'Recent orders'}
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Order</th>
                      {user.role !== 'customer' && <th className={styles.th}>Customer</th>}
                      {user.role === 'customer' && <th className={styles.th}>Status</th>}
                      {user.role !== 'customer' && <th className={styles.th}>Status</th>}
                      <th className={styles.th} style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o) => <OrderRow key={o.id} order={o} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Admin: orders by district chart */}
          {user.role === 'admin' && ordersByDistrict.length > 0 && (
            <div className={`card ${styles.chartCard}`}>
              <h3 className={styles.sectionTitle}>Orders by district</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ordersByDistrict} barCategoryGap="35%">
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-charcoal-soft)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-charcoal-soft)' }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: 'var(--shadow-md)', fontSize: '0.85rem' }} />
                  <Bar dataKey="orderCount" fill="var(--color-terracotta)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Employee: upcoming tasks */}
          {user.role === 'employee' && upcomingTasks.length > 0 && (
            <div className={`card ${styles.tableCard}`}>
              <h3 className={styles.sectionTitle}>My upcoming tasks</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Task</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>Priority</th>
                      <th className={styles.th}>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingTasks.map((t) => <TaskRow key={t.id} task={t} />)}
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
