import { useState, useEffect, useCallback, useRef } from 'react';
import { BUILD_VERSION } from '../App';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const TOKEN_KEY = 'ninja-tg-token';
const REFRESH_KEY = 'ninja-tg-refresh';
const USER_KEY = 'ninja-tg-user';

function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

function ensureTelegramReady() {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp) {
      resolve();
      return;
    }
    let attempts = 0;
    const maxAttempts = 50;
    const interval = setInterval(() => {
      attempts++;
      if (window.Telegram?.WebApp || attempts >= maxAttempts) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

function detectTelegramEnvironment() {
  const webApp = getTelegramWebApp();
  const hasInitData = !!(webApp && webApp.initData && webApp.initData.length > 0);
  const platform = webApp?.platform;
  const isTgPlatform = !!(platform && platform !== 'unknown');
  const result = hasInitData || isTgPlatform;
  console.log('[TG-AUTH] detectTelegramEnvironment (build=' + BUILD_VERSION + '):', result, {
    hasWebApp: !!webApp,
    hasInitData,
    initDataLength: webApp?.initData?.length || 0,
    platform: platform || 'N/A',
    isTgPlatform,
    userName: webApp?.initDataUnsafe?.user?.first_name || 'N/A',
  });
  return result;
}

export function isTelegramEnvironment() {
  return detectTelegramEnvironment();
}

export const useTelegram = () => {
  const [isTelegram, setIsTelegram] = useState(() => detectTelegramEnvironment());
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

  // Re-check Telegram environment after mount (handles late SDK init)
  useEffect(() => {
    const check = () => {
      const detected = detectTelegramEnvironment();
      setIsTelegram(prev => {
        if (prev !== detected) {
          console.log('[TG-AUTH] isTelegram changed:', prev, '->', detected);
        }
        return detected;
      });
    };
    check();
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, []);

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

  const login = useCallback(async (retryCount = 0) => {
    const webApp = getTelegramWebApp();
    if (!webApp?.initData) {
      console.warn('[TG-AUTH] login() aborted: no initData available');
      return;
    }

    console.log('[TG-AUTH] login() starting, initData length:', webApp.initData.length, 'retry:', retryCount);
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

      console.log('[TG-AUTH] login() success (build=' + BUILD_VERSION + '), user:', data.user?.displayName, 'walletAddress:', data.user?.walletAddress, 'isNewUser:', data.isNewUser);
      saveAuth(data.token, data.refreshToken, data.user);
    } catch (err) {
      console.error('[TG-AUTH] login() exception:', err.message);
      setError(err.message);

      if (retryCount < 2) {
        const delay = (retryCount + 1) * 2000;
        console.log(`[TG-AUTH] login() will retry in ${delay}ms (attempt ${retryCount + 1}/2)`);
        setTimeout(() => login(retryCount + 1), delay);
        return;
      }
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

    const initTelegramView = async () => {
      await ensureTelegramReady();
      const webApp = getTelegramWebApp();
      if (webApp) {
        console.log('[TG-AUTH] initTelegramView: calling ready() + expand, platform:', webApp.platform);
        webApp.ready();
        webApp.expand();
        if (window.Telegram?.WebView) {
          window.Telegram.WebView.postEvent("web_app_expand");
        }
        webApp.disableVerticalSwipes?.();
      } else {
        console.warn('[TG-AUTH] initTelegramView: isTelegram=true but webApp is null after waiting');
      }
    };
    initTelegramView();

    const currentWebApp = getTelegramWebApp();
    if (!token && !loginAttempted.current) {
      if (currentWebApp?.initData) {
        console.log('[TG-AUTH] useEffect: no stored token, starting auto-login...');
        loginAttempted.current = true;
        login();
      } else {
        console.warn('[TG-AUTH] useEffect: no stored token and no initData, cannot auto-login');
      }
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
