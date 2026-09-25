import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bell } from 'lucide-react';
import api from '../services/api';
import { useNotif } from '../context/NotifContext';
import { FullPageSpinner, toast } from '../components/UI';
import styles from './Ops.module.css';

const ENTITY_LINKS = {
  order: (id) => `/orders/${id}`,
};

export default function NotificationDetailPage() {
  const { id } = useParams();
  const { markRead } = useNotif();
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/notifications/${id}`)
      .then((r) => {
        setNotification(r.data.notification);
        if (!r.data.notification.isRead) markRead(id);
      })
      .catch(() => toast('Failed to load notification.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <FullPageSpinner />;
  if (!notification) return null;

  const entityLink = notification.relatedEntityType && ENTITY_LINKS[notification.relatedEntityType]
    ? ENTITY_LINKS[notification.relatedEntityType](notification.relatedEntityId)
    : null;

  return (
    <div className={styles.page}>
      <div className="container">
        <Link to="/dashboard" className={styles.backLink}><ArrowLeft size={14} /> Back to dashboard</Link>

        <div className={`card ${styles.detailCard}`}>
          <div className={styles.detailHeaderRow}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <Bell size={20} color="var(--color-forest)" style={{ marginTop: 3 }} />
              <h1 className={styles.detailTitle}>{notification.title}</h1>
            </div>
            <span className="badge badge-neutral">{notification.category?.replace(/_/g, ' ')}</span>
          </div>

          <p className={styles.bodyText}>{notification.message}</p>

          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Received</span>
              <span className={styles.metaValue}>{new Date(notification.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            {notification.readAt && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Read</span>
                <span className={styles.metaValue}>{new Date(notification.readAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
          </div>

          {entityLink && (
            <Link to={entityLink} className="btn btn-primary" style={{ display: 'inline-flex' }}>
              View related details <ArrowRight size={15} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
