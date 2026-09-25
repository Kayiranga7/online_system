import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Plus, ChevronRight } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import styles from './Ops.module.css';

export default function TransfersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isReviewer = user?.role === 'manager' || user?.role === 'admin';

  const [requests, setRequests] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ requestType: 'district', requestedDistrictId: '', reason: '' });

  const load = () => {
    setLoading(true);
    api.get('/transfers')
      .then((r) => setRequests(r.data.transferRequests || []))
      .catch(() => toast('Failed to load transfer requests.', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get('/users/districts').then((r) => setDistricts(r.data.districts || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/transfers', { ...form, requestedDistrictId: form.requestedDistrictId ? Number(form.requestedDistrictId) : undefined });
      toast('Transfer request submitted.', 'success');
      setShowCreate(false);
      setForm({ requestType: 'district', requestedDistrictId: '', reason: '' });
      load();
    } catch (err) { toast(err.response?.data?.error || 'Failed to submit transfer request.', 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Transfers</h1>
          {!isReviewer && (
            <div className={styles.headerActions}>
              <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
                <Plus size={16} /> Request transfer
              </button>
            </div>
          )}
        </div>

        {showCreate && !isReviewer && (
          <form onSubmit={handleCreate} className={`card ${styles.createForm}`}>
            <h3 className={styles.sectionTitle}>New transfer request</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}><label>Type</label>
                <select className="input" value={form.requestType} onChange={set('requestType')}>
                  <option value="district">District</option>
                  <option value="institution">Institution</option>
                </select>
              </div>
              {form.requestType === 'district' && (
                <div className={styles.field}><label>Requested district</label>
                  <select className="input" value={form.requestedDistrictId} onChange={set('requestedDistrictId')} required>
                    <option value="">Select district…</option>
                    {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              <div className={`${styles.field} ${styles.span2}`}><label>Reason</label>
                <textarea className="input" rows={2} value={form.reason} onChange={set('reason')} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Submit request</button>
            </div>
          </form>
        )}

        {loading ? <FullPageSpinner /> : requests.length === 0 ? (
          <div className={styles.empty}><ArrowLeftRight size={40} color="var(--color-line)" /><p>No transfer requests found.</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {isReviewer && <th className={styles.th}>Employee</th>}
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>From</th>
                    <th className={styles.th}>Requested</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className={styles.tr} style={{ cursor: 'pointer' }} onClick={() => navigate(`/transfers/${r.id}`)}>
                      {isReviewer && <td className={styles.td} style={{ fontWeight: 500 }}>{r.employee_name}</td>}
                      <td className={styles.td}><span className="badge badge-neutral">{r.request_type}</span></td>
                      <td className={styles.td}>{r.current_district_name || '—'}</td>
                      <td className={styles.td}>{r.requested_district_name || '—'}</td>
                      <td className={styles.td}><StatusBadge status={r.status} /></td>
                      <td className={styles.td} style={{ color: 'var(--color-charcoal-soft)' }}><ChevronRight size={16} /></td>
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
