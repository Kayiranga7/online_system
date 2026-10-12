import { useState, useEffect } from 'react';
import { Plus, ClipboardList } from 'lucide-react';
import api from '../services/api';
import { StatusBadge, FullPageSpinner, toast } from '../components/UI';
import { useLanguage } from '../context/LanguageContext';
import styles from './Tasks.module.css';

export default function TasksPage() {
  const { t } = useLanguage();
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
    api.get(`/tasks?${params}`).then((r) => setTasks(r.data.tasks || [])).catch(() => toast(t('tasks.loadFailed'), 'error')).finally(() => setLoading(false));
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
      toast(t('tasks.toastCreated'), 'success');
      setShowCreate(false);
      setForm({ title: '', description: '', taskType: 'other', priority: 'medium', dueDate: '', institutionId: '', assignToEmployeeId: '' });
      loadTasks();
    } catch (err) { toast(err.response?.data?.error || t('tasks.createFailed'), 'error'); }
  };

  const assignTask = async (taskId, employeeId) => {
    if (!employeeId) return;
    try {
      await api.patch(`/tasks/${taskId}/assign`, { employeeId: Number(employeeId) });
      toast(t('tasks.toastAssigned'), 'success');
      loadTasks();
    } catch (err) { toast(err.response?.data?.error || t('tasks.assignFailed'), 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>{t('tasks.title')}</h1>
          <div className={styles.headerActions}>
            <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('orders.allStatuses')}</option>
              {['unassigned','assigned','in_progress','completed','cancelled'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
              <Plus size={16} /> {t('tasks.newTask')}
            </button>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className={`card ${styles.createForm}`}>
            <h3 className={styles.sectionTitle}>{t('tasks.create')}</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}><label className="label">{t('tasks.form.title')}</label><input className="input" value={form.title} onChange={set('title')} required /></div>
              <div className={styles.field}><label className="label">{t('tasks.form.type')}</label>
                <select className="input" value={form.taskType} onChange={set('taskType')}>
                  {['delivery','installation','maintenance','consultation','other'].map((ty) => <option key={ty} value={ty}>{t(`tasks.type.${ty}`)}</option>)}
                </select>
              </div>
              <div className={styles.field}><label className="label">{t('tasks.form.priority')}</label>
                <select className="input" value={form.priority} onChange={set('priority')}>
                  {['low','medium','high','urgent'].map((p) => <option key={p} value={p}>{t(`status.${p}`)}</option>)}
                </select>
              </div>
              <div className={styles.field}><label className="label">{t('tasks.form.dueDate')}</label><input className="input" type="datetime-local" value={form.dueDate} onChange={set('dueDate')} /></div>
              <div className={`${styles.field} ${styles.span2}`}><label className="label">{t('tasks.form.description')}</label><textarea className="input" rows={2} value={form.description} onChange={set('description')} /></div>
              <div className={styles.field}><label className="label">{t('tasks.form.institution')}</label>
                <select className="input" value={form.institutionId} onChange={set('institutionId')} required>
                  <option value="" disabled>{t('tasks.form.selectInstitution')}</option>
                  {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className={styles.field}><label className="label">{t('tasks.form.assignTo')}</label>
                <select className="input" value={form.assignToEmployeeId} onChange={set('assignToEmployeeId')} required>
                  <option value="" disabled>{t('tasks.form.selectEmployee')}</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>{t('ui.cancel')}</button>
              <button type="submit" className="btn btn-primary">{t('tasks.create')}</button>
            </div>
          </form>
        )}

        {loading ? <FullPageSpinner /> : tasks.length === 0 ? (
          <div className={styles.empty}><ClipboardList size={40} color="var(--color-line)" /><p>{t('tasks.empty')}</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>{t('tasks.col.title')}</th>
                    <th className={styles.th}>{t('tasks.col.type')}</th>
                    <th className={styles.th}>{t('tasks.col.priority')}</th>
                    <th className={styles.th}>{t('tasks.col.status')}</th>
                    <th className={styles.th}>{t('tasks.col.assignedTo')}</th>
                    <th className={styles.th}>{t('tasks.col.due')}</th>
                    <th className={styles.th}>{t('tasks.col.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((row) => (
                    <tr key={row.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 500 }}>{row.title}</td>
                      <td className={styles.td}><span className="badge badge-neutral">{t(`tasks.type.${row.task_type}`)}</span></td>
                      <td className={styles.td}><StatusBadge status={row.priority} /></td>
                      <td className={styles.td}><StatusBadge status={row.status} /></td>
                      <td className={styles.td}>{row.assigned_employee_name || <span style={{ color: 'var(--color-charcoal-soft)' }}>{t('tasks.unassigned')}</span>}</td>
                      <td className={styles.td} style={{ fontSize: '0.8rem' }}>{row.due_date ? new Date(row.due_date).toLocaleDateString() : '—'}</td>
                      <td className={styles.td}>
                        {row.status === 'unassigned' && (
                          <select className="input" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.3rem 0.5rem' }} onChange={(e) => assignTask(row.id, e.target.value)} defaultValue="">
                            <option value="" disabled>{t('tasks.assignOption')}</option>
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
