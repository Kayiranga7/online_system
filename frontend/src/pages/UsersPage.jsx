import { useState, useEffect } from 'react';
import { UserPlus, Search } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import styles from './Tasks.module.css';

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(null); // 'manager' | 'employee' | null
  const [districts, setDistricts] = useState([]);
  const [form, setForm] = useState({ fullName: '', email: '', phoneNumber: '', district: '', password: '', specialty: '' });

  const load = () => {
    const params = new URLSearchParams();
    if (roleFilter) params.set('role', roleFilter);
    if (search) params.set('search', search);
    setLoading(true);
    api.get(`/users?${params}`).then((r) => setUsers(r.data.users || [])).catch(() => toast('Failed to load users.', 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [roleFilter, search]);
  useEffect(() => { api.get('/users/districts').then((r) => setDistricts(r.data.districts || [])); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const endpoint = showCreate === 'manager' ? '/users/managers' : '/users/employees';
      await api.post(endpoint, { ...form, district: form.district ? Number(form.district) : undefined });
      toast(`${showCreate === 'manager' ? 'Manager' : 'Employee'} account created.`, 'success');
      setShowCreate(null);
      setForm({ fullName: '', email: '', phoneNumber: '', district: '', password: '', specialty: '' });
      load();
    } catch (err) { toast(err.response?.data?.error || 'Failed to create account.', 'error'); }
  };

  const toggleStatus = async (u) => {
    const newStatus = u.status === 'active' ? 'suspended' : 'active';
    try {
      await api.patch(`/users/${u.id}/status`, { status: newStatus });
      toast(`User ${newStatus}.`, 'success');
      load();
    } catch (err) { toast(err.response?.data?.error || 'Could not update status.', 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Users</h1>
          <div className={styles.headerActions}>
            <div style={{ position: 'relative' }}>
              <input className="input" placeholder="Search…" style={{ paddingRight: '2rem', width: 180 }} value={search} onChange={(e) => setSearch(e.target.value)} />
              <Search size={15} aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-charcoal-soft)', pointerEvents: 'none' }} />
            </div>
            <select className="input" style={{ width: 'auto' }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {['admin','manager','employee','customer'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {me.role === 'admin' && <button className="btn btn-outline" onClick={() => setShowCreate('manager')}><UserPlus size={15} /> Manager</button>}
            <button className="btn btn-primary" onClick={() => setShowCreate('employee')}><UserPlus size={15} /> Employee</button>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className={`card ${styles.createForm}`}>
            <h3 className={styles.sectionTitle}>Create {showCreate} account</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}><label className="label">Full name *</label><input className="input" value={form.fullName} onChange={set('fullName')} required /></div>
              <div className={styles.field}><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={set('email')} required /></div>
              <div className={styles.field}><label className="label">Phone</label><input className="input" value={form.phoneNumber} onChange={set('phoneNumber')} /></div>
              {(showCreate === 'manager' || me.role === 'admin') && (
                <div className={styles.field}><label className="label">District {showCreate === 'manager' ? '*' : ''}</label>
                  <select className="input" value={form.district} onChange={set('district')} required={showCreate === 'manager'}>
                    <option value="">Select…</option>
                    {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              {showCreate === 'employee' && (
                <div className={styles.field}><label className="label">Specialty</label><input className="input" value={form.specialty} onChange={set('specialty')} placeholder="e.g. Irrigation" /></div>
              )}
              <div className={styles.field}><label className="label">Temporary password *</label><input className="input" type="password" value={form.password} onChange={set('password')} required minLength={8} /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create account</button>
            </div>
          </form>
        )}

        {loading ? <FullPageSpinner /> : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Name</th>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>District</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 500 }}>{u.fullName}</td>
                      <td className={styles.td} style={{ fontSize: '0.83rem' }}>{u.email}</td>
                      <td className={styles.td}><span className="badge badge-neutral">{u.role}</span></td>
                      <td className={styles.td}>{u.districtName || '—'}</td>
                      <td className={styles.td}><StatusBadge status={u.status} /></td>
                      <td className={styles.td}>
                        {u.role !== 'admin' && (
                          <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }} onClick={() => toggleStatus(u)}>
                            {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>
                        )}
                      </td>
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
