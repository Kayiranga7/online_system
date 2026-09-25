import { useState, useEffect } from 'react';
import { Plus, ClipboardList } from 'lucide-react';
import api from '../services/api';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import styles from './Tasks.module.css';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState({ title: '', description: '', taskType: 'other', priority: 'medium', dueDate: '', institutionId: '', assignToEmployeeId: '' });

  const loadTasks = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    setLoading(true);
    api.get(`/tasks?${params}`).then((r) => setTasks(r.data.tasks || [])).catch(() => toast('Failed to load tasks.', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { loadTasks(); }, [statusFilter]);
  useEffect(() => {
    api.get('/users?role=employee&status=active').then((r) => setEmployees(r.data.users || [])).catch(() => {});
    api.get('/institutions?status=active').then((r) => setInstitutions(r.data.institutions || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tasks', { ...form, institutionId: Number(form.institutionId), assignToEmployeeId: Number(form.assignToEmployeeId) });
      toast('Task created.', 'success');
      setShowCreate(false);
      setForm({ title: '', description: '', taskType: 'other', priority: 'medium', dueDate: '', institutionId: '', assignToEmployeeId: '' });
      loadTasks();
    } catch (err) { toast(err.response?.data?.error || 'Failed to create task.', 'error'); }
  };

  const assignTask = async (taskId, employeeId) => {
    if (!employeeId) return;
    try {
      await api.patch(`/tasks/${taskId}/assign`, { employeeId: Number(employeeId) });
      toast('Task assigned.', 'success');
      loadTasks();
    } catch (err) { toast(err.response?.data?.error || 'Failed to assign task.', 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Tasks</h1>
          <div className={styles.headerActions}>
            <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {['unassigned','assigned','in_progress','completed','cancelled'].map((s) => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
              <Plus size={16} /> New task
            </button>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className={`card ${styles.createForm}`}>
            <h3 className={styles.sectionTitle}>Create task</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}><label className="label">Title *</label><input className="input" value={form.title} onChange={set('title')} required /></div>
              <div className={styles.field}><label className="label">Type</label>
                <select className="input" value={form.taskType} onChange={set('taskType')}>
                  {['delivery','installation','maintenance','consultation','other'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.field}><label className="label">Priority</label>
                <select className="input" value={form.priority} onChange={set('priority')}>
                  {['low','medium','high','urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className={styles.field}><label className="label">Due date</label><input className="input" type="datetime-local" value={form.dueDate} onChange={set('dueDate')} /></div>
              <div className={`${styles.field} ${styles.span2}`}><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={set('description')} /></div>
              <div className={styles.field}><label className="label">Institution *</label>
                <select className="input" value={form.institutionId} onChange={set('institutionId')} required>
                  <option value="" disabled>Select institution…</option>
                  {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className={styles.field}><label className="label">Assign to *</label>
                <select className="input" value={form.assignToEmployeeId} onChange={set('assignToEmployeeId')} required>
                  <option value="" disabled>Select employee…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create task</button>
            </div>
          </form>
        )}

        {loading ? <FullPageSpinner /> : tasks.length === 0 ? (
          <div className={styles.empty}><ClipboardList size={40} color="var(--color-line)" /><p>No tasks found.</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Title</th>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Priority</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Assigned to</th>
                    <th className={styles.th}>Due</th>
                    <th className={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 500 }}>{t.title}</td>
                      <td className={styles.td}><span className="badge badge-neutral">{t.task_type}</span></td>
                      <td className={styles.td}><StatusBadge status={t.priority} /></td>
                      <td className={styles.td}><StatusBadge status={t.status} /></td>
                      <td className={styles.td}>{t.assigned_employee_name || <span style={{ color: 'var(--color-charcoal-soft)' }}>Unassigned</span>}</td>
                      <td className={styles.td} style={{ fontSize: '0.8rem' }}>{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
                      <td className={styles.td}>
                        {t.status === 'unassigned' && (
                          <select className="input" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.3rem 0.5rem' }} onChange={(e) => assignTask(t.id, e.target.value)} defaultValue="">
                            <option value="" disabled>Assign…</option>
                            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
                          </select>
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
