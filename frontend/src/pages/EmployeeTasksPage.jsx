import { useState, useEffect } from 'react';
import { ClipboardCheck, Clock } from 'lucide-react';
import api from '../services/api';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import { useLanguage } from '../context/LanguageContext';
import styles from './Tasks.module.css';

export default function EmployeeTasksPage() {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState(null);
  const [report, setReport] = useState({ reportText: '', hoursSpent: '' });

  const load = () => {
    setLoading(true);
    api.get('/tasks').then((r) => setTasks(r.data.tasks || [])).catch(() => toast(t('tasks.loadFailed'), 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleComplete = async (taskId) => {
    try {
      await api.patch(`/tasks/${taskId}/complete`, { reportText: report.reportText, hoursSpent: Number(report.hoursSpent) || null });
      toast(t('tasks.toastCompleted'), 'success');
      setCompletingId(null);
      setReport({ reportText: '', hoursSpent: '' });
      load();
    } catch (err) { toast(err.response?.data?.error || t('tasks.completeFailed'), 'error'); }
  };

  if (loading) return <FullPageSpinner />;

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.heading} style={{ marginBottom: 'var(--space-5)' }}>{t('tasks.myTitle')}</h1>

        {tasks.length === 0 ? (
          <div className={styles.empty}><ClipboardCheck size={40} color="var(--color-line)" /><p>{t('tasks.emptyMine')}</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {tasks.map((row) => (
              <div key={row.id} className="card" style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>{row.title}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-soft)' }}>{row.description}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <StatusBadge status={row.priority} />
                    <StatusBadge status={row.status} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '0.8rem', color: 'var(--color-charcoal-soft)', marginBottom: 'var(--space-3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {row.due_date ? new Date(row.due_date).toLocaleString() : t('tasks.noDueDate')}</span>
                  <span style={{ textTransform: 'capitalize' }}>{row.task_type}</span>
                </div>

                {row.status !== 'completed' && row.status !== 'cancelled' && (
                  completingId === row.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', borderTop: '1px solid var(--color-line)', paddingTop: 'var(--space-3)' }}>
                      <textarea
                        className="input" rows={2} placeholder={t('tasks.reportPlaceholder')}
                        value={report.reportText} onChange={(e) => setReport((r) => ({ ...r, reportText: e.target.value }))}
                      />
                      <input
                        className="input" type="number" step="0.5" placeholder={t('tasks.hoursSpent')} style={{ width: 160 }}
                        value={report.hoursSpent} onChange={(e) => setReport((r) => ({ ...r, hoursSpent: e.target.value }))}
                      />
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-primary" onClick={() => handleComplete(row.id)}>{t('tasks.submitComplete')}</button>
                        <button className="btn btn-ghost" onClick={() => setCompletingId(null)}>{t('ui.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => setCompletingId(row.id)}>{t('tasks.markComplete')}</button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
