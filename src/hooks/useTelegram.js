import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const TOKEN_KEY = 'ninja-tg-token';
const REFRESH_KEY = 'ninja-tg-refresh';
const USER_KEY = 'ninja-tg-user';

function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

export function isTelegramEnvironment() {
  const webApp = getTelegramWebApp();
  return !!(webApp && webApp.initData && webApp.initData.length > 0);
}

export const useTelegram = () => {
  const isTelegram = isTelegramEnvironment();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [error, setError] = useState(null);
  const loginAttempted = useRef(false);

  const saveAuth = useCallback((tokenVal, refreshVal, userVal) => {
    localStorage.setItem(TOKEN_KEY, tokenVal);
    localStorage.setItem(REFRESH_KEY, refreshVal);
    localStorage.setItem(USER_KEY, JSON.stringify(userVal));
    setToken(tokenVal);
    setUser(userVal);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async () => {
    const webApp = getTelegramWebApp();
    if (!webApp?.initData) return;

    setIsAuthenticating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: webApp.initData }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Telegram login failed');
      }

      saveAuth(data.token, data.refreshToken, data.user);
    } catch (err) {
      setError(err.message);
      clearAuth();
    } finally {
      setIsAuthenticating(false);
    }
  }, [saveAuth, clearAuth]);

  const refreshAccessToken = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) {
      clearAuth();
      return null;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        clearAuth();
        await login();
        return localStorage.getItem(TOKEN_KEY);
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      setToken(data.token);
      return data.token;
    } catch {
      clearAuth();
      await login();
      return localStorage.getItem(TOKEN_KEY);
    }
  }, [clearAuth, login]);

  useEffect(() => {
    if (!isTelegram) return;

    const webApp = getTelegramWebApp();
    webApp.ready();
    webApp.expand();

    if (!token && !loginAttempted.current) {
      loginAttempted.current = true;
      login();
    }
  }, [isTelegram, token, login]);

  return {
    isTelegram,
    isAuthenticating,
    user,
    token,
    error,
    login,
    refreshAccessToken,
    clearAuth,
    walletAddress: user?.walletAddress || null,
  };
};
