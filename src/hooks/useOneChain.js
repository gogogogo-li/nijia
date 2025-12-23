import { useState, useEffect, useCallback } from 'react';
import onechainService from '../services/onechainService';

export const useOneChain = () => {
  const [walletAddress, setWalletAddress] = useState(onechainService.walletAddress);
  const [isConnected, setIsConnected] = useState(onechainService.walletConnected);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isMinting, setIsMinting] = useState(false);
  const [mintedNFT, setMintedNFT] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [balance, setBalance] = useState(null);

  // Check if wallet is already connected on mount and set up listeners
  useEffect(() => {
    const checkConnection = async () => {
      try {
        // Try to restore previous session
        const restored = await onechainService.restoreSession();

        if (restored) {
          setWalletAddress(onechainService.walletAddress);
          setIsConnected(true);
          setUserProfile(onechainService.userProfile);
          console.log('✅ Wallet session restored');

          // Load balance
          const balanceData = await onechainService.getBalance();
          setBalance(balanceData);
        } else if (window.onechain) {
          // Check current connection without restoring
          try {
            const account = await window.onechain.account();
            if (account && account.address) {
              setWalletAddress(account.address);
              setIsConnected(true);
            }
          } catch (err) {
            console.log('No active wallet connection');
          }
        }
      } catch (err) {
        console.log('Wallet not auto-connected:', err);
      }
    };

    checkConnection();

    // Set up event listeners
    const handleWalletEvent = (event, data) => {
      switch (event) {
        case 'connected':
          setWalletAddress(data.address);
          setIsConnected(true);
          setUserProfile(data.profile);
          setError(null);
          break;
        case 'disconnect':
          setWalletAddress(null);
          setIsConnected(false);
          setUserProfile(null);
          setBalance(null);
          setMintedNFT(null);
          break;
        case 'accountChanged':
          setWalletAddress(data.address);
          break;
        default:
          break;
      }
    };

    onechainService.addEventListener(handleWalletEvent);

    return () => {
      onechainService.removeEventListener(handleWalletEvent);
    };
  }, []);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      console.log('🔵 Initiating wallet connection...');
      const result = await onechainService.connectWallet();

      if (result.success) {
        setWalletAddress(result.address);
        setIsConnected(true);
        setUserProfile(result.profile);

        // Load balance after connection with retry logic
        const loadBalance = async (attempt = 1) => {
          try {
            console.log(`💰 Loading balance (attempt ${attempt})...`);
            // Small delay to ensure wallet state is fully synchronized
            if (attempt === 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            const balanceData = await onechainService.getBalance();
            console.log('✅ Balance loaded:', balanceData);
            setBalance(balanceData);
            return balanceData;
          } catch (balErr) {
            console.warn(`Failed to load balance (attempt ${attempt}):`, balErr.message);
            if (attempt < 3) {
              console.log(`   Retrying in ${attempt * 1000}ms...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 1000));
              return loadBalance(attempt + 1);
            }
            console.error('❌ All balance fetch attempts failed');
            setBalance({ amount: '0.0000', symbol: 'OCT', error: 'Failed to fetch' });
            return null;
          }
        };

        loadBalance();

        console.log('✅ Wallet connected in hook:', result.address);
        return result;
      } else {
        setError(result.error);
        console.error('❌ Connection failed:', result.error);
        return result;
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to connect OneWallet';
      setError(errorMsg);
      console.error('❌ Connection error:', err);
      return { success: false, error: errorMsg };
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    onechainService.disconnectWallet();
    setWalletAddress(null);
    setIsConnected(false);
    setError(null);
    setMintedNFT(null);
    setUserProfile(null);
    setBalance(null);
    console.log('✅ Wallet disconnected in hook');
  }, []);

  // Start game session
  const startGameSession = useCallback(() => {
    onechainService.startGameSession();
  }, []);

  // Record a slash
  const recordSlash = useCallback((slashData) => {
    onechainService.recordSlash(slashData);
  }, []);

  // Refresh balance
  const refreshBalance = useCallback(async () => {
    try {
      const balanceData = await onechainService.getBalance();
      setBalance(balanceData);
      return balanceData;
    } catch (error) {
      console.error('Error refreshing balance:', error);
      return balance || { amount: '0', symbol: 'OCT' };
    }
  }, [balance]);

  // Get balance (returns current or fetches new)
  const getBalance = useCallback(async () => {
    if (balance) return balance;
    return await refreshBalance();
  }, [balance, refreshBalance]);

  // Mint NFT with game results
  const mintGameNFT = useCallback(async (gameStats) => {
    if (!walletAddress || !isConnected) {
      const error = 'Please connect your OneWallet first';
      setError(error);
      return { success: false, error };
    }

    setIsMinting(true);
    setError(null);

    try {
      const result = await onechainService.mintGameNFT(gameStats);

      if (result.success) {
        setMintedNFT(result);
        // Refresh balance after minting (gas was spent)
        await refreshBalance();
      } else {
        setError(result.error);
      }

      return result;
    } catch (err) {
      const errorMsg = err.message || 'Failed to mint NFT';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsMinting(false);
    }
  }, [walletAddress, isConnected, refreshBalance]);

  return {
    // Wallet state
    walletAddress,
    isConnected,
    isConnecting,
    error,
    userProfile,
    balance,

    // Wallet actions
    connectWallet,
    disconnectWallet,
    refreshBalance,

    // NFT minting
    isMinting,
    mintedNFT,
    mintGameNFT,

    // Game actions
    startGameSession,
    recordSlash,
    getBalance
  };
};
