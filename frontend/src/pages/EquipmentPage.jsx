import { useState, useEffect } from 'react';
import { Plus, Wrench } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import styles from './Ops.module.css';

export default function EquipmentPage() {
  const { user } = useAuth();
  const [equipment, setEquipment] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', serialNumber: '', districtId: '', purchaseDate: '', purchaseCost: '', conditionNotes: '' });
  // Tracks assignmentId per equipmentId for items checked out during this session,
  // so we can offer a "Check in" action right after checkout.
  const [assignments, setAssignments] = useState({});
  const [checkoutFor, setCheckoutFor] = useState(null);
  const [checkoutEmployee, setCheckoutEmployee] = useState('');

  const loadEquipment = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    setLoading(true);
    api.get(`/equipment?${params}`)
      .then((r) => setEquipment(r.data.equipment || []))
      .catch(() => toast('Failed to load equipment.', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadEquipment(); }, [statusFilter]);
  useEffect(() => {
    api.get('/users?role=employee&status=active').then((r) => setEmployees(r.data.users || [])).catch(() => {});
    api.get('/users/districts').then((r) => setDistricts(r.data.districts || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/equipment', {
        ...form,
        districtId: form.districtId ? Number(form.districtId) : undefined,
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
      });
      toast('Equipment registered.', 'success');
      setShowCreate(false);
      setForm({ name: '', serialNumber: '', districtId: '', purchaseDate: '', purchaseCost: '', conditionNotes: '' });
      loadEquipment();
    } catch (err) { toast(err.response?.data?.error || 'Failed to register equipment.', 'error'); }
  };

  const handleCheckout = async (equipmentId) => {
    if (!checkoutEmployee) { toast('Choose an employee to assign it to.', 'error'); return; }
    try {
      const r = await api.post('/equipment/checkout', { equipmentId, employeeId: Number(checkoutEmployee) });
      setAssignments((a) => ({ ...a, [equipmentId]: r.data.assignmentId }));
      toast('Equipment checked out.', 'success');
      setCheckoutFor(null);
      setCheckoutEmployee('');
      loadEquipment();
    } catch (err) { toast(err.response?.data?.error || 'Could not check out equipment.', 'error'); }
  };

  const handleCheckin = async (equipmentId) => {
    const assignmentId = assignments[equipmentId];
    if (!assignmentId) return;
    try {
      await api.patch(`/equipment/checkin/${assignmentId}`, { newStatus: 'available' });
      toast('Equipment checked in.', 'success');
      setAssignments((a) => { const next = { ...a }; delete next[equipmentId]; return next; });
      loadEquipment();
    } catch (err) { toast(err.response?.data?.error || 'Could not check in equipment.', 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Equipment</h1>
          <div className={styles.headerActions}>
            <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {['available', 'in_use', 'maintenance', 'retired'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            {user?.role !== 'employee' && (
              <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
                <Plus size={16} /> Register equipment
              </button>
            )}
          </div>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className={`card ${styles.createForm}`}>
            <h3 className={styles.sectionTitle}>Register new equipment</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}><label>Name *</label><input className="input" value={form.name} onChange={set('name')} required /></div>
              <div className={styles.field}><label>Serial number</label><input className="input" value={form.serialNumber} onChange={set('serialNumber')} /></div>
              <div className={styles.field}><label>District</label>
                <select className="input" value={form.districtId} onChange={set('districtId')}>
                  <option value="">— None —</option>
                  {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className={styles.field}><label>Purchase date</label><input className="input" type="date" value={form.purchaseDate} onChange={set('purchaseDate')} /></div>
              <div className={styles.field}><label>Purchase cost</label><input className="input" type="number" min="0" step="0.01" value={form.purchaseCost} onChange={set('purchaseCost')} /></div>
              <div className={`${styles.field} ${styles.span2}`}><label>Condition notes</label><textarea className="input" rows={2} value={form.conditionNotes} onChange={set('conditionNotes')} /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Register</button>
            </div>
          </form>
        )}

        {loading ? <FullPageSpinner /> : equipment.length === 0 ? (
          <div className={styles.empty}><Wrench size={40} color="var(--color-line)" /><p>No equipment found.</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Name</th>
                    <th className={styles.th}>Serial</th>
                    <th className={styles.th}>District</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((eq) => (
                    <tr key={eq.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 500 }}>{eq.name}</td>
                      <td className={styles.td}>{eq.serial_number || '—'}</td>
                      <td className={styles.td}>{eq.district_name || '—'}</td>
                      <td className={styles.td}><StatusBadge status={eq.status} /></td>
                      <td className={styles.td}>
                        {eq.status === 'available' && checkoutFor === eq.id && (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <select className="input" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.3rem 0.5rem' }} value={checkoutEmployee} onChange={(e) => setCheckoutEmployee(e.target.value)}>
                              <option value="">Assign to…</option>
                              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
                            </select>
                            <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => handleCheckout(eq.id)}>Confirm</button>
                            <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => setCheckoutFor(null)}>Cancel</button>
                          </div>
                        )}
                        {eq.status === 'available' && checkoutFor !== eq.id && (
                          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => setCheckoutFor(eq.id)}>Check out</button>
                        )}
                        {eq.status === 'in_use' && assignments[eq.id] && (
                          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => handleCheckin(eq.id)}>Check in</button>
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
