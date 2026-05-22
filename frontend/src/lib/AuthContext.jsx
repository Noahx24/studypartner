import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

import { clearToken, getToken, loadTokenFromStorage, setToken } from './tokenStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const logout = useCallback(async () => {
    // Best-effort server-side revocation. If the network is down we
    // still clear local state — the token will be rejected next time
    // the user comes online and tries to authenticate.
    const token = getToken();
    if (token) {
      try {
        await fetch(`${API_BASE}/users/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Swallow: local logout still proceeds.
      }
    }
    await clearToken();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
  }, []);

  const checkUserAuth = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsAuthenticated(false);
      setUser(null);
      setIsLoadingAuth(false);
      return;
    }
    try {
      setIsLoadingAuth(true);
      const response = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        // Token is expired or invalid — clear it
        await clearToken();
        setIsAuthenticated(false);
        setUser(null);
      } else {
        const currentUser = await response.json();
        setUser(currentUser);
        setIsAuthenticated(true);
      }
    } catch {
      // Network failure — stay unauthenticated, keep the token to retry later
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  // Called from the Login page on successful credential check
  const login = useCallback(async (email, password) => {
    const response = await fetch(`${API_BASE}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Invalid email or password');
    }
    const { token } = await response.json();
    await setToken(token);
    await checkUserAuth();
  }, [checkUserAuth]);

  // Called from the Register page on successful account creation
  const register = useCallback(async (payload) => {
    const response = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Registration failed');
    }
    const { token } = await response.json();
    await setToken(token);
    await checkUserAuth();
  }, [checkUserAuth]);

  useEffect(() => {
    // Load the persisted token before any sync getToken() reads happen.
    loadTokenFromStorage().then(checkUserAuth);
  }, [checkUserAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        authError,
        login,
        logout,
        register,
        checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const getStoredToken = () => getToken();
