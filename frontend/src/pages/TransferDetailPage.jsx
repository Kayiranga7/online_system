import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, FullPageSpinner, ConfirmModal, toast } from '../components/UI';
import styles from './Ops.module.css';

export default function TransferDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // boolean approve or null

  const isReviewer = user?.role === 'manager' || user?.role === 'admin';

  const load = () => {
    setLoading(true);
    api.get(`/transfers/${id}`)
      .then((r) => setRequest(r.data.transferRequest))
      .catch(() => toast('Failed to load transfer request.', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleReview = async () => {
    try {
      await api.patch(`/transfers/${id}/review`, { approve: confirm });
      toast(confirm ? 'Transfer approved.' : 'Transfer rejected.', 'success');
      setConfirm(null);
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Could not update transfer request.', 'error');
      setConfirm(null);
    }
  };

  if (loading) return <FullPageSpinner />;
  if (!request) return null;

  const backTo = isReviewer ? '/manager/transfers' : '/employee/transfers';

  return (
    <div className={styles.page}>
      <div className="container">
        <Link to={backTo} className={styles.backLink}><ArrowLeft size={14} /> Back to transfers</Link>

        <div className={`card ${styles.detailCard}`}>
          <div className={styles.detailHeaderRow}>
            <h1 className={styles.detailTitle}>Transfer request #{request.id}</h1>
            <StatusBadge status={request.status} />
          </div>

          <div className={styles.metaRow}>
            {isReviewer && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Employee</span>
                <span className={styles.metaValue}>{request.employee_name}</span>
              </div>
            )}
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Type</span>
              <span className={styles.metaValue}>{request.request_type}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Current district</span>
              <span className={styles.metaValue}>{request.current_district_name || '—'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Requested district</span>
              <span className={styles.metaValue}>{request.requested_district_name || '—'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Submitted</span>
              <span className={styles.metaValue}>{new Date(request.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            {request.reviewed_at && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Reviewed</span>
                <span className={styles.metaValue}>
                  {new Date(request.reviewed_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  {request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ''}
                </span>
              </div>
            )}
          </div>

          <p className={styles.metaLabel} style={{ marginBottom: '0.4rem' }}>Reason</p>
          <p className={styles.bodyText}>{request.reason || 'No reason provided.'}</p>

          {request.review_notes && (
            <>
              <p className={styles.metaLabel} style={{ marginTop: 'var(--space-4)', marginBottom: '0.4rem' }}>Review notes</p>
              <p className={styles.bodyText}>{request.review_notes}</p>
            </>
          )}

          {isReviewer && request.status === 'pending' && (
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
              <button className="btn btn-primary" onClick={() => setConfirm(true)}>
                <Check size={15} /> Approve
              </button>
              <button className="btn btn-outline" onClick={() => setConfirm(false)}>
                <X size={15} /> Reject
              </button>
            </div>
          )}
        </div>

        {confirm !== null && (
          <ConfirmModal
            message={confirm ? 'Approve this transfer request?' : 'Reject this transfer request?'}
            dangerous={!confirm}
            onConfirm={handleReview}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </div>
  );
}
