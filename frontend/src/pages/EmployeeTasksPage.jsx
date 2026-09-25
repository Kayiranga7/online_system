import { useState, useEffect } from 'react';
import { ClipboardCheck, Clock } from 'lucide-react';
import api from '../services/api';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import styles from './Tasks.module.css';

export default function EmployeeTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState(null);
  const [report, setReport] = useState({ reportText: '', hoursSpent: '' });

  const load = () => {
    setLoading(true);
    api.get('/tasks').then((r) => setTasks(r.data.tasks || [])).catch(() => toast('Failed to load tasks.', 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleComplete = async (taskId) => {
    try {
      await api.patch(`/tasks/${taskId}/complete`, { reportText: report.reportText, hoursSpent: Number(report.hoursSpent) || null });
      toast('Task marked complete!', 'success');
      setCompletingId(null);
      setReport({ reportText: '', hoursSpent: '' });
      load();
    } catch (err) { toast(err.response?.data?.error || 'Could not complete task.', 'error'); }
  };

  if (loading) return <FullPageSpinner />;

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.heading} style={{ marginBottom: 'var(--space-5)' }}>My tasks</h1>

        {tasks.length === 0 ? (
          <div className={styles.empty}><ClipboardCheck size={40} color="var(--color-line)" /><p>No tasks assigned yet.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {tasks.map((t) => (
              <div key={t.id} className="card" style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>{t.title}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-soft)' }}>{t.description}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <StatusBadge status={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '0.8rem', color: 'var(--color-charcoal-soft)', marginBottom: 'var(--space-3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {t.due_date ? new Date(t.due_date).toLocaleString() : 'No due date'}</span>
                  <span style={{ textTransform: 'capitalize' }}>{t.task_type}</span>
                </div>

                {t.status !== 'completed' && t.status !== 'cancelled' && (
                  completingId === t.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', borderTop: '1px solid var(--color-line)', paddingTop: 'var(--space-3)' }}>
                      <textarea
                        className="input" rows={2} placeholder="Work report — describe what you did…"
                        value={report.reportText} onChange={(e) => setReport((r) => ({ ...r, reportText: e.target.value }))}
                      />
                      <input
                        className="input" type="number" step="0.5" placeholder="Hours spent" style={{ width: 160 }}
                        value={report.hoursSpent} onChange={(e) => setReport((r) => ({ ...r, hoursSpent: e.target.value }))}
                      />
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-primary" onClick={() => handleComplete(t.id)}>Submit & complete</button>
                        <button className="btn btn-ghost" onClick={() => setCompletingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => setCompletingId(t.id)}>Mark complete</button>
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
