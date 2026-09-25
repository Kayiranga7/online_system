import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/* ─── Spinner ─── */
export function Spinner({ size = 24, color = 'var(--color-forest)' }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}
      >
        <circle
          cx="12" cy="12" r="10"
          stroke="var(--color-line)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 'var(--space-4)',
    }}>
      <Spinner size={40} />
      <span style={{
        fontSize: '0.85rem',
        color: 'var(--color-charcoal-soft)',
        fontWeight: 500,
      }}>Loading...</span>
    </div>
  );
}

/* ─── Skeleton Loaders ─── */
export function SkeletonLine({ width = '100%', height = '1rem', style = {} }) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: 'var(--radius-sm)',
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card card-enter" style={{ padding: 'var(--space-5)' }}>
      <SkeletonLine height="12rem" style={{ marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)' }} />
      <SkeletonLine width="60%" height="0.75rem" style={{ marginBottom: 'var(--space-2)' }} />
      <SkeletonLine width="80%" height="1rem" style={{ marginBottom: 'var(--space-3)' }} />
      <SkeletonLine width="40%" height="0.75rem" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card card-enter" style={{ padding: 'var(--space-5)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex',
          gap: 'var(--space-4)',
          padding: '0.75rem 0',
          borderBottom: i < rows - 1 ? '1px solid var(--color-line)' : 'none',
        }}>
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine
              key={j}
              width={j === 0 ? '30%' : '20%'}
              height="1rem"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Toast ─── */
let _setToast = null;
export function toast(msg, type = 'success', duration = 4000) {
  if (_setToast) _setToast({ msg, type, key: Date.now() });
}

export function ToastProvider() {
  const [t, setT] = useState(null);
  useEffect(() => { _setToast = setT; }, []);
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => setT(null), 4400);
    return () => clearTimeout(timer);
  }, [t?.key]);

  if (!t) return null;

  const colors = {
    success: 'var(--color-success)',
    error: 'var(--color-danger)',
    warning: 'var(--color-warning)',
  };

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      maxWidth: 380,
    }}>
      <div style={{
        background: 'var(--color-charcoal)',
        color: 'white',
        padding: '0.9rem 1.2rem',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        fontSize: '0.9rem',
        borderLeft: `4px solid ${colors[t.type] || colors.success}`,
      }}>
        <span style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: colors[t.type] || colors.success,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {icons[t.type] || icons.success}
        </span>
        <span style={{ flex: 1, lineHeight: 1.4 }}>{t.msg}</span>
        <button
          onClick={() => setT(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.color = 'white'}
          onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.5)'}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/* ─── StatusBadge ─── */
const STATUS_STYLES = {
  paid: 'badge-green', completed: 'badge-green', active: 'badge-green', approved: 'badge-green',
  in_progress: 'badge-green', delivered: 'badge-green', installed: 'badge-green',
  processing: 'badge-amber', assigned: 'badge-amber', pending: 'badge-amber', pending_payment: 'badge-amber',
  pending_approval: 'badge-amber', open: 'badge-amber', in_review: 'badge-amber',
  cancelled: 'badge-red', suspended: 'badge-red', rejected: 'badge-red', failed: 'badge-red',
};

export function StatusBadge({ status }) {
  return (
    <span
      className={`badge ${STATUS_STYLES[status] || 'badge-neutral'}`}
      style={{ transition: 'all 0.2s ease' }}
    >
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

/* ─── ConfirmModal ─── */
export function ConfirmModal({ message, onConfirm, onCancel, dangerous = false }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 500,
      animation: 'fadeIn 0.2s ease',
    }}>
      <div
        className="card card-enter"
        style={{
          padding: 'var(--space-6)',
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', marginBottom: 'var(--space-5)' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: dangerous ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 119, 6, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={20} color={dangerous ? 'var(--color-danger)' : 'var(--color-warning)'} />
          </div>
          <p style={{ fontSize: '0.95rem', color: 'var(--color-charcoal)', lineHeight: 1.5 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className={`btn ${dangerous ? 'btn-primary' : 'btn-secondary'}`}
            style={dangerous ? { background: 'var(--color-danger)', boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)' } : {}}
            onClick={onConfirm}
          >Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Pagination ─── */
export function Pagination({ page, total, limit, onChange }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', padding: 'var(--space-5) 0' }}>
      <button className="btn btn-outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span style={{ padding: '0.65rem 1rem', fontSize: '0.88rem', color: 'var(--color-charcoal-soft)' }}>
        {page} / {totalPages}
      </span>
      <button className="btn btn-outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

/* inject keyframe animations */
const style = document.createElement('style');
style.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeInScale { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
`;
document.head.appendChild(style);
