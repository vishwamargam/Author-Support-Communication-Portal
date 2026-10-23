import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setCsrfToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState('');
  const refreshInFlight = useRef(null);

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;
    setLoading(true);
    refreshInFlight.current = (async () => {
      try {
        // The HttpOnly session cookie survives reloads; /me restores the UI
        // identity while the separate CSRF token is rehydrated best-effort.
        const response = await api.get('/auth/me');
        setUser(response.data.data.user);
        setStartupError('');
        try {
          const csrf = await api.get('/auth/csrf', { params: { role: response.data.data.user.role } });
          setCsrfToken(csrf.data.data.csrfToken);
        } catch (_error) { /* Mutations will retry token recovery if needed. */ }
      } catch (error) {
        if (error.response?.status === 401) setUser(null);
        if (!error.response) setStartupError(error.userMessage);
        else setStartupError('');
      } finally {
        setLoading(false);
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { user: authenticatedUser, csrfToken } = response.data.data;
    setCsrfToken(csrfToken);
    setUser(authenticatedUser);
    setStartupError('');
    return authenticatedUser;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); }
    finally { setCsrfToken(''); setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, loading, startupError, login, logout, refresh }),
    [user, loading, startupError, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
