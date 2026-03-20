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
      const isConnected = !!telegram.token && !!telegram.user;
      console.log('[TG-AUTH] AuthContext: provider=telegram, isConnected:', isConnected,
        ', isAuthenticating:', telegram.isAuthenticating,
        ', walletAddress:', telegram.walletAddress,
        ', user:', telegram.user?.displayName || null,
        ', error:', telegram.error || 'none');
      return {
        authProvider: 'telegram',
        isTelegram: true,
        walletAddress: telegram.walletAddress,
        isConnected,
        isAuthenticating: telegram.isAuthenticating,
        token: telegram.token,
        user: telegram.user,
        error: telegram.error,
        refreshAccessToken: telegram.refreshAccessToken,
        onechain: null,
        telegram,
      };
    }

    console.log('[TG-AUTH] AuthContext: provider=wallet, isConnected:', onechain?.isConnected || false);
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
