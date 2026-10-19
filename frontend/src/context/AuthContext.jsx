import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { isAuth0Configured, auth0LogoutUrl, AUTH0_SESSION_KEY } from '../services/auth0';
import { googleSignOut } from '../services/google';

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
    // Password login means this session is not tied to an Auth0 SSO session.
    sessionStorage.removeItem(AUTH0_SESSION_KEY);
    return { user: res.data.user };
  }, []);

  const loginWithGoogle = useCallback(async (idToken, extra = {}) => {
    const res = await api.post('/auth/google', { idToken, ...extra });
    if (res.data.requiresProfileCompletion) return { requiresProfileCompletion: true, profile: res.data.profile };
    storeToken(res.data.accessToken);
    setUser(res.data.user);
    sessionStorage.removeItem(AUTH0_SESSION_KEY);
    return { user: res.data.user };
  }, []);

  /**
   * Completes an Auth0 sign-in: the callback page hands over the token Auth0
   * issued, and the API answers with the app's own session, exactly like login().
   * `extra` carries the profile fields (district, institution type) on first
   * sign-in, or the 2FA code for accounts that have it enabled.
   */
  const completeAuth0Login = useCallback(async (accessToken, extra = {}) => {
    const res = await api.post('/auth/auth0', { accessToken, ...extra });
    if (res.data.requiresProfileCompletion) {
      return { requiresProfileCompletion: true, profile: res.data.profile };
    }
    if (res.data.requiresTwoFactor) return { requiresTwoFactor: true };

    storeToken(res.data.accessToken);
    setUser(res.data.user);
    sessionStorage.setItem(AUTH0_SESSION_KEY, '1');
    return { user: res.data.user };
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    storeToken(null);
    setUser(null);

    // Stop Google from auto-selecting the account that just signed out.
    googleSignOut();

    // Clearing the app session leaves Auth0's SSO session alive, so the next
    // "Continue with Auth0" click would sign the same person straight back in.
    // Only follow the Auth0 logout when this browser actually used it.
    if (isAuth0Configured && sessionStorage.getItem(AUTH0_SESSION_KEY)) {
      sessionStorage.removeItem(AUTH0_SESSION_KEY);
      window.location.assign(auth0LogoutUrl());
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.user);
    return res.data.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, completeAuth0Login, logout, refreshUser, storeToken, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
