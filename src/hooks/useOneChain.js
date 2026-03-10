import { useState, useEffect, useCallback } from 'react';
import onechainService from '../services/onechainService';
import { createSoloGameTransaction, getStakeAmountToken } from '../services/soloContract';

export const useOneChain = () => {
  const [walletAddress, setWalletAddress] = useState(onechainService.walletAddress);
  const [isConnected, setIsConnected] = useState(onechainService.walletConnected);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isMinting, setIsMinting] = useState(false);
  const [mintedNFT, setMintedNFT] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [walletSignature, setWalletSignature] = useState(onechainService.sessionToken);
  const [walletAuthMessage, setWalletAuthMessage] = useState(onechainService.authMessage);

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
          setWalletSignature(onechainService.sessionToken);
          setWalletAuthMessage(onechainService.authMessage);
          console.log('✅ Wallet session restored');

          // Load balance
          const balanceData = await onechainService.getBalance();
          setBalance(balanceData);
        } else if (window.onechain) {
          // Wallet is available but no saved session — do a full connect to get signature
          try {
            const account = await window.onechain.account();
            if (account && account.address) {
              console.log('🔄 Wallet detected without session, performing full connect for auth signature...');
              const result = await onechainService.connectWallet();
              if (result.success) {
                setWalletAddress(result.address);
                setIsConnected(true);
                setUserProfile(result.profile);
                setWalletSignature(onechainService.sessionToken);
                setWalletAuthMessage(onechainService.authMessage);

                // Load balance
                const balanceData = await onechainService.getBalance();
                setBalance(balanceData);
              }
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
          setWalletSignature(onechainService.sessionToken);
          setWalletAuthMessage(onechainService.authMessage);
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
        setWalletSignature(onechainService.sessionToken);
        setWalletAuthMessage(onechainService.authMessage);

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
            setBalance({ amount: '0.0000', symbol: 'HACK', error: 'Failed to fetch' });
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
    setWalletSignature(null);
    setWalletAuthMessage(null);
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
      return balance || { amount: '0', symbol: 'HACK' };
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

  // Create and stake a solo game on-chain
  const createSoloGame = useCallback(async (difficulty) => {
    if (!walletAddress || !isConnected) {
      return { success: false, error: 'Please connect your OneWallet first' };
    }

    try {
      console.log('🎮 Creating solo game on-chain...');
      console.log(`   Difficulty: ${difficulty}`);
      console.log(`   Stake: ${getStakeAmountToken(difficulty)} HACK`);

      // 1. Fetch available HACK coin objects
      const coinObjects = await onechainService.getCoinObjects();
      console.log('   Available coins:', coinObjects);

      // 2. Select a coin with sufficient balance or use primary
      // Note: for production, you might want to merge coins if split is needed
      let selectedCoinId = null;
      if (coinObjects.length > 0) {
        // Find largest coin
        const bestCoin = coinObjects.sort((a, b) => Number(b.balance) - Number(a.balance))[0];
        selectedCoinId = bestCoin.objectId;
        console.log('   Selected coin for payment:', selectedCoinId);
      } else {
        console.warn('   ⚠️ No HACK coins found! Transaction might fail if not simulating.');
      }

      // Build the transaction with selected coin
      const tx = createSoloGameTransaction({
        difficulty,
        coinObjectId: selectedCoinId
      });

      // Check if this is development mode
      if (tx._isDevelopmentMode) {
        console.log('⚠️  Development mode - simulating transaction');
        return {
          success: true,
          transactionHash: `dev_tx_${Date.now()}`,
          gameId: tx._mockGameId || Math.floor(Math.random() * 1000000),
          isDevelopmentMode: true
        };
      }

      // Execute the transaction via wallet
      const result = await onechainService.executeTransaction(tx);

      if (result.success) {
        console.log('✅ Solo game created on-chain!');
        console.log(`   TX Hash: ${result.transactionHash}`);

        // Extract game ID from events if available
        let gameId = null;
        if (result.events) {
          const createEvent = result.events.find(e =>
            e.type && e.type.includes('SoloGameCreatedEvent')
          );
          if (createEvent && createEvent.parsedJson) {
            gameId = createEvent.parsedJson.game_id;
          }
        }

        // Refresh balance after stake
        await refreshBalance();

        return {
          success: true,
          transactionHash: result.transactionHash,
          gameId,
          events: result.events,
          objectChanges: result.objectChanges
        };
      } else {
        return { success: false, error: result.error || 'Transaction failed' };
      }
    } catch (error) {
      console.error('❌ Failed to create solo game:', error);
      return { success: false, error: error.message };
    }
  }, [walletAddress, isConnected, refreshBalance]);

  // Compute Token balance from balance object
  const tokenBalance = balance ? parseFloat(balance.amount) : 0;

  return {
    // Wallet state
    walletAddress,
    isConnected,
    isConnecting,
    error,
    userProfile,
    balance,
    tokenBalance,
    walletSignature,
    walletAuthMessage,

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
    getBalance,
    createSoloGame
  };
};
