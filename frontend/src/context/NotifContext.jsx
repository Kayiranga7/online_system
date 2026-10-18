import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../services/api';
import { SOCKET_URL } from '../services/config';
import { createRefreshGuard, isTokenExpired } from '../utils/sessionGuard';

const NotifContext = createContext(null);

export function NotifProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef(null);

  // Fetch initial notifications when user logs in
  useEffect(() => {
    if (!user) { setNotifications([]); setUnreadCount(0); return; }
    api.get('/notifications?limit=30').then((r) => {
      setNotifications(r.data.notifications || []);
      setUnreadCount(r.data.unreadCount || 0);
    }).catch(() => {});
  }, [user?.id]);

  // Socket.IO real-time connection
  useEffect(() => {
    if (!user) return;
    if (!window.__imiziAccessToken) return;

    // `auth` as a function (rather than a static object) is re-evaluated on every
    // (re)connect attempt, so a token refreshed by the axios interceptor in the
    // background is picked up automatically instead of the socket being stuck
    // retrying with the token that was valid when the page first loaded.
    // On a split deployment the static host has no /socket.io route, so the
    // realtime connection must target the API origin (same origin in dev).
    const socket = io(SOCKET_URL, {
      auth: (cb) => cb({ token: window.__imiziAccessToken }),
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('notification', (notif) => {
      setNotifications((prev) => [notif, ...prev].slice(0, 50));
      setUnreadCount((n) => n + 1);
    });

    // If the access token had already expired by the time the socket tried to
    // (re)connect, proactively refresh it via the httpOnly cookie so the next
    // automatic reconnect attempt (built into socket.io-client) succeeds.
    //
    // Bounded on purpose: socket.io retries on its own, so without the guard a
    // session that cannot be refreshed re-requested /auth/refresh every few
    // seconds indefinitely.
    const refreshGuard = createRefreshGuard();
    socket.on('connect', () => refreshGuard.succeeded());
    socket.on('connect_error', async () => {
      // A handshake only fails for an expired token when refreshing could help;
      // a network blip is left to socket.io's own backoff.
      if (!isTokenExpired(window.__imiziAccessToken)) return;

      const verdict = refreshGuard.check();
      if (verdict === 'stop') {
        // The refresh cookie is gone or unusable. Stop reconnecting and end the
        // session instead of hammering the endpoint.
        socket.disconnect();
        socketRef.current = null;
        window.dispatchEvent(new Event('imizi:logout'));
        return;
      }
      if (verdict === 'wait') return;

      try {
        const r = await api.post('/auth/refresh');
        window.__imiziAccessToken = r.data.accessToken;
        refreshGuard.succeeded();
      } catch {
        // Unusable session - the next attempt is rate-limited by the guard.
      }
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [user?.id]);

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <NotifContext.Provider value={{ notifications, unreadCount, markRead, markAllRead }}>
      {children}
    </NotifContext.Provider>
  );
}

export const useNotif = () => useContext(NotifContext);
