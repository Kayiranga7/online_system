import { useState, useEffect } from 'react';
import { Building2, Check, X } from 'lucide-react';
import api from '../services/api';
import { StatusBadge, FullPageSpinner, ConfirmModal, toast } from '../components/UI';
import styles from './Ops.module.css';

export default function InstitutionsPage() {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending_approval');
  const [confirm, setConfirm] = useState(null); // { id, approve }

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    setLoading(true);
    api.get(`/institutions?${params}`)
      .then((r) => setInstitutions(r.data.institutions || []))
      .catch(() => toast('Failed to load institutions.', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleReview = async () => {
    if (!confirm) return;
    try {
      await api.patch(`/institutions/${confirm.id}/review`, { approve: confirm.approve });
      toast(confirm.approve ? 'Institution approved.' : 'Institution rejected.', 'success');
      setConfirm(null);
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Could not update institution.', 'error');
      setConfirm(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Institutions</h1>
          <div className={styles.headerActions}>
            <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {['pending_approval', 'active', 'suspended'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>

        {loading ? <FullPageSpinner /> : institutions.length === 0 ? (
          <div className={styles.empty}><Building2 size={40} color="var(--color-line)" /><p>No institutions found.</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Name</th>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Owner</th>
                    <th className={styles.th}>District</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {institutions.map((i) => (
                    <tr key={i.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 500 }}>{i.name}</td>
                      <td className={styles.td}><span className="badge badge-neutral">{i.type}</span></td>
                      <td className={styles.td}>{i.owner_name}</td>
                      <td className={styles.td}>{i.district_name || '—'}</td>
                      <td className={styles.td}><StatusBadge status={i.status} /></td>
                      <td className={styles.td}>
                        {i.status === 'pending_approval' && (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => setConfirm({ id: i.id, approve: true })}>
                              <Check size={13} /> Approve
                            </button>
                            <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => setConfirm({ id: i.id, approve: false })}>
                              <X size={13} /> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {confirm && (
          <ConfirmModal
            message={confirm.approve ? 'Approve this institution?' : 'Reject this institution? The owner will be notified.'}
            dangerous={!confirm.approve}
            onConfirm={handleReview}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </div>
  );
}
