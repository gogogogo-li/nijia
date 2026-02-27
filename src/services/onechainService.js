// OneChain Service - Handles all blockchain interactions with OneChain network
// Integrates OneWallet, OneDEX, OneID, and OneRWA
import onelabsApiClient from './onelabsApiClient';


class OneChainService {
  constructor() {
    this.walletConnected = false;
    this.walletAddress = null;
    this.walletProvider = null;
    this.sessionToken = null;
    this.authMessage = null;
    this.userProfile = null;
    this.slashBuffer = [];
    this.BATCH_SIZE = 10;
    this.currentTokenId = 0;
    this.gameStartTime = null;
    this.listeners = new Set();

    // Initialize OneLabs API Client
    this.apiClient = onelabsApiClient;

    // Backend proxy URL for RPC calls (bypasses CORS)
    // Use REACT_APP_API_BASE_URL for consistency with multiplayer service
    const backendUrl = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

    // OneChain configuration
    this.ONECHAIN_CONFIG = {
      apiEndpoint: process.env.REACT_APP_ONECHAIN_API || 'https://api.onelabs.cc',
      // Use backend proxy for RPC to bypass CORS
      rpcEndpoint: `${backendUrl}/api/rpc`,
      // Keep original RPC URL for reference
      originalRpcEndpoint: process.env.REACT_APP_ONECHAIN_RPC || 'https://rpc-testnet.onelabs.cc:443',
      network: process.env.REACT_APP_ONECHAIN_NETWORK || 'testnet',
      projectId: process.env.REACT_APP_ONECHAIN_PROJECT_ID || 'oneninja',
      gameContractAddress: process.env.REACT_APP_GAME_CONTRACT_ADDRESS,
      // OneChain Infrastructure Flags
      oneIdEnabled: process.env.REACT_APP_ONEID_ENABLED === 'true',
      oneIdClientId: process.env.REACT_APP_ONEID_CLIENT_ID,
      oneDexEnabled: process.env.REACT_APP_ONEDEX_ENABLED === 'true',
      rewardTokenAddress: process.env.REACT_APP_REWARD_TOKEN_ADDRESS,
      oneRwaEnabled: process.env.REACT_APP_ONERWA_ENABLED === 'true',
      nftCollectionAddress: process.env.REACT_APP_NFT_COLLECTION_ADDRESS,
    };

    console.log('📡 OneChainService initialized with RPC proxy:', this.ONECHAIN_CONFIG.rpcEndpoint);

    // Wait for wallet to inject before restoring session
    this.waitForWallet().then(() => {
      this.restoreSession();
      this.setupWalletListeners();
    });
  }

  // Add event listener
  addEventListener(callback) {
    this.listeners.add(callback);
  }

  // Remove event listener
  removeEventListener(callback) {
    this.listeners.delete(callback);
  }

  // Notify all listeners
  notifyListeners(event, data) {
    this.listeners.forEach(callback => callback(event, data));
  }

  // Setup wallet event listeners
  setupWalletListeners() {
    const wallet = this.getWalletProvider();
    if (!wallet) return;

    const provider = wallet.provider;

    // Listen for account changes
    if (typeof provider.onAccountChange === 'function') {
      provider.onAccountChange((newAccount) => {
        console.log('🔄 Account changed:', newAccount);
        if (newAccount) {
          const address = typeof newAccount === 'string' ? newAccount : newAccount.address;
          if (address) {
            this.walletAddress = address;
            this.saveSession();
            this.notifyListeners('accountChanged', { address: this.walletAddress });
          }
        } else {
          this.handleDisconnect();
        }
      });
    }

    // Listen for network changes
    if (typeof provider.onNetworkChange === 'function') {
      provider.onNetworkChange((newNetwork) => {
        console.log('🌐 Network changed:', newNetwork);
        this.notifyListeners('networkChanged', { network: newNetwork });
      });
    }

    // Listen for disconnect
    if (typeof provider.onDisconnect === 'function') {
      provider.onDisconnect(() => {
        console.log('🔌 Wallet disconnected');
        this.handleDisconnect();
      });
    }
  }

  // Handle account change
  handleAccountChange(accounts) {
    if (accounts.length === 0) {
      this.handleDisconnect();
    } else {
      this.walletAddress = accounts[0];
      this.saveSession();
      this.notifyListeners('accountChanged', { address: this.walletAddress });
    }
  }

  // Handle disconnection
  handleDisconnect() {
    this.walletConnected = false;
    this.walletAddress = null;
    this.sessionToken = null;
    this.userProfile = null;
    this.clearSession();
    this.notifyListeners('disconnect', {});
  }

  // Save session to localStorage
  saveSession() {
    if (this.walletAddress) {
      const session = {
        address: this.walletAddress,
        provider: this.walletProvider,
        signature: this.sessionToken,
        authMessage: this.authMessage,
        timestamp: Date.now(),
        network: this.ONECHAIN_CONFIG.network,
        profile: this.userProfile
      };
      localStorage.setItem('onechain_session', JSON.stringify(session));
      console.log('💾 Session saved:', {
        address: session.address.substring(0, 10) + '...',
        authenticated: !!session.signature,
        timestamp: new Date(session.timestamp).toLocaleString()
      });
    }
  }

  // Clear session from localStorage
  clearSession() {
    localStorage.removeItem('onechain_session');
  }

  // Restore session from localStorage
  async restoreSession() {
    try {
      console.log('🔄 Attempting to restore session...');

      const sessionData = localStorage.getItem('onechain_session');
      if (!sessionData) {
        console.log('   No saved session found');
        return false;
      }

      const session = JSON.parse(sessionData);
      console.log('   Found session:', {
        address: session.address ? session.address.substring(0, 10) + '...' : 'none',
        age: Math.round((Date.now() - session.timestamp) / 1000 / 60) + ' minutes',
        authenticated: !!session.signature
      });

      // Check if session is less than 24 hours old
      const hoursSinceSession = (Date.now() - session.timestamp) / (1000 * 60 * 60);
      if (hoursSinceSession > 24) {
        console.log('   ❌ Session expired (>24 hours)');
        this.clearSession();
        return false;
      }

      // Wait for wallet
      await this.waitForWallet();

      // Verify with current wallet provider
      const wallet = this.getWalletProvider();
      if (!wallet) {
        console.log('   ❌ Wallet not available');
        this.clearSession();
        return false;
      }

      try {
        const provider = wallet.provider;

        // Try to get current account
        let account = null;
        if (typeof provider.account === 'function') {
          account = await provider.account();
        } else if (typeof provider.getAccount === 'function') {
          account = await provider.getAccount();
        } else if (provider.accounts && provider.accounts.length > 0) {
          account = { address: provider.accounts[0] };
        }

        if (account && account.address === session.address) {
          // Restore session state
          this.walletAddress = session.address;
          this.walletConnected = true;
          this.walletProvider = session.provider || wallet.name;
          this.sessionToken = session.signature;
          this.authMessage = session.authMessage || null;
          this.userProfile = session.profile;

          console.log('   ✅ Session restored successfully');
          console.log(`      Address: ${this.walletAddress}`);
          console.log(`      Authenticated: ${!!this.sessionToken ? 'YES' : 'NO'}`);

          // Setup event listeners
          this.setupWalletListeners();

          // Refresh profile if OneID enabled
          if (this.ONECHAIN_CONFIG.oneIdEnabled && !this.userProfile) {
            try {
              await this.fetchUserProfile();
            } catch (err) {
              console.warn('   ⚠️  Could not refresh profile:', err.message);
            }
          }

          // Notify listeners
          this.notifyListeners('sessionRestored', {
            address: this.walletAddress,
            profile: this.userProfile
          });

          return true;
        } else {
          console.log('   ❌ Address mismatch or account not found');
        }
      } catch (err) {
        console.log('   ❌ Session verification failed:', err.message);
      }

      this.clearSession();
      return false;
    } catch (error) {
      console.error('Error restoring session:', error);
      this.clearSession();
      return false;
    }
  }

  // Wait for wallet to be injected
  async waitForWallet(timeout = 3000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (window.onechain) {
        console.log('✅ OneWallet detected after', Date.now() - startTime, 'ms');
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('⚠️ OneWallet not detected after', timeout, 'ms');
    return false;
  }

  // Get OneWallet provider
  getWalletProvider() {
    // OneWallet injects as window.onechain with multi-chain support
    if (window.onechain && typeof window.onechain === 'object') {
      console.log('✅ OneWallet detected, available methods:', Object.keys(window.onechain));

      // Check if there's a providers object with OneChain
      if (window.onechain.providers && typeof window.onechain.providers === 'object') {
        console.log('   Available providers:', Object.keys(window.onechain.providers));

        // Look for OneChain provider first (highest priority)
        if (window.onechain.providers.onechain && typeof window.onechain.providers.onechain.connect === 'function') {
          console.log('   ✅ Using OneChain provider from providers object');
          return { provider: window.onechain.providers.onechain, name: 'OneWallet', chain: 'onechain' };
        }
      }

      // Check TOP-LEVEL for onechain provider FIRST (before sui)
      if (window.onechain.onechain && typeof window.onechain.onechain.connect === 'function') {
        console.log('   ✅ Using window.onechain.onechain provider (native OneChain)');
        return { provider: window.onechain.onechain, name: 'OneWallet', chain: 'onechain' };
      }

      // Check if window.onechain has connect directly (this IS the OneChain provider)
      if (typeof window.onechain.connect === 'function') {
        console.log('   ✅ Using direct window.onechain provider (OneChain native)');
        return { provider: window.onechain, name: 'OneWallet', chain: 'onechain' };
      }

      // Last resort: use sui-compatible provider with chain override
      // OneChain is built on Sui's framework, so we use sui provider but specify onechain network
      if (window.onechain.sui && typeof window.onechain.sui.connect === 'function') {
        console.log('   ⚠️ Using window.onechain.sui provider (Sui-compatible)');
        console.log('      IMPORTANT: Will specify chain: onechain:testnet in all transactions');
        return { provider: window.onechain.sui, name: 'OneWallet', chain: 'sui' };
      }

      console.log('❌ No compatible provider found in OneWallet');
      console.log('   Available top-level keys:', Object.keys(window.onechain));
      if (window.onechain.providers) {
        console.log('   Available providers:', Object.keys(window.onechain.providers));
      }
      return null;
    }

    console.log('❌ OneWallet not found');
    return null;
  }

  // Connect OneWallet
  async connectWallet() {
    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔵 OneWallet Connection Flow Started');
      console.log('═══════════════════════════════════════════════════════\n');

      // STEP 1: Wait for wallet injection
      console.log('Step 1: Waiting for OneWallet...');
      await this.waitForWallet();

      // STEP 2: Get wallet provider
      console.log('\nStep 2: Getting wallet provider...');
      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not detected. Please install the OneWallet extension and refresh the page.');
      }
      console.log(`✅ ${wallet.name} detected`);

      // STEP 3: Get provider instance
      console.log('\nStep 3: Accessing provider...');
      const provider = wallet.provider;
      if (!provider) {
        throw new Error('OneWallet provider not available');
      }
      console.log('✅ Provider ready:', Object.keys(provider).join(', '));

      // STEP 4: Request wallet connection
      console.log('\nStep 4: Requesting wallet connection...');
      if (typeof provider.connect !== 'function') {
        throw new Error('Provider does not support connect()');
      }

      const connectResult = await provider.connect();
      console.log('Connection result:', connectResult);

      // STEP 5: Handle connection response
      console.log('\nStep 5: Processing connection response...');
      if (connectResult && connectResult.status === 'Rejected') {
        throw new Error('Connection rejected by user');
      }

      // STEP 6: Retrieve account information
      console.log('\nStep 6: Retrieving account information...');
      let account = null;
      let address = null;

      // Try multiple methods to get account based on provider type
      if (connectResult && connectResult.address) {
        account = connectResult;
        address = connectResult.address;
        console.log('✅ Got account from connect result');
      } else if (connectResult && connectResult.status === 'Approved') {
        if (typeof provider.account === 'function') {
          account = await provider.account();
          console.log('✅ Got account from provider.account()');
          console.log('   Account object:', account);

          if (typeof account === 'string') {
            address = account;
          } else if (account && account.address) {
            address = account.address;
          }
        } else if (provider.accounts && provider.accounts.length > 0) {
          address = provider.accounts[0];
          account = { address };
          console.log('✅ Got account from provider.accounts');
        }
      } else {
        // Try getAccounts() for Sui/multi-chain wallets
        if (typeof provider.getAccounts === 'function') {
          console.log('   Trying provider.getAccounts()...');
          const accounts = await provider.getAccounts();
          console.log('   Accounts:', accounts);

          if (accounts && accounts.length > 0) {
            // Handle different account formats
            if (typeof accounts[0] === 'string') {
              address = accounts[0];
            } else if (accounts[0].address) {
              address = accounts[0].address;
            } else if (accounts[0].publicKey) {
              address = accounts[0].publicKey;
            }
            account = accounts[0];
            console.log('✅ Got account from provider.getAccounts()');
          }
        } else if (typeof provider.account === 'function') {
          account = await provider.account();
          console.log('✅ Got account from provider.account()');
          console.log('   Account object:', account);

          if (typeof account === 'string') {
            address = account;
          } else if (account && account.address) {
            address = account.address;
          } else if (account && account.publicKey) {
            address = account.publicKey;
          }
        } else if (provider.accounts && provider.accounts.length > 0) {
          address = provider.accounts[0];
          account = { address };
          console.log('✅ Got address from provider.accounts array');
        }
      }

      if (!address) {
        console.error('❌ Account retrieval details:');
        console.error('   connectResult:', connectResult);
        console.error('   account:', account);
        console.error('   provider.accounts:', provider.accounts);
        console.error('   provider methods:', Object.keys(provider));
        throw new Error('Failed to retrieve account information');
      }

      console.log(`✅ Account address: ${address}`);

      // STEP 7: Create authentication signature (optional - not critical for wallet connection)
      console.log('\nStep 7: Creating authentication signature...');
      let signature = null;
      let authMessage = null;

      try {
        const timestamp = Date.now();
        authMessage = `Welcome to OneNinja!\n\nWallet Address: ${address}\nTimestamp: ${timestamp}`;

        // Convert message to Uint8Array for signPersonalMessage
        const messageBytes = new TextEncoder().encode(authMessage);

        // Try signPersonalMessage first (preferred for Sui wallets)
        if (typeof provider.signPersonalMessage === 'function') {
          console.log('   Using signPersonalMessage...');
          const signResult = await provider.signPersonalMessage({
            message: messageBytes,
            account: account // Add account parameter
          });
          signature = signResult.signature || signResult.bytes || signResult;
          console.log('✅ Signature created via signPersonalMessage');
        } else if (typeof provider.signMessage === 'function') {
          // Fallback to signMessage
          console.log('   Using signMessage...');
          const signResult = await provider.signMessage({
            message: messageBytes,
            account: account // Add account parameter
          });
          signature = signResult.signature || signResult;
          console.log('✅ Signature created via signMessage');
        } else {
          console.log('⚠️  No signature method available - skipping authentication');
        }
      } catch (sigError) {
        // Signature is optional - don't block connection
        console.warn('⚠️  Signature skipped:', sigError.message);
      }

      // STEP 8: Get network information
      console.log('\nStep 8: Getting network information...');
      let network = null;
      try {
        if (typeof provider.network === 'function') {
          network = await provider.network();
        } else if (provider.network) {
          network = provider.network;
        }
        if (network) {
          console.log(`✅ Network: ${network.name || 'unknown'} (Chain ID: ${network.chainId || 'unknown'})`);
        }
      } catch (err) {
        console.warn('⚠️  Could not get network:', err.message);
      }

      // STEP 9: Initialize session
      console.log('\nStep 9: Initializing session...');
      this.walletAddress = address;
      this.walletProvider = wallet.name;
      this.walletConnected = true;
      this.sessionToken = signature;
      this.authMessage = authMessage;

      // Save to localStorage with signature
      this.saveSession();
      console.log('✅ Session saved to localStorage');

      // STEP 10: Fetch user profile (optional)
      if (this.ONECHAIN_CONFIG.oneIdEnabled) {
        console.log('\nStep 10: Fetching OneID profile...');
        try {
          await this.fetchUserProfile();
          console.log('✅ Profile fetched');
        } catch (err) {
          console.warn('⚠️  Profile fetch failed:', err.message);
        }
      }

      // STEP 11: Setup event listeners
      console.log('\nStep 11: Setting up event listeners...');
      this.setupWalletListeners();
      console.log('✅ Event listeners registered');

      // STEP 12: Notify success
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('✅ WALLET CONNECTED SUCCESSFULLY!');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Address: ${address}`);
      console.log(`   Provider: ${this.walletProvider}`);
      console.log(`   Network: ${network ? network.name : 'unknown'}`);
      console.log(`   Authenticated: ${!!signature ? 'YES ✓' : 'NO ✗'}`);
      console.log(`   Profile: ${this.userProfile ? 'Loaded' : 'Not loaded'}`);
      console.log('═══════════════════════════════════════════════════════\n');

      this.notifyListeners('connected', {
        address: this.walletAddress,
        profile: this.userProfile,
        signature: signature,
        authMessage: authMessage,
        network: network,
        timestamp: Date.now()
      });

      return {
        success: true,
        address: this.walletAddress,
        profile: this.userProfile,
        signature: signature,
        network: network,
        authenticated: !!signature
      };

    } catch (error) {
      console.error('\n═══════════════════════════════════════════════════════');
      console.error('❌ WALLET CONNECTION FAILED');
      console.error('═══════════════════════════════════════════════════════');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('═══════════════════════════════════════════════════════\n');

      // Clean up any partial state
      this.walletConnected = false;
      this.walletAddress = null;
      this.sessionToken = null;
      this.userProfile = null;
      this.clearSession();

      return {
        success: false,
        error: error.message || 'Failed to connect wallet'
      };
    }
  }

  // Disconnect wallet with full cleanup
  async disconnectWallet() {
    try {
      console.log('👋 Disconnecting wallet...');

      // Try to disconnect using the wallet provider
      const wallet = this.getWalletProvider();
      if (wallet) {
        const provider = wallet.provider;
        if (typeof provider.disconnect === 'function') {
          await provider.disconnect();
        }
      }

      this.walletConnected = false;
      this.walletProvider = null;
      this.walletAddress = null;
      this.sessionToken = null;
      this.userProfile = null;

      // Clear session storage
      this.clearSession();

      // Notify listeners
      this.notifyListeners('disconnect', {});

      console.log('✅ OneWallet disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting OneWallet:', error);
    }
  }

  // Check if wallet is connected
  isWalletConnected() {
    return this.walletConnected && this.walletAddress !== null;
  }

  // Get wallet address
  getWalletAddress() {
    return this.walletAddress;
  }

  // Get wallet balance from OneChain using OneLabs API SDK
  async getBalance() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('💰 Balance Fetch Flow Started');
    console.log('═══════════════════════════════════════════════════════');

    // Step 1: Check wallet connection
    console.log('\nStep 1: Checking wallet connection...');
    if (!this.isWalletConnected()) {
      console.error('❌ Wallet not connected');
      console.log('   walletConnected:', this.walletConnected);
      console.log('   walletAddress:', this.walletAddress);
      throw new Error('Wallet not connected');
    }
    console.log('✅ Wallet is connected');
    console.log('   Address:', this.walletAddress);

    // Step 2: Validate wallet address format
    console.log('\nStep 2: Validating wallet address format...');
    if (!this.walletAddress || typeof this.walletAddress !== 'string') {
      console.error('❌ Invalid wallet address type:', typeof this.walletAddress);
      return { amount: '0.0000', symbol: 'HACK', error: 'Invalid address type' };
    }
    if (!this.walletAddress.startsWith('0x')) {
      console.error('❌ Address does not start with 0x:', this.walletAddress);
      return { amount: '0.0000', symbol: 'HACK', error: 'Invalid address format' };
    }
    console.log('✅ Address format valid');

    try {
      // Step 3: Try OneLabs API SDK (primary method)
      console.log('\nStep 3: Fetching balance via OneLabs API SDK...');
      console.log('   Target address:', this.walletAddress);

      try {
        const hackCoinType = process.env.REACT_APP_HACK_COIN_TYPE || '0x8b76fc2a2317d45118770cefed7e57171a08c477ed16283616b15f099391f120::hackathon::HACKATHON';
        const balance = await this.apiClient.getBalance(this.walletAddress, hackCoinType);
        console.log('   Raw API response:', JSON.stringify(balance));

        if (balance && balance.totalBalance !== undefined) {
          // Convert from MIST (smallest unit) to HACK (9 decimals)
          const rawBalance = balance.totalBalance;
          console.log('   Raw totalBalance:', rawBalance, '(type:', typeof rawBalance, ')');

          const balanceInToken = this.apiClient.formatAmount(rawBalance, 9);
          const formattedBalance = balanceInToken.toFixed(4);

          console.log('═══════════════════════════════════════════════════════');
          console.log('✅ BALANCE FETCH SUCCESSFUL');
          console.log('   Balance:', formattedBalance, 'HACK');
          console.log('   Coin Type:', balance.coinType || 'unknown');
          console.log('═══════════════════════════════════════════════════════\n');

          return {
            amount: formattedBalance,
            symbol: 'HACK',
            coinType: balance.coinType
          };
        } else {
          console.warn('   ⚠️ Balance response missing totalBalance property');
          console.warn('   Response structure:', Object.keys(balance || {}));
        }
      } catch (sdkErr) {
        console.error('   ❌ API SDK balance fetch failed:');
        console.error('   Error name:', sdkErr.name);
        console.error('   Error message:', sdkErr.message);
        if (sdkErr.cause) console.error('   Error cause:', sdkErr.cause);
      }

      // Step 4: Fallback to wallet provider
      console.log('\nStep 4: Trying wallet provider fallback...');
      const provider = this.getWalletProvider();

      if (provider && provider.provider) {
        const actualProvider = provider.provider;
        console.log('   Provider name:', provider.name);
        console.log('   Provider methods:', Object.keys(actualProvider).slice(0, 10).join(', '));

        // Try getBalance from the actual Sui provider
        if (typeof actualProvider.getBalance === 'function') {
          try {
            console.log('   Calling actualProvider.getBalance()...');
            const result = await actualProvider.getBalance({ owner: this.walletAddress });
            console.log('   Provider balance result:', JSON.stringify(result));

            if (result && result.totalBalance) {
              const balanceInToken = (Number(result.totalBalance) / 1_000_000_000).toFixed(4);
              console.log('✅ Balance from provider:', balanceInToken, 'HACK\n');
              return {
                amount: balanceInToken,
                symbol: 'HACK'
              };
            }
          } catch (err) {
            console.warn('   actualProvider.getBalance() failed:', err.message);
          }
        }

        // Try getAllBalances
        if (typeof actualProvider.getAllBalances === 'function') {
          try {
            console.log('   Calling actualProvider.getAllBalances()...');
            const result = await actualProvider.getAllBalances({ owner: this.walletAddress });
            console.log('   Provider all balances result:', JSON.stringify(result));

            if (result && result.length > 0) {
              // Only look for HACK coin - do NOT fallback to SUI
              const hackCoinType = process.env.REACT_APP_HACK_COIN_TYPE || '::hackathon::HACKATHON';
              const targetBalance = result.find(b => b.coinType && b.coinType.includes(hackCoinType));

              if (targetBalance && targetBalance.totalBalance) {
                const balanceInToken = (Number(targetBalance.totalBalance) / 1_000_000_000).toFixed(4);
                console.log('✅ Balance from provider.getAllBalances():', balanceInToken, 'HACK');
                console.log('   Coin type:', targetBalance.coinType, '\n');
                return {
                  amount: balanceInToken,
                  symbol: 'HACK'
                };
              }
            }
          } catch (err) {
            console.warn('   actualProvider.getAllBalances() failed:', err.message);
          }
        }
      } else {
        console.warn('   ⚠️ No wallet provider available for fallback');
      }

      // All methods failed
      console.log('═══════════════════════════════════════════════════════');
      console.warn('⚠️ ALL BALANCE FETCH METHODS FAILED');
      console.warn('   Returning 0.0000 HACK');
      console.log('═══════════════════════════════════════════════════════\n');
      return { amount: '0.0000', symbol: 'HACK', error: 'All fetch methods failed' };

    } catch (error) {
      console.log('═══════════════════════════════════════════════════════');
      console.error('❌ UNEXPECTED ERROR IN BALANCE FETCH');
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
      console.log('═══════════════════════════════════════════════════════\n');
      return { amount: '0.0000', symbol: 'HACK', error: error.message };
    }
  }

  /**
   * Get coin objects for transaction building
   * @param {number} minAmount - Minimum amount needed in HACK
   * @returns {Promise<Array>} Array of coin objects
   */
  async getCoinObjects(minAmount = 0) {
    try {
      if (!this.walletAddress) {
        throw new Error('Wallet not connected');
      }

      console.log(`🪙 Fetching coin objects for: ${this.walletAddress}`);
      const hackCoinType = process.env.REACT_APP_HACK_COIN_TYPE || '0x8b76fc2a2317d45118770cefed7e57171a08c477ed16283616b15f099391f120::hackathon::HACKATHON';

      // Use OneLabs API SDK to get specific coins
      if (this.apiClient && this.apiClient.getSuiClient()) {
        const client = this.apiClient.getSuiClient();
        const coins = await client.getCoins({
          owner: this.walletAddress,
          coinType: hackCoinType
        });

        console.log('   Fetched coins:', coins.data.length);

        // Filter coins with enough balance if needed
        const validCoins = coins.data.map(c => ({
          objectId: c.coinObjectId,
          balance: c.balance,
          coinType: c.coinType
        }));

        return validCoins;
      }

      return [];
    } catch (error) {
      console.error('❌ Error fetching coin objects:', error);
      return [];
    }
  }

  // Start a new game session
  startGameSession() {
    this.gameStartTime = Date.now();
    this.slashBuffer = [];
    console.log('🎮 Game session started');
  }

  // Record a slash action
  recordSlash(slashData) {
    const slash = {
      ...slashData,
      timestamp: Date.now()
    };

    this.slashBuffer.push(slash);

    // Auto-submit if buffer is full
    if (this.slashBuffer.length >= this.BATCH_SIZE) {
      this.submitSlashBatch();
    }
  }

  // Submit batch of slashes to OneChain
  async submitSlashBatch() {
    if (this.slashBuffer.length === 0) return;

    const batch = [...this.slashBuffer];
    this.slashBuffer = [];

    try {
      // Use OneLabs API SDK
      await this.apiClient.submitSlashBatch(
        this.walletAddress,
        batch,
        this.sessionToken
      );

      console.log(`✅ Submitted ${batch.length} slashes to OneChain via API SDK`);
    } catch (error) {
      console.error('Error submitting slash batch:', error);
      // Re-add to buffer on failure
      this.slashBuffer.push(...batch);
    }
  }

  // Mint Game NFT using OneChain wallet - REAL blockchain transaction
  async mintGameNFT(gameStats) {
    if (!this.isWalletConnected()) {
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      console.log('🎨 Minting Game NFT on OneChain...', gameStats);

      // Get NFT package ID from environment config and sanitize (remove trailing ~ or whitespace)
      let nftPackageId = process.env.REACT_APP_NFT_PACKAGE_ID || this.ONECHAIN_CONFIG.nftCollectionAddress;
      if (nftPackageId) {
        nftPackageId = nftPackageId.trim().replace(/[~]+$/, ''); // Remove trailing ~ and whitespace
      }

      console.log('📦 NFT Package ID:', nftPackageId);

      if (!nftPackageId) {
        console.warn('⚠️ NFT Package ID not configured - using simulation mode');
        return this.mintGameNFTSimulated(gameStats);
      }

      // Clock object ID for OneChain (0x6 is the system clock)
      const CLOCK_ID = '0x6';

      // Create NFT metadata
      const nftName = gameStats.isWelcomeNFT
        ? 'OneNinja Welcome Badge'
        : gameStats.isWinnerNFT
          ? `OneNinja Victory #${Date.now()}`
          : `OneNinja ${gameStats.tierName} Achievement`;

      const nftDescription = gameStats.isWelcomeNFT
        ? 'Welcome to OneNinja! Your journey begins here.'
        : gameStats.isWinnerNFT
          ? `🏆 Victory in multiplayer! Won with score ${gameStats.score} and claimed ${gameStats.prizeAmount || '?'} HACK!`
          : `${gameStats.tierIcon || '🎮'} Achieved ${gameStats.tierName} tier with ${gameStats.totalScore} total score!`;

      // Generate proper NFT image URL
      const imageUrl = this.generateNFTImageUrl(gameStats);

      console.log('📝 NFT Details:', { nftName, nftDescription, imageUrl });

      // Build the transaction using Transaction from the SDK
      const { Transaction } = await import('@onelabs/sui/transactions');
      const tx = new Transaction();

      // Convert strings to bytes for Move contract
      const nameBytes = Array.from(new TextEncoder().encode(nftName));
      const descBytes = Array.from(new TextEncoder().encode(nftDescription));
      const imageBytes = Array.from(new TextEncoder().encode(imageUrl));

      console.log('🔨 Building transaction for NFT type:',
        gameStats.isWelcomeNFT ? 'Welcome' :
          gameStats.isWinnerNFT ? 'Winner' : 'Achievement');

      if (gameStats.isWelcomeNFT) {
        // Mint welcome NFT
        tx.moveCall({
          target: `${nftPackageId}::game_nft::mint_welcome_nft`,
          arguments: [
            tx.pure.vector('u8', nameBytes),
            tx.pure.vector('u8', descBytes),
            tx.pure.vector('u8', imageBytes),
            tx.object(CLOCK_ID),
          ],
        });
      } else if (gameStats.isWinnerNFT) {
        // Mint winner NFT for multiplayer victories
        tx.moveCall({
          target: `${nftPackageId}::game_nft::mint_winner_nft`,
          arguments: [
            tx.pure.vector('u8', nameBytes),
            tx.pure.vector('u8', descBytes),
            tx.pure.vector('u8', imageBytes),
            tx.pure.u64(gameStats.score || 0),
            tx.pure.u64(gameStats.opponentScore || 0),
            tx.pure.u64(gameStats.prizeAmountMist || 0),
            tx.object(CLOCK_ID),
          ],
        });
      } else {
        // Mint achievement NFT
        const tierBytes = Array.from(new TextEncoder().encode(gameStats.tierName || 'Unknown'));
        tx.moveCall({
          target: `${nftPackageId}::game_nft::mint_achievement_nft`,
          arguments: [
            tx.pure.vector('u8', nameBytes),
            tx.pure.vector('u8', descBytes),
            tx.pure.vector('u8', imageBytes),
            tx.pure.vector('u8', tierBytes),
            tx.pure.u64(gameStats.score || 0),
            tx.object(CLOCK_ID),
          ],
        });
      }

      console.log('📤 Executing NFT mint transaction via executeTransaction...');

      // Use the existing executeTransaction method which handles wallet signing correctly
      const result = await this.executeTransaction(tx);

      console.log('✅ NFT Mint transaction result:', result);

      const txDigest = result.digest || result.transactionDigest || result.transactionHash;

      return {
        success: true,
        transactionHash: txDigest,
        explorerUrl: `https://onescan.cc/testnet/tx/${txDigest}`,
        name: nftName,
        tier: gameStats.tierName,
        score: gameStats.score,
        metadata: {
          name: nftName,
          description: nftDescription,
          image: imageUrl,
        },
      };

    } catch (error) {
      console.error('❌ NFT Minting failed:', error);

      // If contract not deployed, fall back to simulation
      if (error.message?.includes('Package') || error.message?.includes('not found') || error.message?.includes('ObjectNotFound')) {
        console.log('⚠️ NFT contract issue, using simulation mode');
        return this.mintGameNFTSimulated(gameStats);
      }

      return {
        success: false,
        error: error.message || 'Failed to mint NFT'
      };
    }
  }

  // Simulated NFT minting (fallback when contract not deployed)
  mintGameNFTSimulated(gameStats) {
    const nftName = gameStats.isWelcomeNFT
      ? 'OneNinja Welcome Badge'
      : `OneNinja ${gameStats.tierName} Achievement`;

    const nftDescription = gameStats.isWelcomeNFT
      ? 'Welcome to OneNinja! Your journey begins here.'
      : `${gameStats.tierIcon || '🎮'} Achieved ${gameStats.tierName} tier with ${gameStats.totalScore} total score!`;

    const mockTxHash = `0xSIM_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

    console.log('📊 NFT Simulation - would mint:', { nftName, nftDescription });

    return {
      success: true,
      transactionHash: mockTxHash,
      tokenId: Date.now(),
      explorerUrl: `https://onescan.cc/testnet/tx/${mockTxHash}`,
      name: nftName,
      tier: gameStats.tierName,
      score: gameStats.score,
      metadata: {
        name: nftName,
        description: nftDescription,
        image: this.generateNFTImageUrl(gameStats),
      },
      simulated: true,
      note: 'NFT contract not yet deployed - this is a simulation. Set REACT_APP_NFT_PACKAGE_ID after deploying game_nft.move'
    };
  }

  // Generate NFT image/emoji based on tier
  generateNFTImage(gameStats) {
    if (gameStats.isWelcomeNFT) {
      return '🌱'; // Welcome badge
    }

    // Return the tier icon from gameStats
    return gameStats.tierIcon || '🎮';
  }

  // Generate NFT image URL for blockchain storage
  // In production, replace with IPFS/Arweave URLs
  generateNFTImageUrl(gameStats) {
    // Base URL for NFT images (should be IPFS in production)
    const baseUrl = process.env.REACT_APP_NFT_IMAGE_BASE_URL || 'https://oneninja.xyz/nft-images';

    if (gameStats.isWelcomeNFT) {
      return `${baseUrl}/welcome-badge.png`;
    }

    if (gameStats.isWinnerNFT) {
      return `${baseUrl}/winner-trophy.png`;
    }

    // Achievement NFTs based on tier
    const tierSlug = (gameStats.tierName || 'bronze').toLowerCase().replace(/\s+/g, '-');
    return `${baseUrl}/${tierSlug}-achievement.png`;
  }

  // Fetch user profile via OneID using API SDK
  async fetchUserProfile() {
    try {
      const profile = await this.apiClient.getUserProfile(this.walletAddress);
      console.log('✅ OneID Profile loaded via API SDK:', profile);
      return profile;
    } catch (error) {
      console.error('Error fetching OneID profile:', error);
    }
    return null;
  }

  // Get game state from OneChain using API SDK
  async getGameState() {
    if (!this.isWalletConnected()) {
      return null;
    }

    try {
      return await this.apiClient.getPlayerStats(this.walletAddress);
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
    return null;
  }

  // Get leaderboard from backend with filters
  async getLeaderboard(options = {}) {
    const { period = 'all-time', mode = 'all', limit = 100 } = options;
    try {
      const backendUrl = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(
        `${backendUrl}/api/games/leaderboard?period=${period}&mode=${mode}&limit=${limit}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }
      const data = await response.json();
      return data.leaderboard || [];
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      // Fallback to API client if backend is unavailable
      try {
        return await this.apiClient.getLeaderboard(limit);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        return [];
      }
    }
  }

  // Get player's leaderboard stats
  async getPlayerLeaderboardStats(address, options = {}) {
    const { period = 'all-time', mode = 'all' } = options;
    try {
      const backendUrl = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(
        `${backendUrl}/api/games/leaderboard/player/${address}?period=${period}&mode=${mode}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch player stats');
      }
      const data = await response.json();
      return data.player || null;
    } catch (error) {
      console.error('Error fetching player leaderboard stats:', error);
      return null;
    }
  }

  // Get token price from OneDEX using API SDK
  async getTokenPrice() {
    try {
      // In production this would call a real DEX or oracle
      const data = await this.apiClient.getTokenPrice('HACK');
      return data.price;
    } catch (error) {
      console.error('Error fetching token price:', error);
    }
    return null;
  }

  // Reward player with tokens via OneDEX using API SDK
  async rewardPlayer(amount) {
    if (!this.isWalletConnected()) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const result = await this.apiClient.claimReward(
        this.walletAddress,
        amount,
        this.sessionToken
      );
      return { success: true, ...result };
    } catch (error) {
      console.error('Error rewarding player:', error);
    }
    return { success: false, error: 'Failed to reward player' };
  }

  // Sign and submit transaction to OneChain
  async signAndSubmitTransaction(transaction) {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('📝 Transaction Signing Flow');
      console.log('═══════════════════════════════════════════════════════\n');

      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not available');
      }

      const provider = wallet.provider;

      if (typeof provider.signAndSubmitTransaction !== 'function') {
        throw new Error('signAndSubmitTransaction method not available');
      }

      console.log('Transaction payload:', {
        type: transaction.type,
        function: transaction.function,
        arguments: transaction.arguments
      });

      console.log('\nRequesting signature from wallet...');
      const startTime = Date.now();

      const result = await provider.signAndSubmitTransaction(transaction);

      const duration = Date.now() - startTime;
      console.log(`\n✅ Transaction signed and submitted (${duration}ms)`);
      console.log('Transaction hash:', result.hash || result);
      console.log('═══════════════════════════════════════════════════════\n');

      // Store transaction reference
      this.lastTransaction = {
        hash: result.hash || result,
        timestamp: Date.now(),
        type: transaction.function || transaction.type
      };

      return {
        success: true,
        hash: result.hash || result,
        result,
        duration
      };

    } catch (error) {
      console.error('\n❌ Transaction failed:', error.message);
      console.error('═══════════════════════════════════════════════════════\n');
      throw error;
    }
  }

  // Wait for transaction confirmation
  async waitForTransaction(txHash, timeout = 30000) {
    console.log(`⏳ Waiting for transaction confirmation: ${txHash}`);

    const startTime = Date.now();
    const checkInterval = 1000; // Check every second

    while (Date.now() - startTime < timeout) {
      try {
        // Try to get transaction status from OneChain API using SDK
        const data = await this.apiClient.getTransactionStatus(txHash);

        if (data && (data.success || data.confirmed)) {
          const duration = Date.now() - startTime;
          console.log(`✅ Transaction confirmed via API SDK (${duration}ms)`);
          return {
            success: true,
            confirmed: true,
            data,
            duration
          };
        }
      } catch (err) {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error('Transaction confirmation timeout');
  }

  // Sign message with OneWallet
  async signMessage(message, nonce) {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('✍️  Message Signing Flow');
      console.log('═══════════════════════════════════════════════════════\n');

      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not available');
      }

      const provider = wallet.provider;

      if (typeof provider.signMessage !== 'function') {
        throw new Error('signMessage method not available');
      }

      const timestamp = nonce || Date.now();
      const payload = {
        message,
        nonce: timestamp.toString()
      };

      console.log('Message to sign:', message.substring(0, 100) + '...');
      console.log('Nonce:', payload.nonce);
      console.log('\nRequesting signature from wallet...');

      const startTime = Date.now();
      const result = await provider.signMessage(payload);
      const duration = Date.now() - startTime;

      const signature = result.signature || result;
      console.log(`\n✅ Message signed (${duration}ms)`);
      console.log('Signature:', signature.substring(0, 20) + '...' + signature.substring(signature.length - 20));
      console.log('═══════════════════════════════════════════════════════\n');

      return {
        signature,
        fullMessage: message,
        nonce: payload.nonce,
        address: this.walletAddress,
        timestamp
      };

    } catch (error) {
      console.error('\n❌ Message signing failed:', error.message);
      console.error('═══════════════════════════════════════════════════════\n');
      throw error;
    }
  }

  // Verify signature (for authentication)
  async verifySignature(message, signature, address) {
    try {
      console.log('🔍 Verifying signature via API SDK...');

      // Call OneChain API to verify signature using SDK
      const result = await this.apiClient.verifyAuth(address, message, signature);

      console.log('✅ Signature verification via API SDK:', result.valid ? 'VALID' : 'INVALID');
      return result.valid;
    } catch (error) {
      console.error('❌ Signature verification failed:', error);
      return false;
    }
  }

  // Get network information
  async getNetwork() {
    try {
      const wallet = this.getWalletProvider();
      if (!wallet) {
        return null;
      }

      const provider = wallet.provider;

      if (typeof provider.network === 'function') {
        return await provider.network();
      } else if (provider.network) {
        return provider.network;
      }

      return null;
    } catch (error) {
      console.error('Error getting network:', error);
      return null;
    }
  }

  // Check if wallet is installed
  isWalletInstalled() {
    return !!window.onechain;
  }

  // Get wallet state for debugging
  getState() {
    return {
      connected: this.walletConnected,
      address: this.walletAddress,
      provider: this.walletProvider,
      profile: this.userProfile,
      hasSessionToken: !!this.sessionToken
    };
  }

  /**
   * Transfer HACK to a recipient
   * @param {string} recipient - Recipient address
   * @param {number} amount - Amount in HACK (will be converted to MIST)
   */
  async transferToken(recipient, amount) {
    console.log('💸 transferToken called');

    if (!this.walletAddress) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log(`💸 Transferring ${amount} HACK to ${recipient}...`);

      // Convert HACK to MIST (1 HACK = 10^9 MIST)
      if (!this.walletConnected || !this.walletAddress) {
        throw new Error('Wallet not connected');
      }

      const wallet = this.getWalletProvider();
      if (!wallet || !wallet.provider) {
        throw new Error('Wallet provider not available');
      }

      console.log(`💸 Transferring ${amount} HACK to ${recipient}...`);

      // Convert HACK to MIST (1 HACK = 10^9 MIST)
      // eslint-disable-next-line no-undef
      const amountInMist = BigInt(Math.floor(amount * 1_000_000_000));

      // Create a proper Transaction instance
      const { Transaction } = await import('@onelabs/sui/transactions');
      const tx = new Transaction();

      // Set sender for the transaction
      tx.setSender(this.walletAddress);

      // Split coins and transfer
      const [coin] = tx.splitCoins(tx.gas, [amountInMist]);
      tx.transferObjects([coin], recipient);

      console.log('📝 Transaction created with Transaction class');
      console.log('   Available wallet methods:', Object.keys(wallet.provider).filter(k => k.includes('sign') || k.includes('execute')));

      let result;

      // Get account for transaction signing
      let account = null;
      if (typeof wallet.provider.account === 'function') {
        account = await wallet.provider.account();
      } else if (typeof wallet.provider.getAccount === 'function') {
        account = await wallet.provider.getAccount();
      } else if (wallet.provider.accounts && wallet.provider.accounts.length > 0) {
        account = wallet.provider.accounts[0];
      }

      console.log('   Using account:', account?.address || account);

      // Try different methods based on what the wallet supports
      if (typeof wallet.provider.signAndExecuteTransaction === 'function') {
        // Newer wallet standard
        console.log('   Using signAndExecuteTransaction with chain: onechain:testnet...');
        result = await wallet.provider.signAndExecuteTransaction({
          transaction: tx,
          account: account,
          chain: 'onechain:testnet', // CRITICAL: Specify OneChain network
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          }
        });
      } else if (typeof wallet.provider.signAndExecuteTransactionBlock === 'function') {
        // Older wallet standard - serialize the transaction first
        console.log('   Using signAndExecuteTransactionBlock with chain: onechain:testnet...');

        // Build the transaction bytes first using the API client
        try {
          const txBytes = await tx.build({
            client: this.apiClient.getSuiClient()
          });

          console.log('   Transaction built, bytes length:', txBytes.length);

          result = await wallet.provider.signAndExecuteTransactionBlock({
            transactionBlock: txBytes,
            account: account,
            chain: 'onechain:testnet', // CRITICAL: Specify OneChain network
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
        } catch (buildError) {
          console.warn('   Failed to build transaction, trying direct pass:', buildError.message);

          // Last resort: try passing the transaction directly
          result = await wallet.provider.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            account: account,
            chain: 'onechain:testnet', // CRITICAL: Specify OneChain network
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
        }
      } else {
        throw new Error('Wallet does not support transaction signing methods');
      }

      console.log('✅ Transfer successful:', result);

      return {
        success: true,
        transactionHash: result.digest || result.hash,
        effects: result.effects
      };
    } catch (error) {
      console.error('❌ Transfer failed:', error);
      throw error;
    }
  }

  /**
   * Execute a custom transaction
   * @param {Transaction} transaction - Pre-built transaction object
   * @returns {Promise<Object>} Transaction result with hash
   */
  async executeTransaction(transaction) {
    try {
      // DEVELOPMENT MODE: Handle mock transactions
      if (transaction._isDevelopmentMode) {
        console.warn('⚠️  Development Mode: Simulating transaction execution');
        console.log('   Transaction will not be sent to blockchain');
        console.log('   No wallet signature required');

        // Generate a mock transaction hash with DEV prefix for easy detection
        // Format: 0xDEV + random hex string (total 66 chars to match Sui digest length)
        const randomHex = Array.from({ length: 60 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join('');
        const mockHash = '0xDEV' + randomHex;

        // Wait a bit to simulate network delay
        await new Promise(resolve => setTimeout(resolve, 300));

        console.log('✅ Mock transaction executed:', mockHash);

        return {
          success: true,
          transactionHash: mockHash,
          digest: mockHash,
          effects: { status: { status: 'success' } },
          events: [],
          _isDevelopmentMode: true
        };
      }

      if (!this.walletConnected || !this.walletAddress) {
        throw new Error('Wallet not connected');
      }

      const wallet = this.getWalletProvider();
      if (!wallet || !wallet.provider) {
        throw new Error('Wallet provider not available');
      }

      console.log('📝 Executing transaction...');
      console.log('   Sender:', this.walletAddress);

      // CRITICAL: Set sender on transaction before building
      // This is required for the wallet to sign the transaction
      transaction.setSender(this.walletAddress);

      // Set a reasonable gas budget if not already set
      // This prevents "all endpoints failed" error
      transaction.setGasBudget(50000000); // 0.05 SUI/HACK for gas

      let result;
      const provider = wallet.provider;

      // Get account object for signing
      let account = { address: this.walletAddress };
      if (typeof provider.getAccounts === 'function') {
        try {
          const accounts = await provider.getAccounts();
          if (accounts && accounts.length > 0) {
            account = accounts[0];
            console.log('   Using account from getAccounts():', account);
          }
        } catch (err) {
          console.warn('   Could not get accounts, using address:', err.message);
        }
      }

      // Check available methods
      const hasSignAndExecute = typeof provider.signAndExecuteTransaction === 'function';
      const hasSignAndExecuteBlock = typeof provider.signAndExecuteTransactionBlock === 'function';

      console.log('   Wallet methods: signAndExecuteTransaction=' + hasSignAndExecute +
        ', signAndExecuteTransactionBlock=' + hasSignAndExecuteBlock);

      if (hasSignAndExecute) {
        // Newer Sui wallet standard - pass Transaction directly with account
        console.log('   Using signAndExecuteTransaction (newer API)...');
        result = await provider.signAndExecuteTransaction({
          transaction: transaction,
          account: account, // Add account parameter for OneWallet
          chain: 'onechain:testnet', // Specify OneChain network for multi-chain wallets
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          }
        });
      } else if (hasSignAndExecuteBlock) {
        // Older Sui wallet standard - build to bytes first
        console.log('   Using signAndExecuteTransactionBlock (older API)...');

        try {
          // Build transaction to bytes using the SuiClient
          console.log('   Building transaction bytes...');
          const txBytes = await transaction.build({
            client: this.apiClient.getSuiClient()
          });
          console.log('   Transaction built, bytes length:', txBytes.length);

          result = await provider.signAndExecuteTransactionBlock({
            transactionBlock: txBytes,
            account: account,
            chain: 'onechain:testnet', // CRITICAL: Specify OneChain network
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
        } catch (buildError) {
          console.error('   Build error:', buildError.message);
          console.error('   Full error:', buildError);

          // Try passing Transaction object directly as last resort
          console.log('   Trying direct Transaction object...');
          result = await provider.signAndExecuteTransactionBlock({
            transactionBlock: transaction,
            account: account,
            chain: 'onechain:testnet', // CRITICAL: Specify OneChain network
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
        }
      } else {
        throw new Error('Wallet does not support any transaction signing methods. Please ensure OneWallet extension is installed and up to date.');
      }

      console.log('✅ Transaction successful');
      console.log('   Digest:', result.digest || result.hash);

      // Log transaction effects status
      if (result.effects) {
        const status = result.effects.status || result.effects;
        console.log('   Effects Status:', JSON.stringify(status));
        if (status.status === 'failure' || status.error) {
          console.error('   ❌ Transaction FAILED on-chain:', status.error || status);
        }
      }

      // Log any object changes (NFT creation)
      if (result.objectChanges) {
        console.log('   Object Changes:', result.objectChanges.length, 'objects');
        result.objectChanges.forEach((change, i) => {
          console.log(`     [${i}] ${change.type}: ${change.objectType || change.objectId}`);
        });
      }

      return {
        success: true,
        transactionHash: result.digest || result.hash,
        effects: result.effects,
        events: result.events,
        objectChanges: result.objectChanges
      };
    } catch (error) {
      console.error('❌ Transaction failed:', error.message);
      console.error('   Error type:', error.constructor.name);
      if (error.cause) console.error('   Cause:', error.cause);
      if (error.code) console.error('   Code:', error.code);

      // Provide helpful error messages
      if (error.message.includes('User rejected')) {
        throw new Error('Transaction cancelled by user');
      } else if (error.message.includes('Insufficient')) {
        throw new Error('Insufficient balance for transaction');
      } else {
        throw new Error(`Transaction failed: ${error.message}`);
      }
    }
  }

}

// Export singleton instance
const onechainService = new OneChainService();
export default onechainService;
