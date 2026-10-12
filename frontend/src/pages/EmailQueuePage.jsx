import { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, RefreshCw, RotateCw, AlertTriangle, Search, X } from 'lucide-react';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { StatusBadge, Pagination, FullPageSpinner, ConfirmModal, toast } from '../components/UI';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import styles from './Ops.module.css';

const LIMIT = 20;

// Seconds and the year-every-time format cost more width than they add here: the
// admin needs to spot when a send happened, not read an audit timestamp to the second.
const formatWhen = (value) => (value
  ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—');

// Email is sent in the background, so without this page a failed verification or
// password reset is only visible in the server log file.
export default function EmailQueuePage() {
  const { t } = useLanguage();
  const [emails, setEmails] = useState([]);
  const [summary, setSummary] = useState({ queued: 0, sent: 0, failed: 0, total: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [retryNotice, setRetryNotice] = useState(null);
  const requestSeq = useRef(0);

  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Debounced search: the list is only re-fetched once typing pauses.
  useEffect(() => {
    setSearch(debouncedSearch);
    setPage(1);
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const res = await api.get(`/emails?${params}`);
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setEmails(res.data.emails || []);
      setSummary(res.data.summary || { queued: 0, sent: 0, failed: 0, total: 0 });
      setTotal(res.data.pagination?.total || 0);
    } catch {
      if (seq === requestSeq.current) toast(t('emails.loadFailed'), 'error');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [page, status, search, reloadKey]);

  useEffect(() => { load(); }, [load]);

  // Skip reasons arrive with a machine code so the common ones can be translated;
  // anything new falls back to the server's own wording.
  const skipLabel = (entry) => {
    const key = `emails.skip.${entry.code}`;
    const translated = t(key);
    return translated === key ? entry.reason : translated;
  };

  const describeRetry = (report) => {
    const summary = t('emails.retrySummary', { sent: report.sent, skipped: report.skipped.length, failed: report.failed });
    const counted = report.skipped.reduce((acc, entry) => {
      const label = skipLabel(entry);
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const reasons = Object.entries(counted).map(([label, count]) => `${label} ×${count}`);
    // When a re-send failed again, the provider's own message is the line worth
    // showing - and the toast must not claim the links simply went stale.
    if (report.errors?.length) reasons.unshift(report.errors[0].error);
    setRetryNotice(reasons.length ? `${summary} — ${reasons.join(', ')}` : summary);

    if (report.sent > 0) toast(summary, 'success');
    else if (report.failed > 0) toast(summary, 'error');
    else toast(t('emails.retryNothing'), 'warning');
  };

  const retryAllFailed = async () => {
    setConfirmRetry(false);
    setRetrying(true);
    try {
      const res = await api.post('/emails/retry', {});
      describeRetry(res.data);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast(err.response?.data?.error || t('emails.retryRequestFailed'), 'error');
    } finally {
      setRetrying(false);
    }
  };

  const retryOne = async (id) => {
    setRetrying(true);
    try {
      await api.post(`/emails/${id}/retry`, {});
      setRetryNotice(t('emails.retryOneSent'));
      toast(t('emails.retryOneSent'), 'success');
      setReloadKey((k) => k + 1);
    } catch (err) {
      // A stale link comes back as a 409 with the reason, which is the expected
      // answer for an old verification or reset email.
      toast(err.response?.data?.error || t('emails.retryRequestFailed'), 'error');
    } finally {
      setRetrying(false);
    }
  };

  const chip = (label, value, tone) => (
    <div
      key={label}
      style={{
        display: 'flex', flexDirection: 'column', gap: '0.15rem',
        padding: '0.6rem 1rem', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-line)', background: 'var(--color-sage)',
        minWidth: '5.5rem',
      }}
    >
      <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-charcoal-soft)' }}>{label}</span>
      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: tone || 'var(--color-charcoal)' }}>{value}</span>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>{t('emails.title')}</h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-soft)', marginTop: '0.25rem' }}>
              {t('emails.subtitle')}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              className="btn btn-primary"
              onClick={() => setConfirmRetry(true)}
              disabled={retrying || loading || summary.failed === 0}
            >
              <RotateCw size={15} /> {t('emails.retryAll')}
            </button>
            <button className="btn btn-outline" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              <RefreshCw size={15} /> {t('emails.refresh')}
            </button>
          </div>
        </div>

        {/* Counts cover the whole table, so a failure stays visible even while
            the list below is filtered to something else. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          {chip(t('emails.total'), summary.total)}
          {chip(t('status.sent'), summary.sent, 'var(--color-success)')}
          {chip(t('status.failed'), summary.failed, summary.failed > 0 ? 'var(--color-danger)' : undefined)}
          {chip(t('status.queued'), summary.queued)}
        </div>

        {summary.failed > 0 && (
          <div className={`card ${styles.createForm}`} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
            <p style={{ fontSize: '0.9rem', color: 'var(--color-charcoal-soft)' }}>
              {t('emails.failedNote', { count: summary.failed })}
            </p>
          </div>
        )}

        <div className={`card ${styles.createForm}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {[
              { value: '', label: t('emails.all') },
              { value: 'failed', label: t('status.failed') },
              { value: 'queued', label: t('status.queued') },
              { value: 'sent', label: t('status.sent') },
            ].map((f) => (
              <button
                key={f.value || 'all'}
                className="btn btn-outline"
                style={status === f.value ? { background: 'var(--color-forest)', borderColor: 'var(--color-forest)', color: 'var(--on-solid, #fff)' } : {}}
                aria-pressed={status === f.value}
                onClick={() => { setStatus(f.value); setPage(1); }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Icon pinned to the right edge and the text kept clear of it: the
              global `.input` rule loads after page CSS, so the padding is inline. */}
          <div style={{ position: 'relative', flex: '1 1 16rem', minWidth: '12rem' }}>
            <input
              className="input"
              style={{ paddingRight: '2.5rem', textOverflow: 'ellipsis' }}
              placeholder={t('emails.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput ? (
              <button
                type="button"
                aria-label={t('emails.clear')}
                onClick={() => setSearchInput('')}
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.5rem', height: '1.5rem', border: 'none', borderRadius: '50%', background: 'transparent', color: 'var(--color-charcoal-soft)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            ) : (
              <Search size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-charcoal-soft)', pointerEvents: 'none' }} />
            )}
          </div>
        </div>

        {retryNotice && (
          <div className={`card ${styles.createForm}`} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <RotateCw size={16} color="var(--color-forest)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem' }}>{retryNotice}</span>
          </div>
        )}

        {loading ? <FullPageSpinner /> : emails.length === 0 ? (
          <div className={styles.empty}><Mail size={40} color="var(--color-line)" /><p>{t('emails.empty')}</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              {/* A min-width keeps eight columns from crushing each other; the
                  wrapper scrolls horizontally on narrow screens instead. */}
              <table className={`${styles.table} ${styles.tableDense}`} style={{ minWidth: '980px' }}>
                <thead>
                  <tr>
                    <th className={styles.th}>{t('emails.recipient')}</th>
                    <th className={styles.th}>{t('emails.subject')}</th>
                    <th className={styles.th}>{t('emails.status')}</th>
                    <th className={styles.th}>{t('emails.attempts')}</th>
                    <th className={styles.th}>{t('emails.error')}</th>
                    <th className={styles.th}>{t('emails.queuedAt')}</th>
                    <th className={styles.th}>{t('emails.sentAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((m) => (
                    <tr key={m.id} className={styles.tr}>
                      <td className={styles.td}>{m.to_email}</td>
                      {/* The template is the subject's producer, so it sits under
                          it rather than occupying a column of its own. */}
                      <td className={styles.td} style={{ minWidth: '10rem' }}>
                        <span style={{ display: 'block' }}>{m.subject}</span>
                        <span className="badge badge-neutral" style={{ whiteSpace: 'nowrap', marginTop: '0.3rem' }}>{m.template?.replace(/_/g, ' ')}</span>
                      </td>
                      <td className={styles.td}>
                        <StatusBadge status={m.status} />
                        {['failed', 'queued'].includes(m.status) && (
                          <button
                            className="btn btn-ghost"
                            style={{ display: 'block', marginTop: '0.35rem', padding: '0.1rem 0.35rem', fontSize: '0.75rem', minHeight: 0, lineHeight: 1.5 }}
                            disabled={retrying}
                            onClick={() => retryOne(m.id)}
                          >
                            {t('emails.retry')}
                          </button>
                        )}
                      </td>
                      <td className={styles.td}>{m.attempts}</td>
                      <td className={styles.td} style={{ maxWidth: '18rem' }}>
                        {m.error_message ? (
                          <span
                            title={m.error_message}
                            style={{ color: 'var(--color-danger)', fontSize: '0.82rem', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', verticalAlign: 'bottom' }}
                          >
                            {m.error_message}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-charcoal-soft)' }}>—</span>
                        )}
                      </td>
                      <td className={styles.td} style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatWhen(m.created_at)}</td>
                      <td className={styles.td} style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatWhen(m.sent_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />

        {confirmRetry && (
          <ConfirmModal
            message={t('emails.retryConfirm', { count: summary.failed })}
            onConfirm={retryAllFailed}
            onCancel={() => setConfirmRetry(false)}
          />
        )}
      </div>
    </div>
  );
}
