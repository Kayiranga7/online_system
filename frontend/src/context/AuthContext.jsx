import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged in
  const [loading, setLoading] = useState(true);

  const storeToken = (token) => { window.__imiziAccessToken = token; };

  // Silently refresh on mount (user may have a valid httpOnly refresh cookie)
  useEffect(() => {
    api.post('/auth/refresh')
      .then((r) => { storeToken(r.data.accessToken); setUser(r.data.user); })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const handleLogout = () => { setUser(null); storeToken(null); };
    window.addEventListener('imizi:logout', handleLogout);
    return () => window.removeEventListener('imizi:logout', handleLogout);
  }, []);

  const login = useCallback(async (email, password, twoFactorCode) => {
    const res = await api.post('/auth/login', { email, password, twoFactorCode });
    if (res.data.requiresTwoFactor) return { requiresTwoFactor: true };
    storeToken(res.data.accessToken);
    setUser(res.data.user);
    return { user: res.data.user };
  }, []);

  const loginWithGoogle = useCallback(async (idToken, extra = {}) => {
    const res = await api.post('/auth/google', { idToken, ...extra });
    if (res.data.requiresProfileCompletion) return { requiresProfileCompletion: true, profile: res.data.profile };
    storeToken(res.data.accessToken);
    setUser(res.data.user);
    return { user: res.data.user };
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    storeToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.user);
    return res.data.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout, refreshUser, storeToken, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
