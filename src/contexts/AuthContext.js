import React, { createContext, useContext, useMemo } from 'react';
import { useTelegram } from '../hooks/useTelegram';

const AuthContext = createContext(null);

/**
 * Unified auth provider that bridges Telegram and Wallet auth.
 *
 * When inside Telegram Mini App, authentication happens automatically via initData.
 * When in a regular browser, the existing useOneChain wallet hook is used.
 *
 * `onechain` must be passed in from the parent so we don't duplicate the hook call.
 */
export function AuthProvider({ onechain, children }) {
  const telegram = useTelegram();

  const value = useMemo(() => {
    if (telegram.isTelegram) {
      return {
        authProvider: 'telegram',
        isTelegram: true,
        walletAddress: telegram.walletAddress,
        isConnected: !!telegram.token && !!telegram.user,
        isAuthenticating: telegram.isAuthenticating,
        token: telegram.token,
        user: telegram.user,
        error: telegram.error,
        refreshAccessToken: telegram.refreshAccessToken,
        onechain: null,
        telegram,
      };
    }

    return {
      authProvider: 'wallet',
      isTelegram: false,
      walletAddress: onechain?.walletAddress || null,
      isConnected: onechain?.isConnected || false,
      isAuthenticating: onechain?.isConnecting || false,
      token: null,
      user: null,
      error: onechain?.error || null,
      refreshAccessToken: null,
      onechain,
      telegram: null,
    };
  }, [telegram, onechain]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
