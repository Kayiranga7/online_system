import { useEffect, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotif } from '../context/NotifContext';
import styles from './NotifDropdown.module.css';

const CATEGORY_COLORS = {
  order_update: 'var(--color-forest)',
  payment: 'var(--color-gold)',
  task_assignment: 'var(--accent-strong)',
  system_alert: 'var(--color-danger)',
  transfer_request: 'var(--color-moss)',
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotifDropdown({ onClose }) {
  const { notifications, unreadCount, markAllRead } = useNotif();
  const ref = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const openNotification = (n) => {
    onClose();
    navigate(`/notifications/${n.id}`);
  };

  return (
    <div ref={ref} className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}><Bell size={15} /> Notifications</span>
        {unreadCount > 0 && (
          <button className={styles.markAll} onClick={markAllRead}>
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      <div className={styles.list}>
        {notifications.length === 0 ? (
          <div className={styles.empty}>No notifications yet.</div>
        ) : (
          notifications.slice(0, 15).map((n) => (
            <div
              key={n.id}
              className={`${styles.item} ${n.isRead ? styles.itemRead : styles.itemUnread}`}
              onClick={() => openNotification(n)}
            >
              <div
                className={styles.dot}
                style={{ background: CATEGORY_COLORS[n.category] || 'var(--color-moss)' }}
              />
              <div className={styles.itemBody}>
                <p className={styles.itemTitle}>{n.title}</p>
                <p className={styles.itemMsg}>{n.message}</p>
                <span className={styles.itemTime}>{timeAgo(n.createdAt || n.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
