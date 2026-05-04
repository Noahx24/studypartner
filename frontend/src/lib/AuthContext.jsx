import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const logout = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
  }, []);

  const navigateToLogin = useCallback(() => {
    // Redirect to external login — adjust URL to match platform conventions.
    window.location.href = '/login';
  }, []);

  const checkUserAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      if (!appParams.token) {
        setIsAuthenticated(false);
        setUser(null);
        setAuthChecked(true);
        return;
      }
      // Resolve the authenticated user from the backend using the injected token.
      const response = await fetch(`/api/users/me`, {
        headers: { Authorization: `Bearer ${appParams.token}` },
      });
      if (!response.ok) {
        throw Object.assign(new Error('Auth check failed'), { status: response.status });
      }
      const currentUser = await response.json();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsAuthenticated(false);
      setUser(null);
      setAuthChecked(true);
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const checkAppState = useCallback(async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      const response = await fetch(
        `/api/apps/public/prod/public-settings/by-id/${appParams.appId}`,
        { headers: { 'X-App-Id': appParams.appId } },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const reason = data?.extra_data?.reason;
        if (response.status === 403 && reason) {
          setAuthError({ type: reason, message: data.message || 'Access denied' });
        } else {
          setAuthError({ type: 'unknown', message: data.message || 'Failed to load app' });
        }
        return;
      }

      const publicSettings = await response.json();
      setAppPublicSettings(publicSettings);

      if (appParams.token) {
        await checkUserAuth();
      } else {
        setIsAuthenticated(false);
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error during app state check:', error);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingAuth(false);
    } finally {
      setIsLoadingPublicSettings(false);
    }
  }, [checkUserAuth]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState,
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
