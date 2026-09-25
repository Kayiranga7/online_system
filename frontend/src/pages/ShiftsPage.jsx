import { useState, useEffect } from 'react';
import { CalendarClock, LogIn, LogOut } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FullPageSpinner, toast } from '../components/UI';
import styles from './Ops.module.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ShiftsPage() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attendanceId, setAttendanceId] = useState(null);
  const [checkingInOut, setCheckingInOut] = useState(false);

  const storageKey = user ? `imizi:attendance:${user.id}:${todayISO()}` : null;

  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) setAttendanceId(saved);
    }
  }, [storageKey]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('from', todayISO());
    setLoading(true);
    api.get(`/attendance/shifts?${params}`)
      .then((r) => setShifts(r.data.shifts || []))
      .catch(() => toast('Failed to load shifts.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleCheckIn = async () => {
    setCheckingInOut(true);
    try {
      const pos = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
          () => resolve(null),
          { timeout: 4000 }
        );
      });
      const r = await api.post('/attendance/check-in', pos || {});
      setAttendanceId(String(r.data.id));
      if (storageKey) localStorage.setItem(storageKey, String(r.data.id));
      toast('Checked in for today.', 'success');
    } catch (err) { toast(err.response?.data?.error || 'Could not check in.', 'error'); }
    finally { setCheckingInOut(false); }
  };

  const handleCheckOut = async () => {
    if (!attendanceId) return;
    setCheckingInOut(true);
    try {
      await api.patch(`/attendance/check-out/${attendanceId}`);
      toast('Checked out. See you next time!', 'success');
      setAttendanceId(null);
      if (storageKey) localStorage.removeItem(storageKey);
    } catch (err) { toast(err.response?.data?.error || 'Could not check out.', 'error'); }
    finally { setCheckingInOut(false); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Shifts</h1>
          <div className={styles.headerActions}>
            {attendanceId ? (
              <button className="btn btn-outline" disabled={checkingInOut} onClick={handleCheckOut}>
                <LogOut size={16} /> Check out
              </button>
            ) : (
              <button className="btn btn-primary" disabled={checkingInOut} onClick={handleCheckIn}>
                <LogIn size={16} /> Check in
              </button>
            )}
          </div>
        </div>

        {loading ? <FullPageSpinner /> : shifts.length === 0 ? (
          <div className={styles.empty}><CalendarClock size={40} color="var(--color-line)" /><p>No upcoming shifts scheduled.</p></div>
        ) : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Date</th>
                    <th className={styles.th}>Start</th>
                    <th className={styles.th}>End</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.id} className={styles.tr}>
                      <td className={styles.td} style={{ fontWeight: 500 }}>{new Date(s.shift_date).toLocaleDateString()}</td>
                      <td className={styles.td}>{s.start_time}</td>
                      <td className={styles.td}>{s.end_time}</td>
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
