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
  const result = !!(webApp && webApp.initData && webApp.initData.length > 0);
  console.log('[TG-AUTH] isTelegramEnvironment:', result, {
    hasWebApp: !!webApp,
    hasInitData: !!webApp?.initData,
    initDataLength: webApp?.initData?.length || 0,
  });
  return result;
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
    if (!webApp?.initData) {
      console.warn('[TG-AUTH] login() aborted: no initData available');
      return;
    }

    console.log('[TG-AUTH] login() starting, initData length:', webApp.initData.length);
    setIsAuthenticating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: webApp.initData }),
      });

      console.log('[TG-AUTH] login() response status:', res.status);
      const data = await res.json();

      if (!res.ok || !data.success) {
        console.error('[TG-AUTH] login() failed:', data.error);
        throw new Error(data.error || 'Telegram login failed');
      }

      console.log('[TG-AUTH] login() success, user:', data.user?.displayName, 'walletAddress:', data.user?.walletAddress, 'isNewUser:', data.isNewUser);
      saveAuth(data.token, data.refreshToken, data.user);
    } catch (err) {
      console.error('[TG-AUTH] login() exception:', err.message);
      setError(err.message);
      clearAuth();
    } finally {
      setIsAuthenticating(false);
    }
  }, [saveAuth, clearAuth]);

  const refreshAccessToken = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) {
      console.warn('[TG-AUTH] refreshAccessToken: no refresh token, clearing auth');
      clearAuth();
      return null;
    }

    console.log('[TG-AUTH] refreshAccessToken: requesting new token...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        console.warn('[TG-AUTH] refreshAccessToken: refresh failed (status', res.status, '), re-login...');
        clearAuth();
        await login();
        return localStorage.getItem(TOKEN_KEY);
      }

      console.log('[TG-AUTH] refreshAccessToken: success');
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      setToken(data.token);
      return data.token;
    } catch (err) {
      console.error('[TG-AUTH] refreshAccessToken: exception:', err.message, ', re-login...');
      clearAuth();
      await login();
      return localStorage.getItem(TOKEN_KEY);
    }
  }, [clearAuth, login]);

  useEffect(() => {
    if (!isTelegram) {
      console.log('[TG-AUTH] useEffect: not Telegram environment, skipping auto-login');
      return;
    }

    console.log('[TG-AUTH] useEffect: Telegram detected, calling webApp.ready() + expand()');
    const webApp = getTelegramWebApp();
    webApp.ready();
    webApp.expand();

    if (!token && !loginAttempted.current) {
      console.log('[TG-AUTH] useEffect: no stored token, starting auto-login...');
      loginAttempted.current = true;
      login();
    } else {
      console.log('[TG-AUTH] useEffect: token already present or login already attempted, token:', !!token);
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
