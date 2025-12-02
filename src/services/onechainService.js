// OneChain Service - Handles all blockchain interactions with OneChain network
// Integrates OneWallet, OneDEX, OneID, and OneRWA

class OneChainService {
  constructor() {
    this.walletConnected = false;
    this.walletAddress = null;
    this.walletProvider = null;
    this.sessionToken = null;
    this.userProfile = null;
    this.slashBuffer = [];
    this.BATCH_SIZE = 10;
    this.currentTokenId = 0;
    this.gameStartTime = null;
    this.listeners = new Set();
    
    // OneChain configuration
    this.ONECHAIN_CONFIG = {
      apiEndpoint: process.env.REACT_APP_ONECHAIN_API || 'https://api.onelabs.cc',
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

    const provider = wallet.provider.aptos || wallet.provider;

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
        timestamp: Date.now(),
        network: this.ONECHAIN_CONFIG.network
      };
      localStorage.setItem('onechain_session', JSON.stringify(session));
    }
  }

  // Clear session from localStorage
  clearSession() {
    localStorage.removeItem('onechain_session');
  }

  // Restore session from localStorage
  async restoreSession() {
    try {
      const sessionData = localStorage.getItem('onechain_session');
      if (!sessionData) return false;

      const session = JSON.parse(sessionData);
      
      // Check if session is less than 24 hours old
      const hoursSinceSession = (Date.now() - session.timestamp) / (1000 * 60 * 60);
      if (hoursSinceSession > 24) {
        this.clearSession();
        return false;
      }

      // Verify with current wallet provider
      const wallet = this.getWalletProvider();
      if (wallet) {
        try {
          const provider = wallet.provider.aptos || wallet.provider;
          
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
            this.walletAddress = session.address;
            this.walletConnected = true;
            this.walletProvider = wallet.name;
            console.log('✅ Session restored:', this.walletAddress);
            
            // Setup event listeners
            this.setupWalletListeners();
            
            // Load user profile if OneID enabled
            if (this.ONECHAIN_CONFIG.oneIdEnabled) {
              await this.fetchUserProfile();
            }
            
            return true;
          }
        } catch (err) {
          console.log('Session verification failed:', err);
        }
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
    // OneWallet injects as window.onechain
    if (window.onechain && typeof window.onechain === 'object') {
      console.log('✅ OneWallet detected, available methods:', Object.keys(window.onechain));
      return { provider: window.onechain, name: 'OneWallet' };
    }
    
    console.log('❌ OneWallet not found');
    return null;
  }

  // Connect OneWallet
  async connectWallet() {
    try {
      console.log('🔵 Starting OneWallet connection...');
      
      // Wait for wallet to load
      await this.waitForWallet();
      
      // Check for OneWallet
      const wallet = this.getWalletProvider();
      if (!wallet) {
        console.error('❌ OneWallet not found');
        throw new Error('OneWallet extension not detected. Please install OneWallet and refresh the page.');
      }

      console.log(`✅ ${wallet.name} detected`);
      console.log('Available wallet methods:', Object.keys(wallet.provider));

      // OneWallet provides window.onechain with aptos compatibility layer
      let account;
      
      try {
        // OneWallet exposes an aptos-compatible provider
        const provider = wallet.provider.aptos || wallet.provider;
        
        if (!provider) {
          throw new Error('OneWallet provider not available');
        }
        
        console.log('📞 Connecting to OneWallet...');
        console.log('Available methods:', Object.keys(provider));
        
        // Connect using the standard connect method
        if (typeof provider.connect === 'function') {
          const result = await provider.connect();
          console.log('Connect result:', result);
          
          // Handle user rejection
          if (result && result.status === 'Rejected') {
            throw new Error('User rejected the connection request');
          }
          
          // Try to get account from various sources
          if (result && result.address) {
            account = result;
          } else if (result && result.status === 'Approved') {
            // Get account info after approval
            if (provider.accounts && provider.accounts.length > 0) {
              account = { address: provider.accounts[0] };
            } else if (typeof provider.account === 'function') {
              account = await provider.account();
            } else if (result.args && result.args.address) {
              account = result.args;
            }
          }
        }
        
        // Fallback: try account() method directly
        if (!account && typeof provider.account === 'function') {
          console.log('Trying account() method...');
          account = await provider.account();
        }
        
        // Fallback: try getAccount()
        if (!account && typeof provider.getAccount === 'function') {
          console.log('Trying getAccount() method...');
          account = await provider.getAccount();
        }
        
        if (!account) {
          throw new Error('Could not retrieve account information');
        }
        
      } catch (connectError) {
        console.error('❌ Connection failed:', connectError);
        throw new Error(`Failed to connect: ${connectError.message}`);
      }
      
      // Extract address from response
      let address;
      if (typeof account === 'string') {
        address = account;
      } else if (account && account.address) {
        address = account.address;
      } else if (account && account.publicKey) {
        // Sometimes only publicKey is returned
        address = account.publicKey;
      } else if (Array.isArray(account) && account.length > 0) {
        address = typeof account[0] === 'string' ? account[0] : account[0].address;
      }
      
      if (!address) {
        console.error('Could not extract address from:', account);
        console.log('Full account object:', JSON.stringify(account, null, 2));
        throw new Error('No address returned from wallet.');
      }

      this.walletAddress = address;
      this.walletProvider = wallet.name;
      this.walletConnected = true;

      // Save session
      this.saveSession();

      // Create authentication signature for session (optional)
      console.log('🔐 Creating authentication session...');
      try {
        const message = `OneNinja Login\nTimestamp: ${Date.now()}\nNetwork: ${this.ONECHAIN_CONFIG.network}`;
        const nonce = Math.random().toString(36).substring(7);
        
        // Use OneChain signMessage
        const walletProvider = this.getWalletProvider();
        if (walletProvider && walletProvider.provider.signMessage) {
          const payload = {
            message,
            nonce
          };
          const signResponse = await walletProvider.provider.signMessage(payload);
          this.sessionToken = signResponse.signature;
          console.log('✅ Authentication signature created');
        } else {
          console.log('ℹ️ Wallet does not support message signing, skipping auth token');
        }
      } catch (sigError) {
        console.warn('⚠️ Signature creation failed, continuing without auth token:', sigError);
      }

      // Fetch user profile via OneID if enabled
      if (this.ONECHAIN_CONFIG.oneIdEnabled) {
        console.log('👤 Fetching OneID profile...');
        await this.fetchUserProfile();
      }

      console.log(`✅ ${this.walletProvider} connected successfully:`, this.walletAddress);
      
      // Setup event listeners after successful connection
      this.setupWalletListeners();
      
      this.notifyListeners('connected', { 
        address: this.walletAddress,
        profile: this.userProfile 
      });

      return {
        success: true,
        address: this.walletAddress,
        profile: this.userProfile
      };
    } catch (error) {
      console.error('❌ Failed to connect OneWallet:', error);
      
      // Clear any partial state
      this.walletConnected = false;
      this.walletAddress = null;
      this.sessionToken = null;
      this.clearSession();
      
      return {
        success: false,
        error: error.message || 'Failed to connect OneWallet'
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
        const provider = wallet.provider.aptos || wallet.provider;
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

  // Get wallet balance from OneChain
  async getBalance() {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/wallet/balance/${this.walletAddress}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }

      const data = await response.json();
      return {
        amount: data.balance || '0',
        symbol: 'ONE'
      };
    } catch (error) {
      console.error('Error fetching balance:', error);
      return { amount: '0', symbol: 'ONE' };
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
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/slash-batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          },
          body: JSON.stringify({
            walletAddress: this.walletAddress,
            slashes: batch,
            sessionStart: this.gameStartTime
          })
        }
      );

      if (response.ok) {
        console.log(`✅ Submitted ${batch.length} slashes to OneChain`);
      }
    } catch (error) {
      console.error('Error submitting slash batch:', error);
      // Re-add to buffer on failure
      this.slashBuffer.push(...batch);
    }
  }

  // Mint Game NFT using OneRWA
  async mintGameNFT(gameStats) {
    if (!this.isWalletConnected()) {
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      console.log('🎨 Minting Game NFT on OneChain...');

      // Prepare NFT metadata
      const nftMetadata = {
        name: `OneNinja Achievement - Score ${gameStats.score}`,
        description: `Legendary achievement with ${gameStats.score} points, ${gameStats.combo} max combo`,
        attributes: [
          { trait_type: 'Score', value: gameStats.score },
          { trait_type: 'Max Combo', value: gameStats.combo },
          { trait_type: 'Accuracy', value: `${gameStats.accuracy}%` },
          { trait_type: 'Tier', value: gameStats.tier },
          { trait_type: 'Date', value: new Date().toISOString() }
        ],
        image: this.generateNFTImage(gameStats),
      };

      // Call OneChain API to mint NFT
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/nft/mint`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          },
          body: JSON.stringify({
            walletAddress: this.walletAddress,
            contractAddress: this.ONECHAIN_CONFIG.gameContractAddress,
            metadata: nftMetadata
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to mint NFT');
      }

      const result = await response.json();

      console.log('✅ NFT Minted successfully:', result.transactionHash);

      return {
        success: true,
        transactionHash: result.transactionHash,
        tokenId: result.tokenId,
        explorerUrl: `https://explorer.onelabs.cc/tx/${result.transactionHash}`,
        name: nftMetadata.name,
        tier: gameStats.tier,
        score: gameStats.score
      };

    } catch (error) {
      console.error('❌ NFT Minting failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to mint NFT'
      };
    }
  }

  // Generate NFT image/emoji based on tier
  generateNFTImage(gameStats) {
    const tier = gameStats.tier;
    const emojiMap = {
      'Legendary': '👑',
      'Epic': '⚔️',
      'Rare': '🗡️',
      'Common': '🎮'
    };
    return emojiMap[tier] || '🎮';
  }

  // Fetch user profile via OneID
  async fetchUserProfile() {
    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/identity/profile/${this.walletAddress}`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        const profile = await response.json();
        console.log('✅ OneID Profile loaded:', profile);
        return profile;
      }
    } catch (error) {
      console.error('Error fetching OneID profile:', error);
    }
    return null;
  }

  // Get game state from OneChain
  async getGameState() {
    if (!this.isWalletConnected()) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/state/${this.walletAddress}`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
    return null;
  }

  // Get leaderboard from OneChain
  async getLeaderboard(limit = 100) {
    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/leaderboard?limit=${limit}`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
    return [];
  }

  // Get token price from OneDEX
  async getTokenPrice() {
    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/dex/price/ONE`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.price;
      }
    } catch (error) {
      console.error('Error fetching token price:', error);
    }
    return null;
  }

  // Reward player with tokens via OneDEX
  async rewardPlayer(amount) {
    if (!this.isWalletConnected()) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/reward`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          },
          body: JSON.stringify({
            walletAddress: this.walletAddress,
            amount: amount,
            currency: 'ONE'
          })
        }
      );

      if (response.ok) {
        const result = await response.json();
        return { success: true, ...result };
      }
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
      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not available');
      }

      const provider = wallet.provider.aptos || wallet.provider;
      
      if (typeof provider.signAndSubmitTransaction !== 'function') {
        throw new Error('signAndSubmitTransaction method not available');
      }

      console.log('📝 Signing transaction:', transaction);
      
      const result = await provider.signAndSubmitTransaction(transaction);
      
      console.log('✅ Transaction submitted:', result);
      
      return {
        success: true,
        hash: result.hash || result,
        result
      };
      
    } catch (error) {
      console.error('❌ Transaction failed:', error);
      throw error;
    }
  }

  // Sign message with OneWallet
  async signMessage(message, nonce) {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not available');
      }

      const provider = wallet.provider.aptos || wallet.provider;
      
      if (typeof provider.signMessage !== 'function') {
        throw new Error('signMessage method not available');
      }

      const payload = {
        message,
        nonce: nonce || Date.now()
      };

      console.log('✍️  Signing message:', payload);
      
      const result = await provider.signMessage(payload);
      
      console.log('✅ Message signed');
      
      return {
        signature: result.signature || result,
        fullMessage: message,
        nonce: payload.nonce
      };
      
    } catch (error) {
      console.error('❌ Message signing failed:', error);
      throw error;
    }
  }

  // Get network information
  async getNetwork() {
    try {
      const wallet = this.getWalletProvider();
      if (!wallet) {
        return null;
      }

      const provider = wallet.provider.aptos || wallet.provider;
      
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
}

// Export singleton instance
const onechainService = new OneChainService();
export default onechainService;
