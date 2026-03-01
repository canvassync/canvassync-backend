// src/hooks/useAuth.js
// Hook de autenticação global — use em qualquer componente

import { useState, useEffect, createContext, useContext } from 'react';
import { authApi, saveSession, clearSession, getCachedUser, isPro } from '../services/api';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(getCachedUser());
  const [loading, setLoading] = useState(true);

  // Valida token ao carregar a aplicação
  useEffect(() => {
    const token = localStorage.getItem('canvassync_token');
    if (!token) {
      setLoading(false);
      return;
    }

    authApi.me()
      .then((freshUser) => {
        setUser(freshUser);
        localStorage.setItem('canvassync_user', JSON.stringify(freshUser));
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await authApi.login(email, password);
    saveSession(data.token, data.user);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, name) => {
    const data = await authApi.register(email, password, name);
    saveSession(data.token, data.user);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    clearSession();
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isLoggedIn: !!user,
      isPro: isPro(user),
      login,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
